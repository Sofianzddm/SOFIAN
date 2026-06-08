/**
 * 📤 EXPORTS COMPTABLES PRO — Glow Up Agence
 *
 * Formats générés pour l'expert-comptable :
 *   - FEC (Fichier des Écritures Comptables) — format réglementaire art. A47 A-1 LPF
 *   - Journal des ventes (Excel / CSV)
 *   - Journal de banque (Excel)
 *   - Récapitulatif TVA / préparation CA3 (Excel)
 *   - Balance auxiliaire clients (Excel)
 *   - Liasse comptable complète (classeur Excel multi-feuilles)
 */

import ExcelJS from "exceljs";
import {
  FecLine,
  VenteRow,
  BanqueRow,
  TvaRow,
  CreanceRow,
  ComptaSummary,
  Periode,
  TvaEncaissementRow,
  GrandLivreCompte,
  BalanceLigne,
  Anomalie,
} from "./accounting";

// Ordre RÉGLEMENTAIRE des 18 colonnes du FEC
const FEC_COLUMNS: (keyof FecLine)[] = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
];

const BRAND = {
  rose: "FFEA4C89",
  licorice: "FF1A1A1A",
  lace: "FFFCE4EC",
  blue: "FFE3F2FD",
  green: "FFE8F5E9",
  amber: "FFFFF3E0",
};

/** Montant FEC : 2 décimales, séparateur virgule (obligatoire). */
function fecMontant(value: number): string {
  if (!value) return "0,00";
  return value.toFixed(2).replace(".", ",");
}

function sanitizeFec(value: string): string {
  // Aucun caractère séparateur (tab) ou retour ligne dans les champs
  return (value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * Génère le FEC au format texte tabulé (séparateur TAB, décimales virgule),
 * conforme à l'arrêté du 29 juillet 2013.
 */
export function generateFEC(lines: FecLine[]): string {
  const out: string[] = [];
  out.push(FEC_COLUMNS.join("\t"));

  for (const line of lines) {
    const row = FEC_COLUMNS.map((col) => {
      if (col === "Debit" || col === "Credit") {
        return fecMontant(line[col] as number);
      }
      return sanitizeFec(String(line[col] ?? ""));
    });
    out.push(row.join("\t"));
  }

  return out.join("\r\n");
}

/** Nom de fichier FEC normalisé : SIRENFECAAAAMMJJ.txt (clôture). */
export function fecFileName(siren: string | null | undefined, periode: Periode): string {
  const cleanSiren = (siren || "000000000").replace(/\D/g, "").slice(0, 9).padEnd(9, "0");
  const d = periode.dateFin;
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `${cleanSiren}FEC${stamp}.txt`;
}

// ============================================================
// CLASSEURS EXCEL
// ============================================================

interface AgenceInfo {
  nom?: string | null;
  siret?: string | null;
  numeroTVA?: string | null;
}

function styleHeaderRow(row: ExcelJS.Row, color: string = BRAND.blue) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFBDBDBD" } },
    };
  });
}

function addTitleBanner(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  span: string
) {
  sheet.mergeCells(`A1:${span}1`);
  const t = sheet.getCell("A1");
  t.value = title;
  t.font = { size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.rose } };
  t.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(`A2:${span}2`);
  const s = sheet.getCell("A2");
  s.value = subtitle;
  s.font = { size: 10, italic: true, color: { argb: "FF757575" } };
  s.alignment = { horizontal: "left", indent: 1 };
}

/** Convertit une date FEC AAAAMMJJ en dd/mm/yyyy lisible. */
function fmtDateStr(fec: string): string {
  if (!fec || fec.length !== 8) return fec || "";
  return `${fec.slice(6, 8)}/${fec.slice(4, 6)}/${fec.slice(0, 4)}`;
}

function periodeLabel(periode: Periode): string {
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `Période du ${fmt(periode.dateDebut)} au ${fmt(periode.dateFin)}`;
}

function agenceLabel(agence: AgenceInfo): string {
  const parts = [agence.nom || "Glow Up Agence"];
  if (agence.siret) parts.push(`SIRET ${agence.siret}`);
  if (agence.numeroTVA) parts.push(`TVA ${agence.numeroTVA}`);
  return parts.join(" — ");
}

const EUR = "#,##0.00 €";

