/**
 * Export Excel des prospections du mois calendaire précédent.
 * Usage: npx tsx scripts/export-prospections-mois-dernier.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import ExcelJS from "exceljs";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { fr } from "date-fns/locale";
import prisma from "../src/lib/prisma";

async function main() {
  const lastMonth = subMonths(new Date(), 1);
  const mois = lastMonth.getMonth() + 1;
  const annee = lastMonth.getFullYear();
  const moisLabel = format(lastMonth, "MMMM yyyy", { locale: fr });
  const dateDebut = startOfMonth(lastMonth);
  const dateFin = endOfMonth(lastMonth);

  console.log(`Export prospections ${moisLabel} (${mois}/${annee})…`);

  const contacts = await prisma.prospectionContact.findMany({
    where: {
      OR: [
        { fichier: { mois, annee } },
        {
          fichier: {
            AND: [
              { annee },
              {
                OR: [
                  { titre: { contains: moisLabel, mode: "insensitive" } },
                  {
                    titre: {
                      contains: format(lastMonth, "MMMM", { locale: fr }),
                      mode: "insensitive",
                    },
                  },
                ],
              },
            ],
          },
        },
        // Variante sans accent / titre type "JUILLET 2026"
        {
          fichier: {
            titre: {
              contains: `${format(lastMonth, "MMMM", { locale: fr })} ${annee}`,
              mode: "insensitive",
            },
          },
        },
      ],
    },
    include: {
      fichier: {
        select: {
          titre: true,
          mois: true,
          annee: true,
          user: { select: { prenom: true, nom: true, email: true, role: true } },
        },
      },
      talent: { select: { prenom: true, nom: true } },
    },
    orderBy: [{ statut: "asc" }, { montantBrut: "desc" }],
  });

  // Dédupliquer (OR titre + mois peut doubler)
  const seen = new Set<string>();
  const unique = contacts.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  console.log(`${unique.length} contacts trouvés (${contacts.length} avant dédup)`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform";
  workbook.created = new Date();

  // —— Feuille détail ——
  const detail = workbook.addWorksheet("Prospections");
  detail.columns = [
    { header: "TM", key: "tm", width: 22 },
    { header: "Email TM", key: "tmEmail", width: 32 },
    { header: "Fichier", key: "fichier", width: 36 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Opportunité", key: "opportunite", width: 36 },
    { header: "Talent", key: "talent", width: 24 },
    { header: "Contact", key: "contact", width: 24 },
    { header: "Email contact", key: "email", width: 30 },
    { header: "Montant HT (€)", key: "montant", width: 16 },
    { header: "Créé le", key: "createdAt", width: 14 },
    { header: "Maj le", key: "updatedAt", width: 14 },
  ];

  const headerRow = detail.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF220101" },
  };

  const statutFill: Record<string, string> = {
    GAGNE: "FFC6EFCE",
    PERDU: "FFFFC7CE",
    EN_NEGOC: "FFFFEB9C",
    CONTACTE: "FFDDEBF7",
    EN_ATTENTE: "FFF2F2F2",
  };

  for (const c of unique) {
    const tm = c.fichier.user;
    const montant = c.montantBrut ? Number(c.montantBrut) : 0;
    const row = detail.addRow({
      tm: `${tm.prenom} ${tm.nom}`.trim(),
      tmEmail: tm.email,
      fichier: c.fichier.titre,
      statut: c.statut,
      opportunite: c.nomOpportunite,
      talent: c.talent
        ? `${c.talent.prenom} ${c.talent.nom}`.trim()
        : "",
      contact: [c.prenom, c.nom].filter(Boolean).join(" "),
      email: c.email ?? "",
      montant,
      createdAt: format(c.createdAt, "dd/MM/yyyy"),
      updatedAt: format(c.updatedAt, "dd/MM/yyyy"),
    });
    const fill = statutFill[c.statut];
    if (fill) {
      row.getCell("statut").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
    }
    row.getCell("montant").numFmt = "#,##0.00";
  }

  // —— Feuille synthèse par TM ——
  const synth = workbook.addWorksheet("Synthèse par TM");
  synth.columns = [
    { header: "TM", key: "tm", width: 24 },
    { header: "Email", key: "email", width: 32 },
    { header: "Nb total", key: "nbTotal", width: 12 },
    { header: "Nb GAGNÉ", key: "nbGagne", width: 12 },
    { header: "CA GAGNÉ HT (€)", key: "caGagne", width: 18 },
    { header: "CA pipeline HT (€)", key: "caPipeline", width: 18 },
    { header: "Nb PERDU", key: "nbPerdu", width: 12 },
    { header: "Nb EN_NEGOC", key: "nbNego", width: 14 },
  ];
  synth.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  synth.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF220101" },
  };

  type Agg = {
    tm: string;
    email: string;
    nbTotal: number;
    nbGagne: number;
    caGagne: number;
    caPipeline: number;
    nbPerdu: number;
    nbNego: number;
  };
  const byTm = new Map<string, Agg>();

  for (const c of unique) {
    const u = c.fichier.user;
    const key = u.email;
    const montant = c.montantBrut ? Number(c.montantBrut) : 0;
    let agg = byTm.get(key);
    if (!agg) {
      agg = {
        tm: `${u.prenom} ${u.nom}`.trim(),
        email: u.email,
        nbTotal: 0,
        nbGagne: 0,
        caGagne: 0,
        caPipeline: 0,
        nbPerdu: 0,
        nbNego: 0,
      };
      byTm.set(key, agg);
    }
    agg.nbTotal += 1;
    if (c.statut !== "PERDU") agg.caPipeline += montant;
    if (c.statut === "GAGNE") {
      agg.nbGagne += 1;
      agg.caGagne += montant;
    } else if (c.statut === "PERDU") {
      agg.nbPerdu += 1;
    } else if (c.statut === "EN_NEGOC") {
      agg.nbNego += 1;
    }
  }

  const sorted = [...byTm.values()].sort((a, b) => b.caGagne - a.caGagne);
  for (const a of sorted) {
    const row = synth.addRow(a);
    row.getCell("caGagne").numFmt = "#,##0.00";
    row.getCell("caPipeline").numFmt = "#,##0.00";
  }

  // Total
  const total = sorted.reduce(
    (acc, a) => {
      acc.nbTotal += a.nbTotal;
      acc.nbGagne += a.nbGagne;
      acc.caGagne += a.caGagne;
      acc.caPipeline += a.caPipeline;
      acc.nbPerdu += a.nbPerdu;
      acc.nbNego += a.nbNego;
      return acc;
    },
    {
      tm: "TOTAL",
      email: "",
      nbTotal: 0,
      nbGagne: 0,
      caGagne: 0,
      caPipeline: 0,
      nbPerdu: 0,
      nbNego: 0,
    }
  );
  const totalRow = synth.addRow(total);
  totalRow.font = { bold: true };
  totalRow.getCell("caGagne").numFmt = "#,##0.00";
  totalRow.getCell("caPipeline").numFmt = "#,##0.00";

  // Infos période
  const info = workbook.addWorksheet("Info");
  info.getColumn(1).width = 28;
  info.getColumn(2).width = 40;
  info.addRow(["Période", moisLabel]);
  info.addRow(["Mois / année fichier", `${mois} / ${annee}`]);
  info.addRow([
    "Bornes calendaires",
    `${format(dateDebut, "dd/MM/yyyy")} → ${format(dateFin, "dd/MM/yyyy")}`,
  ]);
  info.addRow(["Nb lignes", unique.length]);
  info.addRow(["Généré le", format(new Date(), "dd/MM/yyyy HH:mm")]);
  info.addRow([
    "Note",
    "CA GAGNÉ = somme montantBrut des contacts statut GAGNE (pipeline prosp, pas collabs).",
  ]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const slug = format(lastMonth, "yyyy-MM");
  const outPath = join(
    process.cwd(),
    `prospections-${slug}-export.xlsx`
  );
  writeFileSync(outPath, buffer);
  console.log(`Écrit: ${outPath}`);

  // Aperçu Manon
  const manon = sorted.filter((a) =>
    a.tm.toLowerCase().includes("manon")
  );
  if (manon.length) {
    console.log("\n— Manon —");
    for (const m of manon) {
      console.log(
        `${m.tm}: ${m.nbGagne} GAGNÉ / ${m.nbTotal} total · CA GAGNÉ ${m.caGagne.toLocaleString("fr-FR")} €`
      );
    }
  } else {
    console.log("\nAucune ligne TM contenant « Manon ».");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
