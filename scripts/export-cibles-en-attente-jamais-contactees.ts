/**
 * Export Excel : cibles outreach en attente (WAITING) qui n'ont JAMAIS reçu de
 * mail de cycle (cycleCount = 0, lastSentAt vide).
 *
 * Depuis que les flux entrants ne décalent plus le compteur d'une cible
 * existante et qu'un contact inconnu entre directement en « à contacter », ces
 * lignes sont des reliquats de l'ancien comportement : elles attendent une date
 * de recontact qui n'a plus lieu d'être. Seule exception, les entrées créées
 * après un envoi SORTANT (pipeline casting) : on leur a écrit, leur attente
 * J+45 est légitime — elles sont isolées dans leur propre onglet.
 *
 * Usage: npx tsx scripts/export-cibles-en-attente-jamais-contactees.ts
 */
import { join } from "path";
import ExcelJS from "exceljs";
import prisma from "../src/lib/prisma";

type Ligne = {
  pipeline: string;
  societe: string;
  contact: string;
  email: string;
  origine: string;
  raison: string;
  creeLe: Date;
  recontactPrevuLe: Date | null;
};

/** Première partie de la raison, avant la date : sert de libellé d'origine. */
function origineDepuisRaison(raison: string | null): string {
  if (!raison) return "Origine inconnue";
  return raison.split(" le ")[0].trim();
}

/** Une attente légitime : on vient d'écrire au contact (flux sortant). */
function estEnvoiSortant(raison: string | null): boolean {
  return /pipeline casting/i.test(raison || "");
}

function formatDate(d: Date | null): string {
  return d ? d.toLocaleDateString("fr-FR") : "";
}

async function main() {
  console.log("Export des cibles en attente jamais contactées…");

  const where = { status: "WAITING" as const, cycleCount: 0, lastSentAt: null };

  const [agences, clients, benelux] = await Promise.all([
    prisma.agencyOutreachTarget.findMany({
      where,
      orderBy: [{ company: "asc" }, { email: "asc" }],
      select: {
        company: true,
        firstname: true,
        lastname: true,
        email: true,
        autoRescheduleReason: true,
        createdAt: true,
        nextRecontactAt: true,
      },
    }),
    prisma.outreachTarget.findMany({
      where,
      orderBy: [{ company: "asc" }, { email: "asc" }],
      select: {
        company: true,
        firstname: true,
        lastname: true,
        email: true,
        autoRescheduleReason: true,
        createdAt: true,
        nextRecontactAt: true,
      },
    }),
    prisma.beneluxOutreachTarget.findMany({
      where,
      orderBy: [{ companyName: "asc" }, { email: "asc" }],
      select: {
        companyName: true,
        firstname: true,
        lastname: true,
        email: true,
        autoRescheduleReason: true,
        createdAt: true,
        nextRecontactAt: true,
      },
    }),
  ]);

  const lignes: Ligne[] = [
    ...agences.map((t) => ({ ...t, societe: t.company, pipeline: "Prospection Agences" })),
    ...clients.map((t) => ({ ...t, societe: t.company, pipeline: "Outreach Clients" })),
    ...benelux.map((t) => ({ ...t, societe: t.companyName, pipeline: "Prospection Benelux" })),
  ].map((t) => ({
    pipeline: t.pipeline,
    societe: t.societe,
    contact: [t.firstname, t.lastname].filter(Boolean).join(" "),
    email: t.email,
    origine: origineDepuisRaison(t.autoRescheduleReason),
    raison: t.autoRescheduleReason || "",
    creeLe: t.createdAt,
    recontactPrevuLe: t.nextRecontactAt,
  }));

  const aBasculer = lignes.filter((l) => !estEnvoiSortant(l.raison));
  const aLaisser = lignes.filter((l) => estEnvoiSortant(l.raison));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Glow Up Platform";
  wb.created = new Date();

  const remplir = (nom: string, data: Ligne[], couleur: string) => {
    const ws = wb.addWorksheet(nom);
    ws.columns = [
      { header: "Pipeline", key: "pipeline", width: 22 },
      { header: "Société", key: "societe", width: 34 },
      { header: "Contact", key: "contact", width: 26 },
      { header: "Email", key: "email", width: 38 },
      { header: "Origine", key: "origine", width: 34 },
      { header: "Créé le", key: "creeLe", width: 13 },
      { header: "Recontact prévu", key: "recontactPrevuLe", width: 16 },
      { header: "Raison enregistrée", key: "raison", width: 90 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: couleur },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const l of data) {
      ws.addRow({
        ...l,
        creeLe: formatDate(l.creeLe),
        recontactPrevuLe: formatDate(l.recontactPrevuLe),
      });
    }
    ws.autoFilter = { from: "A1", to: "H1" };
    return ws;
  };

  remplir(`À basculer (${aBasculer.length})`, aBasculer, "FFFFE8CC");
  remplir(`Envois sortants — laisser (${aLaisser.length})`, aLaisser, "FFE3F2FD");

  const recap = wb.addWorksheet("Récap par origine");
  recap.columns = [
    { header: "Pipeline", key: "pipeline", width: 22 },
    { header: "Origine", key: "origine", width: 40 },
    { header: "Contacts", key: "n", width: 10 },
    { header: "Action", key: "action", width: 24 },
  ];
  recap.getRow(1).font = { bold: true };
  const compte = new Map<string, number>();
  for (const l of lignes) {
    const cle = `${l.pipeline}|||${l.origine}|||${estEnvoiSortant(l.raison) ? "Laisser en attente" : "Basculer à contacter"}`;
    compte.set(cle, (compte.get(cle) || 0) + 1);
  }
  for (const [cle, n] of [...compte.entries()].sort()) {
    const [pipeline, origine, action] = cle.split("|||");
    recap.addRow({ pipeline, origine, n, action });
  }

  const nomFichier = `cibles-outreach-en-attente-jamais-contactees-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const chemin = join(process.cwd(), nomFichier);
  await wb.xlsx.writeFile(chemin);

  console.log(`À basculer          : ${aBasculer.length}`);
  console.log(`Envois sortants     : ${aLaisser.length}`);
  console.log(`Fichier : ${chemin}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