function statutLabel(statut: string): string {
  const map: Record<string, string> = {
    BROUILLON: "Brouillon",
    ENVOYE: "Envoyée",
    VALIDE: "Validée",
    PAYE: "Payée",
    REFUSE: "Refusée",
    ANNULE: "Annulée",
  };
  return map[statut] || statut;
}

// ---- Journal des ventes ----
export function buildJournalVentesSheet(
  workbook: ExcelJS.Workbook,
  rows: VenteRow[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Journal des ventes");
  sheet.columns = [
    { key: "date", width: 12 },
    { key: "ref", width: 16 },
    { key: "type", width: 10 },
    { key: "client", width: 32 },
    { key: "compte", width: 14 },
    { key: "ht", width: 14 },
    { key: "taux", width: 8 },
    { key: "tva", width: 13 },
    { key: "ttc", width: 14 },
    { key: "regime", width: 30 },
    { key: "statut", width: 12 },
    { key: "echeance", width: 12 },
    { key: "encaisse", width: 14 },
    { key: "reste", width: 14 },
    { key: "let", width: 9 },
  ];

  addTitleBanner(sheet, "Journal des ventes", `${agenceLabel(agence)} · ${periodeLabel(periode)}`, "O");
  sheet.addRow([]);

  const header = sheet.addRow([
    "Date",
    "Référence",
    "Type",
    "Client",
    "Compte aux.",
    "Montant HT",
    "TVA %",
    "Montant TVA",
    "Montant TTC",
    "Régime TVA",
    "Statut",
    "Échéance",
    "Encaissé",
    "Restant dû",
    "Lettr.",
  ]);
  styleHeaderRow(header, BRAND.lace);

  rows.forEach((r) => {
    const isAvoir = r.type === "AVOIR";
    const sens = isAvoir ? -1 : 1;
    sheet.addRow([
      r.date,
      r.reference,
      isAvoir ? "Avoir" : "Facture",
      r.client,
      r.clientCompteAux,
      sens * r.montantHT,
      r.tauxTVA / 100,
      sens * r.montantTVA,
      sens * r.montantTTC,
      r.regimeTVA,
      statutLabel(r.statut),
      r.echeance,
      r.encaisse,
      r.restantDu,
      r.lettrage,
    ]);
  });

  // Totaux
  sheet.addRow([]);
  const totalHT = rows.reduce((s, r) => s + (r.type === "AVOIR" ? -1 : 1) * r.montantHT, 0);
  const totalTVA = rows.reduce((s, r) => s + (r.type === "AVOIR" ? -1 : 1) * r.montantTVA, 0);
  const totalTTC = rows.reduce((s, r) => s + (r.type === "AVOIR" ? -1 : 1) * r.montantTTC, 0);
  const totalReste = rows.reduce((s, r) => s + r.restantDu, 0);
  const totalRow = sheet.addRow([
    "TOTAUX",
    "",
    "",
    "",
    "",
    totalHT,
    "",
    totalTVA,
    totalTTC,
    "",
    "",
    "",
    "",
    totalReste,
    "",
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
  });

  ["F", "H", "I", "M", "N"].forEach((c) => (sheet.getColumn(c).numFmt = EUR));
  sheet.getColumn("G").numFmt = "0%";
  ["A", "L"].forEach((c) => (sheet.getColumn(c).numFmt = "dd/mm/yyyy"));
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  return sheet;
}

// ---- Journal de banque ----
export function buildJournalBanqueSheet(
  workbook: ExcelJS.Workbook,
  rows: BanqueRow[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Journal de banque");
  sheet.columns = [
    { key: "date", width: 12 },
    { key: "lib", width: 36 },
    { key: "emetteur", width: 28 },
    { key: "ref", width: 18 },
    { key: "montant", width: 15 },
    { key: "statut", width: 12 },
    { key: "rappro", width: 14 },
    { key: "factures", width: 28 },
  ];

  addTitleBanner(sheet, "Journal de banque (encaissements)", `${agenceLabel(agence)} · ${periodeLabel(periode)}`, "H");
  sheet.addRow([]);

  const header = sheet.addRow([
    "Date",
    "Libellé",
    "Émetteur",
    "Référence",
    "Montant",
    "Statut",
    "Rapproché",
    "Factures rapprochées",
  ]);
  styleHeaderRow(header, BRAND.green);

  rows.forEach((r) => {
    sheet.addRow([
      r.date,
      r.libelle,
      r.emetteur,
      r.reference,
      r.montant,
      r.statut,
      r.horsPlateforme ? "Hors plateforme" : r.rapproche ? "Oui" : "À rapprocher",
      r.facturesRapprochees.join(", "),
    ]);
  });

  sheet.addRow([]);
  const total = rows.reduce((s, r) => s + r.montant, 0);
  const totalRow = sheet.addRow(["TOTAL ENCAISSEMENTS", "", "", "", total, "", "", ""]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
  });

  sheet.getColumn("E").numFmt = EUR;
  sheet.getColumn("A").numFmt = "dd/mm/yyyy";
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  return sheet;
}

// ---- Récap TVA (préparation CA3) ----
export function buildTvaSheet(
  workbook: ExcelJS.Workbook,
  rows: TvaRow[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Récap TVA");
  sheet.columns = [
    { key: "regime", width: 40 },
    { key: "taux", width: 12 },
    { key: "base", width: 18 },
    { key: "tva", width: 18 },
    { key: "nb", width: 12 },
  ];

  addTitleBanner(sheet, "Récapitulatif TVA — préparation CA3", `${agenceLabel(agence)} · ${periodeLabel(periode)}`, "E");
  sheet.addRow([]);

  const header = sheet.addRow(["Régime / Taux", "Taux", "Base HT", "TVA collectée", "Nb pièces"]);
  styleHeaderRow(header, BRAND.amber);

  rows.forEach((r) => {
    sheet.addRow([r.regime, r.taux / 100, r.baseHT, r.montantTVA, r.nbPieces]);
  });

  sheet.addRow([]);
  const totalBase = rows.reduce((s, r) => s + r.baseHT, 0);
  const totalTVA = rows.reduce((s, r) => s + r.montantTVA, 0);
  const totalRow = sheet.addRow(["TOTAL", "", totalBase, totalTVA, ""]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.amber } };
  });

  sheet.getColumn("B").numFmt = "0%";
  ["C", "D"].forEach((c) => (sheet.getColumn(c).numFmt = EUR));

  sheet.addRow([]);
  const note = sheet.addRow([
    "TVA nette due (collectée) = total ci-dessus. La TVA déductible sur achats n'est pas gérée par la plateforme.",
  ]);
  note.getCell(1).font = { italic: true, size: 9, color: { argb: "FF9E9E9E" } };

  return sheet;
}

