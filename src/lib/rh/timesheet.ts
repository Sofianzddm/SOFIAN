import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { splitOvertime } from "@/lib/rh/calculations";
import { createRhRequest, isoWeekInfo, writeRhAudit } from "@/lib/rh/workflow";
import { notifyRhRequestCreated, notifyRhDecision } from "@/lib/rh/notify";

type Slot = { from: string; to: string };

function hm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function dayMinutes(slots: Slot[], breakMinutes: number): number {
  let total = 0;
  for (const s of slots) {
    total += Math.max(0, hm(s.to) - hm(s.from));
  }
  return Math.max(0, total - breakMinutes);
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

  const totals = recalculateTotals(ts.days, weeklyHours);
  return { timesheet: ts, ...totals, info };
}

function recalculateTotals(
  days: { date: Date; totalMinutes: number; slots: unknown }[],
  weeklyHours: number
) {
  const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
  const { at25, at50 } = splitOvertime(totalMinutes, weeklyHours * 60);
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

  for (const day of params.days) {
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
  const totals = recalculateTotals(refreshed, params.weeklyHours);

  // Weekend saisie → audit (notif Sofian + manager + Maud en V1 = audit)
  const hasWeekend = params.days.some((d) => {
    const dow = new Date(d.date).getDay();
    return (dow === 0 || dow === 6) && d.slots.length > 0;
  });
  if (hasWeekend) {
    await writeRhAudit({
      actorId: params.employeeId,
      targetId: params.employeeId,
      action: "timesheet.weekend",
      detail: { timesheetId: ts.id },
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
  if (ts.ot25Minutes + ts.ot50Minutes > 0 && !params.overtimeNote?.trim()) {
    throw new Error("Commentaire obligatoire en présence d'heures supplémentaires");
  }

  const request = await createRhRequest({
    type: "TIMESHEET",
    status: "PENDING",
    employeeId: params.employeeId,
    title: `Feuille de temps S${ts.isoWeek}`,
    comment: params.overtimeNote,
    dateFrom: ts.weekStart,
    dateTo: ts.weekEnd,
    payload: {
      timesheetId: ts.id,
      totalMinutes: ts.totalMinutes,
      ot25: ts.ot25Minutes,
      ot50: ts.ot50Minutes,
    },
    prefix: "TS",
  });

  void notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: "feuille de temps",
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
    const otDays =
      Math.round(((ts.ot25Minutes + ts.ot50Minutes) / 60 / 7) * 10000) / 10000;
    if (otDays > 0) {
      const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
      const yearEnd = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31));
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
      void notifyRhDecision({
        employeeId: ts.employeeId,
        title: req.title,
        reference: req.reference,
        approved,
        note: params.note,
      });
    }
  }
}

export async function signTimesheet(params: {
  timesheetId: string;
  employeeId: string;
}) {
  const ts = await prisma.rhTimesheet.findFirst({
    where: { id: params.timesheetId, employeeId: params.employeeId },
  });
  if (!ts || ts.status !== "APPROVED") {
    throw new Error("Signature possible uniquement après approbation");
  }
  return prisma.rhTimesheet.update({
    where: { id: ts.id },
    data: { status: "SIGNED", signedAt: new Date() },
  });
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
