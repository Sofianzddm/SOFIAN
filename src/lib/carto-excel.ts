import ExcelJS from "exceljs";

/**
 * Extrait une feuille d'un classeur .xlsx en un nouveau fichier .xlsx
 * (une seule feuille). Utilisé pour isoler la feuille AO (index 1) à l'import carto.
 */
export async function extractWorksheetAsXlsx(
  sourceData: Buffer,
  sheetIndex: number
): Promise<{ buffer: Buffer; sheetName: string } | null> {
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(sourceData);
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
  return { buffer: Buffer.from(buf), sheetName };
}

/** Nom de fichier pour la feuille AO extraite. */
export function aoFileNameFromOriginal(originalName: string, sheetName: string): string {
  const base = originalName.replace(/\.(xlsx|csv|tsv|txt)$/i, "").trim() || "carto";
  const safeSheet = sheetName.replace(/[\\/:*?"<>|]/g, "-").trim() || "AO";
  return `${base} - ${safeSheet}.xlsx`;
}