// ---- Balance auxiliaire clients ----
export function buildBalanceClientsSheet(
  workbook: ExcelJS.Workbook,
  rows: CreanceRow[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Balance clients");
  sheet.columns = [
    { key: "compte", width: 16 },
    { key: "client", width: 36 },
    { key: "facture", width: 16 },
    { key: "encaisse", width: 16 },
    { key: "reste", width: 16 },
    { key: "retard", width: 16 },
    { key: "nb", width: 12 },
  ];

  addTitleBanner(sheet, "Balance auxiliaire clients (411)", `${agenceLabel(agence)} · ${periodeLabel(periode)}`, "G");
  sheet.addRow([]);

  const header = sheet.addRow([
    "Compte aux.",
    "Client",
    "Total facturé TTC",
    "Encaissé",
    "Restant dû",
    "Dont en retard",
    "Nb factures",
  ]);
  styleHeaderRow(header, BRAND.lace);

  rows.forEach((r) => {
    sheet.addRow([
      r.clientCompteAux,
      r.client,
      r.totalFacture,
      r.totalEncaisse,
      r.restantDu,
      r.enRetard,
      r.nbFactures,
    ]);
  });

  sheet.addRow([]);
  const totalReste = rows.reduce((s, r) => s + r.restantDu, 0);
  const totalRetard = rows.reduce((s, r) => s + r.enRetard, 0);
  const totalRow = sheet.addRow([
    "TOTAL CRÉANCES",
    "",
    rows.reduce((s, r) => s + r.totalFacture, 0),
    rows.reduce((s, r) => s + r.totalEncaisse, 0),
    totalReste,
    totalRetard,
    "",
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.lace } };
  });

  ["C", "D", "E", "F"].forEach((c) => (sheet.getColumn(c).numFmt = EUR));
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  return sheet;
}

