import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  bookableBalance,
  coverageAfter,
  cpExercise,
  nextPeriodCpAccrued,
  LEAVE_LABELS,
  BALANCE_ACCOUNTS,
  assertRecupMinutes,
} from "@/lib/rh/calculations";
import {
  countWeekdays,
  createRhRequest,
  eachDate,
  isWorkday,
  writeRhAudit,
} from "@/lib/rh/workflow";
import { notifyRhRequestCreated, notifyRhDecision } from "@/lib/rh/notify";
import { getRhSettings } from "@/lib/rh/settings";

export async function ensureCpAccrual(
  employeeId: string,
  hireDate: Date,
  today = new Date()
) {
  const settings = await getRhSettings();
  const startMonth = settings.cpExerciseStartMonth;
  const current = cpExercise(today, startMonth);
  const nextStart = new Date(
    Date.UTC(current.startYear + 1, startMonth, 1)
  );
  const next = cpExercise(nextStart, startMonth);
  const seniorityBookable =
    bookableBalance(1, hireDate, today, "CP", settings.cpSeniorityYears) > 0
      ? undefined
      : 0;

  // Exercice en cours : accrual mensuel. Un solde Lucca déjà plus élevé n'est jamais baissé.
  await upsertCpPeriod({
    employeeId,
    hireDate,
    today,
    label: current.label,
    start: current.start,
    end: current.end,
    targetAccrued: nextPeriodCpAccrued(today, {
      daysPerYear: settings.cpDaysPerYear,
      startMonth,
    }),
    forceBookable: seniorityBookable,
    seniorityYears: settings.cpSeniorityYears,
  });
  const nextAccrued = nextPeriodCpAccrued(nextStart, {
    daysPerYear: settings.cpDaysPerYear,
    startMonth,
  });
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
      seniorityYears: settings.cpSeniorityYears,
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
  seniorityYears?: number;
}) {
  const years = params.seniorityYears ?? 1;
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
      bookableBalance(remaining, params.hireDate, params.today, "CP", years);
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
        bookableBalance(remaining, params.hireDate, params.today, "CP", years),
    },
  });
}

export async function getBalancesForEmployee(employeeId: string, hireDate: Date) {
  await ensureCpAccrual(employeeId, hireDate);
  const settings = await getRhSettings();
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
          : bookableBalance(
              b.remaining,
              hireDate,
              today,
              "CP",
              settings.cpSeniorityYears
            )
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
  const settings = await getRhSettings();
  const threshold = settings.coverageThresholdPercent;
  return {
    teamSize,
    presentAfter,
    percent: pct,
    belowThreshold: pct < threshold,
    threshold,
  };
}

/** Jours déjà posés (PENDING/APPROVED) qui chevauchent la plage. */
async function assertNoLeaveOverlap(params: {
  employeeId: string;
  dates: Date[];
  halfDay?: boolean;
  half?: "AM" | "PM" | null;
}) {
  if (params.dates.length === 0) return;
  const dayStarts = params.dates.map((d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  });
  const existing = await prisma.rhLeaveDay.findMany({
    where: {
      employeeId: params.employeeId,
      date: { in: dayStarts },
      OR: [
        { requestId: null },
        { request: { status: { in: ["PENDING", "APPROVED", "SIGNED", "PAUSED"] } } },
      ],
    },
    select: { date: true, halfDay: true, half: true },
  });
  for (const row of existing) {
    const isFull = !row.halfDay || !row.half;
    const wantHalf = !!params.halfDay;
    const wantHalfSlot = params.half ?? "AM";
    if (isFull || !wantHalf) {
      throw new Error(
        `Tu as déjà une absence le ${row.date.toLocaleDateString("fr-FR")} — choisis une autre date.`
      );
    }
    if (row.half === wantHalfSlot) {
      throw new Error(
        `La demi-journée ${wantHalfSlot === "AM" ? "matin" : "après-midi"} du ${row.date.toLocaleDateString("fr-FR")} est déjà prise.`
      );
    }
  }
}

