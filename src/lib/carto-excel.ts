import ExcelJS from "exceljs";
import { parseCartoText } from "@/lib/parse-carto";

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

function excelValueToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).replace(/[\t\r\n]+/g, " ").trim();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as {
      text?: string;
      hyperlink?: string;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (Array.isArray(v.richText)) {
      return v.richText.map((t) => t.text).join("").replace(/[\t\r\n]+/g, " ").trim();
    }
    if (v.text != null && String(v.text).trim()) {
      return String(v.text).replace(/[\t\r\n]+/g, " ").trim();
    }
    if (typeof v.hyperlink === "string") {
      return v.hyperlink.startsWith("mailto:")
        ? v.hyperlink.slice(7)
        : v.hyperlink;
    }
    if (v.result != null) return excelValueToText(v.result);
  }
  return "";
}

/** Texte affiché d’une cellule (libellé d’un lien plutôt que l’URL). */
export function worksheetCellToText(cell: ExcelJS.Cell): string {
  const displayed = String(cell.text || "").replace(/[\t\r\n]+/g, " ").trim();
  if (displayed && !/^https?:\/\//i.test(displayed) && !displayed.startsWith("mailto:")) {
    return displayed;
  }
  const fromValue = excelValueToText(cell.value);
  return fromValue || displayed;
}

function sheetBounds(sheet: ExcelJS.Worksheet): { lastRow: number; colCount: number } {
  let lastRow = Math.max(
    sheet.lastRow?.number || 0,
    sheet.rowCount || 0,
    sheet.actualRowCount || 0
  );
  let colCount = Math.max(sheet.columnCount || 0, sheet.actualColumnCount || 0, 12);
  const dim = sheet.dimensions as { bottom?: number; right?: number } | string | null;
  if (dim && typeof dim === "object") {
    lastRow = Math.max(lastRow, dim.bottom || 0);
    colCount = Math.max(colCount, dim.right || 0);
  }
  // ExcelJS rate souvent lastRow sur les tableaux filtrés / formatés.
  lastRow = Math.min(Math.max(lastRow, 80), 500);
  colCount = Math.min(Math.max(colCount, 12), 40);
  return { lastRow, colCount };
}

/** Toutes les lignes × colonnes, pas seulement le tableau sparse d’ExcelJS. */
export function worksheetToTsv(sheet: ExcelJS.Worksheet): string {
  const { lastRow, colCount } = sheetBounds(sheet);
  const lines: string[] = [];
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let col = 1; col <= colCount; col++) {
      cells.push(worksheetCellToText(row.getCell(col)));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

function toArrayBuffer(sourceData: Uint8Array): ArrayBuffer {
  return sourceData.buffer.slice(
    sourceData.byteOffset,
    sourceData.byteOffset + sourceData.byteLength
  ) as ArrayBuffer;
}

/** Parse TSV (même logique que l'import carto UI) → lignes contacts. */
export function parseCartoTsv(text: string): ParsedCartoRow[] {
  return parseCartoText(text).rows.map((r) => ({
    priorite: r.priorite || undefined,
    prenom: r.prenom || undefined,
    nom: r.nom || undefined,
    poste: r.poste || undefined,
    perimetre: r.perimetre || undefined,
    localisation: r.localisation || undefined,
    linkedinUrl: r.linkedinUrl || undefined,
    email: r.email || undefined,
  }));
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
