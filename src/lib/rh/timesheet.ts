import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  assertLegalBreak,
  breakRangeMinutes,
  collapseLeaveAbsence,
  dayNetMinutes,
  LEGAL_BREAK_MIN_MINUTES,
  netDayMinutes,
  slotsBreakMinutes,
  slotsBreakWindow,
  slotsGrossMinutes,
  splitOvertime,
  type LeaveAbsenceInput,
} from "@/lib/rh/calculations";
import { createRhRequest, isoWeekInfo, writeRhAudit } from "@/lib/rh/workflow";
import {
  notifyRhRequestCreated,
  notifyRhDecision,
  notifyTimesheetWeekend,
  notifyTimesheetSignatureRequest,
  notifyTimesheetSubmitReminder,
} from "@/lib/rh/notify";
import { displayName, initials } from "@/lib/rh/auth";
import { isFrenchHoliday } from "@/lib/rh/holidays";
import { getRhSettings } from "@/lib/rh/settings";

type Slot = { from: string; to: string };

/** Pause effective : trou entre créneaux, sinon valeur saisie. */
function effectiveBreakMinutes(slots: Slot[], breakMinutes: number): number {
  const gaps = slotsBreakMinutes(slots);
  return gaps > 0 ? gaps : Math.max(0, breakMinutes);
}

function dayMinutes(slots: Slot[], breakMinutes: number): number {
  return dayNetMinutes(slots, breakMinutes);
}

export async function getOrCreateTimesheet(
  employeeId: string,
  refDate: Date,
  weeklyHours: number
) {
  const info = isoWeekInfo(refDate);
  let ts = await prisma.rhTimesheet.findUnique({
    where: {
      employeeId_isoYear_isoWeek: {
        employeeId,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
      },
    },
    include: { days: { orderBy: { date: "asc" } } },
  });

  if (!ts) {
    const dayRows: Prisma.RhTimesheetDayCreateWithoutTimesheetInput[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(info.weekStart);
      d.setUTCDate(info.weekStart.getUTCDate() + i);
      dayRows.push({
        date: d,
        slots: [],
        breakMinutes: 0,
        totalMinutes: 0,
        exception: false,
      });
    }
    ts = await prisma.rhTimesheet.create({
      data: {
        employeeId,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
        weekStart: info.weekStart,
        weekEnd: info.weekEnd,
        days: { create: dayRows },
      },
      include: { days: { orderBy: { date: "asc" } } },
    });
  }

  if (MUTABLE_TIMESHEET.has(ts.status)) {
    const synced = await reconcileTimesheetAbsences(ts.id);
    if (synced) ts = synced;
  }

  const settings = await getRhSettings();
  const totals = recalculateTotals(
    ts.days,
    weeklyHours,
    settings.ot25CapHours
  );
  return { timesheet: ts, ...totals, info, settings };
}

function recalculateTotals(
  days: { date: Date; totalMinutes: number; slots: unknown }[],
  weeklyHours: number,
  ot25CapHours = 8
) {
  const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
  const { at25, at50 } = splitOvertime(
    totalMinutes,
    weeklyHours * 60,
    ot25CapHours
  );
  return { totalMinutes, ot25Minutes: at25, ot50Minutes: at50 };
}

