import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mealVoucherCount, mileageAllowance } from "@/lib/rh/calculations";
import { isWorkday } from "@/lib/rh/holidays";
import { createRhRequest, writeRhAudit } from "@/lib/rh/workflow";
import { notifyRhRequestCreated, notifyRhDecision } from "@/lib/rh/notify";

export function vehicleDocsValid(vehicle: {
  carteGriseExpiresOn: Date | null;
  insuranceExpiresOn: Date | null;
  licenseExpiresOn: Date | null;
} | null): boolean {
  if (!vehicle) return false;
  const today = new Date();
  const ok = (d: Date | null) => !!d && d >= today;
  return (
    ok(vehicle.carteGriseExpiresOn) &&
    ok(vehicle.insuranceExpiresOn) &&
    ok(vehicle.licenseExpiresOn)
  );
}

export async function computeTrForMonth(params: {
  employeeId: string;
  year: number;
  month: number; // 1-12
}) {
  const from = new Date(params.year, params.month - 1, 1);
  const to = new Date(params.year, params.month, 0);
  let workedOpenDays = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (isWorkday(d)) workedOpenDays++;
  }

  const leaveDays = await prisma.rhLeaveDay.findMany({
    where: {
      employeeId: params.employeeId,
      date: { gte: from, lte: to },
      request: { status: { in: ["APPROVED", "SIGNED"] } },
    },
  });

  const leaveFull = leaveDays
    .filter((l) => l.accountCode !== "SS" && !l.halfDay)
    .reduce((s, l) => s + l.days, 0);
  const sickDays = leaveDays
    .filter((l) => l.accountCode === "SS")
    .reduce((s, l) => s + l.days, 0);
  const halfDays = leaveDays.filter((l) => l.halfDay).length;

  const lines = await prisma.rhExpenseLine.findMany({
    where: {
      report: {
        employeeId: params.employeeId,
        periodYear: params.year,
        periodMonth: params.month,
      },
    },
  });
  const companyMeals = lines.filter((l) => l.isCompanyMeal).length;
  const travelMeals = lines.filter((l) => l.isTravelMeal).length;

  const count = mealVoucherCount({
    workedOpenDays,
    leaveDays: leaveFull,
    sickDays,
    halfDays,
    companyMeals,
    reimbursedTravelMeals: travelMeals,
  });

  return {
    workedOpenDays,
    leaveDays: leaveFull,
    sickDays,
    halfDays,
    companyMeals,
    travelMeals,
    count,
    facial: 9,
    companyShare: 5.4,
    payrollDeduction: Math.round(count * 3.6 * 100) / 100,
  };
}

