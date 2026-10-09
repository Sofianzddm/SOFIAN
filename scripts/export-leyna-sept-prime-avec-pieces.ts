/**
 * Export prime Head of Sales Leyna — septembre 2026
 * Uniquement les collabs avec devis SIGNÉ client OU contrat (marque/mini).
 */
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "path";

const prisma = new PrismaClient();

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const STATUT_LABELS: Record<string, string> = {
  EN_COURS: "En cours",
  PUBLIE: "Publié",
  GAGNE: "Gagné",
  FACTURE_RECUE: "Facture reçue",
  FACTURE_ENVOYEE: "Facture envoyée",
  PAYE: "Payé",
};

function hasDevisClientSigne(docs: Array<{
  signatureStatus: string | null;
  signedDocumentUrl: string | null;
}>): boolean {
  return docs.some((d) => d.signatureStatus === "SIGNED" || !!d.signedDocumentUrl);
}

function hasContrat(c: {
  contratStatut: string;
  contratMarqueStatut: string;
  contratMarquePdfUrl: string | null;
  contratMarqueSigneAt: Date | null;
  contratMarquePdfOfficielSigneDeposeAt: Date | null;
}): boolean {
  return (
    !!c.contratMarquePdfUrl ||
    !!c.contratMarqueSigneAt ||
    !!c.contratMarquePdfOfficielSigneDeposeAt ||
    ["SIGNE", "EN_ATTENTE_JURISTE", "A_MODIFIER", "APPROUVE", "EN_COURS"].includes(
      c.contratMarqueStatut
    ) ||
    ["SIGNE", "SIGNE_COMPLET"].includes(c.contratStatut)
  );
}