function isWeekendOrHolidayIso(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00`).getDay();
  return dow === 0 || dow === 6 || isFrenchHoliday(iso);
}

const MUTABLE_TIMESHEET = new Set(["DRAFT", "PAUSED", "SUBMITTED"]);

function isoFromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asSlots(value: unknown): Slot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is Slot =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Slot).from === "string" &&
      typeof (s as Slot).to === "string"
  );
}

/**
 * Aligne la feuille sur les congés acceptés.
 * Une absence manuelle (bouton) est conservée tant qu'aucun congé ne couvre le jour.
 * Feuille déjà validée ou signée : on ne réécrit pas.
 */
export async function reconcileTimesheetAbsences(timesheetId: string) {
  const ts = await prisma.rhTimesheet.findUnique({
    where: { id: timesheetId },
    include: { days: { orderBy: { date: "asc" } } },
  });
  if (!ts || !MUTABLE_TIMESHEET.has(ts.status)) return ts;

  const settings = await getRhSettings();
  const leaves = await prisma.rhLeaveDay.findMany({
    where: {
      employeeId: ts.employeeId,
      date: { gte: ts.weekStart, lte: ts.weekEnd },
      request: { status: { in: ["APPROVED", "SIGNED"] } },
    },
  });

  const byDate = new Map<string, LeaveAbsenceInput[]>();
  for (const row of leaves) {
    const iso = isoFromDbDate(row.date);
    const list = byDate.get(iso) || [];
    list.push({
      accountCode: row.accountCode,
      halfDay: row.halfDay,
      half: row.half,
      minutes: row.minutes,
      requestId: row.requestId,
    });
    byDate.set(iso, list);
  }

  let changed = false;
  for (const day of ts.days) {
    const iso = isoFromDbDate(day.date);
    const collapsed = collapseLeaveAbsence(
      byDate.get(iso) || [],
      settings.workdayMinutes
    );
    const slots = asSlots(day.slots);
    const breakMinutes = effectiveBreakMinutes(slots, day.breakMinutes);
    const gross = dayMinutes(slots, breakMinutes);

    if (collapsed) {
      const totalMinutes = netDayMinutes(
        gross,
        collapsed.kind,
        collapsed.minutes,
        settings.workdayMinutes
      );
      const same =
        day.absenceKind === collapsed.kind &&
        day.absenceMinutes === collapsed.minutes &&
        day.absenceLabel === collapsed.label &&
        day.absenceSource === "LEAVE" &&
        (day.absenceRequestId || null) === collapsed.requestId &&
        day.totalMinutes === totalMinutes;
      if (same) continue;
      await prisma.rhTimesheetDay.update({
        where: { id: day.id },
        data: {
          totalMinutes,
          absenceKind: collapsed.kind,
          absenceMinutes: collapsed.minutes,
          absenceLabel: collapsed.label,
          absenceSource: "LEAVE",
          absenceRequestId: collapsed.requestId,
        },
      });
      changed = true;
      continue;
    }

    if (day.absenceSource === "LEAVE") {
      const totalMinutes = dayMinutes(slots, breakMinutes);
      await prisma.rhTimesheetDay.update({
        where: { id: day.id },
        data: {
          totalMinutes,
          absenceKind: null,
          absenceMinutes: 0,
          absenceLabel: null,
          absenceSource: null,
          absenceRequestId: null,
        },
      });
      changed = true;
    }
  }

  if (!changed) return ts;

  const refreshed = await prisma.rhTimesheetDay.findMany({
    where: { timesheetId: ts.id },
  });
  const employee = await prisma.rhEmployee.findUnique({
    where: { id: ts.employeeId },
    select: { weeklyHours: true },
  });
  const weekly = recalculateTotals(
    refreshed,
    employee?.weeklyHours || 35,
    settings.ot25CapHours
  );
  await prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: weekly,
  });
  return prisma.rhTimesheet.findUnique({
    where: { id: ts.id },
    include: { days: { orderBy: { date: "asc" } } },
  });
}

/** Recalcule les feuilles encore modifiables qui couvrent ces dates. */
export async function syncTimesheetAbsencesForDates(
  employeeId: string,
  dates: Date[]
) {
  if (!dates.length) return;
  const times = dates.map((d) => d.getTime()).filter((n) => Number.isFinite(n));
  if (!times.length) return;
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  min.setUTCDate(min.getUTCDate() - 1);
  max.setUTCDate(max.getUTCDate() + 1);
  const sheets = await prisma.rhTimesheet.findMany({
    where: {
      employeeId,
      weekStart: { lte: max },
      weekEnd: { gte: min },
      status: { in: ["DRAFT", "PAUSED", "SUBMITTED"] },
    },
    select: { id: true },
  });
  for (const sheet of sheets) {
    await reconcileTimesheetAbsences(sheet.id);
  }
}

export async function updateTimesheetDays(params: {
  timesheetId: string;
  employeeId: string;
  weeklyHours: number;
  days: {
    date: string;
    slots: Slot[];
    breakMinutes: number;
    /** Horaires de pause (créneau unique sans trou auto) */
    breakFrom?: string | null;
    breakTo?: string | null;
    exception?: boolean;
    /** Justification HS / exception pour ce jour */
    note?: string | null;
    /** FULL = journée déclarée absente à la main */
    absenceKind?: string | null;
    absenceMinutes?: number;
    absenceLabel?: string | null;
    absenceSource?: string | null;
  }[];
}) {
  const ts = await prisma.rhTimesheet.findFirst({
    where: { id: params.timesheetId, employeeId: params.employeeId },
  });
  if (!ts) throw new Error("Feuille introuvable");
  if (ts.status !== "DRAFT" && ts.status !== "PAUSED") {
    throw new Error("Feuille non modifiable");
  }

  const settings = await getRhSettings();

  for (const day of params.days) {
    const iso = day.date.slice(0, 10);
    const special = isWeekendOrHolidayIso(iso);
    const exception = special ? !!day.exception : false;
    const slots =
      special && !exception
        ? []
        : (day.slots || []).filter((s) => s.from && s.to);

    if (special && slots.length > 0 && !exception) {
      throw new Error(
        `Coche « Exception » pour saisir des heures le ${iso} (week-end / férié)`
      );
    }

    const autoWindow = slotsBreakWindow(slots);
    const fromRange =
      typeof day.breakFrom === "string" && /^\d{2}:\d{2}$/.test(day.breakFrom)
        ? day.breakFrom
        : null;
    const toRange =
      typeof day.breakTo === "string" && /^\d{2}:\d{2}$/.test(day.breakTo)
        ? day.breakTo
        : null;
    const rangeMinutes =
      fromRange && toRange ? breakRangeMinutes(fromRange, toRange) : 0;
    const inputtedBreak =
      rangeMinutes > 0 ? rangeMinutes : Math.max(0, day.breakMinutes || 0);
    const breakMinutes = effectiveBreakMinutes(slots, inputtedBreak);
    const breakFrom = slots.length
      ? autoWindow?.from || (rangeMinutes > 0 ? fromRange : null)
      : null;
    const breakTo = slots.length
      ? autoWindow?.to || (rangeMinutes > 0 ? toRange : null)
      : null;

    const manualKinds = new Set(["FULL", "HALF_AM", "HALF_PM", "MINUTES"]);
    const isManual =
      day.absenceSource === "MANUAL" &&
      !!day.absenceKind &&
      manualKinds.has(day.absenceKind);
    const isLeave = day.absenceSource === "LEAVE" && !!day.absenceKind;
    const fullAbsent = day.absenceKind === "FULL";
    if (slots.length > 0 && !fullAbsent) {
      // L3121-16 : ≥ 20 min dès 6 h brutes (plancher légal, indépendant du défaut UI)
      assertLegalBreak(slotsGrossMinutes(slots), breakMinutes, {
        minBreak: LEGAL_BREAK_MIN_MINUTES,
      });
    }
    const date = new Date(day.date);
    const gross = dayMinutes(slots, breakMinutes);
    const activeKind = isManual || isLeave ? day.absenceKind : null;
    const activeMinutes = isManual
      ? day.absenceKind === "FULL"
        ? settings.workdayMinutes
        : day.absenceKind === "HALF_AM" || day.absenceKind === "HALF_PM"
          ? Math.round(settings.workdayMinutes / 2)
          : Math.max(0, day.absenceMinutes || 0)
      : day.absenceMinutes || 0;
    const totalMinutes = netDayMinutes(
      gross,
      activeKind,
      activeMinutes,
      settings.workdayMinutes
    );
    const note =
      typeof day.note === "string" ? day.note.trim() || null : undefined;
    // Le congé accepté est réappliqué juste après : on ne le laisse pas écraser ici.
    const absenceWrite = isLeave
      ? {}
      : isManual
        ? {
            absenceKind: day.absenceKind!,
            absenceMinutes: activeMinutes,
            absenceLabel: day.absenceLabel?.trim() || "Absence",
            absenceSource: "MANUAL",
            absenceRequestId: null,
          }
        : {
            absenceKind: null,
            absenceMinutes: 0,
            absenceLabel: null,
            absenceSource: null,
            absenceRequestId: null,
          };
    await prisma.rhTimesheetDay.upsert({
      where: {
        timesheetId_date: { timesheetId: ts.id, date },
      },
      create: {
        timesheetId: ts.id,
        date,
        slots,
        breakMinutes: slots.length ? breakMinutes : 0,
        breakFrom,
        breakTo,
        totalMinutes,
        exception,
        note: note ?? null,
        absenceKind: isManual ? day.absenceKind! : null,
        absenceMinutes: isManual ? activeMinutes : 0,
        absenceLabel: isManual ? day.absenceLabel?.trim() || "Absence" : null,
        absenceSource: isManual ? "MANUAL" : null,
        absenceRequestId: null,
      },
      update: {
        slots,
        breakMinutes: slots.length ? breakMinutes : 0,
        breakFrom,
        breakTo,
        totalMinutes,
        exception,
        ...(note !== undefined ? { note } : {}),
        ...absenceWrite,
      },
    });
  }

  const refreshed = await prisma.rhTimesheetDay.findMany({
    where: { timesheetId: ts.id },
  });
  const totals = recalculateTotals(
    refreshed,
    params.weeklyHours,
    settings.ot25CapHours
  );

  // Week-end / férié exception → audit + notif SAZ + manager + RH
  const weekendDates = params.days
    .filter((d) => {
      const iso = d.date.slice(0, 10);
      if (!isWeekendOrHolidayIso(iso) || !d.exception) return false;
      return (d.slots || []).some((s) => s.from && s.to);
    })
    .map((d) => d.date.slice(0, 10));
  if (weekendDates.length > 0) {
    await writeRhAudit({
      actorId: params.employeeId,
      targetId: params.employeeId,
      action: "timesheet.weekend",
      detail: { timesheetId: ts.id, dates: weekendDates },
    });
    await notifyTimesheetWeekend({
      employeeId: params.employeeId,
      isoWeek: ts.isoWeek,
      dates: weekendDates,
    });
  }

  await prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: totals,
  });

  const synced = await reconcileTimesheetAbsences(ts.id);
  if (synced) return synced;
  return prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: ts.id },
    include: { days: { orderBy: { date: "asc" } } },
  });
}

export async function submitTimesheet(params: {
  timesheetId: string;
  employeeId: string;
  overtimeNote?: string;
}) {
  const ts = await prisma.rhTimesheet.findFirst({
    where: { id: params.timesheetId, employeeId: params.employeeId },
    include: { days: true },
  });
  if (!ts) throw new Error("Feuille introuvable");
  const settings = await getRhSettings();
  const overDays: Array<{ iso: string; note: string | null }> = [];
  for (const d of ts.days) {
    if (d.absenceKind === "FULL") continue;
    const slots = (Array.isArray(d.slots) ? d.slots : []) as Slot[];
    const iso = d.date.toISOString().slice(0, 10);
    if (slots.length > 0 && isWeekendOrHolidayIso(iso) && !d.exception) {
      throw new Error(
        `Coche « Exception » pour le ${iso} (week-end / férié) avant envoi`
      );
    }
    if (slots.length > 0) {
      assertLegalBreak(
        slotsGrossMinutes(slots),
        effectiveBreakMinutes(slots, d.breakMinutes),
        { minBreak: LEGAL_BREAK_MIN_MINUTES }
      );
    }
    // Demi-journée / récup : le total déjà déduit sert de base HS
    const isOver =
      d.totalMinutes > 0 &&
      (isWeekendOrHolidayIso(iso) ||
        d.totalMinutes > settings.workdayMinutes);
    if (isOver) {
      overDays.push({ iso, note: d.note });
    }
  }
  const missing = overDays.filter((d) => !d.note?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Justification obligatoire pour chaque jour en dépassement (${missing
        .map((d) => d.iso)
        .join(", ")})`
    );
  }
  const otTotal = ts.ot25Minutes + ts.ot50Minutes;
  const needsJustification = overDays.length > 0 || otTotal > 0;
  const dayNotesSummary = overDays
    .filter((d) => d.note?.trim())
    .map((d) => `${d.iso} : ${d.note!.trim()}`)
    .join("\n");
  const overtimeNote =
    dayNotesSummary || params.overtimeNote?.trim() || null;
  // HS hebdo (ex. 5×7,5 h) sans jour « dépassé » → motif semaine obligatoire
  if (otTotal > 0 && !overtimeNote) {
    throw new Error(
      "Justification obligatoire pour les heures supplémentaires (motif semaine ou par jour)"
    );
  }
  const microOt =
    otTotal > 0 && otTotal < settings.microOtMaxMinutes;

  const request = await createRhRequest({
    type: "TIMESHEET",
    status: "PENDING",
    employeeId: params.employeeId,
    title: microOt
      ? `HS < 30 min · S${ts.isoWeek}`
      : `Feuille de temps S${ts.isoWeek}`,
    comment: overtimeNote ?? undefined,
    dateFrom: ts.weekStart,
    dateTo: ts.weekEnd,
    payload: {
      timesheetId: ts.id,
      totalMinutes: ts.totalMinutes,
      ot25: ts.ot25Minutes,
      ot50: ts.ot50Minutes,
      microOt,
      needsJustification,
      dayNotes: overDays.map((d) => ({ date: d.iso, note: d.note })),
    },
    prefix: microOt ? "HS" : "TS",
  });

  await notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: "feuille de temps",
  });

  await writeRhAudit({
    actorId: params.employeeId,
    targetId: params.employeeId,
    action: "timesheet.submit",
    detail: {
      timesheetId: ts.id,
      requestId: request.id,
      totalMinutes: ts.totalMinutes,
      ot25: ts.ot25Minutes,
      ot50: ts.ot50Minutes,
      microOt,
    },
  });

  return prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: {
      status: "SUBMITTED",
      overtimeNote,
      requestId: request.id,
    },
    include: { days: true, request: true },
  });
}