export async function createExpenseReport(params: {
  employeeId: string;
  label: string;
  periodMonth: number;
  periodYear: number;
}) {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT nextval('rh_expense_report_number_seq')::int AS n
  `;
  const number = rows[0]?.n ?? Date.now() % 100000;
  return prisma.rhExpenseReport.create({
    data: {
      number,
      employeeId: params.employeeId,
      label: params.label,
      periodMonth: params.periodMonth,
      periodYear: params.periodYear,
    },
  });
}

export async function addExpenseLine(params: {
  reportId: string;
  employeeId: string;
  date: Date;
  category: string;
  label: string;
  amount: number;
  vatRate?: number;
  vatAmount?: number;
  reimbursedAmount?: number | null;
  receiptUrl?: string;
  receiptName?: string;
  missingReceipt?: boolean;
  comment?: string;
  isCompanyMeal?: boolean;
  isTravelMeal?: boolean;
  isMileage?: boolean;
  km?: number;
  fiscalHp?: number;
}) {
  const report = await prisma.rhExpenseReport.findFirst({
    where: { id: params.reportId, employeeId: params.employeeId },
  });
  if (!report || report.status !== "DRAFT") {
    throw new Error("Note de frais non modifiable");
  }

  let amount = params.amount;
  if (params.isMileage) {
    const vehicle = await prisma.rhVehicle.findUnique({
      where: { employeeId: params.employeeId },
    });
    if (!vehicleDocsValid(vehicle)) {
      throw new Error("IK bloquées : documents véhicule périmés ou absents");
    }
    const km = params.km ?? 0;
    const hp = params.fiscalHp ?? vehicle?.fiscalHorsepower ?? 5;
    amount = mileageAllowance(km, hp);
    if (vehicle) {
      await prisma.rhVehicle.update({
        where: { id: vehicle.id },
        data: { yearKm: vehicle.yearKm + km },
      });
    }
  }

  const vatRate = params.isMileage ? 0 : Number(params.vatRate ?? 0);
  const vatAmount =
    params.vatAmount != null
      ? Number(params.vatAmount)
      : Math.round(((amount * vatRate) / (100 + vatRate)) * 100) / 100;

  const line = await prisma.rhExpenseLine.create({
    data: {
      reportId: params.reportId,
      date: params.date,
      category: params.category,
      label: params.label,
      amount,
      vatRate,
      vatAmount: params.isMileage ? 0 : vatAmount,
      reimbursedAmount:
        params.reimbursedAmount == null ? null : params.reimbursedAmount,
      receiptUrl: params.receiptUrl,
      receiptName: params.receiptName,
      missingReceipt: !!params.missingReceipt || (!params.isMileage && !params.receiptUrl),
      comment: params.comment || null,
      isCompanyMeal: !!params.isCompanyMeal,
      isTravelMeal: !!params.isTravelMeal,
      isMileage: !!params.isMileage,
      km: params.km,
      fiscalHp: params.fiscalHp,
      status:
        !params.isMileage && !params.receiptUrl
          ? "missing"
          : params.missingReceipt
            ? "missing"
            : "ok",
    },
  });

  const agg = await prisma.rhExpenseLine.aggregate({
    where: { reportId: params.reportId },
    _sum: { amount: true },
  });
  await prisma.rhExpenseReport.update({
    where: { id: params.reportId },
    data: { totalAmount: agg._sum.amount ?? new Prisma.Decimal(0) },
  });

  return line;
}

export async function submitExpenseReport(params: {
  reportId: string;
  employeeId: string;
}) {
  const report = await prisma.rhExpenseReport.findFirst({
    where: { id: params.reportId, employeeId: params.employeeId },
    include: { lines: true },
  });
  if (!report) throw new Error("Note introuvable");
  if (report.lines.some((l) => l.missingReceipt)) {
    throw new Error("Justificatifs manquants");
  }

  const request = await createRhRequest({
    type: "EXPENSE",
    status: "PENDING",
    employeeId: params.employeeId,
    title: report.label,
    days: undefined,
    payload: {
      reportId: report.id,
      total: Number(report.totalAmount),
    },
    prefix: "NDF",
  });

  void notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: "note de frais",
  });

  return prisma.rhExpenseReport.update({
    where: { id: report.id },
    data: { status: "SUBMITTED", requestId: request.id },
    include: { lines: true, request: true },
  });
}

export async function decideExpense(params: {
  reportId: string;
  reviewerId: string;
  approve: boolean;
  note?: string;
}) {
  const report = await prisma.rhExpenseReport.findUnique({
    where: { id: params.reportId },
  });
  if (!report) throw new Error("Note introuvable");
  await prisma.rhExpenseReport.update({
    where: { id: report.id },
    data: { status: params.approve ? "APPROVED" : "REFUSED" },
  });
  if (report.requestId) {
    await prisma.rhRequest.update({
      where: { id: report.requestId },
      data: {
        status: params.approve ? "APPROVED" : "REFUSED",
        reviewedById: params.reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.note,
      },
    });
  }
  await writeRhAudit({
    actorId: params.reviewerId,
    targetId: report.employeeId,
    action: params.approve ? "expense.approve" : "expense.refuse",
    detail: { reportId: report.id },
  });
  if (report.requestId) {
    const req = await prisma.rhRequest.findUnique({
      where: { id: report.requestId },
    });
    if (req) {
      void notifyRhDecision({
        employeeId: report.employeeId,
        title: req.title,
        reference: req.reference,
        approved: params.approve,
        note: params.note,
      });
    }
  }
}