// ---- Écritures (vue FEC dans Excel) ----
export function buildEcrituresSheet(workbook: ExcelJS.Workbook, lines: FecLine[]) {
  const sheet = workbook.addWorksheet("Écritures (FEC)");
  sheet.columns = FEC_COLUMNS.map((c) => ({
    key: c,
    width:
      c === "EcritureLib" || c === "CompteLib" || c === "CompAuxLib"
        ? 30
        : c === "Debit" || c === "Credit"
        ? 14
        : 13,
  }));

  const header = sheet.addRow(FEC_COLUMNS as string[]);
  styleHeaderRow(header, BRAND.blue);

  lines.forEach((line) => {
    sheet.addRow(FEC_COLUMNS.map((c) => line[c]));
  });

  const debitIdx = FEC_COLUMNS.indexOf("Debit") + 1;
  const creditIdx = FEC_COLUMNS.indexOf("Credit") + 1;
  sheet.getColumn(debitIdx).numFmt = EUR;
  sheet.getColumn(creditIdx).numFmt = EUR;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  return sheet;
}

// ---- TVA sur encaissements (CA3 services) ----
export function buildTvaEncaissementSheet(
  workbook: ExcelJS.Workbook,
  rows: TvaEncaissementRow[],
  nonLettres: number,
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("TVA sur encaissements");
  sheet.columns = [
    { key: "regime", width: 40 },
    { key: "taux", width: 12 },
    { key: "base", width: 18 },
    { key: "tva", width: 18 },
    { key: "nb", width: 14 },
  ];

  addTitleBanner(
    sheet,
    "TVA exigible sur encaissements — CA3 (prestations de services)",
    `${agenceLabel(agence)} · ${periodeLabel(periode)}`,
    "E"
  );
  sheet.addRow([]);

  const header = sheet.addRow([
    "Régime / Taux",
    "Taux",
    "Base encaissée HT",
    "TVA exigible",
    "Nb règlements",
  ]);
  styleHeaderRow(header, BRAND.amber);

  rows.forEach((r) => {
    sheet.addRow([r.regime, r.taux / 100, r.baseEncaisseeHT, r.tvaExigible, r.nbReglements]);
  });

  sheet.addRow([]);
  const totalBase = rows.reduce((s, r) => s + r.baseEncaisseeHT, 0);
  const totalTVA = rows.reduce((s, r) => s + r.tvaExigible, 0);
  const totalRow = sheet.addRow(["TOTAL TVA EXIGIBLE", "", totalBase, totalTVA, ""]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.amber } };
  });

  sheet.getColumn("B").numFmt = "0%";
  ["C", "D"].forEach((c) => (sheet.getColumn(c).numFmt = EUR));

  sheet.addRow([]);
  const note = sheet.addRow([
    `Encaissements non encore lettrés à une facture : ${new Intl.NumberFormat(
      "fr-FR",
      { style: "currency", currency: "EUR" }
    ).format(nonLettres)} — TVA en attente de rapprochement.`,
  ]);
  note.getCell(1).font = { italic: true, size: 9, color: { argb: "FF9E9E9E" } };
  const note2 = sheet.addRow([
    "Base légale : TVA exigible à l'encaissement pour les prestations de services (art. 269-2-c CGI).",
  ]);
  note2.getCell(1).font = { italic: true, size: 9, color: { argb: "FF9E9E9E" } };

  return sheet;
}

// ---- Grand livre ----
export function buildGrandLivreSheet(
  workbook: ExcelJS.Workbook,
  comptes: GrandLivreCompte[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Grand livre");
  sheet.columns = [
    { key: "date", width: 12 },
    { key: "jrn", width: 8 },
    { key: "piece", width: 16 },
    { key: "aux", width: 14 },
    { key: "lib", width: 44 },
    { key: "debit", width: 14 },
    { key: "credit", width: 14 },
    { key: "solde", width: 16 },
    { key: "let", width: 8 },
  ];

  addTitleBanner(
    sheet,
    "Grand livre",
    `${agenceLabel(agence)} · ${periodeLabel(periode)}`,
    "I"
  );
  sheet.addRow([]);

  for (const compte of comptes) {
    const titre = sheet.addRow([`${compte.compteNum} — ${compte.compteLib}`]);
    sheet.mergeCells(`A${titre.number}:I${titre.number}`);
    titre.font = { bold: true, color: { argb: "FFFFFFFF" } };
    titre.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.licorice },
    };

    const header = sheet.addRow([
      "Date",
      "Jrn",
      "Pièce",
      "Aux.",
      "Libellé",
      "Débit",
      "Crédit",
      "Solde",
      "Let.",
    ]);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
    });

    compte.lignes.forEach((l) => {
      const r = sheet.addRow([
        fmtDateStr(l.date),
        l.journal,
        l.piece,
        l.compAux,
        l.libelle,
        l.debit || null,
        l.credit || null,
        l.solde,
        l.lettrage,
      ]);
      ["F", "G", "H"].forEach((c) => (r.getCell(c).numFmt = EUR));
    });

    const totalRow = sheet.addRow([
      "",
      "",
      "",
      "",
      `Total ${compte.compteNum}`,
      compte.totalDebit,
      compte.totalCredit,
      compte.solde,
      "",
    ]);
    totalRow.font = { bold: true };
    ["F", "G", "H"].forEach((c) => {
      totalRow.getCell(c).numFmt = EUR;
      totalRow.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND.lace },
      };
    });
    sheet.addRow([]);
  }

  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return sheet;
}