/** Débite un solde (CP/RTT/RECUP) de `days` jours. */
export async function debitLeaveBalance(params: {
  employeeId: string;
  hireDate: Date;
  accountCode: RhLeaveAccount;
  days: number;
}) {
  if (!BALANCE_ACCOUNTS.has(params.accountCode) || params.days <= 0) return;
  const bals = await prisma.rhLeaveBalance.findMany({
    where: {
      employeeId: params.employeeId,
      accountCode: params.accountCode,
    },
    orderBy: { periodStart: "asc" },
  });
  let left = params.days;
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
          params.accountCode === "CP"
            ? bookableBalance(remaining, params.hireDate, new Date(), "CP")
            : remaining,
      },
    });
    left -= take;
  }
  if (left > 0.001) {
    throw new Error("Solde insuffisant pour cette opération");
  }
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
  /** Récup / absence courte : 15–420 min (prioritaire sur demi-journée). */
  minutes?: number;
  comment?: string;
}) {
  const hourly =
    params.minutes != null &&
    (params.accountCode === "RECUP" || params.accountCode === "AUTHORIZED");

  const settings = await getRhSettings();
  if (hourly) {
    assertRecupMinutes(params.minutes!, {
      min: settings.recupMinMinutes,
      max: settings.recupMaxMinutes,
      step: settings.recupStepMinutes,
    });
  }

  const calendar = params.accountCode === "SS";
  // Maladie : motif / contexte obligatoire (justificatif médical côté dossier)
  if (params.accountCode === "SS" && !params.comment?.trim()) {
    throw new Error(
      "Motif obligatoire pour un arrêt maladie (précise aussi le dépôt du justificatif)"
    );
  }
  const pool = hourly
    ? [params.from]
    : eachDate(params.from, params.to).filter((d) => calendar || isWorkday(d));

  if (hourly && !isWorkday(params.from) && params.accountCode !== "SS") {
    throw new Error("La récupération horaire se pose sur un jour ouvré");
  }

  const days = countWeekdays(params.from, params.to, !!params.halfDay);
  const counted = hourly
    ? Math.round((params.minutes! / settings.workdayMinutes) * 10000) / 10000
    : calendar
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

  if (hourly) {
    const existingAny = await prisma.rhLeaveDay.findFirst({
      where: {
        employeeId: params.employeeId,
        date: pool[0],
        OR: [
          { requestId: null },
          {
            request: {
              status: { in: ["PENDING", "APPROVED", "SIGNED", "PAUSED"] },
            },
          },
        ],
      },
    });
    if (existingAny) {
      throw new Error(
        `Tu as déjà une absence le ${pool[0].toLocaleDateString("fr-FR")}`
      );
    }
  } else {
    await assertNoLeaveOverlap({
      employeeId: params.employeeId,
      dates: pool,
      halfDay: params.halfDay,
      half: params.half,
    });
  }

  const balances = await getBalancesForEmployee(
    params.employeeId,
    params.hireDate
  );

  // Solde disponible = bookable − déjà réservé (PENDING)
  const pendingReserved = await prisma.rhLeaveDay.aggregate({
    where: {
      employeeId: params.employeeId,
      accountCode: params.accountCode,
      request: { status: { in: ["PENDING", "PAUSED"] } },
    },
    _sum: { days: true },
  });
  const reserved = pendingReserved._sum.days ?? 0;

  if (params.accountCode === "RECUP") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = balances.some(
      (b) =>
        b.accountCode === "RECUP" &&
        b.expiresOn &&
        b.expiresOn < today &&
        b.remaining > 0
    );
    const activeRecup = balances.filter(
      (b) =>
        b.accountCode === "RECUP" &&
        (!b.expiresOn || b.expiresOn >= params.from)
    );
    const availableRecup =
      activeRecup.reduce((s, b) => s + b.bookable, 0) - reserved;
    if (expired && availableRecup < counted) {
      throw new Error(
        "Récupération expirée ou hors fenêtre — impossible de poser ces jours."
      );
    }
    if (availableRecup < counted) {
      throw new Error(
        "Solde récup insuffisant (ou hors fenêtre d’utilisation)."
      );
    }
  } else if (params.accountCode === "CP") {
    const seniorityOk =
      bookableBalance(
        1,
        params.hireDate,
        new Date(),
        "CP",
        settings.cpSeniorityYears
      ) > 0;
    if (!seniorityOk) {
      throw new Error(
        `Congés payés non posables avant ${settings.cpSeniorityYears} an d'ancienneté — utilise RTT, récup ou sans solde.`
      );
    }
    if (sumBookable(balances, "CP") - reserved < counted) {
      throw new Error(
        "Solde insuffisant (en tenant compte des demandes déjà en attente)."
      );
    }
  } else if (BALANCE_ACCOUNTS.has(params.accountCode)) {
    const available = sumBookable(balances, params.accountCode) - reserved;
    if (available < counted) {
      throw new Error(
        "Solde insuffisant (en tenant compte des demandes déjà en attente)."
      );
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
  const titleDays = hourly
    ? `${params.minutes} min`
    : `${String(counted).replace(".", ",")} j`;

  const result = await prisma.$transaction(async () => {
    const request = await createRhRequest({
      type,
      status: "PENDING",
      employeeId: params.employeeId,
      title: `${label} · ${titleDays}`,
      comment: params.comment,
      days: counted,
      dateFrom: params.from,
      dateTo: hourly ? params.from : params.to,
      payload: {
        accountCode: params.accountCode,
        halfDay: !!params.halfDay && !hourly,
        half: hourly ? "H" : params.half ?? null,
        minutes: hourly ? params.minutes : null,
        coverage,
      },
    });

    if (hourly) {
      await prisma.rhLeaveDay.create({
        data: {
          employeeId: params.employeeId,
          requestId: request.id,
          date: pool[0],
          accountCode: params.accountCode,
          halfDay: false,
          half: "H",
          days: counted,
          minutes: params.minutes!,
        },
      });
    } else {
      // half = "FULL" pour journée entière → unique Postgres effective
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
            half: isHalf ? params.half ?? "AM" : "FULL",
            days: isHalf ? 0.5 : 1,
          };
        }),
      });
    }

    await writeRhAudit({
      actorId: params.employeeId,
      targetId: params.employeeId,
      action: "leave.create",
      detail: {
        requestId: request.id,
        days: counted,
        minutes: params.minutes ?? null,
        accountCode: params.accountCode,
      },
    });

    return request;
  });

  await notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: result.title,
    reference: result.reference,
    type: label,
  });

  return { request: result, coverage };
}

