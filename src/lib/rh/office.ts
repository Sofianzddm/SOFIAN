import type { RhWorkPlace } from "@prisma/client";
import prisma from "@/lib/prisma";
import { remoteEntitlement } from "@/lib/rh/calculations";
import { isFrenchHoliday } from "@/lib/rh/holidays";
import { notifyRhRequestCreated } from "@/lib/rh/notify";
import { getRhSettings } from "@/lib/rh/settings";
import { createRhRequest, isoWeekInfo, writeRhAudit } from "@/lib/rh/workflow";

export const WORK_PLACES: Array<{
  id: RhWorkPlace;
  label: string;
  short: string;
}> = [
  { id: "OFFICE", label: "Bureau", short: "BUREAU" },
  { id: "REMOTE", label: "Télétravail", short: "TÉLÉ" },
  { id: "TRAVEL", label: "Déplacement", short: "DÉPL." },
  { id: "SITE", label: "Soleil du Sud", short: "SITE" },
];

export function nextWorkPlace(current: RhWorkPlace | null): RhWorkPlace {
  const order: RhWorkPlace[] = ["OFFICE", "REMOTE", "TRAVEL", "SITE"];
  if (!current) return "REMOTE";
  const i = order.indexOf(current);
  return order[(i + 1) % order.length] ?? "OFFICE";
}

function utcDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Jours TT à rendre la semaine suivante (exception compensée). */
export async function compensationDebt(
  employeeId: string,
  isoYear: number,
  isoWeek: number
): Promise<number> {
  const candidates = await prisma.rhRemoteDeclaration.findMany({
    where: {
      employeeId,
      exceptional: true,
      compensationWeek: { not: null },
    },
  });
  let debt = 0;
  for (const d of candidates) {
    const nextStart = new Date(d.weekStart);
    nextStart.setDate(nextStart.getDate() + 7);
    const next = isoWeekInfo(nextStart);
    if (next.isoYear === isoYear && next.isoWeek === isoWeek) debt += 1;
  }
  return debt;
}