// ---- Balance générale ----
export function buildBalanceGeneraleSheet(
  workbook: ExcelJS.Workbook,
  rows: BalanceLigne[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Balance générale");
  sheet.columns = [
    { key: "compte", width: 14 },
    { key: "lib", width: 40 },
    { key: "debit", width: 16 },
    { key: "credit", width: 16 },
    { key: "sd", width: 16 },
    { key: "sc", width: 16 },
  ];

  addTitleBanner(
    sheet,
    "Balance générale",
    `${agenceLabel(agence)} · ${periodeLabel(periode)}`,
    "F"
  );
  sheet.addRow([]);

  const header = sheet.addRow([
    "Compte",
    "Libellé",
    "Total débit",
    "Total crédit",
    "Solde débiteur",
    "Solde créditeur",
  ]);
  styleHeaderRow(header, BRAND.blue);

  rows.forEach((r) => {
    sheet.addRow([
      r.compteNum,
      r.compteLib,
      r.debit,
      r.credit,
      r.soldeDebiteur || null,
      r.soldeCrediteur || null,
    ]);
  });

  sheet.addRow([]);
  const totalRow = sheet.addRow([
    "TOTAUX",
    "",
    rows.reduce((s, r) => s + r.debit, 0),
    rows.reduce((s, r) => s + r.credit, 0),
    rows.reduce((s, r) => s + r.soldeDebiteur, 0),
    rows.reduce((s, r) => s + r.soldeCrediteur, 0),
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
  });

  ["C", "D", "E", "F"].forEach((c) => (sheet.getColumn(c).numFmt = EUR));
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return sheet;
}

// ---- Contrôles / anomalies ----
export function buildControlesSheet(
  workbook: ExcelJS.Workbook,
  anomalies: Anomalie[],
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Contrôles");
  sheet.columns = [
    { key: "grav", width: 14 },
    { key: "cat", width: 28 },
    { key: "ref", width: 16 },
    { key: "msg", width: 70 },
    { key: "montant", width: 14 },
  ];

  addTitleBanner(
    sheet,
    "Contrôles de cohérence",
    `${agenceLabel(agence)} · ${periodeLabel(periode)}`,
    "E"
  );
  sheet.addRow([]);

  const header = sheet.addRow(["Gravité", "Catégorie", "Référence", "Détail", "Montant"]);
  styleHeaderRow(header, BRAND.amber);

  if (anomalies.length === 0) {
    const ok = sheet.addRow(["OK", "Aucune anomalie", "", "Toutes les pièces sont cohérentes.", ""]);
    ok.getCell(1).font = { bold: true, color: { argb: "FF2E7D32" } };
  }

  anomalies.forEach((a) => {
    const r = sheet.addRow([
      a.gravite === "error" ? "Bloquant" : "À vérifier",
      a.categorie,
      a.reference || "",
      a.message,
      a.montant ?? null,
    ]);
    r.getCell(1).font = {
      bold: true,
      color: { argb: a.gravite === "error" ? "FFC62828" : "FFEF6C00" },
    };
    r.getCell(5).numFmt = EUR;
  });

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return sheet;
}

// ---- Synthèse ----
export function buildSyntheseSheet(
  workbook: ExcelJS.Workbook,
  summary: ComptaSummary,
  periode: Periode,
  agence: AgenceInfo
) {
  const sheet = workbook.addWorksheet("Synthèse");
  sheet.getColumn(1).width = 38;
  sheet.getColumn(2).width = 22;

  addTitleBanner(sheet, "Liasse comptable — Synthèse", `${agenceLabel(agence)} · ${periodeLabel(periode)}`, "B");
  sheet.addRow([]);

  const section = (label: string) => {
    const r = sheet.addRow([label, ""]);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.licorice } };
    });
  };

  const kpi = (label: string, value: number | string, money = true) => {
    const r = sheet.addRow([label, value]);
    r.getCell(2).alignment = { horizontal: "right" };
    if (money && typeof value === "number") r.getCell(2).numFmt = EUR;
  };

  section("Chiffre d'affaires");
  kpi("CA HT", summary.caHT);
  kpi("TVA collectée", summary.tvaCollectee);
  kpi("CA TTC", summary.caTTC);
  kpi("Total avoirs HT", summary.totalAvoirsHT);
  kpi("Nb factures", summary.nbFactures, false);
  kpi("Nb avoirs", summary.nbAvoirs, false);

  sheet.addRow([]);
  section("Encaissements (banque Qonto)");
  kpi("Total encaissé", summary.encaissementsBanque);
  kpi("Dont rapproché", summary.encaissementsRapproches);
  kpi("Non rapproché / à classer", summary.encaissementsNonRapproches);

  sheet.addRow([]);
  section("TVA exigible sur encaissements (CA3 services)");
  kpi("TVA exigible (encaissements)", summary.tvaExigibleEncaissement);
  kpi("Encaissements non lettrés", summary.encaissementsNonLettres);

  sheet.addRow([]);
  section("Créances clients");
  kpi("Restant dû clients", summary.creancesClients);
  kpi("Dont en retard", summary.creancesEnRetard);

  sheet.addRow([]);
  section("Écritures & contrôles");
  kpi("Nb lignes d'écritures", summary.nbEcritures, false);
  kpi("Anomalies détectées", summary.nbAnomalies, false);
  kpi("Dont bloquantes", summary.nbAnomaliesBloquantes, false);

  return sheet;
}

