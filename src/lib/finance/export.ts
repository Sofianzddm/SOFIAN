/**
 * 📤 EXPORT EXCEL/CSV - Génération de rapports
 */

import ExcelJS from "exceljs";
import {
  FinanceStats,
  CAParMois,
  RepartitionItem,
  CollabValideeAvecDevis,
} from "./analytics";

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

function formatDateFr(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(date));
}

/**
 * Export Excel : collabs créées sur la période (+ écarts)
 * Colonnes Documents présents / manquants ; rouge = devis du mois sur collab hors période
 */
export async function generateCollabsValideesExcel(
  rows: CollabValideeAvecDevis[],
  meta: { dateDebut: Date; dateFin: Date; pole?: string }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Collabs + alertes");

  const poleLabel =
    meta.pole === "INFLUENCE"
      ? "Influence"
      : meta.pole === "SALES"
        ? "Sales"
        : "Tous pôles";

  const caRows = rows.filter((r) => r.compteDansCA);
  const rougeRows = rows.filter((r) => r.highlightRouge);
  const alerteRows = rows.filter((r) => r.alerte && !r.highlightRouge);

  sheet.mergeCells("A1:M1");
  const title = sheet.getCell("A1");
  title.value = `Collabs ${formatDateFr(meta.dateDebut)} → ${formatDateFr(meta.dateFin)} — ${poleLabel} — CA OK ${caRows.length} · Rouge (devis hors mois collab) ${rougeRows.length} · Alertes ${alerteRows.length}`;
  title.font = { size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8B1A3A" },
  };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  const header = sheet.addRow([
    "AFFAIRE",
    "DATE",
    "Nom du talent",
    "TM",
    "RÉF",
    "GLOW UP AGENCY HT",
    "TALENTS HT",
    "TAUX",
    "MARGE ATTENDUE",
    "DOCUMENTS PRÉSENTS",
    "DOCUMENTS MANQUANTS",
    "ALERTE",
    "RAISON",
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8B1A3A" },
  };

  const alerteFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF3CD" },
  };
  const rougeFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFECACA" },
  };

  for (const row of rows) {
    const dataRow = sheet.addRow([
      row.sourceLigne === "PROSPECTION" && !row.reference
        ? row.marque
        : `${row.talent} x ${row.marque}`,
      row.dateValidation,
      row.talentPrenom || row.talent,
      row.createdBy || "",
      row.reference || "",
      row.montantBrut,
      row.montantNet,
      row.commissionPercent > 0 ? row.commissionPercent / 100 : "",
      row.commissionEuros > 0 || row.compteDansCA ? row.commissionEuros : "",
      row.documentsPresent,
      row.documentsManquants,
      row.highlightRouge ? "ROUGE" : row.alerte ? "OUI" : "",
      row.raison || "",
    ]);
    dataRow.getCell(2).numFmt = "dd/mm/yyyy";

    if (row.highlightRouge) {
      for (let col = 1; col <= 13; col++) {
        dataRow.getCell(col).fill = rougeFill;
      }
      dataRow.getCell(12).font = { bold: true, color: { argb: "FFB91C1C" } };
    } else if (row.alerte) {
      for (let col = 1; col <= 13; col++) {
        dataRow.getCell(col).fill = alerteFill;
      }
      dataRow.getCell(12).font = { bold: true, color: { argb: "FFB45309" } };
    }
  }

  sheet.getColumn(1).width = 42;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 16;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 14;
  sheet.getColumn(8).width = 10;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 18;
  sheet.getColumn(11).width = 18;
  sheet.getColumn(12).width = 10;
  sheet.getColumn(13).width = 55;

  sheet.getColumn(6).numFmt = "#,##0.00";
  sheet.getColumn(7).numFmt = '#,##0.00 "€"';
  sheet.getColumn(8).numFmt = "0%";
  sheet.getColumn(9).numFmt = '#,##0.00 "€"';

  if (rows.length > 0) {
    sheet.addRow([]);
    const totalCA = sheet.addRow([
      `CA comptabilisé (${caRows.length} — collab du mois + devis OU contrat)`,
      "",
      "",
      "",
      "",
      caRows.reduce((s, r) => s + r.montantBrut, 0),
      caRows.reduce((s, r) => s + r.montantNet, 0),
      "",
      caRows.reduce((s, r) => s + r.commissionEuros, 0),
      "",
      "",
      "",
      "",
    ]);
    totalCA.font = { bold: true };
    totalCA.getCell(6).numFmt = "#,##0.00";
    totalCA.getCell(7).numFmt = '#,##0.00 "€"';
    totalCA.getCell(9).numFmt = '#,##0.00 "€"';

    if (rougeRows.length > 0) {
      const totalRouge = sheet.addRow([
        `Rouge (${rougeRows.length}) — devis généré sur la période, collab créée avant (hors CA mois)`,
        "",
        "",
        "",
        "",
        rougeRows.reduce((s, r) => s + r.montantBrut, 0),
        "",
        "",
        "",
        "",
        "",
        "ROUGE",
        "Voir colonne Raison",
      ]);
      totalRouge.font = { bold: true, color: { argb: "FFB91C1C" } };
      for (let col = 1; col <= 13; col++) {
        totalRouge.getCell(col).fill = rougeFill;
      }
      totalRouge.getCell(6).numFmt = "#,##0.00";
    }

    if (alerteRows.length > 0) {
      const totalAlertes = sheet.addRow([
        `Alertes (${alerteRows.length}) — hors CA`,
        "",
        "",
        "",
        "",
        alerteRows.reduce((s, r) => s + r.montantBrut, 0),
        "",
        "",
        "",
        "",
        "",
        "OUI",
        "Voir colonne Raison",
      ]);
      totalAlertes.font = { bold: true, color: { argb: "FFB45309" } };
      for (let col = 1; col <= 13; col++) {
        totalAlertes.getCell(col).fill = alerteFill;
      }
      totalAlertes.getCell(6).numFmt = "#,##0.00";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