export async function getOfficeWeek(params: {
  employeeId: string;
  agreementDays: 0 | 2 | 3;
  weekStart: Date;
  weekCount?: number;
}) {
  const count = params.weekCount ?? 4;
  const weeks = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    // Avancer en jours locaux (pas UTC) pour coller à isoWeekInfo
    const start = new Date(params.weekStart);
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() + i * 7);
    const info = isoWeekInfo(start);
    const key = `${info.isoYear}-W${info.isoWeek}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const days = await prisma.rhWorkDay.findMany({
      where: {
        employeeId: params.employeeId,
        date: { gte: info.weekStart, lte: info.weekEnd },
      },
    });
    const decl = await prisma.rhRemoteDeclaration.findUnique({
      where: {
        employeeId_isoYear_isoWeek: {
          employeeId: params.employeeId,
          isoYear: info.isoYear,
          isoWeek: info.isoWeek,
        },
      },
    });
    const byDate: Record<string, RhWorkPlace> = {};
    const travelMeals: Record<string, string | null> = {};
    const portions: Record<string, string> = {};
    for (const d of decl?.declaredDates ?? []) {
      byDate[d.toISOString().slice(0, 10)] = "REMOTE";
    }
    for (const d of days) {
      const keyDate = d.date.toISOString().slice(0, 10);
      byDate[keyDate] = d.place;
      travelMeals[keyDate] = d.travelMeal;
      portions[keyDate] = d.portion;
    }
    const absences = await prisma.rhLeaveDay.count({
      where: {
        employeeId: params.employeeId,
        date: { gte: info.weekStart, lte: info.weekEnd },
        request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
      },
    });
    const remoteDays = Object.values(byDate).filter((p) => p === "REMOTE").length;
    const debt = await compensationDebt(
      params.employeeId,
      info.isoYear,
      info.isoWeek
    );
    const settings = await getRhSettings();
    const entitlement = Math.max(
      0,
      remoteEntitlement(params.agreementDays, absences, {
        forOneDay: settings.remoteAbsencesForOneDay,
        forZero: settings.remoteAbsencesForZero,
      }) - debt
    );

    // TT proposés en attente de validation
    const pendingReq = await prisma.rhRequest.findFirst({
      where: {
        employeeId: params.employeeId,
        type: "REMOTE_PLAN",
        status: "PENDING",
        dateFrom: { lte: info.weekEnd },
        dateTo: { gte: info.weekStart },
      },
      orderBy: { createdAt: "desc" },
    });
    const weekStartIso = info.weekStart.toISOString().slice(0, 10);
    const weekEndIso = info.weekEnd.toISOString().slice(0, 10);
    const pendingRemote = (
      (pendingReq?.payload as { dates?: string[] } | null)?.dates ?? []
    ).filter((d) => d >= weekStartIso && d <= weekEndIso);

    const totalRemoteCount = new Set([
      ...Object.entries(byDate)
        .filter(([, p]) => p === "REMOTE")
        .map(([d]) => d),
      ...pendingRemote,
    ]).size;

    let verdict: "compliant" | "over" | "none" | "undeclared" | "pending" =
      "undeclared";
    if (totalRemoteCount === 0 && entitlement === 0) verdict = "none";
    else if (totalRemoteCount === 0) verdict = "undeclared";
    else if (totalRemoteCount > entitlement) verdict = "over";
    else if (pendingRemote.length > 0) verdict = "pending";
    else verdict = "compliant";

    weeks.push({
      isoYear: info.isoYear,
      isoWeek: info.isoWeek,
      weekStart: info.weekStart,
      weekEnd: info.weekEnd,
      absenceDays: absences,
      entitlement,
      compensationDebt: debt,
      declared: remoteDays,
      pendingRemote,
      pendingRequestId: pendingReq?.id ?? null,
      pendingRequestRef: pendingReq?.reference ?? null,
      verdict,
      places: byDate,
      travelMeals,
      portions,
    });
  }
  return weeks;
}

export type TravelMeal = "SELF" | "COMPANY" | "REIMBURSED";

export async function setWorkDay(params: {
  employeeId: string;
  date: Date;
  place: RhWorkPlace;
  agreementDays: 0 | 2 | 3;
  /** Exception manager : autorise un TT au-delà de l'article 1.6. */
  allowOverEntitlement?: boolean;
  portion?: "FULL" | "AM" | "PM";
  travelMeal?: TravelMeal | null;
}) {
  const iso = params.date.toISOString().slice(0, 10);
  const date = utcDate(iso);
  if (isFrenchHoliday(iso) || date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    throw new Error("Jour non ouvré (week-end ou férié)");
  }
  const info = isoWeekInfo(date);
  const portion = params.portion ?? "FULL";

  const existing = await prisma.rhWorkDay.findUnique({
    where: {
      employeeId_date_half: {
        employeeId: params.employeeId,
        date,
        half: "FULL",
      },
    },
  });

  const weekRemote = await prisma.rhWorkDay.findMany({
    where: {
      employeeId: params.employeeId,
      date: { gte: info.weekStart, lte: info.weekEnd },
      place: "REMOTE",
      half: "FULL",
    },
  });
  const absences = await prisma.rhLeaveDay.count({
    where: {
      employeeId: params.employeeId,
      date: { gte: info.weekStart, lte: info.weekEnd },
      request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
    },
  });
  const debt = await compensationDebt(
    params.employeeId,
    info.isoYear,
    info.isoWeek
  );
  const settings = await getRhSettings();
  const entitlement = Math.max(
    0,
    remoteEntitlement(params.agreementDays, absences, {
      forOneDay: settings.remoteAbsencesForOneDay,
      forZero: settings.remoteAbsencesForZero,
    }) - debt
  );
  const alreadyRemote = existing?.place === "REMOTE";
  const nextRemote =
    params.place === "REMOTE"
      ? alreadyRemote
        ? weekRemote.length
        : weekRemote.length + 1
      : alreadyRemote
        ? Math.max(0, weekRemote.length - 1)
        : weekRemote.length;
  if (
    !params.allowOverEntitlement &&
    params.place === "REMOTE" &&
    nextRemote > entitlement
  ) {
    throw new Error(
      `Dépassement article 1.6 : droit ${entitlement} j TT, déclaré ${nextRemote} j`
    );
  }

  const travelMeal =
    params.place === "TRAVEL"
      ? params.travelMeal ?? "SELF"
      : null;

  await prisma.rhWorkDay.upsert({
    where: {
      employeeId_date_half: {
        employeeId: params.employeeId,
        date,
        half: "FULL",
      },
    },
    create: {
      employeeId: params.employeeId,
      date,
      place: params.place,
      half: "FULL",
      portion,
      travelMeal,
    },
    update: {
      place: params.place,
      portion,
      travelMeal,
    },
  });

  const remoteDates = await prisma.rhWorkDay.findMany({
    where: {
      employeeId: params.employeeId,
      date: { gte: info.weekStart, lte: info.weekEnd },
      place: "REMOTE",
      half: "FULL",
    },
    select: { date: true },
  });

  await prisma.rhRemoteDeclaration.upsert({
    where: {
      employeeId_isoYear_isoWeek: {
        employeeId: params.employeeId,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
      },
    },
    create: {
      employeeId: params.employeeId,
      isoYear: info.isoYear,
      isoWeek: info.isoWeek,
      weekStart: info.weekStart,
      weekEnd: info.weekEnd,
      declaredDates: remoteDates.map((d) => d.date),
    },
    update: {
      declaredDates: remoteDates.map((d) => d.date),
    },
  });
}

/**
 * Propose des jours TT → demande REMOTE_PLAN (jamais appliqué sans validation).
 * `dates` = liste ISO des jours TT souhaités pour la semaine (remplace le pending).
 */
export async function proposeRemotePlan(params: {
  employeeId: string;
  agreementDays: 0 | 2 | 3;
  /** Jours TT en attente uniquement (pas ceux déjà validés). */
  dates: string[];
  /** Semaine de référence (un des jours ou lundi). */
  refDate: Date;
  /** Jours TT déjà validés cette semaine (pour le plafond). */
  alreadyApprovedCount?: number;
}) {
  const info = isoWeekInfo(params.refDate);
  const unique = [
    ...new Set(
      params.dates
        .map((d) => d.slice(0, 10))
        .filter((iso) => {
          if (isFrenchHoliday(iso)) return false;
          const d = utcDate(iso);
          const dow = d.getUTCDay();
          return dow !== 0 && dow !== 6;
        })
    ),
  ].sort();

  const absences = await prisma.rhLeaveDay.count({
    where: {
      employeeId: params.employeeId,
      date: { gte: info.weekStart, lte: info.weekEnd },
      request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
    },
  });
  const debt = await compensationDebt(
    params.employeeId,
    info.isoYear,
    info.isoWeek
  );
  const settings = await getRhSettings();
  const entitlement = Math.max(
    0,
    remoteEntitlement(params.agreementDays, absences, {
      forOneDay: settings.remoteAbsencesForOneDay,
      forZero: settings.remoteAbsencesForZero,
    }) - debt
  );
  const total =
    unique.length + Math.max(0, params.alreadyApprovedCount ?? 0);
  if (total > entitlement) {
    throw new Error(
      `Dépassement article 1.6 : droit ${entitlement} j TT, total ${total} j`
    );
  }

  // Annuler un pending précédent de la même semaine
  const existing = await prisma.rhRequest.findFirst({
    where: {
      employeeId: params.employeeId,
      type: "REMOTE_PLAN",
      status: "PENDING",
      dateFrom: { lte: info.weekEnd },
      dateTo: { gte: info.weekStart },
    },
  });

  if (unique.length === 0) {
    if (existing) {
      await prisma.rhRequest.update({
        where: { id: existing.id },
        data: { status: "CANCELLED" },
      });
      await writeRhAudit({
        actorId: params.employeeId,
        targetId: params.employeeId,
        action: "remote.plan.cancel",
        detail: { requestId: existing.id, isoWeek: info.isoWeek },
      });
    }
    return { request: null, dates: [] as string[], cancelled: !!existing };
  }

  const title = `TT S${info.isoWeek} · ${unique.length} j`;
  const payload = {
    dates: unique,
    isoYear: info.isoYear,
    isoWeek: info.isoWeek,
    weekStart: info.weekStart.toISOString().slice(0, 10),
    weekEnd: info.weekEnd.toISOString().slice(0, 10),
  };

  if (existing) {
    const updated = await prisma.rhRequest.update({
      where: { id: existing.id },
      data: {
        title,
        days: unique.length,
        dateFrom: utcDate(unique[0]!),
        dateTo: utcDate(unique[unique.length - 1]!),
        payload,
      },
    });
    await writeRhAudit({
      actorId: params.employeeId,
      targetId: params.employeeId,
      action: "remote.plan.update",
      detail: { requestId: updated.id, dates: unique },
    });
    return { request: updated, dates: unique, cancelled: false };
  }

  const request = await createRhRequest({
    type: "REMOTE_PLAN",
    status: "PENDING",
    employeeId: params.employeeId,
    title,
    days: unique.length,
    dateFrom: utcDate(unique[0]!),
    dateTo: utcDate(unique[unique.length - 1]!),
    payload,
    prefix: "TT",
  });
  await notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: "plan télétravail",
  });
  await writeRhAudit({
    actorId: params.employeeId,
    targetId: params.employeeId,
    action: "remote.plan.create",
    detail: { requestId: request.id, dates: unique },
  });
  return { request, dates: unique, cancelled: false };
}

/** Applique un plan TT validé (jours → RhWorkDay REMOTE). */
export async function applyRemotePlan(params: {
  employeeId: string;
  dates: string[];
  agreementDays: 0 | 2 | 3;
}) {
  for (const iso of params.dates) {
    await setWorkDay({
      employeeId: params.employeeId,
      date: new Date(`${iso.slice(0, 10)}T12:00:00`),
      place: "REMOTE",
      agreementDays: params.agreementDays,
      allowOverEntitlement: true,
    });
  }
}