export async function decideTimesheet(params: {
  timesheetId: string;
  reviewerId: string;
  action: "approve" | "refuse" | "pause";
  note?: string;
}) {
  const ts = await prisma.rhTimesheet.findUnique({
    where: { id: params.timesheetId },
  });
  if (!ts) throw new Error("Feuille introuvable");

  if (params.action === "pause") {
    await prisma.rhTimesheet.update({
      where: { id: ts.id },
      data: { status: "PAUSED", pauseNote: params.note },
    });
    if (ts.requestId) {
      await prisma.rhRequest.update({
        where: { id: ts.requestId },
        data: { status: "PAUSED", reviewNote: params.note },
      });
    }
    return;
  }

  const approved = params.action === "approve";
  const wasSubmitted = ts.status === "SUBMITTED" || ts.status === "PAUSED";
  await prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: {
      status: approved ? "APPROVED" : "DRAFT",
      // Refus → détache la demande pour pouvoir resoumettre proprement
      ...(approved ? {} : { requestId: null }),
    },
  });
  if (ts.requestId) {
    await prisma.rhRequest.update({
      where: { id: ts.requestId },
      data: {
        status: approved ? "APPROVED" : "REFUSED",
        reviewedById: params.reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.note,
      },
    });
  }
  if (approved && wasSubmitted) {
    const settings = await getRhSettings();
    const dayH = Math.max(1, settings.workdayMinutes / 60);
    const otDays =
      Math.round(
        ((ts.ot25Minutes + ts.ot50Minutes) / 60 / dayH) * 10000
      ) / 10000;
    if (otDays > 0) {
      const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
      const yearEnd = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31));
      const expiresOn =
        settings.recupExpiryDays > 0
          ? new Date(
              Date.now() + settings.recupExpiryDays * 24 * 60 * 60 * 1000
            )
          : null;
      const bal = await prisma.rhLeaveBalance.findFirst({
        where: { employeeId: ts.employeeId, accountCode: "RECUP" },
        orderBy: { periodStart: "desc" },
      });
      if (bal) {
        await prisma.rhLeaveBalance.update({
          where: { id: bal.id },
          data: {
            accrued: bal.accrued + otDays,
            remaining: bal.remaining + otDays,
            bookable: bal.bookable + otDays,
            expiresOn: expiresOn ?? bal.expiresOn,
          },
        });
      } else {
        await prisma.rhLeaveBalance.create({
          data: {
            employeeId: ts.employeeId,
            accountCode: "RECUP",
            label: "Récupération",
            periodStart: yearStart,
            periodEnd: yearEnd,
            accrued: otDays,
            taken: 0,
            remaining: otDays,
            bookable: otDays,
            expiresOn,
          },
        });
      }
    }
  }
  await writeRhAudit({
    actorId: params.reviewerId,
    targetId: ts.employeeId,
    action: `timesheet.${params.action}`,
    detail: { timesheetId: ts.id },
  });
  if (ts.requestId) {
    const req = await prisma.rhRequest.findUnique({ where: { id: ts.requestId } });
    if (req) {
      await notifyRhDecision({
        employeeId: ts.employeeId,
        title: req.title,
        reference: req.reference,
        approved,
        note: params.note,
      });
    }
  }
}

