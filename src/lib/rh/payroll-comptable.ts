/**
 * Export mensuel complet pour l’expert-comptable.
 * Classeur multi-onglets, colonnes FR explicites, 1 clé = Matricule.
 */
import ExcelJS from "exceljs";
import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import { LEAVE_LABELS } from "@/lib/rh/calculations";
import { computeTrForMonth } from "@/lib/rh/expenses";
import { getRhSettings, trPayrollDeductionOf } from "@/lib/rh/settings";

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

const PLACE_FR: Record<string, string> = {
  OFFICE: "Bureau",
  REMOTE: "Télétravail",
  TRAVEL: "Déplacement",
  SITE: "Site",
};

const HEALTH_FR: Record<string, string> = {
  ENROLLED: "Affilié mutuelle",
  WAIVED: "Dispensé mutuelle",
};

const ALL_LEAVE: RhLeaveAccount[] = [
  "CP",
  "RECUP",
  "RTT",
  "SS",
  "SCHOOL",
  "AUTHORIZED",
  "UNPAID",
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function minToHours(min: number) {
  return round2(min / 60);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FF0A0C0F" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5F2B5" },
  };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
}

function addColumns(
  sheet: ExcelJS.Worksheet,
  cols: Array<{ header: string; key: string; width: number }>
) {
  sheet.columns = cols;
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cols.length },
  };
}

