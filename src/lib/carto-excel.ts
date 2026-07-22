import ExcelJS from "exceljs";

export type ParsedCartoRow = {
  prenom?: string;
  nom?: string;
  poste?: string;
  perimetre?: string;
  localisation?: string;
  priorite?: string;
  linkedinUrl?: string;
  email?: string;
};

function excelCellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const v = value as {
      text?: string;
      hyperlink?: string;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink != null) return String(v.hyperlink);
  }
  return String(value);
}

function toArrayBuffer(sourceData: Uint8Array): ArrayBuffer {
  return sourceData.buffer.slice(
    sourceData.byteOffset,
    sourceData.byteOffset + sourceData.byteLength
  ) as ArrayBuffer;
}

function worksheetToTsv(sheet: ExcelJS.Worksheet): string {
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[];
    const cells: string[] = [];
    for (let col = 1; col < Math.max(values.length, 2); col++) {
      cells.push(excelCellToText(values[col]));
    }
    lines.push(cells.join("\t"));
  });
  return lines.join("\n");
}

/** Parse TSV (même logique que l'import carto UI) → lignes contacts. */
export function parseCartoTsv(text: string): ParsedCartoRow[] {
  const lines = text.split(/\r?\n/);
  const splitLine = (line: string): string[] =>
    line.includes("\t") ? line.split("\t") : line.split(";");

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map(norm);
    const prenomIdx = cells.findIndex(
      (c) => c === "prenom" || c === "firstname" || c === "first name"
    );
    const nomIdx = cells.findIndex(
      (c) => c === "nom" || c === "lastname" || c === "last name"
    );
    if (prenomIdx >= 0 && nomIdx >= 0) {
      headerIdx = i;
      cols = { prenom: prenomIdx, nom: nomIdx };
      cells.forEach((c, idx) => {
        if (c.startsWith("prior")) cols.priorite = idx;
        else if (c.includes("role") || c === "poste" || c === "titre") cols.poste = idx;
        else if (c.startsWith("perim")) cols.perimetre = idx;
        else if (c.startsWith("local")) cols.localisation = idx;
        else if (c.includes("linkedin")) cols.linkedinUrl = idx;
        else if (c.includes("mail")) cols.email = idx;
      });
      break;
    }
  }

  if (headerIdx === -1) return [];

  const cell = (cells: string[], key: string): string =>
    cols[key] !== undefined ? (cells[cols[key]] || "").trim() : "";

  const rows: ParsedCartoRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const prenom = cell(cells, "prenom");
    const nom = cell(cells, "nom");
    if (!prenom && !nom) continue;
    rows.push({
      priorite: cell(cells, "priorite") || undefined,
      prenom: prenom || undefined,
      nom: nom || undefined,
      poste: cell(cells, "poste") || undefined,
      perimetre: cell(cells, "perimetre") || undefined,
      localisation: cell(cells, "localisation") || undefined,
      linkedinUrl: cell(cells, "linkedinUrl") || undefined,
      email: cell(cells, "email") || undefined,
    });
  }
  return rows;
}

/** Parse les contacts d'une feuille du classeur (0 = influence, 1 = AO). */
export async function parseWorksheetCartoRows(
  sourceData: Uint8Array,
  sheetIndex: number
): Promise<ParsedCartoRow[]> {
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(toArrayBuffer(sourceData));
  const sheet = source.worksheets[sheetIndex];
  if (!sheet) return [];
  return parseCartoTsv(worksheetToTsv(sheet));
}

/**
 * Extrait une feuille d'un classeur .xlsx en un nouveau fichier .xlsx
 * (une seule feuille). Utilisé pour isoler la feuille AO (index 1) à l'import carto.
 */
export async function extractWorksheetAsXlsx(
  sourceData: Uint8Array,
  sheetIndex: number
): Promise<{ buffer: Uint8Array; sheetName: string } | null> {
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(toArrayBuffer(sourceData));
  const sheet = source.worksheets[sheetIndex];
  if (!sheet) return null;

  const dest = new ExcelJS.Workbook();
  const sheetName = sheet.name?.trim() || "Appel d'offre";
  const newSheet = dest.addWorksheet(sheetName);

  sheet.columns?.forEach((col, idx) => {
    if (col?.width) {
      newSheet.getColumn(idx + 1).width = col.width;
    }
  });

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const newRow = newSheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      newRow.getCell(colNumber).value = cell.value;
    });
    if (row.height) newRow.height = row.height;
    newRow.commit();
  });

  const buf = await dest.xlsx.writeBuffer();
  return { buffer: new Uint8Array(buf), sheetName };
}

/** Nom de fichier pour la feuille AO extraite. */
export function aoFileNameFromOriginal(originalName: string, sheetName: string): string {
  const base = originalName.replace(/\.(xlsx|csv|tsv|txt)$/i, "").trim() || "carto";
  const safeSheet = sheetName.replace(/[\\/:*?"<>|]/g, "-").trim() || "AO";
  return `${base} - ${safeSheet}.xlsx`;
}
