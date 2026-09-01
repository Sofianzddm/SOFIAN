import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  bookableBalance,
  coverageAfter,
  cpExercise,
  nextPeriodCpAccrued,
  LEAVE_LABELS,
  BALANCE_ACCOUNTS,
} from "@/lib/rh/calculations";
import {
  countWeekdays,
  createRhRequest,
  eachDate,
  isWorkday,
  writeRhAudit,
} from "@/lib/rh/workflow";
import { notifyRhRequestCreated, notifyRhDecision } from "@/lib/rh/notify";

const COVERAGE_THRESHOLD = 60;

export async function ensureCpAccrual(
  employeeId: string,
  hireDate: Date,
  today = new Date()
) {
  const current = cpExercise(today);
  const nextStart = new Date(Date.UTC(current.startYear + 1, 6, 1));
  const next = cpExercise(nextStart);
  const seniorityBookable =
    bookableBalance(1, hireDate, today, "CP") > 0 ? undefined : 0;

  // Exercice en cours : +2,08 j / mois clos. Un solde Lucca déjà plus élevé
  // (25 j crédités d'un coup) n'est jamais baissé.
  await upsertCpPeriod({
    employeeId,
    hireDate,
    today,
    label: current.label,
    start: current.start,
    end: current.end,
    targetAccrued: nextPeriodCpAccrued(today),
    forceBookable: seniorityBookable,
  });
  const nextAccrued = nextPeriodCpAccrued(nextStart);
  if (nextAccrued > 0) {
    await upsertCpPeriod({
      employeeId,
      hireDate,
      today,
      label: next.label,
      start: next.start,
      end: next.end,
      targetAccrued: nextAccrued,
      forceBookable: 0,
    });
  }
}

async function upsertCpPeriod(params: {
  employeeId: string;
  hireDate: Date;
  today: Date;
  label: string;
  start: Date;
  end: Date;
  targetAccrued: number;
  forceBookable?: number;
}) {
  const existing = await prisma.rhLeaveBalance.findUnique({
    where: {
      employeeId_accountCode_periodStart: {
        employeeId: params.employeeId,
        accountCode: "CP",
        periodStart: params.start,
      },
    },
  });
  if (!existing) {
    const remaining = params.targetAccrued;
    const bookable =
      params.forceBookable ??
      bookableBalance(remaining, params.hireDate, params.today, "CP");
    await prisma.rhLeaveBalance.create({
      data: {
        employeeId: params.employeeId,
        accountCode: "CP",
        label: params.label,
        periodStart: params.start,
        periodEnd: params.end,
        accrued: params.targetAccrued,
        taken: 0,
        remaining,
        bookable,
      },
    });
    return;
  }
  if (existing.accrued + 0.001 >= params.targetAccrued) return;
  const delta = Math.round((params.targetAccrued - existing.accrued) * 100) / 100;
  const remaining = existing.remaining + delta;
  await prisma.rhLeaveBalance.update({
    where: { id: existing.id },
    data: {
      accrued: params.targetAccrued,
      remaining,
      bookable:
        params.forceBookable ??
        bookableBalance(remaining, params.hireDate, params.today, "CP"),
    },
  });
}

export async function getBalancesForEmployee(employeeId: string, hireDate: Date) {
  await ensureCpAccrual(employeeId, hireDate);
  const balances = await prisma.rhLeaveBalance.findMany({
    where: { employeeId },
    orderBy: [{ accountCode: "asc" }, { periodStart: "asc" }],
  });
  const today = new Date();
  return balances.map((b) => {
    const futurePeriod = b.accountCode === "CP" && b.periodStart > today;
    const bookable =
      b.accountCode === "CP"
        ? futurePeriod
          ? 0
          : bookableBalance(b.remaining, hireDate, today, "CP")
        : b.bookable;
    return { ...b, bookable };
  });
}

function sumBookable(
  balances: Array<{ accountCode: string; bookable: number }>,
  accountCode: string
) {
  return balances
    .filter((b) => b.accountCode === accountCode)
    .reduce((s, b) => s + b.bookable, 0);
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
  const calendar = params.accountCode === "SS";
  const pool = eachDate(params.from, params.to).filter(
    (d) => calendar || isWorkday(d)
  );
  const days = countWeekdays(
    params.from,
    params.to,
    !!params.halfDay
  );
  const counted = calendar
    ? params.halfDay && pool.length === 1
      ? 0.5
      : params.halfDay
        ? Math.max(0.5, pool.length - 0.5)
        : pool.length
    : days;
  if (counted <= 0 || pool.length === 0) {
    throw new Error(
      "Aucune journée ouvrée dans la période (week-end et jours fériés exclus)"
    );
  }

  const balances = await getBalancesForEmployee(
    params.employeeId,
    params.hireDate
  );

  if (params.accountCode === "CP") {
    const seniorityOk = bookableBalance(1, params.hireDate, new Date(), "CP") > 0;
    if (!seniorityOk) {
      throw new Error(
        "Congés payés non posables avant 1 an d'ancienneté — utilisez un congé sans solde"
      );
    }
    if (sumBookable(balances, "CP") < counted) {
      throw new Error("Solde insuffisant pour cette demande");
    }
  } else if (BALANCE_ACCOUNTS.has(params.accountCode)) {
    const available = sumBookable(balances, params.accountCode);
    if (available < counted) {
      throw new Error("Solde insuffisant pour cette demande");
    }
  }

  const coverage = await computeTeamCoverage({
    employeeId: params.employeeId,
    department: params.department,
    from: params.from,
    to: params.to,
  });

  const label = LEAVE_LABELS[params.accountCode] || params.accountCode;
  const type = params.accountCode === "UNPAID" ? "UNPAID_LEAVE" : "LEAVE";
  const request = await createRhRequest({
    type,
    status: "PENDING",
    employeeId: params.employeeId,
    title: `${label} · ${String(counted).replace(".", ",")} j`,
    comment: params.comment,
    days: counted,
    dateFrom: params.from,
    dateTo: params.to,
    payload: {
      accountCode: params.accountCode,
      halfDay: !!params.halfDay,
      half: params.half ?? null,
      coverage,
    },
  });

  await prisma.rhLeaveDay.createMany({
    data: pool.map((date, idx) => {
      const isHalf =
        !!params.halfDay &&
        (pool.length === 1 || idx === pool.length - 1);
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
    detail: { requestId: request.id, days: counted, accountCode: params.accountCode },
  });

  void notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: label,
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
    if (accountCode && BALANCE_ACCOUNTS.has(accountCode)) {
      const bals = await prisma.rhLeaveBalance.findMany({
        where: { employeeId: request.employeeId, accountCode },
        orderBy: { periodStart: "asc" },
      });
      let left = request.days;
      for (const bal of bals) {
        if (left <= 0) break;
        const take = Math.min(bal.remaining, left);
        if (take <= 0) continue;
        const taken = bal.taken + take;
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
        left -= take;
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

  void notifyRhDecision({
    employeeId: request.employeeId,
    title: request.title,
    reference: request.reference,
    approved: params.approve,
    note: params.note,
  });

  return updated;
}

export async function accrueAllActiveEmployees(today = new Date()) {
  const emps = await prisma.rhEmployee.findMany({
    where: { actif: true },
    select: { id: true, hireDate: true },
  });
  for (const e of emps) {
    await ensureCpAccrual(e.id, e.hireDate, today);
  }
  return emps.length;
}