/**
 * Classeur complet « Liasse comptable » : toutes les feuilles dans un seul fichier.
 */
export async function generateLiasseComptable(params: {
  summary: ComptaSummary;
  ventes: VenteRow[];
  banque: BanqueRow[];
  tva: TvaRow[];
  tvaEncaissement: TvaEncaissementRow[];
  encaissementsNonLettres: number;
  creances: CreanceRow[];
  grandLivre: GrandLivreCompte[];
  balance: BalanceLigne[];
  anomalies: Anomalie[];
  ecritures: FecLine[];
  periode: Periode;
  agence: AgenceInfo;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform — Espace Expert-Comptable";
  workbook.created = new Date();

  buildSyntheseSheet(workbook, params.summary, params.periode, params.agence);
  buildJournalVentesSheet(workbook, params.ventes, params.periode, params.agence);
  buildJournalBanqueSheet(workbook, params.banque, params.periode, params.agence);
  buildTvaSheet(workbook, params.tva, params.periode, params.agence);
  buildTvaEncaissementSheet(
    workbook,
    params.tvaEncaissement,
    params.encaissementsNonLettres,
    params.periode,
    params.agence
  );
  buildBalanceClientsSheet(workbook, params.creances, params.periode, params.agence);
  buildGrandLivreSheet(workbook, params.grandLivre, params.periode, params.agence);
  buildBalanceGeneraleSheet(workbook, params.balance, params.periode, params.agence);
  buildControlesSheet(workbook, params.anomalies, params.periode, params.agence);
  buildEcrituresSheet(workbook, params.ecritures);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Génère un classeur Excel d'une seule feuille (journal/tva/balance). */
export async function generateSingleSheet(
  build: (wb: ExcelJS.Workbook) => void
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform — Espace Expert-Comptable";
  workbook.created = new Date();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================================
// CSV (compatible imports logiciels comptables génériques)
// ============================================================

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvDate(date: Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function csvMontant(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function generateJournalVentesCSV(rows: VenteRow[]): string {
  const lines: string[] = [];
  lines.push(
    [
      "Date",
      "Reference",
      "Type",
      "Client",
      "CompteAux",
      "MontantHT",
      "TauxTVA",
      "MontantTVA",
      "MontantTTC",
      "RegimeTVA",
      "Statut",
      "Echeance",
      "Encaisse",
      "RestantDu",
      "Lettrage",
    ].join(";")
  );
  rows.forEach((r) => {
    const sens = r.type === "AVOIR" ? -1 : 1;
    lines.push(
      [
        csvDate(r.date),
        csvCell(r.reference),
        r.type,
        csvCell(r.client),
        r.clientCompteAux,
        csvMontant(sens * r.montantHT),
        csvMontant(r.tauxTVA),
        csvMontant(sens * r.montantTVA),
        csvMontant(sens * r.montantTTC),
        csvCell(r.regimeTVA),
        r.statut,
        csvDate(r.echeance),
        csvMontant(r.encaisse),
        csvMontant(r.restantDu),
        r.lettrage,
      ].join(";")
    );
  });
  return "\uFEFF" + lines.join("\r\n");
}

/** Export CSV des écritures (format "journal" générique, décimales virgule). */
export function generateEcrituresCSV(lines: FecLine[]): string {
  const out: string[] = [];
  out.push(FEC_COLUMNS.join(";"));
  for (const line of lines) {
    out.push(
      FEC_COLUMNS.map((col) => {
        if (col === "Debit" || col === "Credit") return csvMontant(line[col] as number);
        return csvCell(line[col]);
      }).join(";")
    );
  }
  return "\uFEFF" + out.join("\r\n");
}

// ============================================================
// FORMATS LOGICIELS COMPTABLES SPÉCIFIQUES
// ============================================================

function padRight(value: string, len: number): string {
  return (value ?? "").slice(0, len).padEnd(len, " ");
}
function padLeft(value: string, len: number): string {
  return (value ?? "").slice(0, len).padStart(len, " ");
}

/**
 * Format CEGID / QUADRATUS (Quadra) — ASCII à largeur fixe, enregistrements "M".
 * Référence : format d'import Quadratus (ligne de 256 caractères, type mouvement 'M').
 * Montant en centimes sur 13 caractères cadré à droite, sens 'D'/'C'.
 */
export function generateQuadratus(lines: FecLine[]): string {
  const out: string[] = [];
  for (const l of lines) {
    const sens = l.Debit > 0 ? "D" : "C";
    const montantCents = Math.round((l.Debit > 0 ? l.Debit : l.Credit) * 100);
    // jjmmaa
    const d = l.EcritureDate;
    const jjmmaa = d.length === 8 ? `${d.slice(6, 8)}${d.slice(4, 6)}${d.slice(2, 4)}` : "000000";
    const compteAux = l.CompAuxNum ? padRight(l.CompAuxNum, 8) : padRight("", 8);
    const rec =
      "M" +
      padRight(l.CompteNum, 8) + // compte général (8)
      padRight("", 3) + // filler
      padRight(l.JournalCode, 2) + // code journal (2)
      padLeft("", 3) + // folio
      jjmmaa + // date (6)
      padRight(l.PieceRef, 5) + // n° pièce (5)
      padRight(l.EcritureLib, 20) + // libellé (20)
      sens + // sens D/C (1)
      padLeft(String(montantCents), 13) + // montant en centimes (13)
      padRight(l.EcritureLet, 2) + // lettrage (2)
      padRight("", 8) + // filler
      compteAux + // compte auxiliaire (8)
      padRight(l.PieceRef, 10); // référence pièce (10)
    out.push(rec);
  }
  return out.join("\r\n");
}

/**
 * Format SAGE / PENNYLANE — CSV générique d'import d'écritures.
 * Pennylane et Sage acceptent un CSV "journal" : Journal, Date, Compte, Libellé, Débit, Crédit,
 * Pièce, Lettrage, Compte auxiliaire. Décimales virgule, séparateur point-virgule.
 */
export function generateSageCSV(lines: FecLine[]): string {
  const out: string[] = [];
  out.push(
    [
      "Journal",
      "Date",
      "Compte",
      "CompteAuxiliaire",
      "Piece",
      "Libelle",
      "Debit",
      "Credit",
      "Lettrage",
    ].join(";")
  );
  for (const l of lines) {
    const date =
      l.EcritureDate.length === 8
        ? `${l.EcritureDate.slice(6, 8)}/${l.EcritureDate.slice(4, 6)}/${l.EcritureDate.slice(0, 4)}`
        : l.EcritureDate;
    out.push(
      [
        l.JournalCode,
        date,
        l.CompteNum,
        l.CompAuxNum,
        csvCell(l.PieceRef),
        csvCell(l.EcritureLib),
        csvMontant(l.Debit),
        csvMontant(l.Credit),
        l.EcritureLet,
      ].join(";")
    );
  }
  return "\uFEFF" + out.join("\r\n");
}
