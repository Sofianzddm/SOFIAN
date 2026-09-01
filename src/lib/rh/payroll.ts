import ExcelJS from "exceljs";
import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";

const PAYROLL_ACCOUNTS: RhLeaveAccount[] = [
  "CP",
  "RECUP",
  "SS",
  "SCHOOL",
  "AUTHORIZED",
  "UNPAID",
];

/**
 * Export paie : une ligne par date et collaborateur,
 * comptes CP / Récup / SS dissociés (handoff §7.2).
 */
export async function generatePayrollLeaveExport(params: {
  from: Date;
  to: Date;
}): Promise<Buffer> {
  const days = await prisma.rhLeaveDay.findMany({
    where: {
      date: { gte: params.from, lte: params.to },
      accountCode: { in: PAYROLL_ACCOUNTS },
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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up RH";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Absences paie");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Matricule", key: "matricule", width: 12 },
    { header: "Prénom", key: "prenom", width: 16 },
    { header: "Nom", key: "nom", width: 16 },
    { header: "Email", key: "email", width: 28 },
    { header: "Compte", key: "account", width: 10 },
    { header: "Jours", key: "days", width: 8 },
    { header: "Demi-journée", key: "half", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const d of days) {
    sheet.addRow({
      date: d.date.toISOString().slice(0, 10),
      matricule: d.employee.matricule,
      prenom: d.employee.user.prenom,
      nom: d.employee.user.nom,
      email: d.employee.user.email,
      account: d.accountCode,
      days: d.days,
      half: d.halfDay ? d.half ?? "OUI" : "",
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