/** Manager / RH : envoie la feuille validée en signature au collaborateur. */
export async function requestTimesheetSignature(params: {
  timesheetId: string;
  actorId: string;
}) {
  const ts = await prisma.rhTimesheet.findUnique({
    where: { id: params.timesheetId },
  });
  if (!ts) throw new Error("Feuille introuvable");
  if (ts.status !== "APPROVED") {
    throw new Error("La feuille doit être validée avant envoi en signature");
  }
  if (ts.signedAt) throw new Error("Feuille déjà signée");

  await prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: {
      signatureRequestedAt: new Date(),
      signedAt: null,
      signedPdfUrl: null,
      signatureName: null,
      docusealSubmissionId: null,
      docusealSigningUrl: null,
    },
  });

  const { sendTimesheetToDocuSeal } = await import("@/lib/rh/timesheet-docuseal");
  let pdfUrl: string | null = null;
  let signingUrl: string | null = null;
  let submissionId: string | null = null;
  try {
    const sent = await sendTimesheetToDocuSeal(ts.id);
    pdfUrl = sent.pdfUrl;
    signingUrl = sent.signingUrl;
    submissionId = sent.submissionId;
  } catch (e) {
    console.error("[rh.timesheet] DocuSeal", e);
    throw e instanceof Error
      ? e
      : new Error("Envoi DocuSeal impossible");
  }

  const updated = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: ts.id },
    include: { days: true },
  });

  await writeRhAudit({
    actorId: params.actorId,
    targetId: ts.employeeId,
    action: "timesheet.requestSignature",
    detail: {
      timesheetId: ts.id,
      isoWeek: ts.isoWeek,
      pdfUrl,
      submissionId,
      via: "docuseal",
    },
  });
  await notifyTimesheetSignatureRequest({
    employeeId: ts.employeeId,
    isoWeek: ts.isoWeek,
    isoYear: ts.isoYear,
    pdfUrl,
    signingUrl,
  });
  return updated;
}