async function main() {
  const mois = 9;
  const annee = 2026;
  const debut = new Date(Date.UTC(annee, mois - 1, 1));
  const fin = new Date(Date.UTC(annee, mois, 1));

  const all = await prisma.collaboration.findMany({
    where: {
      statut: { notIn: ["PERDU", "NEGO"] },
      createdAt: { gte: debut, lt: fin },
      createdBy: { is: { role: "HEAD_OF_SALES" } },
    },
    select: {
      id: true,
      reference: true,
      montantBrut: true,
      commissionEuros: true,
      statut: true,
      marquePayeeAt: true,
      contratStatut: true,
      contratMarqueStatut: true,
      contratMarquePdfUrl: true,
      contratMarqueSigneAt: true,
      contratMarquePdfOfficielSigneDeposeAt: true,
      marque: { select: { nom: true } },
      talent: { select: { prenom: true } },
      documents: {
        where: { type: "DEVIS" },
        select: {
          signatureStatus: true,
          signedDocumentUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const hosCollabs = all
    .filter((c) => hasDevisClientSigne(c.documents) || hasContrat(c))
    .map((c) => ({
      reference: c.reference,
      marque: c.marque?.nom ?? "",
      talent: c.talent?.prenom ?? "",
      montantBrut: Number(c.montantBrut ?? 0),
      margeTotale: Number(c.commissionEuros ?? 0),
      statut: String(c.statut),
      encaisse: Boolean(c.marquePayeeAt),
    }));

  if (hosCollabs.length === 0) {
    throw new Error("Aucune collab éligible (avec devis signé ou contrat).");
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Head of Sales");

  const C_LICORICE = "FF1A1110";
  const C_OLD_ROSE = "FFC08B8B";
  const C_TEA_GREEN = "FFC8F285";
  const C_OLD_LACE = "FFF7EFE6";
  const C_LACE_ALT = "FFFBF6F0";
  const C_WHITE = "FFFFFFFF";
  const C_BORDER = "FFEBDDCF";
  const C_RED = "FFB91C1C";
  const C_GREEN = "FF166534";
  const EUR_FMT = '#,##0.00" €"';
  const softBorder = {
    top: { style: "thin" as const, color: { argb: C_BORDER } },
    left: { style: "thin" as const, color: { argb: C_BORDER } },
    bottom: { style: "thin" as const, color: { argb: C_BORDER } },
    right: { style: "thin" as const, color: { argb: C_BORDER } },
  };
  const capitalized = MONTHS[mois - 1].charAt(0).toUpperCase() + MONTHS[mois - 1].slice(1);
  const NB_COLS = 8;

  ws.columns = [
    { key: "nom", width: 52 },
    { key: "montant", width: 15, style: { numFmt: EUR_FMT } },
    { key: "marge", width: 15, style: { numFmt: EUR_FMT } },
    { key: "prime", width: 18, style: { numFmt: EUR_FMT } },
    { key: "etat", width: 17 },
    { key: "debut", width: 20, style: { numFmt: EUR_FMT } },
    { key: "fin", width: 20, style: { numFmt: EUR_FMT } },
    { key: "reste", width: 15, style: { numFmt: EUR_FMT } },
  ];

  ws.mergeCells(1, 1, 1, NB_COLS);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Prime Head of Sales — ${capitalized} ${annee} (avec devis signé ou contrat)`;
  titleCell.font = { name: "Calibri", bold: true, size: 16, color: { argb: C_LICORICE } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, NB_COLS);
  const subCell = ws.getCell(2, 1);
  subCell.value =
    `Hors collabs sans pièce · ${hosCollabs.length}/${all.length} campagnes · Prime = taux moyen (3% jusqu'à 35k € · 3,5% au-dessus) × Montant · 50% début / 50% fin`;
  subCell.font = { name: "Calibri", italic: true, size: 10, color: { argb: C_OLD_ROSE } };
  subCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 18;

  const headerLabels = [
    "Nom de la campagne",
    "Montant",
    "Marge total",
    "% Marge Bénéficiaire",
    "État de la campagne",
    "50% Début de campagne",
    "50% Fin de campagne",
    "RESTE À PAYER",
  ];
  const headerRow = ws.addRow(headerLabels);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_LICORICE } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = softBorder;
  });

  const SEUIL = 35000;
  const TAUX_BAS = 0.03;
  const TAUX_HAUT = 0.035;
  const n = hosCollabs.length;
  const firstDataRow = 4;
  const lastDataRow = firstDataRow + n - 1;
  const totalRowNum = lastDataRow + 1;
  const caRow = totalRowNum + 2;
  const partBasseRow = caRow + 1;
  const partHauteRow = caRow + 2;
  const tauxRow = caRow + 3;
  const primeTotaleRow = caRow + 4;

  const totalCA = hosCollabs.reduce((s, c) => s + c.montantBrut, 0);
  const partBasse = Math.min(totalCA, SEUIL) * TAUX_BAS;
  const partHaute = Math.max(totalCA - SEUIL, 0) * TAUX_HAUT;
  const primeTotale = partBasse + partHaute;
  const tauxMoyen = totalCA > 0 ? primeTotale / totalCA : 0;

  let totMontant = 0;
  let totMarge = 0;
  let totPrime = 0;
  let totDebut = 0;
  let totFin = 0;
  let totReste = 0;

  hosCollabs.forEach((c, i) => {
    const rowNum = firstDataRow + i;
    const prime = Math.round(c.montantBrut * tauxMoyen * 100) / 100;
    const debut = Math.round(prime * 0.5 * 100) / 100;
    const fin = Math.round((prime - debut) * 100) / 100;
    const reste = c.encaisse ? 0 : fin;

    totMontant += c.montantBrut;
    totMarge += c.margeTotale;
    totPrime += prime;
    totDebut += debut;
    totFin += fin;
    totReste += reste;

    const row = ws.addRow({
      nom: `${capitalized} ${annee} - ${c.marque} X ${c.talent}`,
      montant: c.montantBrut,
      marge: c.margeTotale,
      etat: STATUT_LABELS[c.statut] ?? c.statut,
    });
    row.getCell(4).value = {
      formula: `ROUND(B${rowNum}*$B$${tauxRow},2)`,
      result: prime,
    };
    row.getCell(6).value = {
      formula: `ROUND(D${rowNum}*0.5,2)`,
      result: debut,
    };
    row.getCell(7).value = {
      formula: `ROUND(D${rowNum}-F${rowNum},2)`,
      result: fin,
    };
    row.getCell(8).value = c.encaisse ? 0 : { formula: `G${rowNum}`, result: reste };

    row.height = 20;
    const fill = i % 2 === 0 ? C_WHITE : C_LACE_ALT;
    row.eachCell((cell, col) => {
      cell.border = softBorder;
      cell.font = { name: "Calibri", size: 10, color: { argb: C_LICORICE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : col === 5 ? "center" : "right",
      };
      if ([2, 3, 4, 6, 7, 8].includes(col)) cell.numFmt = EUR_FMT;
    });
    const resteCell = row.getCell(8);
    resteCell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: reste > 0 ? C_RED : C_GREEN },
    };
  });

  const totalRow = ws.addRow([]);
  totalRow.getCell(1).value = {
    formula: `"TOTAL — "&COUNTA(A${firstDataRow}:A${lastDataRow})&" campagne(s)"`,
    result: `TOTAL — ${n} campagne(s)`,
  };
  totalRow.getCell(2).value = {
    formula: `SUM(B${firstDataRow}:B${lastDataRow})`,
    result: totMontant,
  };
  totalRow.getCell(3).value = {
    formula: `SUM(C${firstDataRow}:C${lastDataRow})`,
    result: totMarge,
  };
  totalRow.getCell(4).value = {
    formula: `SUM(D${firstDataRow}:D${lastDataRow})`,
    result: totPrime,
  };
  totalRow.getCell(6).value = {
    formula: `SUM(F${firstDataRow}:F${lastDataRow})`,
    result: totDebut,
  };
  totalRow.getCell(7).value = {
    formula: `SUM(G${firstDataRow}:G${lastDataRow})`,
    result: totFin,
  };
  totalRow.getCell(8).value = {
    formula: `SUM(H${firstDataRow}:H${lastDataRow})`,
    result: totReste,
  };
  totalRow.height = 24;
  totalRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_TEA_GREEN } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_LICORICE } };
    cell.border = softBorder;
    cell.alignment = {
      vertical: "middle",
      horizontal: col === 1 ? "left" : col === 5 ? "center" : "right",
    };
    if ([2, 3, 4, 6, 7, 8].includes(col)) cell.numFmt = EUR_FMT;
  });

  ws.addRow({});
  const recap = [
    {
      label: "C.A du mois",
      formula: `B${totalRowNum}`,
      result: totMontant,
      fmt: EUR_FMT,
      kind: "eur" as const,
    },
    {
      label: "3% du C.A (0 à 35 000 €)",
      formula: `MIN(B${caRow},${SEUIL})*${TAUX_BAS}`,
      result: partBasse,
      fmt: EUR_FMT,
      kind: "eur" as const,
    },
    {
      label: "3,5% du C.A au-dessus de 35 000 €",
      formula: `MAX(B${caRow}-${SEUIL},0)*${TAUX_HAUT}`,
      result: partHaute,
      fmt: EUR_FMT,
      kind: "eur" as const,
    },
    {
      label: "Taux moyen appliqué",
      formula: `IF(B${caRow}=0,0,B${primeTotaleRow}/B${caRow})`,
      result: tauxMoyen,
      fmt: "0.00%",
      kind: "pct" as const,
    },
    {
      label: "MARGE BÉNÉFICIAIRE (prime totale)",
      formula: `B${partBasseRow}+B${partHauteRow}`,
      result: primeTotale,
      fmt: EUR_FMT,
      kind: "prime" as const,
    },
  ];
  recap.forEach((r) => {
    const row = ws.addRow({ nom: r.label });
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);
    const isPrime = r.kind === "prime";
    labelCell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_LICORICE } };
    labelCell.alignment = { vertical: "middle", horizontal: "left" };
    valueCell.value = { formula: r.formula, result: r.result };
    valueCell.numFmt = r.fmt;
    valueCell.font = {
      name: "Calibri",
      bold: true,
      size: isPrime ? 13 : 11,
      color: { argb: isPrime ? C_GREEN : C_LICORICE },
    };
    valueCell.alignment = { vertical: "middle", horizontal: "left" };
    valueCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isPrime ? C_OLD_LACE : C_WHITE },
    };
    if (isPrime) valueCell.border = softBorder;
    row.height = isPrime ? 24 : 20;
  });

  ws.views = [{ state: "frozen", ySplit: 3 }];

  const out = path.resolve(
    process.cwd(),
    "leyna-septembre-2026-prime-avec-devis-ou-contrat.xlsx"
  );
  await workbook.xlsx.writeFile(out);
  console.log(out);
  console.log(
    JSON.stringify(
      {
        incluses: hosCollabs.length,
        exclues: all.length - hosCollabs.length,
        ca: totMontant,
        primeTotale: Math.round(primeTotale * 100) / 100,
        tauxMoyen: Math.round(tauxMoyen * 10000) / 100,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
