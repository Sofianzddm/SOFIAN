/**
 * 📤 EXPORT EXCEL/CSV - Génération de rapports
 */

import ExcelJS from "exceljs";
import { FinanceStats, CAParMois, RepartitionItem } from "./analytics";

export async function generateExcelReport(
  stats: FinanceStats,
  evolution: CAParMois[],
  repartitions: {
    talents: RepartitionItem[];
    marques: RepartitionItem[];
    sources: RepartitionItem[];
  }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Métadonnées
  workbook.creator = "Glow Up Platform";
  workbook.created = new Date();

  // 1. Feuille KPIs
  const sheetKPIs = workbook.addWorksheet("KPIs Globaux");
  
  // Header styling
  sheetKPIs.getColumn(1).width = 30;
  sheetKPIs.getColumn(2).width = 20;

  // Titre
  sheetKPIs.mergeCells("A1:B1");
  const titleCell = sheetKPIs.getCell("A1");
  titleCell.value = "📊 RAPPORT FINANCIER - GLOW UP";
  titleCell.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEA4C89" }, // Rose Glow Up
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheetKPIs.getRow(1).height = 30;

  // KPIs
  sheetKPIs.addRow([]);
  sheetKPIs.addRow(["Indicateur", "Valeur"]).font = { bold: true };

  const kpis = [
    ["CA Total", `${formatMoney(stats.caTotal)}`],
    ["CA Payé", `${formatMoney(stats.caPaye)}`],
    ["CA En Attente", `${formatMoney(stats.caEnAttente)}`],
    ["Commissions", `${formatMoney(stats.commissionsTotal)}`],
    ["Marge Moyenne", `${stats.margeMoyenne.toFixed(2)}%`],
    ["Ticket Moyen", `${formatMoney(stats.ticketMoyen)}`],
    ["Délai Paiement Moyen", `${Math.round(stats.delaiPaiementMoyen)} jours`],
    [""],
    ["Nombre de Collaborations", stats.nbCollaborations],
    ["Collaborations Payées", stats.nbCollabsPayees],
    ["Collaborations En Attente", stats.nbCollabsEnAttente],
    [""],
    ["Factures Payées", stats.nbFacturesPayees],
    ["Factures En Attente", stats.nbFacturesEnAttente],
    ["Factures En Retard", stats.nbFacturesRetard],
    [""],
    ["Évolution vs Période Précédente", `${stats.evolutionVsPeriodePrecedente.toFixed(1)}%`],
    ["Évolution vs Année Précédente", `${stats.evolutionVsAnnePrecedente.toFixed(1)}%`],
  ];

  kpis.forEach((row) => {
    const addedRow = sheetKPIs.addRow(row);
    if (row[0] === "") return; // Empty row
    
    // Style values
    addedRow.getCell(2).font = { bold: true };
    addedRow.getCell(2).alignment = { horizontal: "right" };
  });

  // 2. Feuille Évolution
  const sheetEvolution = workbook.addWorksheet("Évolution CA");
  sheetEvolution.columns = [
    { header: "Mois", key: "mois", width: 20 },
    { header: "CA HT", key: "caHT", width: 15 },
    { header: "CA TTC", key: "caTTC", width: 15 },
    { header: "Commissions", key: "commissions", width: 15 },
    { header: "Nb Collabs", key: "nbCollabs", width: 12 },
  ];

  sheetEvolution.getRow(1).font = { bold: true };
  sheetEvolution.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  };

  evolution.forEach((mois) => {
    sheetEvolution.addRow({
      mois: mois.moisLabel,
      caHT: mois.caHT,
      caTTC: mois.caTTC,
      commissions: mois.commissions,
      nbCollabs: mois.nbCollabs,
    });
  });

  // Format numbers
  ["B", "C", "D"].forEach((col) => {
    sheetEvolution.getColumn(col).numFmt = "#,##0.00 €";
  });

  // 3. Feuille Top Talents
  const sheetTalents = workbook.addWorksheet("Top Talents");
  sheetTalents.columns = [
    { header: "Rang", key: "rang", width: 8 },
    { header: "Talent", key: "talent", width: 30 },
    { header: "CA", key: "ca", width: 15 },
    { header: "%", key: "pourcent", width: 10 },
    { header: "Nb Collabs", key: "count", width: 12 },
  ];

  sheetTalents.getRow(1).font = { bold: true };
  sheetTalents.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFCE4EC" }, // Rose clair
  };

  repartitions.talents.forEach((item, index) => {
    sheetTalents.addRow({
      rang: index + 1,
      talent: item.label,
      ca: item.value,
      pourcent: item.pourcentage / 100,
      count: item.count,
    });
  });

  sheetTalents.getColumn("C").numFmt = "#,##0.00 €";
  sheetTalents.getColumn("D").numFmt = "0.00%";

  // 4. Feuille Top Marques
  const sheetMarques = workbook.addWorksheet("Top Marques");
  sheetMarques.columns = [
    { header: "Rang", key: "rang", width: 8 },
    { header: "Marque", key: "marque", width: 30 },
    { header: "CA", key: "ca", width: 15 },
    { header: "%", key: "pourcent", width: 10 },
    { header: "Nb Collabs", key: "count", width: 12 },
  ];

  sheetMarques.getRow(1).font = { bold: true };
  sheetMarques.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3E5F5" }, // Violet clair
  };

  repartitions.marques.forEach((item, index) => {
    sheetMarques.addRow({
      rang: index + 1,
      marque: item.label,
      ca: item.value,
      pourcent: item.pourcentage / 100,
      count: item.count,
    });
  });

  sheetMarques.getColumn("C").numFmt = "#,##0.00 €";
  sheetMarques.getColumn("D").numFmt = "0.00%";

  // Générer buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generateCSV(
  stats: FinanceStats,
  evolution: CAParMois[]
): string {
  const lines: string[] = [];

  // Header
  lines.push("RAPPORT FINANCIER - GLOW UP");
  lines.push("");

  // KPIs
  lines.push("INDICATEURS GLOBAUX");
  lines.push("CA Total," + stats.caTotal);
  lines.push("CA Payé," + stats.caPaye);
  lines.push("CA En Attente," + stats.caEnAttente);
  lines.push("Commissions," + stats.commissionsTotal);
  lines.push("Marge Moyenne," + stats.margeMoyenne.toFixed(2) + "%");
  lines.push("Ticket Moyen," + stats.ticketMoyen);
  lines.push("");

  // Évolution
  lines.push("ÉVOLUTION CA");
  lines.push("Mois,CA HT,CA TTC,Commissions,Nb Collabs");
  evolution.forEach((m) => {
    lines.push(`${m.moisLabel},${m.caHT},${m.caTTC},${m.commissions},${m.nbCollabs}`);
  });

  return lines.join("\n");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}