/**
 * Batch mensuel : pour chaque collab, les ~4 feuilles APPROVED du mois
 * → 1 envoi DocuSeal (plusieurs PDF, une signature).
 */
export async function requestMonthlySignatures(params: {
  year: number;
  month: number; // 1-12
  actorId?: string | null;
}) {
  const from = new Date(Date.UTC(params.year, params.month - 1, 1));
  const to = new Date(Date.UTC(params.year, params.month, 0));
  const sheets = await prisma.rhTimesheet.findMany({
    where: {
      status: "APPROVED",
      signedAt: null,
      weekStart: { gte: from, lte: to },
      docusealSubmissionId: null,
    },
    orderBy: [{ employeeId: "asc" }, { isoWeek: "asc" }],
  });

  const byEmployee = new Map<string, typeof sheets>();
  for (const ts of sheets) {
    const list = byEmployee.get(ts.employeeId) || [];
    list.push(ts);
    byEmployee.set(ts.employeeId, list);
  }

  const { sendMonthlyTimesheetsToDocuSeal } = await import(
    "@/lib/rh/timesheet-docuseal"
  );
  const { notifyTimesheetMonthlySignature } = await import("@/lib/rh/notify");

  let packages = 0;
  let weeks = 0;
  const errors: string[] = [];

  for (const [employeeId, empSheets] of byEmployee) {
    try {
      const result = await sendMonthlyTimesheetsToDocuSeal({
        employeeId,
        year: params.year,
        month: params.month,
        timesheetIds: empSheets.map((s) => s.id),
      });
      packages += 1;
      weeks += result.weekCount;
      await notifyTimesheetMonthlySignature({
        employeeId,
        year: params.year,
        month: params.month,
        weekCount: result.weekCount,
        weeks: empSheets.map((s) => s.isoWeek),
        signingUrl: result.signingUrl,
        pdfUrl: result.pdfUrls[0] ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      console.error("[rh.timesheet] monthly package", employeeId, e);
      errors.push(`${employeeId}: ${msg}`);
    }
  }

  await writeRhAudit({
    actorId: params.actorId || null,
    action: "timesheet.monthlySignatures",
    detail: {
      year: params.year,
      month: params.month,
      packages,
      weeks,
      employees: byEmployee.size,
      errors,
    },
  });
  return {
    packages,
    weeks,
    employees: byEmployee.size,
    total: sheets.length,
    errors,
  };
}

export async function signTimesheet(params: {
  timesheetId: string;
  employeeId: string;
  signatureName?: string;
  signatureImageDataUrl?: string | null;
}) {
  const ts = await prisma.rhTimesheet.findFirst({
    where: { id: params.timesheetId, employeeId: params.employeeId },
  });
  if (!ts || ts.status !== "APPROVED") {
    throw new Error("Signature possible uniquement après approbation");
  }
  if (!ts.signatureRequestedAt) {
    throw new Error("En attente d’envoi en signature par ton manager");
  }
  const name = (params.signatureName || "").trim();
  if (name.length < 2) {
    throw new Error("Indique ton nom pour attester la signature");
  }

  await prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signatureName: name,
    },
  });

  let signedPdfUrl: string | null = null;
  try {
    const { generateAndStoreSignedTimesheetPdf } = await import(
      "@/lib/rh/timesheet-pdf"
    );
    const { url } = await generateAndStoreSignedTimesheetPdf({
      timesheetId: ts.id,
      signatureName: name,
      signatureImageDataUrl: params.signatureImageDataUrl,
    });
    signedPdfUrl = url;
    await prisma.rhTimesheet.update({
      where: { id: ts.id },
      data: { signedPdfUrl: url },
    });
  } catch (e) {
    console.error("[rh.timesheet] signed PDF", e);
  }

  await writeRhAudit({
    actorId: params.employeeId,
    targetId: params.employeeId,
    action: "timesheet.sign",
    detail: { timesheetId: ts.id, signedPdfUrl },
  });

  return prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: ts.id },
    include: { days: true },
  });
}

