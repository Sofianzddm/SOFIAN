import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  assertLegalBreak,
  LEGAL_BREAK_MIN_MINUTES,
  slotsGrossMinutes,
  splitOvertime,
} from "@/lib/rh/calculations";
import { createRhRequest, isoWeekInfo, writeRhAudit } from "@/lib/rh/workflow";
import {
  notifyRhRequestCreated,
  notifyRhDecision,
  notifyTimesheetWeekend,
  notifyTimesheetSignatureRequest,
} from "@/lib/rh/notify";
import { isFrenchHoliday } from "@/lib/rh/holidays";
import { getRhSettings } from "@/lib/rh/settings";

type Slot = { from: string; to: string };

function dayMinutes(slots: Slot[], breakMinutes: number): number {
  return Math.max(0, slotsGrossMinutes(slots) - breakMinutes);
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
      d.setDate(info.weekStart.getDate() + i);
      dayRows.push({
        date: d,
        slots: [],
        breakMinutes: i < 5 ? 60 : 0,
        totalMinutes: 0,
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

export async function updateTimesheetDays(params: {
  timesheetId: string;
  employeeId: string;
  weeklyHours: number;
  days: {
    date: string;
    slots: Slot[];
    breakMinutes: number;
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
    if (day.slots.length > 0) {
      // L3121-16 : ≥ 20 min dès 6 h brutes (plancher légal, indépendant du défaut UI)
      assertLegalBreak(slotsGrossMinutes(day.slots), day.breakMinutes, {
        minBreak: LEGAL_BREAK_MIN_MINUTES,
      });
    }
    const date = new Date(day.date);
    const totalMinutes = dayMinutes(day.slots, day.breakMinutes);
    await prisma.rhTimesheetDay.upsert({
      where: {
        timesheetId_date: { timesheetId: ts.id, date },
      },
      create: {
        timesheetId: ts.id,
        date,
        slots: day.slots,
        breakMinutes: day.breakMinutes,
        totalMinutes,
      },
      update: {
        slots: day.slots,
        breakMinutes: day.breakMinutes,
        totalMinutes,
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

  // Week-end / férié → audit + notif SAZ + manager + RH
  const weekendDates = params.days
    .filter((d) => {
      if (!d.slots.length) return false;
      const iso = d.date.slice(0, 10);
      const dow = new Date(`${iso}T12:00:00`).getDay();
      return dow === 0 || dow === 6 || isFrenchHoliday(iso);
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

  return prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: totals,
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
  for (const d of ts.days) {
    const slots = (Array.isArray(d.slots) ? d.slots : []) as Slot[];
    if (slots.length > 0) {
      assertLegalBreak(slotsGrossMinutes(slots), d.breakMinutes, {
        minBreak: LEGAL_BREAK_MIN_MINUTES,
      });
    }
  }
  const dayOverHours = ts.days.some((d) => {
    const dow = new Date(d.date).getUTCDay();
    if (dow === 0 || dow === 6) return false;
    return d.totalMinutes > settings.workdayMinutes;
  });
  const otTotal = ts.ot25Minutes + ts.ot50Minutes;
  const needsJustification = otTotal > 0 || dayOverHours;
  if (needsJustification && !params.overtimeNote?.trim()) {
    throw new Error(
      "Justification obligatoire dès que les horaires de travail sont dépassés"
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
    comment: params.overtimeNote,
    dateFrom: ts.weekStart,
    dateTo: ts.weekEnd,
    payload: {
      timesheetId: ts.id,
      totalMinutes: ts.totalMinutes,
      ot25: ts.ot25Minutes,
      ot50: ts.ot50Minutes,
      microOt,
      needsJustification,
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
      overtimeNote: params.overtimeNote,
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
    data: { status: approved ? "APPROVED" : "DRAFT" },
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
