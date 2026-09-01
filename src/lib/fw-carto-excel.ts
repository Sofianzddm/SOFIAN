import ExcelJS from "exceljs";

export type FwCartoExportContact = {
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  perimetre?: string | null;
  marquesGerees?: string | null;
  marche?: string | null;
  localisation?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  note?: string | null;
};

const HEADERS = [
  "Nom",
  "Rôle",
  "Équipe / Périmètre",
  "Marque(s) gérée(s)",
  "Marché",
  "Localisation",
  "Email",
  "URL Linkedin",
  "Note",
] as const;

function fullName(c: FwCartoExportContact) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

/** Excel à jour (colonnes carto PJ) pour une maison FW. */
export async function buildFwCartoExcelBuffer(
  maison: string,
  contacts: FwCartoExportContact[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Cartographie");
  ws.columns = [
    { width: 28 },
    { width: 28 },
    { width: 28 },
    { width: 28 },
    { width: 16 },
    { width: 18 },
    { width: 32 },
    { width: 42 },
    { width: 36 },
  ];

  ws.mergeCells("A1:I1");
  const title = ws.getCell("A1");
  title.value = `${maison} — Cartographie Fashion Week`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE11D8F" } };
  title.alignment = { vertical: "middle" };
  ws.getRow(1).height = 22;

  ws.addRow([]);
  const headerRow = ws.addRow([...HEADERS]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE11D8F" } };
    cell.alignment = { vertical: "middle" };
  });

  for (const c of contacts) {
    const row = ws.addRow([
      fullName(c),
      c.role || "",
      c.perimetre || "",
      c.marquesGerees || "",
      c.marche || "",
      c.localisation || "",
      c.email || "",
      c.linkedinUrl || "",
      c.note || "",
    ]);
    const linkedin = (c.linkedinUrl || "").trim();
    if (linkedin.startsWith("http")) {
      const cell = row.getCell(8);
      cell.value = { text: linkedin, hyperlink: linkedin };
      cell.font = { color: { argb: "FF0563C1" }, underline: true };
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