/** Feuilles validées en attente de signature. HR = tout ; manager = ses reports. */
export async function listAwaitingSignature(opts?: {
  managerId?: string;
  hr?: boolean;
}) {
  return prisma.rhTimesheet.findMany({
    where: {
      status: "APPROVED",
      signedAt: null,
      ...(opts?.hr
        ? {}
        : opts?.managerId
          ? { employee: { managerId: opts.managerId } }
          : {}),
    },
    include: {
      employee: {
        include: {
          user: { select: { prenom: true, nom: true, email: true } },
        },
      },
    },
    orderBy: [{ isoYear: "desc" }, { isoWeek: "desc" }],
    take: 100,
  });
}

/** Feuilles déjà signées (accès RH / manager). */
export async function listSignedTimesheets(opts?: {
  managerId?: string;
  hr?: boolean;
  take?: number;
}) {
  return prisma.rhTimesheet.findMany({
    where: {
      status: "SIGNED",
      ...(opts?.hr
        ? {}
        : opts?.managerId
          ? { employee: { managerId: opts.managerId } }
          : {}),
    },
    include: {
      employee: {
        include: {
          user: { select: { prenom: true, nom: true, email: true } },
        },
      },
    },
    orderBy: [{ signedAt: "desc" }, { isoYear: "desc" }, { isoWeek: "desc" }],
    take: opts?.take ?? 100,
  });
}

