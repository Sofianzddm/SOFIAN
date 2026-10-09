import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const debut = new Date(Date.UTC(2026, 8, 1));
  const fin = new Date(Date.UTC(2026, 9, 1));
  const collabs = await prisma.collaboration.findMany({
    where: {
      statut: { notIn: ["PERDU", "NEGO"] },
      createdAt: { gte: debut, lt: fin },
      createdBy: { is: { role: "HEAD_OF_SALES" } },
    },
    select: {
      id: true,
      reference: true,
      statut: true,
      montantBrut: true,
      createdAt: true,
      contratStatut: true,
      contratMarqueStatut: true,
      contratMarquePdfUrl: true,
      contratMarqueSigneAt: true,
      contratMarquePdfOfficielSigneDeposeAt: true,
      marque: { select: { nom: true } },
      talent: { select: { prenom: true, nom: true } },
      documents: {
        where: { type: "DEVIS" },
        select: {
          reference: true,
          signatureStatus: true,
          signedDocumentUrl: true,
          signaturesCount: true,
          signaturesTotal: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ montantBrut: "desc" }, { createdAt: "asc" }],
  });

  const rows = collabs
    .map((c) => {
      const devisClientSigne = c.documents.find(
        (d) => d.signatureStatus === "SIGNED" || !!d.signedDocumentUrl
      );
      const hasContrat =
        !!c.contratMarquePdfUrl ||
        !!c.contratMarqueSigneAt ||
        !!c.contratMarquePdfOfficielSigneDeposeAt ||
        ["SIGNE", "EN_ATTENTE_JURISTE", "A_MODIFIER", "APPROUVE", "EN_COURS"].includes(
          c.contratMarqueStatut
        ) ||
        ["SIGNE", "SIGNE_COMPLET"].includes(c.contratStatut);

      if (devisClientSigne || hasContrat) return null;

      const pending = c.documents.find((d) => d.signatureStatus === "PENDING");
      const any = c.documents[0];
      let etatPiece = "Aucun devis / aucun contrat";
      let devisRef = "";
      if (pending) {
        etatPiece = `Devis en attente (${pending.signaturesCount ?? 0}/${pending.signaturesTotal ?? "?"})`;
        devisRef = pending.reference ?? "";
      } else if (any) {
        etatPiece = `Devis non signé (${any.signatureStatus ?? "—"})`;
        devisRef = any.reference ?? "";
      }

      return {
        reference: c.reference,
        marque: c.marque.nom,
        talent: `${c.talent.prenom} ${c.talent.nom}`.replace(/\s+/g, " ").trim(),
        montant: Number(c.montantBrut ?? 0),
        statut: c.statut,
        etatPiece,
        devisRef,
        contratMini: c.contratStatut,
        contratMarque: c.contratMarqueStatut,
        createdAt: c.createdAt,
        url: `https://app.glowupagence.fr/collaborations/${c.id}`,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sans devis ni contrat");
  const EUR_FMT = '#,##0.00" €"';
  const C_LICORICE = "FF1A1110";
  const C_WHITE = "FFFFFFFF";
  const C_ROSE = "FFC08B8B";
  const C_ALT = "FFFBF6F0";
  const C_GREEN = "FFC8F285";
  const border = {
    top: { style: "thin" as const, color: { argb: "FFEBDDCF" } },
    left: { style: "thin" as const, color: { argb: "FFEBDDCF" } },
    bottom: { style: "thin" as const, color: { argb: "FFEBDDCF" } },
    right: { style: "thin" as const, color: { argb: "FFEBDDCF" } },
  };

  ws.columns = [
    { key: "reference", width: 16 },
    { key: "marque", width: 22 },
    { key: "talent", width: 28 },
    { key: "montant", width: 14 },
    { key: "statut", width: 16 },
    { key: "etatPiece", width: 36 },
    { key: "devisRef", width: 14 },
    { key: "contratMini", width: 14 },
    { key: "contratMarque", width: 18 },
    { key: "createdAt", width: 12 },
    { key: "url", width: 48 },
  ];

  ws.mergeCells(1, 1, 1, 11);
  const title = ws.getCell(1, 1);
  title.value = "Leyna — Septembre 2026 — Sans devis signé client ni contrat";
  title.font = { name: "Calibri", bold: true, size: 14, color: { argb: C_LICORICE } };
  ws.getRow(1).height = 26;

  const totalCA = rows.reduce((s, r) => s + r.montant, 0);
  ws.mergeCells(2, 1, 2, 11);
  const sub = ws.getCell(2, 1);
  sub.value = `${rows.length} collabs · C.A. ${totalCA.toLocaleString("fr-FR")} € · ni devis SIGNÉ par le client, ni contrat marque / mini`;
  sub.font = { name: "Calibri", italic: true, size: 10, color: { argb: C_ROSE } };

  const headerLabels = [
    "Référence",
    "Marque",
    "Talent",
    "Montant",
    "Statut collab",
    "État pièce",
    "Réf. devis",
    "Contrat mini",
    "Contrat marque",
    "Créée le",
    "Lien",
  ];
  const header = ws.addRow(headerLabels);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_LICORICE } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = border;
  });

  rows.forEach((r, i) => {
    const row = ws.addRow([
      r.reference,
      r.marque,
      r.talent,
      r.montant,
      r.statut,
      r.etatPiece,
      r.devisRef || "—",
      r.contratMini,
      r.contratMarque,
      r.createdAt,
      r.url,
    ]);
    row.height = 18;
    const fill = i % 2 === 0 ? C_WHITE : C_ALT;
    row.eachCell((cell, col) => {
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C_LICORICE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = { vertical: "middle", horizontal: col === 4 ? "right" : "left" };
    });
    row.getCell(4).numFmt = EUR_FMT;
    row.getCell(10).numFmt = "DD/MM/YYYY";
    row.getCell(11).value = { text: r.url, hyperlink: r.url };
    row.getCell(11).font = {
      name: "Calibri",
      size: 10,
      color: { argb: "FF2563EB" },
      underline: true,
    };
  });

  const totalRow = ws.addRow([`TOTAL — ${rows.length} collab(s)`, "", "", totalCA]);
  totalRow.height = 22;
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_GREEN } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_LICORICE } };
    cell.border = border;
  });
  totalRow.getCell(4).numFmt = EUR_FMT;

  ws.views = [{ state: "frozen", ySplit: 3 }];

  const out = path.resolve(
    process.cwd(),
    "leyna-septembre-2026-sans-devis-signe-ni-contrat.xlsx"
  );
  await wb.xlsx.writeFile(out);
  console.log(out);
  console.log(`rows=${rows.length} ca=${totalCA}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
