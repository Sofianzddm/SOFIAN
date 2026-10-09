import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mealVoucherCount, mileageAllowance } from "@/lib/rh/calculations";
import { isWorkday } from "@/lib/rh/holidays";
import { createRhRequest, writeRhAudit } from "@/lib/rh/workflow";
import { notifyRhRequestCreated, notifyRhDecision } from "@/lib/rh/notify";
import { getRhSettings, trPayrollDeductionOf } from "@/lib/rh/settings";

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

const MIN_JUSTIFICATION = 20;

/** Mappe une catégorie module Dépenses → nature RH. */
export function mapDepenseCategorieToRhNature(
  categorie: string | null | undefined
): string | null {
  if (!categorie) return null;
  const map: Record<string, string> = {
    "Déplacements": "Transport",
    Restauration: "Repas",
    Matériel: "Fournitures",
    Événements: "Hébergement",
    "Marketing & communication": "Admin",
    "Prestataires & freelances": "Admin",
    "Logiciels & abonnements": "Admin",
    Autres: "Admin",
  };
  return map[categorie] || "Admin";
}

export function assertExpenseJustification(text: string | null | undefined) {
  const t = (text || "").trim();
  if (t.length < MIN_JUSTIFICATION) {
    throw new Error(
      `Justifie la dépense (min. ${MIN_JUSTIFICATION} caractères) : contexte, avec qui, pourquoi`
    );
  }
  return t;
}