export async function getTimesheetPdfBuffer(timesheetId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const { buildTimesheetPdfData, renderTimesheetPdfBuffer } = await import(
    "@/lib/rh/timesheet-pdf"
  );
  const ts = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: timesheetId },
    select: {
      status: true,
      signatureName: true,
      isoWeek: true,
      isoYear: true,
      employee: { select: { matricule: true } },
    },
  });
  const data = await buildTimesheetPdfData(timesheetId, {
    signed: ts.status === "SIGNED",
    signatureName: ts.signatureName,
  });
  if (ts.status !== "SIGNED" && data.signatureRequested) {
    data.signatureRequested = true;
  }
  const buffer = await renderTimesheetPdfBuffer(data);
  const filename = `feuille-temps-S${ts.isoWeek}-${ts.isoYear}-${ts.employee.matricule}.pdf`;
  return { buffer, filename };
}

export async function replyTimesheetPause(params: {
  timesheetId: string;
  employeeId: string;
  reply: string;
}) {
  const ts = await prisma.rhTimesheet.findFirst({
    where: { id: params.timesheetId, employeeId: params.employeeId },
  });
  if (!ts || ts.status !== "PAUSED") throw new Error("Feuille non en pause");
  await prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: { pauseReply: params.reply, status: "SUBMITTED" },
  });
  if (ts.requestId) {
    await prisma.rhRequest.update({
      where: { id: ts.requestId },
      data: { status: "PENDING", comment: params.reply },
    });
  }
}

/** Statuts considérés comme « déjà envoyés » (hors rappel RH). */
const SENT_STATUSES = new Set(["SUBMITTED", "APPROVED", "SIGNED"]);

/** Semaine ISO précédente (par défaut pour les rappels « non envoyées »). */
export function previousIsoWeekRef(from = new Date()): {
  isoYear: number;
  isoWeek: number;
  weekStart: Date;
  weekEnd: Date;
  label: string;
} {
  const d = new Date(from);
  d.setDate(d.getDate() - 7);
  const info = isoWeekInfo(d);
  return {
    ...info,
    label: `${info.isoYear}-W${String(info.isoWeek).padStart(2, "0")}`,
  };
}