export async function generateAccountantMonthlyExport(params: {
  year: number;
  month: number; // 1-12
}): Promise<{ buffer: Buffer; filename: string }> {
  const year = params.year;
  const month = params.month;
  const from = new Date(year, month - 1, 1, 12, 0, 0);
  const to = new Date(year, month, 0, 12, 0, 0);
  const monthLabel = `${MONTHS_FR[month - 1] || month} ${year}`;
  const settings = await getRhSettings();
  const trUnit = trPayrollDeductionOf(settings);

  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    include: {
      user: { select: { prenom: true, nom: true, email: true } },
      manager: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
    },
    orderBy: [{ department: "asc" }, { matricule: "asc" }],
  });

  const leaveDays = await prisma.rhLeaveDay.findMany({
    where: {
      date: { gte: from, lte: to },
      accountCode: { in: ALL_LEAVE },
      OR: [
        { requestId: null },
        { request: { status: { in: ["APPROVED", "SIGNED"] } } },
      ],
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
    },
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
  });

  const timesheets = await prisma.rhTimesheet.findMany({
    where: {
      weekStart: { gte: from, lte: to },
      status: { in: ["APPROVED", "SIGNED"] },
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
    },
    orderBy: [{ employeeId: "asc" }, { weekStart: "asc" }],
  });

  const expenseReports = await prisma.rhExpenseReport.findMany({
    where: {
      periodYear: year,
      periodMonth: month,
      status: { in: ["APPROVED", "PAID", "SUBMITTED"] },
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
      lines: { orderBy: { date: "asc" } },
    },
    orderBy: [{ employeeId: "asc" }, { number: "asc" }],
  });

  const workDays = await prisma.rhWorkDay.findMany({
    where: { date: { gte: from, lte: to } },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
    },
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
  });

  // Agrégats par collab
  type LeaveAgg = Record<string, number>;
  const leaveByEmp = new Map<string, LeaveAgg>();
  for (const d of leaveDays) {
    const cur = leaveByEmp.get(d.employeeId) || {};
    cur[d.accountCode] = (cur[d.accountCode] || 0) + Number(d.days);
    leaveByEmp.set(d.employeeId, cur);
  }

  const hoursByEmp = new Map<
    string,
    { total: number; ot25: number; ot50: number; sheets: number; signed: number }
  >();
  for (const ts of timesheets) {
    const cur = hoursByEmp.get(ts.employeeId) || {
      total: 0,
      ot25: 0,
      ot50: 0,
      sheets: 0,
      signed: 0,
    };
    cur.total += ts.totalMinutes;
    cur.ot25 += ts.ot25Minutes;
    cur.ot50 += ts.ot50Minutes;
    cur.sheets += 1;
    if (ts.status === "SIGNED") cur.signed += 1;
    hoursByEmp.set(ts.employeeId, cur);
  }

  const ndfByEmp = new Map<string, number>();
  for (const r of expenseReports) {
    if (r.status === "REFUSED" || r.status === "DRAFT") continue;
    // Pour la paie : APPROVED + PAID (soumis = info)
    if (r.status !== "APPROVED" && r.status !== "PAID") continue;
    let sum = 0;
    for (const l of r.lines) {
      sum +=
        l.reimbursedAmount == null
          ? Number(l.amount)
          : Number(l.reimbursedAmount);
    }
    ndfByEmp.set(r.employeeId, (ndfByEmp.get(r.employeeId) || 0) + sum);
  }

  const presenceByEmp = new Map<
    string,
    { office: number; remote: number; travel: number; site: number }
  >();
  for (const w of workDays) {
    const cur = presenceByEmp.get(w.employeeId) || {
      office: 0,
      remote: 0,
      travel: 0,
      site: 0,
    };
    const weight = w.portion === "FULL" ? 1 : 0.5;
    if (w.place === "OFFICE") cur.office += weight;
    else if (w.place === "REMOTE") cur.remote += weight;
    else if (w.place === "TRAVEL") cur.travel += weight;
    else if (w.place === "SITE") cur.site += weight;
    presenceByEmp.set(w.employeeId, cur);
  }

  // TR batch
  const trByEmp = new Map<
    string,
    Awaited<ReturnType<typeof computeTrForMonth>>
  >();
  for (const e of employees) {
    trByEmp.set(
      e.id,
      await computeTrForMonth({ employeeId: e.id, year, month })
    );
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Glow Up RH";
  wb.created = new Date();
  wb.description = `Export expert-comptable — ${monthLabel}`;

  // ─── 00 Lisez-moi ───
  {
    const s = wb.addWorksheet("00 · Lisez-moi");
    s.getColumn(1).width = 28;
    s.getColumn(2).width = 72;
    const rows: Array<[string, string]> = [
      ["Export", "Glow Up — dossier mensuel expert-comptable"],
      ["Période", monthLabel],
      ["Généré le", new Date().toLocaleString("fr-FR")],
      ["Périmètre", "Collaborateurs actifs uniquement"],
      ["", ""],
      ["Onglet", "Contenu"],
      ["01 · Synthèse", "1 ligne / collab — vue paie complète"],
      ["02 · Absences", "Détail jour par jour (CP, Récup, RTT, Maladie…)"],
      ["03 · Heures", "Feuilles de temps validées / signées du mois"],
      ["04 · Heures supp.", "Uniquement les semaines avec HS 25 % / 50 %"],
      ["05 · Titres-resto", "Calcul TR + retenue salariale"],
      ["06 · Notes de frais", "Lignes des notes approuvées / payées"],
      ["07 · Présence & TT", "Bureau / télétravail / déplacement / site"],
      ["", ""],
      ["Clé commune", "Matricule — à croiser entre tous les onglets"],
      [
        "Absences",
        "Statuts APPROVED ou SIGNED (ou saisie forcée sans demande)",
      ],
      [
        "Heures / HS",
        "Feuilles APPROVED ou SIGNED dont le début de semaine tombe dans le mois",
      ],
      [
        "NDF",
        "Notes APPROVED ou PAID du mois (periodMonth / periodYear)",
      ],
      [
        "TR",
        `Retenue unitaire = ${trUnit} € (facial ${settings.trFacial} − part entreprise ${settings.trCompanyShare})`,
      ],
    ];
    for (const [a, b] of rows) {
      const r = s.addRow([a, b]);
      if (a === "Onglet" || a === "Export") r.font = { bold: true };
    }
  }

  // ─── 01 Synthèse ───
  {
    const s = wb.addWorksheet("01 · Synthèse");
    addColumns(s, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Email", key: "email", width: 28 },
      { header: "Service", key: "service", width: 16 },
      { header: "Poste", key: "poste", width: 20 },
      { header: "Manager", key: "manager", width: 18 },
      { header: "Date d'entrée", key: "hire", width: 14 },
      { header: "Heures contrat / sem.", key: "contractH", width: 14 },
      { header: "Salaire brut (€)", key: "gross", width: 14 },
      { header: "Variable (€)", key: "variable", width: 12 },
      { header: "Mutuelle", key: "health", width: 16 },
      { header: "Heures travaillées (h)", key: "hours", width: 14 },
      { header: "HS 25 % (h)", key: "ot25", width: 12 },
      { header: "HS 50 % (h)", key: "ot50", width: 12 },
      { header: "CP (j)", key: "cp", width: 8 },
      { header: "Récup (j)", key: "recup", width: 9 },
      { header: "RTT (j)", key: "rtt", width: 8 },
      { header: "Maladie (j)", key: "ss", width: 10 },
      { header: "CSS (j)", key: "unpaid", width: 8 },
      { header: "École (j)", key: "school", width: 8 },
      { header: "Abs. autorisée (j)", key: "auth", width: 12 },
      { header: "Nb titres-resto", key: "trCount", width: 12 },
      { header: "Retenue TR (€)", key: "trDeduct", width: 12 },
      { header: "NDF à rembourser (€)", key: "ndf", width: 14 },
      { header: "Jours bureau", key: "office", width: 11 },
      { header: "Jours TT", key: "remote", width: 10 },
      { header: "Jours déplacement", key: "travel", width: 12 },
      { header: "Feuilles validées", key: "sheets", width: 12 },
      { header: "Feuilles signées", key: "signed", width: 12 },
    ]);

    for (const e of employees) {
      const leave = leaveByEmp.get(e.id) || {};
      const hours = hoursByEmp.get(e.id) || {
        total: 0,
        ot25: 0,
        ot50: 0,
        sheets: 0,
        signed: 0,
      };
      const tr = trByEmp.get(e.id);
      const presence = presenceByEmp.get(e.id) || {
        office: 0,
        remote: 0,
        travel: 0,
        site: 0,
      };
      const mgr = e.manager
        ? `${e.manager.user.prenom} ${e.manager.user.nom}`.trim()
        : "";

      s.addRow({
        matricule: e.matricule,
        nom: e.user.nom,
        prenom: e.user.prenom,
        email: e.user.email,
        service: e.department,
        poste: e.jobTitle,
        manager: mgr,
        hire: e.hireDate.toISOString().slice(0, 10),
        contractH: e.weeklyHours,
        gross: e.grossSalary != null ? Number(e.grossSalary) : null,
        variable: e.variableSalary != null ? Number(e.variableSalary) : null,
        health: HEALTH_FR[e.healthCover] || e.healthCover,
        hours: minToHours(hours.total),
        ot25: minToHours(hours.ot25),
        ot50: minToHours(hours.ot50),
        cp: leave.CP || 0,
        recup: leave.RECUP || 0,
        rtt: leave.RTT || 0,
        ss: leave.SS || 0,
        unpaid: leave.UNPAID || 0,
        school: leave.SCHOOL || 0,
        auth: leave.AUTHORIZED || 0,
        trCount: tr?.count ?? 0,
        trDeduct: tr?.payrollDeduction ?? 0,
        ndf: round2(ndfByEmp.get(e.id) || 0),
        office: presence.office,
        remote: presence.remote,
        travel: presence.travel,
        sheets: hours.sheets,
        signed: hours.signed,
      });
    }
  }

  // ─── 02 Absences ───
  {
    const s = wb.addWorksheet("02 · Absences");
    addColumns(s, [
      { header: "Date", key: "date", width: 12 },
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Email", key: "email", width: 26 },
      { header: "Code compte", key: "code", width: 10 },
      { header: "Libellé compte", key: "label", width: 18 },
      { header: "Jours", key: "days", width: 8 },
      { header: "Demi-journée", key: "half", width: 12 },
      { header: "Minutes (récup courte)", key: "minutes", width: 14 },
    ]);
    for (const d of leaveDays) {
      s.addRow({
        date: d.date.toISOString().slice(0, 10),
        matricule: d.employee.matricule,
        nom: d.employee.user.nom,
        prenom: d.employee.user.prenom,
        email: d.employee.user.email,
        code: d.accountCode,
        label: LEAVE_LABELS[d.accountCode] || d.accountCode,
        days: d.days,
        half: d.halfDay ? d.half || "OUI" : "",
        minutes: d.minutes || "",
      });
    }
  }

  // ─── 03 Heures ───
  {
    const s = wb.addWorksheet("03 · Heures");
    addColumns(s, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Année ISO", key: "isoYear", width: 10 },
      { header: "Semaine ISO", key: "isoWeek", width: 10 },
      { header: "Début semaine", key: "start", width: 12 },
      { header: "Fin semaine", key: "end", width: 12 },
      { header: "Heures totales (h)", key: "hours", width: 14 },
      { header: "HS 25 % (h)", key: "ot25", width: 11 },
      { header: "HS 50 % (h)", key: "ot50", width: 11 },
      { header: "Statut", key: "status", width: 12 },
      { header: "Note HS", key: "note", width: 36 },
      { header: "Signée le", key: "signedAt", width: 14 },
    ]);
    for (const ts of timesheets) {
      s.addRow({
        matricule: ts.employee.matricule,
        nom: ts.employee.user.nom,
        prenom: ts.employee.user.prenom,
        isoYear: ts.isoYear,
        isoWeek: ts.isoWeek,
        start: ts.weekStart.toISOString().slice(0, 10),
        end: ts.weekEnd.toISOString().slice(0, 10),
        hours: minToHours(ts.totalMinutes),
        ot25: minToHours(ts.ot25Minutes),
        ot50: minToHours(ts.ot50Minutes),
        status: ts.status === "SIGNED" ? "Signée" : "Validée",
        note: ts.overtimeNote || "",
        signedAt: ts.signedAt
          ? ts.signedAt.toISOString().slice(0, 10)
          : "",
      });
    }
  }

  // ─── 04 HS ───
  {
    const s = wb.addWorksheet("04 · Heures supp.");
    addColumns(s, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Semaine", key: "week", width: 12 },
      { header: "Début", key: "start", width: 12 },
      { header: "HS 25 % (h)", key: "ot25", width: 11 },
      { header: "HS 50 % (h)", key: "ot50", width: 11 },
      { header: "Total HS (h)", key: "total", width: 11 },
      { header: "Justification", key: "note", width: 40 },
      { header: "Statut", key: "status", width: 12 },
    ]);
    for (const ts of timesheets) {
      if (ts.ot25Minutes + ts.ot50Minutes <= 0) continue;
      s.addRow({
        matricule: ts.employee.matricule,
        nom: ts.employee.user.nom,
        prenom: ts.employee.user.prenom,
        week: `${ts.isoYear}-S${String(ts.isoWeek).padStart(2, "0")}`,
        start: ts.weekStart.toISOString().slice(0, 10),
        ot25: minToHours(ts.ot25Minutes),
        ot50: minToHours(ts.ot50Minutes),
        total: minToHours(ts.ot25Minutes + ts.ot50Minutes),
        note: ts.overtimeNote || "",
        status: ts.status === "SIGNED" ? "Signée" : "Validée",
      });
    }
  }

  // ─── 05 TR ───
  {
    const s = wb.addWorksheet("05 · Titres-resto");
    addColumns(s, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Jours ouvrés du mois", key: "worked", width: 14 },
      { header: "Congés (hors maladie)", key: "leave", width: 14 },
      { header: "Maladie (j)", key: "sick", width: 11 },
      { header: "Demi-journées", key: "half", width: 12 },
      { header: "Repas société", key: "company", width: 12 },
      { header: "Repas déplacement remboursés", key: "travel", width: 16 },
      { header: "Nb titres-resto", key: "count", width: 12 },
      { header: "Valeur faciale unitaire (€)", key: "facial", width: 14 },
      { header: "Part entreprise (€)", key: "companyShare", width: 14 },
      { header: "Retenue salariale unitaire (€)", key: "unit", width: 14 },
      { header: "Retenue totale (€)", key: "deduct", width: 14 },
    ]);
    for (const e of employees) {
      const tr = trByEmp.get(e.id)!;
      s.addRow({
        matricule: e.matricule,
        nom: e.user.nom,
        prenom: e.user.prenom,
        worked: tr.workedOpenDays,
        leave: tr.leaveDays,
        sick: tr.sickDays,
        half: tr.halfDays,
        company: tr.companyMeals,
        travel: tr.travelMeals,
        count: tr.count,
        facial: tr.facial,
        companyShare: tr.companyShare,
        unit: trUnit,
        deduct: tr.payrollDeduction,
      });
    }
  }

  // ─── 06 NDF ───
  {
    const s = wb.addWorksheet("06 · Notes de frais");
    addColumns(s, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "N° note", key: "number", width: 10 },
      { header: "Statut note", key: "status", width: 12 },
      { header: "Date dépense", key: "date", width: 12 },
      { header: "Nature", key: "category", width: 16 },
      { header: "Libellé", key: "label", width: 28 },
      { header: "Montant TTC (€)", key: "amount", width: 12 },
      { header: "TVA (€)", key: "vat", width: 10 },
      { header: "Remboursé (€)", key: "reimb", width: 12 },
      { header: "IK", key: "ik", width: 6 },
      { header: "Km", key: "km", width: 8 },
      { header: "Repas société", key: "companyMeal", width: 12 },
      { header: "Justification", key: "justif", width: 40 },
      { header: "Justificatif URL", key: "url", width: 36 },
    ]);
    const statusFr: Record<string, string> = {
      APPROVED: "Approuvée",
      PAID: "Payée",
      SUBMITTED: "Soumise",
    };
    for (const r of expenseReports) {
      if (r.status !== "APPROVED" && r.status !== "PAID") continue;
      for (const l of r.lines) {
        s.addRow({
          matricule: r.employee.matricule,
          nom: r.employee.user.nom,
          prenom: r.employee.user.prenom,
          number: r.number,
          status: statusFr[r.status] || r.status,
          date: l.date.toISOString().slice(0, 10),
          category: l.category,
          label: l.label,
          amount: Number(l.amount),
          vat: Number(l.vatAmount),
          reimb:
            l.reimbursedAmount == null
              ? Number(l.amount)
              : Number(l.reimbursedAmount),
          ik: l.isMileage ? "Oui" : "",
          km: l.km ?? "",
          companyMeal: l.isCompanyMeal ? "Oui" : "",
          justif: l.justification || l.comment || "",
          url: l.receiptUrl || "",
        });
      }
    }
  }

  // ─── 07 Présence ───
  {
    const s = wb.addWorksheet("07 · Présence & TT");
    addColumns(s, [
      { header: "Date", key: "date", width: 12 },
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Lieu", key: "place", width: 14 },
      { header: "Portion", key: "portion", width: 10 },
      { header: "Repas déplacement", key: "meal", width: 16 },
    ]);
    const mealFr: Record<string, string> = {
      SELF: "À sa charge (TR)",
      COMPANY: "Repas société",
      REIMBURSED: "Remboursé NDF",
    };
    const portionFr: Record<string, string> = {
      FULL: "Journée",
      AM: "Matin",
      PM: "Après-midi",
    };
    for (const w of workDays) {
      s.addRow({
        date: w.date.toISOString().slice(0, 10),
        matricule: w.employee.matricule,
        nom: w.employee.user.nom,
        prenom: w.employee.user.prenom,
        place: PLACE_FR[w.place] || w.place,
        portion: portionFr[w.portion] || w.portion,
        meal: w.travelMeal ? mealFr[w.travelMeal] || w.travelMeal : "",
      });
    }
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `glowup-export-comptable-${year}-${String(month).padStart(2, "0")}.xlsx`;
  return { buffer: buf, filename };
}