export async function decideLeaveRequest(params: {
  requestId: string;
  reviewerId: string;
  approve: boolean;
  note?: string;
}) {
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.rhRequest.findUnique({
      where: { id: params.requestId },
      include: { leaveDays: true, employee: true },
    });
    if (!request) throw new Error("Demande introuvable");
    if (request.status !== "PENDING" && request.status !== "PAUSED") {
      throw new Error("Demande non décidable");
    }

    const status = params.approve ? "APPROVED" : "REFUSED";
    const row = await tx.rhRequest.update({
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
        const bals = await tx.rhLeaveBalance.findMany({
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
          await tx.rhLeaveBalance.update({
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
        if (left > 0.001) {
          throw new Error("Solde insuffisant pour approuver cette demande");
        }
      }
    }

    if (!params.approve) {
      await tx.rhLeaveDay.deleteMany({ where: { requestId: request.id } });
    }

    await tx.rhAuditLog.create({
      data: {
        actorId: params.reviewerId,
        targetId: request.employeeId,
        action: params.approve ? "leave.approve" : "leave.refuse",
        detail: { requestId: request.id, note: params.note },
      },
    });

    return { row, employeeId: request.employeeId, title: request.title, reference: request.reference };
  });

  await notifyRhDecision({
    employeeId: updated.employeeId,
    title: updated.title,
    reference: updated.reference,
    approved: params.approve,
    note: params.note,
  });

  return updated.row;
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