/** Ancre Date → lundi de la semaine ISO demandée. */
export function dateFromIsoWeek(isoYear: number, isoWeek: number): Date {
  const thu = new Date(Date.UTC(isoYear, 0, 4, 12));
  const thuDow = thu.getUTCDay() || 7;
  const monday = new Date(thu);
  monday.setUTCDate(thu.getUTCDate() - (thuDow - 1) + (isoWeek - 1) * 7);
  return monday;
}

/**
 * Collabs actifs sans feuille soumise pour la semaine (MISSING / DRAFT / PAUSED).
 * HR = tout ; manager = son équipe.
 */
export async function listUnsubmittedTimesheets(opts: {
  isoYear: number;
  isoWeek: number;
  managerId?: string;
  hr?: boolean;
}) {
  const employees = await prisma.rhEmployee.findMany({
    where: {
      actif: true,
      ...(opts.hr
        ? {}
        : opts.managerId
          ? { managerId: opts.managerId }
          : { id: "__none__" }),
    },
    include: {
      user: {
        select: { prenom: true, nom: true, email: true },
      },
    },
    orderBy: [{ department: "asc" }, { matricule: "asc" }],
  });

  const sheets = await prisma.rhTimesheet.findMany({
    where: {
      isoYear: opts.isoYear,
      isoWeek: opts.isoWeek,
      employeeId: { in: employees.map((e) => e.id) },
    },
    select: {
      id: true,
      employeeId: true,
      status: true,
      totalMinutes: true,
      lastReminderAt: true,
      reminderCount: true,
      updatedAt: true,
    },
  });
  const byEmp = new Map(sheets.map((s) => [s.employeeId, s]));

  const items = employees
    .map((e) => {
      const ts = byEmp.get(e.id);
      if (ts && SENT_STATUSES.has(ts.status)) return null;
      const status = !ts
        ? "MISSING"
        : ts.status === "DRAFT"
          ? "DRAFT"
          : ts.status === "PAUSED"
            ? "PAUSED"
            : String(ts.status);
      return {
        employeeId: e.id,
        name: displayName(e.user),
        initials: initials(e.user),
        color: e.avatarColor,
        avatarUrl: e.avatarUrl,
        department: e.department,
        matricule: e.matricule,
        email: e.user.email,
        timesheetId: ts?.id ?? null,
        status,
        totalMinutes: ts?.totalMinutes ?? 0,
        lastReminderAt: ts?.lastReminderAt?.toISOString() ?? null,
        reminderCount: ts?.reminderCount ?? 0,
        updatedAt: ts?.updatedAt?.toISOString() ?? null,
      };
    })
    .filter(Boolean);

  return items as NonNullable<(typeof items)[number]>[];
}

/** Crée la feuille DRAFT si besoin, notifie le salarié, historise le rappel. */
export async function remindTimesheetSubmit(params: {
  employeeId: string;
  isoYear: number;
  isoWeek: number;
  actorId: string;
}) {
  const emp = await prisma.rhEmployee.findUnique({
    where: { id: params.employeeId },
    select: { id: true, weeklyHours: true, actif: true },
  });
  if (!emp || !emp.actif) throw new Error("Collaborateur introuvable");

  const weekStart = dateFromIsoWeek(params.isoYear, params.isoWeek);
  const { timesheet } = await getOrCreateTimesheet(
    emp.id,
    weekStart,
    emp.weeklyHours
  );

  if (SENT_STATUSES.has(timesheet.status)) {
    throw new Error("Cette feuille a déjà été envoyée");
  }

  const updated = await prisma.rhTimesheet.update({
    where: { id: timesheet.id },
    data: {
      lastReminderAt: new Date(),
      reminderCount: { increment: 1 },
    },
  });

  await writeRhAudit({
    actorId: params.actorId,
    targetId: emp.id,
    action: "timesheet.remind",
    detail: {
      timesheetId: timesheet.id,
      isoYear: params.isoYear,
      isoWeek: params.isoWeek,
      reminderCount: updated.reminderCount,
    },
  });

  await notifyTimesheetSubmitReminder({
    employeeId: emp.id,
    isoWeek: params.isoWeek,
    isoYear: params.isoYear,
  });

  return {
    timesheetId: updated.id,
    lastReminderAt: updated.lastReminderAt?.toISOString() ?? null,
    reminderCount: updated.reminderCount,
  };
}
