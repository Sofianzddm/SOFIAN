import type { RhWorkPlace } from "@prisma/client";
import prisma from "@/lib/prisma";
import { remoteEntitlement } from "@/lib/rh/calculations";
import { isFrenchHoliday } from "@/lib/rh/holidays";
import { isoWeekInfo } from "@/lib/rh/workflow";

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

export async function getOfficeWeek(params: {
  employeeId: string;
  agreementDays: 0 | 2 | 3;
  weekStart: Date;
  weekCount?: number;
}) {
  const count = params.weekCount ?? 4;
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(params.weekStart);
    start.setUTCDate(start.getUTCDate() + i * 7);
    const info = isoWeekInfo(start);
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
    for (const d of decl?.declaredDates ?? []) {
      byDate[d.toISOString().slice(0, 10)] = "REMOTE";
    }
    for (const d of days) {
      byDate[d.date.toISOString().slice(0, 10)] = d.place;
    }
    const absences = await prisma.rhLeaveDay.count({
      where: {
        employeeId: params.employeeId,
        date: { gte: info.weekStart, lte: info.weekEnd },
        request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
      },
    });
    const remoteDays = Object.values(byDate).filter((p) => p === "REMOTE").length;
    const entitlement = remoteEntitlement(params.agreementDays, absences);
    let verdict: "compliant" | "over" | "none" | "undeclared" = "undeclared";
    if (remoteDays === 0 && entitlement === 0) verdict = "none";
    else if (remoteDays === 0) verdict = "undeclared";
    else if (remoteDays > entitlement) verdict = "over";
    else verdict = "compliant";

    weeks.push({
      isoYear: info.isoYear,
      isoWeek: info.isoWeek,
      weekStart: info.weekStart,
      weekEnd: info.weekEnd,
      absenceDays: absences,
      entitlement,
      declared: remoteDays,
      verdict,
      places: byDate,
    });
  }
  return weeks;
}

export async function setWorkDay(params: {
  employeeId: string;
  date: Date;
  place: RhWorkPlace;
  agreementDays: 0 | 2 | 3;
  /** Exception manager : autorise un TT au-delà de l'article 1.6. */
  allowOverEntitlement?: boolean;
}) {
  const iso = params.date.toISOString().slice(0, 10);
  const date = utcDate(iso);
  if (isFrenchHoliday(iso) || date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    throw new Error("Jour non ouvré (week-end ou férié)");
  }
  const info = isoWeekInfo(date);

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
  const entitlement = remoteEntitlement(params.agreementDays, absences);
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
    },
    update: { place: params.place },
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