export async function computeTrForMonth(params: {
  employeeId: string;
  year: number;
  month: number; // 1-12
}) {
  const from = new Date(params.year, params.month - 1, 1);
  const to = new Date(params.year, params.month, 0);

  const emp = await prisma.rhEmployee.findUnique({
    where: { id: params.employeeId },
    select: { hireDate: true },
  });
  const hire = emp?.hireDate ?? from;

  // Jours ouvrés du mois après la date d'entrée (pas avant embauche)
  let workedOpenDays = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    day.setHours(12, 0, 0, 0);
    if (day < hire) continue;
    if (isWorkday(day)) workedOpenDays++;
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
  // Demi-journées = somme des days (0.5), pas le count de lignes
  const halfDays = leaveDays
    .filter((l) => l.halfDay)
    .reduce((s, l) => s + l.days, 0);

  // Uniquement NDF soumises / validées (pas DRAFT / REFUSED)
  const lines = await prisma.rhExpenseLine.findMany({
    where: {
      report: {
        employeeId: params.employeeId,
        periodYear: params.year,
        periodMonth: params.month,
        status: { in: ["SUBMITTED", "APPROVED", "PAID"] },
      },
    },
  });
  const companyMeals = lines.filter((l) => l.isCompanyMeal).length;
  const travelMealsNd = lines.filter((l) => l.isTravelMeal).length;

  // Présence : déplacement avec repas société / remboursé → pas de TR
  const travelDays = await prisma.rhWorkDay.findMany({
    where: {
      employeeId: params.employeeId,
      date: { gte: from, lte: to },
      place: "TRAVEL",
    },
  });
  const travelCoveredMeals = travelDays.filter(
    (d) => d.travelMeal === "COMPANY" || d.travelMeal === "REIMBURSED"
  ).length;
  const travelHalfDays = travelDays
    .filter((d) => d.portion === "AM" || d.portion === "PM")
    .reduce((s) => s + 0.5, 0);

  const companyMealsTotal = companyMeals + travelDays.filter((d) => d.travelMeal === "COMPANY").length;
  const travelMeals =
    travelMealsNd +
    travelDays.filter((d) => d.travelMeal === "REIMBURSED").length;

  const count = mealVoucherCount({
    workedOpenDays,
    leaveDays: leaveFull,
    sickDays,
    halfDays: halfDays + travelHalfDays,
    companyMeals: companyMealsTotal,
    reimbursedTravelMeals: travelMeals,
  });

  const settings = await getRhSettings();
  const unitDeduction = trPayrollDeductionOf(settings);
  return {
    workedOpenDays,
    leaveDays: leaveFull,
    sickDays,
    halfDays: halfDays + travelHalfDays,
    companyMeals: companyMealsTotal,
    travelMeals,
    travelCoveredMeals,
    count,
    facial: settings.trFacial,
    companyShare: settings.trCompanyShare,
    payrollDeduction: Math.round(count * unitDeduction * 100) / 100,
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
  justification?: string;
  comment?: string;
  talentIds?: string[];
  analyseIA?: Prisma.InputJsonValue | null;
  ocrVerified?: boolean;
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

  const justification = assertExpenseJustification(params.justification);
  const talentIds = Array.isArray(params.talentIds)
    ? [...new Set(params.talentIds.filter((id) => typeof id === "string" && id))]
    : [];

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
    const settings = await getRhSettings();
    amount = mileageAllowance(km, hp, { 5: settings.mileageRatePerKm }, settings.mileageRatePerKm);
    if (vehicle) {
      await prisma.rhVehicle.update({
        where: { id: vehicle.id },
        data: { yearKm: vehicle.yearKm + km },
      });
    }
  } else {
    if (!params.receiptUrl) {
      throw new Error("Justificatif obligatoire — scanne ton ticket");
    }
    if (!params.ocrVerified) {
      throw new Error(
        "Vérifie le scan du ticket et confirme que les montants sont corrects"
      );
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
      justification,
      comment: params.comment || null,
      talentIds,
      analyseIA: params.analyseIA ?? undefined,
      ocrVerified: !!params.isMileage || !!params.ocrVerified,
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
  if (report.lines.length === 0) {
    throw new Error("Ajoute au moins une dépense");
  }
  if (report.lines.some((l) => l.missingReceipt)) {
    throw new Error("Justificatifs manquants");
  }
  for (const l of report.lines) {
    if (!l.isMileage && !l.ocrVerified) {
      throw new Error(
        "Chaque ticket doit être scanné et vérifié avant envoi"
      );
    }
    try {
      assertExpenseJustification(l.justification || l.comment);
    } catch {
      throw new Error(
        `Justification manquante sur « ${l.label || l.category} »`
      );
    }
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

  await notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: "note de frais",
  });

  await writeRhAudit({
    actorId: params.employeeId,
    targetId: params.employeeId,
    action: "expense.submit",
    detail: {
      reportId: report.id,
      requestId: request.id,
      total: Number(report.totalAmount),
      lines: report.lines.length,
    },
  });

  return prisma.rhExpenseReport.update({
    where: { id: report.id },
    data: { status: "SUBMITTED", requestId: request.id },
    include: { lines: true, request: true },
  });
}

export async function updateExpenseLine(params: {
  lineId: string;
  employeeId: string;
  patch: {
    date?: Date;
    category?: string;
    label?: string;
    amount?: number;
    vatRate?: number;
    justification?: string | null;
    comment?: string | null;
    talentIds?: string[];
    analyseIA?: Prisma.InputJsonValue | null;
    ocrVerified?: boolean;
    receiptUrl?: string | null;
    receiptName?: string | null;
    missingReceipt?: boolean;
  };
}) {
  const line = await prisma.rhExpenseLine.findFirst({
    where: { id: params.lineId, report: { employeeId: params.employeeId } },
    include: { report: true },
  });
  if (!line || line.report.status !== "DRAFT") {
    throw new Error("Ligne non modifiable");
  }
  const nextJustification =
    params.patch.justification === undefined
      ? line.justification
      : params.patch.justification
        ? assertExpenseJustification(params.patch.justification)
        : null;
  const updated = await prisma.rhExpenseLine.update({
    where: { id: line.id },
    data: {
      date: params.patch.date ?? line.date,
      category: params.patch.category ?? line.category,
      label: params.patch.label ?? line.label,
      amount: params.patch.amount ?? line.amount,
      vatRate: params.patch.vatRate ?? line.vatRate,
      justification: nextJustification,
      comment: params.patch.comment === undefined ? line.comment : params.patch.comment,
      talentIds:
        params.patch.talentIds === undefined
          ? undefined
          : [...new Set(params.patch.talentIds.filter(Boolean))],
      analyseIA:
        params.patch.analyseIA === undefined
          ? undefined
          : params.patch.analyseIA === null
            ? Prisma.DbNull
            : params.patch.analyseIA,
      ocrVerified:
        params.patch.ocrVerified === undefined
          ? undefined
          : !!params.patch.ocrVerified,
      receiptUrl:
        params.patch.receiptUrl === undefined
          ? line.receiptUrl
          : params.patch.receiptUrl,
      receiptName:
        params.patch.receiptName === undefined
          ? line.receiptName
          : params.patch.receiptName,
      missingReceipt:
        params.patch.missingReceipt ??
        (!line.isMileage &&
          !(params.patch.receiptUrl ?? line.receiptUrl)),
      status:
        !line.isMileage && !(params.patch.receiptUrl ?? line.receiptUrl)
          ? "missing"
          : "ok",
    },
  });
  const agg = await prisma.rhExpenseLine.aggregate({
    where: { reportId: line.reportId },
    _sum: { amount: true },
  });
  await prisma.rhExpenseReport.update({
    where: { id: line.reportId },
    data: { totalAmount: agg._sum.amount ?? new Prisma.Decimal(0) },
  });
  return updated;
}

export async function deleteExpenseLine(params: {
  lineId: string;
  employeeId: string;
}) {
  const line = await prisma.rhExpenseLine.findFirst({
    where: { id: params.lineId, report: { employeeId: params.employeeId } },
    include: { report: true },
  });
  if (!line || line.report.status !== "DRAFT") {
    throw new Error("Ligne non supprimable");
  }
  await prisma.rhExpenseLine.delete({ where: { id: line.id } });
  const agg = await prisma.rhExpenseLine.aggregate({
    where: { reportId: line.reportId },
    _sum: { amount: true },
  });
  await prisma.rhExpenseReport.update({
    where: { id: line.reportId },
    data: { totalAmount: agg._sum.amount ?? new Prisma.Decimal(0) },
  });
}

export async function deleteExpenseReport(params: {
  reportId: string;
  employeeId: string;
}) {
  const report = await prisma.rhExpenseReport.findFirst({
    where: { id: params.reportId, employeeId: params.employeeId },
  });
  if (!report || report.status !== "DRAFT") {
    throw new Error("Note non supprimable (brouillon uniquement)");
  }
  await prisma.rhExpenseLine.deleteMany({ where: { reportId: report.id } });
  await prisma.rhExpenseReport.delete({ where: { id: report.id } });
}

export async function upsertVehicle(params: {
  employeeId: string;
  label: string;
  fiscalHorsepower: number;
  carteGriseExpiresOn?: Date | null;
  insuranceExpiresOn?: Date | null;
  licenseExpiresOn?: Date | null;
}) {
  return prisma.rhVehicle.upsert({
    where: { employeeId: params.employeeId },
    create: {
      employeeId: params.employeeId,
      label: params.label,
      fiscalHorsepower: params.fiscalHorsepower,
      carteGriseExpiresOn: params.carteGriseExpiresOn ?? null,
      insuranceExpiresOn: params.insuranceExpiresOn ?? null,
      licenseExpiresOn: params.licenseExpiresOn ?? null,
    },
    update: {
      label: params.label,
      fiscalHorsepower: params.fiscalHorsepower,
      carteGriseExpiresOn: params.carteGriseExpiresOn ?? null,
      insuranceExpiresOn: params.insuranceExpiresOn ?? null,
      licenseExpiresOn: params.licenseExpiresOn ?? null,
    },
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
      await notifyRhDecision({
        employeeId: report.employeeId,
        title: req.title,
        reference: req.reference,
        approved: params.approve,
        note: params.note,
      });
    }
  }
}
