import type { Prisma, RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import { bookableBalance, LEAVE_LABELS } from "@/lib/rh/calculations";
import { getRhSettings } from "@/lib/rh/settings";
import { writeRhAudit } from "@/lib/rh/workflow";
import {
  analyzePayslipPdf,
  matriculesMatch,
  type PayslipExtract,
} from "@/lib/rh/payslip-analyse";

const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function isFirstPayslipMonth(): Promise<boolean> {
  return prisma.rhPayslipScan
    .count({ where: { status: "APPLIED" } })
    .then((n) => n === 0);
}

async function upsertBalanceFromPayslip(params: {
  employeeId: string;
  hireDate: Date;
  accountCode: RhLeaveAccount;
  acquis: number | null;
  pris: number | null;
  solde: number | null;
  periodYear: number;
  periodMonth: number;
}) {
  if (
    params.acquis == null &&
    params.pris == null &&
    params.solde == null
  ) {
    return null;
  }

  const settings = await getRhSettings();
  const today = new Date();
  // Période d’exercice CP (souvent juin→mai) : on met à jour le solde courant
  const bal = await prisma.rhLeaveBalance.findFirst({
    where: {
      employeeId: params.employeeId,
      accountCode: params.accountCode,
      periodStart: { lte: today },
      periodEnd: { gte: today },
    },
    orderBy: { periodStart: "desc" },
  });

  const accrued = params.acquis ?? bal?.accrued ?? 0;
  const taken = params.pris ?? bal?.taken ?? 0;
  const remaining =
    params.solde ??
    Math.max(0, Math.round((accrued - taken) * 100) / 100);
  const bookable =
    params.accountCode === "CP"
      ? bookableBalance(
          remaining,
          params.hireDate,
          today,
          "CP",
          settings.cpSeniorityYears
        )
      : remaining;

  if (!bal) {
    const start = new Date(params.periodYear, params.periodMonth - 1, 1);
    const end = new Date(params.periodYear, params.periodMonth, 0);
    return prisma.rhLeaveBalance.create({
      data: {
        employeeId: params.employeeId,
        accountCode: params.accountCode,
        label: LEAVE_LABELS[params.accountCode] || params.accountCode,
        periodStart: start,
        periodEnd: end,
        accrued,
        taken,
        remaining,
        bookable,
      },
    });
  }

  return prisma.rhLeaveBalance.update({
    where: { id: bal.id },
    data: { accrued, taken, remaining, bookable },
  });
}

export async function applyPayslipScan(params: {
  scanId: string;
  actorId: string;
  verified: {
    cpAcquis?: number | null;
    cpPris?: number | null;
    cpSolde?: number | null;
    rttAcquis?: number | null;
    rttPris?: number | null;
    rttSolde?: number | null;
    grossSalary?: number | null;
    netPay?: number | null;
  };
}) {
  const scan = await prisma.rhPayslipScan.findUnique({
    where: { id: params.scanId },
    include: { employee: true },
  });
  if (!scan) throw new Error("Bulletin introuvable");
  if (scan.status === "APPLIED") throw new Error("Déjà appliqué");

  const v = params.verified;
  const cpAcquis = v.cpAcquis !== undefined ? v.cpAcquis : scan.cpAcquis;
  const cpPris = v.cpPris !== undefined ? v.cpPris : scan.cpPris;
  const cpSolde = v.cpSolde !== undefined ? v.cpSolde : scan.cpSolde;
  const rttAcquis = v.rttAcquis !== undefined ? v.rttAcquis : scan.rttAcquis;
  const rttPris = v.rttPris !== undefined ? v.rttPris : scan.rttPris;
  const rttSolde = v.rttSolde !== undefined ? v.rttSolde : scan.rttSolde;
  const grossSalary =
    v.grossSalary !== undefined ? v.grossSalary : scan.grossSalary;

  if (cpSolde == null && cpAcquis == null && cpPris == null) {
    throw new Error(
      "Indique au moins le solde CP (Acquis / Pris / Solde) avant d’appliquer"
    );
  }

  await upsertBalanceFromPayslip({
    employeeId: scan.employeeId,
    hireDate: scan.employee.hireDate,
    accountCode: "CP",
    acquis: cpAcquis,
    pris: cpPris,
    solde: cpSolde,
    periodYear: scan.periodYear,
    periodMonth: scan.periodMonth,
  });

  if (rttAcquis != null || rttPris != null || rttSolde != null) {
    await upsertBalanceFromPayslip({
      employeeId: scan.employeeId,
      hireDate: scan.employee.hireDate,
      accountCode: "RTT",
      acquis: rttAcquis,
      pris: rttPris,
      solde: rttSolde,
      periodYear: scan.periodYear,
      periodMonth: scan.periodMonth,
    });
  }

  if (grossSalary != null) {
    await prisma.rhEmployee.update({
      where: { id: scan.employeeId },
      data: { grossSalary },
    });
  }

  // Document dossier collab
  await prisma.rhDocument.create({
    data: {
      employeeId: scan.employeeId,
      kind: "PAYSLIP",
      title: `Bulletin ${MONTHS_FR[scan.periodMonth - 1]} ${scan.periodYear}`,
      status: "ACTIVE",
      url: scan.fileUrl,
      period: `${scan.periodYear}-${String(scan.periodMonth).padStart(2, "0")}`,
    },
  });

  const updated = await prisma.rhPayslipScan.update({
    where: { id: scan.id },
    data: {
      cpAcquis,
      cpPris,
      cpSolde,
      rttAcquis,
      rttPris,
      rttSolde,
      grossSalary,
      netPay: v.netPay !== undefined ? v.netPay : scan.netPay,
      ocrVerified: true,
      status: "APPLIED",
      appliedAt: new Date(),
      appliedById: params.actorId,
    },
  });

  await writeRhAudit({
    actorId: params.actorId,
    targetId: scan.employeeId,
    action: "payslip.apply",
    detail: {
      scanId: scan.id,
      period: `${scan.periodYear}-${scan.periodMonth}`,
      cpAcquis,
      cpPris,
      cpSolde,
      rttSolde,
      grossSalary,
    },
  });

  return updated;
}

async function upsertScanForEmployee(params: {
  emp: {
    id: string;
    matricule: string;
    user: { prenom: string; nom: string };
  };
  year: number;
  month: number;
  fileUrl: string;
  fileName: string;
  ex: PayslipExtract | null;
}) {
  const ex = params.ex;
  const analyseIA: Prisma.InputJsonValue | undefined = ex
    ? { ...ex, fileName: params.fileName }
    : { fileName: params.fileName, source: "manual-employee" };

  const row = await prisma.rhPayslipScan.upsert({
    where: {
      employeeId_periodYear_periodMonth: {
        employeeId: params.emp.id,
        periodYear: params.year,
        periodMonth: params.month,
      },
    },
    create: {
      employeeId: params.emp.id,
      periodYear: params.year,
      periodMonth: params.month,
      matricule: params.emp.matricule,
      fileUrl: params.fileUrl,
      fileName: params.fileName,
      rawHeader: ex?.rawHeader || null,
      analyseIA,
      cpAcquis: ex?.cpAcquis ?? null,
      cpPris: ex?.cpPris ?? null,
      cpSolde: ex?.cpSolde ?? null,
      rttAcquis: ex?.rttAcquis ?? null,
      rttPris: ex?.rttPris ?? null,
      rttSolde: ex?.rttSolde ?? null,
      grossSalary: ex?.grossSalary ?? null,
      netPay: ex?.netPay ?? null,
      status: "PENDING_VERIFY",
      ocrVerified: false,
    },
    update: {
      fileUrl: params.fileUrl,
      fileName: params.fileName,
      rawHeader: ex?.rawHeader || null,
      analyseIA,
      cpAcquis: ex?.cpAcquis ?? null,
      cpPris: ex?.cpPris ?? null,
      cpSolde: ex?.cpSolde ?? null,
      rttAcquis: ex?.rttAcquis ?? null,
      rttPris: ex?.rttPris ?? null,
      rttSolde: ex?.rttSolde ?? null,
      grossSalary: ex?.grossSalary ?? null,
      netPay: ex?.netPay ?? null,
      status: "PENDING_VERIFY",
      ocrVerified: false,
      appliedAt: null,
      appliedById: null,
    },
  });

  return {
    id: row.id,
    matricule: params.emp.matricule,
    name: `${params.emp.user.prenom} ${params.emp.user.nom}`.trim(),
  };
}

export async function ingestPayslipFile(params: {
  buffer: Buffer;
  fileUrl: string;
  fileName: string;
  /** Si fourni, force la période (sinon lue sur le bulletin) */
  forceYear?: number;
  forceMonth?: number;
  /** Salarié choisi manuellement (recommandé pour 1 bulletin) */
  employeeId?: string;
}): Promise<{
  extracts: PayslipExtract[];
  created: Array<{ id: string; matricule: string; name: string }>;
  unmatched: string[];
  errors: string[];
}> {
  const extracts = await analyzePayslipPdf(params.buffer);

  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    select: {
      id: true,
      matricule: true,
      user: { select: { prenom: true, nom: true } },
    },
  });

  const created: Array<{ id: string; matricule: string; name: string }> = [];
  const unmatched: string[] = [];
  const errors: string[] = [];

  const now = new Date();
  const defaultYear = params.forceYear || now.getFullYear();
  const defaultMonth = params.forceMonth || now.getMonth() + 1;

  // Mode salarié choisi : 1 bulletin → ce collab (OCR sert aux montants / soldes)
  if (params.employeeId) {
    const emp = employees.find((e) => e.id === params.employeeId);
    if (!emp) {
      return {
        extracts,
        created: [],
        unmatched: [],
        errors: ["Salarié introuvable"],
      };
    }
    // Si plusieurs pages OCR, on prend le 1er extrait (ou merge du matching matricule)
    const ex =
      extracts.find((e) => matriculesMatch(e.matricule, emp.matricule)) ||
      extracts[0] ||
      null;
    const year = params.forceYear || ex?.periodYear || defaultYear;
    const month = params.forceMonth || ex?.periodMonth || defaultMonth;
    try {
      created.push(
        await upsertScanForEmployee({
          emp,
          year,
          month,
          fileUrl: params.fileUrl,
          fileName: params.fileName,
          ex,
        })
      );
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "erreur");
    }
    return { extracts, created, unmatched, errors };
  }

  if (!extracts.length) {
    return {
      extracts: [],
      created: [],
      unmatched: [],
      errors: [
        "Aucun bulletin détecté. Choisis le salarié puis ré-uploade, ou vérifie le PDF.",
      ],
    };
  }

  for (const ex of extracts) {
    const year = params.forceYear || ex.periodYear;
    const month = params.forceMonth || ex.periodMonth;
    const emp = employees.find((e) =>
      matriculesMatch(e.matricule, ex.matricule)
    );
    if (!emp) {
      unmatched.push(
        `${ex.matricule} (${[ex.prenom, ex.nom].filter(Boolean).join(" ") || "?"})`
      );
      continue;
    }

    try {
      created.push(
        await upsertScanForEmployee({
          emp,
          year,
          month,
          fileUrl: params.fileUrl,
          fileName: params.fileName,
          ex,
        })
      );
    } catch (e) {
      errors.push(
        `${ex.matricule}: ${e instanceof Error ? e.message : "erreur"}`
      );
    }
  }

  return { extracts, created, unmatched, errors };
}

