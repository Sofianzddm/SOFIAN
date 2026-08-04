import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import { bookableBalance, coverageAfter } from "@/lib/rh/calculations";
import {
  countWeekdays,
  createRhRequest,
  eachDate,
  isWeekday,
  writeRhAudit,
} from "@/lib/rh/workflow";

const COVERAGE_THRESHOLD = 60;

export async function getBalancesForEmployee(employeeId: string, hireDate: Date) {
  const balances = await prisma.rhLeaveBalance.findMany({
    where: { employeeId },
    orderBy: { accountCode: "asc" },
  });
  const today = new Date();
  return balances.map((b) => {
    const bookable =
      b.accountCode === "CP"
        ? bookableBalance(b.remaining, hireDate, today, "CP")
        : b.bookable;
    return { ...b, bookable };
  });
}

export async function computeTeamCoverage(params: {
  employeeId: string;
  department: string;
  from: Date;
  to: Date;
}) {
  const team = await prisma.rhEmployee.findMany({
    where: { department: params.department, actif: true },
    select: { id: true },
  });
  const teamSize = team.length;
  const teamIds = team.map((t) => t.id);
  const absences = await prisma.rhLeaveDay.findMany({
    where: {
      employeeId: { in: teamIds },
      date: { gte: params.from, lte: params.to },
      request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
    },
    select: { employeeId: true, date: true },
  });
  const absentIds = new Set(absences.map((a) => a.employeeId));
  // If this request is new, include requester as potentially absent
  absentIds.add(params.employeeId);
  const presentAfter = Math.max(0, teamSize - absentIds.size);
  const pct = coverageAfter(presentAfter, teamSize);
  return {
    teamSize,
    presentAfter,
    percent: pct,
    belowThreshold: pct < COVERAGE_THRESHOLD,
    threshold: COVERAGE_THRESHOLD,
  };
}

export async function createLeaveRequest(params: {
  employeeId: string;
  hireDate: Date;
  department: string;
  accountCode: RhLeaveAccount;
  from: Date;
  to: Date;
  halfDay?: boolean;
  half?: "AM" | "PM";
  comment?: string;
}) {
  const days = countWeekdays(params.from, params.to, !!params.halfDay);
  if (days <= 0) {
    throw new Error("Aucune journée ouvrée dans la période");
  }

  if (params.accountCode === "CP") {
    const bookable = bookableBalance(1, params.hireDate, new Date(), "CP");
    const balances = await getBalancesForEmployee(params.employeeId, params.hireDate);
    const cp = balances.find((b) => b.accountCode === "CP");
    if (!cp || cp.bookable < days || bookable === 0) {
      throw new Error(
        "Congés payés non posables avant 1 an d'ancienneté — utilisez un congé sans solde"
      );
    }
  }

  if (params.accountCode !== "UNPAID") {
    const balances = await getBalancesForEmployee(params.employeeId, params.hireDate);
    const bal = balances.find((b) => b.accountCode === params.accountCode);
    if (!bal || bal.bookable < days) {
      throw new Error("Solde insuffisant pour cette demande");
    }
  }

  const coverage = await computeTeamCoverage({
    employeeId: params.employeeId,
    department: params.department,
    from: params.from,
    to: params.to,
  });

  const type = params.accountCode === "UNPAID" ? "UNPAID_LEAVE" : "LEAVE";
  const request = await createRhRequest({
    type,
    status: "PENDING",
    employeeId: params.employeeId,
    title: `Absence ${params.accountCode} · ${days} j`,
    comment: params.comment,
    days,
    dateFrom: params.from,
    dateTo: params.to,
    payload: {
      accountCode: params.accountCode,
      halfDay: !!params.halfDay,
      half: params.half ?? null,
      coverage,
    },
  });

  const weekdayDates = eachDate(params.from, params.to).filter(isWeekday);
  await prisma.rhLeaveDay.createMany({
    data: weekdayDates.map((date, idx) => {
      const isHalf =
        !!params.halfDay &&
        (weekdayDates.length === 1 || idx === weekdayDates.length - 1);
      return {
        employeeId: params.employeeId,
        requestId: request.id,
        date,
        accountCode: params.accountCode,
        halfDay: isHalf,
        half: isHalf ? params.half ?? "AM" : null,
        days: isHalf ? 0.5 : 1,
      };
    }),
  });

  await writeRhAudit({
    actorId: params.employeeId,
    targetId: params.employeeId,
    action: "leave.create",
    detail: { requestId: request.id, days, accountCode: params.accountCode },
  });

  return { request, coverage };
}

export async function decideLeaveRequest(params: {
  requestId: string;
  reviewerId: string;
  approve: boolean;
  note?: string;
}) {
  const request = await prisma.rhRequest.findUnique({
    where: { id: params.requestId },
    include: { leaveDays: true, employee: true },
  });
  if (!request) throw new Error("Demande introuvable");
  if (request.status !== "PENDING" && request.status !== "PAUSED") {
    throw new Error("Demande non décidable");
  }

  const status = params.approve ? "APPROVED" : "REFUSED";
  const updated = await prisma.rhRequest.update({
    where: { id: request.id },
    data: {
      status,
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
      reviewNote: params.note,
    },
  });

  if (params.approve && request.days && request.type !== "UNPAID_LEAVE") {
    const accountCode = (request.payload as { accountCode?: RhLeaveAccount })
      ?.accountCode;
    if (accountCode && accountCode !== "UNPAID") {
      const bal = await prisma.rhLeaveBalance.findFirst({
        where: { employeeId: request.employeeId, accountCode },
        orderBy: { periodStart: "desc" },
      });
      if (bal) {
        const taken = bal.taken + request.days;
        const remaining = Math.max(0, bal.accrued - taken);
        await prisma.rhLeaveBalance.update({
          where: { id: bal.id },
          data: {
            taken,
            remaining,
            bookable:
              accountCode === "CP"
                ? bookableBalance(
                    remaining,
                    request.employee.hireDate,
                    new Date(),
                    "CP"
                  )
                : remaining,
          },
        });
      }
    }
  }

  if (!params.approve) {
    await prisma.rhLeaveDay.deleteMany({ where: { requestId: request.id } });
  }

  await writeRhAudit({
    actorId: params.reviewerId,
    targetId: request.employeeId,
    action: params.approve ? "leave.approve" : "leave.refuse",
    detail: { requestId: request.id, note: params.note },
  });

  return updated;
}