export async function getPayslipMonthStatus(params: {
  year: number;
  month: number;
}) {
  const firstMonth = await isFirstPayslipMonth();
  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    select: {
      id: true,
      matricule: true,
      department: true,
      user: { select: { prenom: true, nom: true, email: true } },
      leaveBalances: {
        where: { accountCode: { in: ["CP", "RTT"] } },
        orderBy: { periodStart: "desc" },
        take: 4,
      },
    },
    orderBy: [{ department: "asc" }, { matricule: "asc" }],
  });

  const scans = await prisma.rhPayslipScan.findMany({
    where: { periodYear: params.year, periodMonth: params.month },
  });
  const byEmp = new Map(scans.map((s) => [s.employeeId, s]));

  const rows = employees.map((e) => {
    const scan = byEmp.get(e.id) || null;
    const cp = e.leaveBalances.find((b) => b.accountCode === "CP");
    return {
      employeeId: e.id,
      matricule: e.matricule,
      name: `${e.user.prenom} ${e.user.nom}`.trim(),
      email: e.user.email,
      department: e.department,
      currentCpSolde: cp?.remaining ?? null,
      scan: scan
        ? {
            id: scan.id,
            status: scan.status,
            cpAcquis: scan.cpAcquis,
            cpPris: scan.cpPris,
            cpSolde: scan.cpSolde,
            rttSolde: scan.rttSolde,
            grossSalary: scan.grossSalary,
            netPay: scan.netPay,
            fileUrl: scan.fileUrl,
            fileName: scan.fileName,
            ocrVerified: scan.ocrVerified,
            appliedAt: scan.appliedAt,
            rawHeader: scan.rawHeader,
          }
        : null,
    };
  });

  const applied = rows.filter((r) => r.scan?.status === "APPLIED").length;
  const pending = rows.filter(
    (r) => r.scan?.status === "PENDING_VERIFY"
  ).length;
  const missing = rows.filter((r) => !r.scan).length;

  return {
    year: params.year,
    month: params.month,
    label: `${MONTHS_FR[params.month - 1]} ${params.year}`,
    firstMonth,
    requiredAll: firstMonth || true, // chaque mois : viser 100 %
    totals: {
      employees: rows.length,
      applied,
      pending,
      missing,
      complete: missing === 0 && pending === 0 && applied === rows.length,
    },
    rows,
  };
}
