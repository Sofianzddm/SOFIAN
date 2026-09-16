/**
 * Export Excel : contacts influence (CARTO) présents mais PAS encore
 * envoyés dans l'outreach client. Les contacts AO sont exclus (jamais
 * contactés en outreach).
 *
 * Usage: npx tsx scripts/export-marques-contacts-non-outreach.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import prisma from "../src/lib/prisma";

async function main() {
  console.log(
    "Export contacts influence non envoyés en outreach client (hors AO)…"
  );

  const contacts = await prisma.marqueContact.findMany({
    where: {
      source: "CARTO", // influence uniquement — jamais les AO
      outreachExcluded: false,
      outreachTargets: { none: {} },
    },
    orderBy: [{ marque: { nom: "asc" } }, { priorite: "asc" }, { nom: "asc" }],
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      perimetre: true,
      localisation: true,
      priorite: true,
      linkedinUrl: true,
      language: true,
      emailSuggested: true,
      emailLookupStatus: true,
      createdAt: true,
      marqueId: true,
      marque: {
        select: {
          id: true,
          nom: true,
          siteWeb: true,
          secteur: true,
        },
      },
      sousMarques: { select: { marque: { select: { nom: true } } } },
    },
  });

  // Emails déjà dans le cycle outreach client (autre fiche) → exclus
  const emails = contacts
    .map((c) => c.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));
  const inCycle =
    emails.length > 0
      ? await prisma.outreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : [];
  const inCycleSet = new Set(inCycle.map((t) => t.email.toLowerCase()));

  const filtered = contacts.filter((c) => {
    const emailLc = c.email?.trim().toLowerCase();
    if (emailLc && inCycleSet.has(emailLc)) return false;
    return true;
  });

  console.log(
    `${filtered.length} contacts influence non envoyés (${contacts.length} avant filtre emails déjà en cycle)`
  );

  type MarqueAgg = {
    id: string;
    nom: string;
    siteWeb: string | null;
    secteur: string | null;
    contacts: typeof filtered;
  };
  const byMarque = new Map<string, MarqueAgg>();
  for (const c of filtered) {
    let agg = byMarque.get(c.marqueId);
    if (!agg) {
      agg = {
        id: c.marque.id,
        nom: c.marque.nom,
        siteWeb: c.marque.siteWeb,
        secteur: c.marque.secteur,
        contacts: [],
      };
      byMarque.set(c.marqueId, agg);
    }
    agg.contacts.push(c);
  }

  const marques = Array.from(byMarque.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom, "fr")
  );
  console.log(`${marques.length} marques concernées`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform";
  workbook.created = new Date();

  const styleHeader = (sheet: ExcelJS.Worksheet) => {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF220101" },
    };
  };

  const sheetMarques = workbook.addWorksheet("Marques");
  sheetMarques.columns = [
    { header: "Marque", key: "marque", width: 36 },
    { header: "Emails", key: "emails", width: 55 },
    { header: "Site web", key: "siteWeb", width: 32 },
    { header: "Secteur", key: "secteur", width: 22 },
    { header: "Nb contacts non envoyés", key: "nb", width: 22 },
    { header: "Avec email", key: "avecEmail", width: 12 },
    { header: "Sans email", key: "sansEmail", width: 12 },
    { header: "Enrichissement QUEUED", key: "queued", width: 20 },
  ];
  styleHeader(sheetMarques);

  for (const m of marques) {
    const avecEmail = m.contacts.filter((c) => Boolean(c.email?.trim())).length;
    const sansEmail = m.contacts.length - avecEmail;
    const queued = m.contacts.filter((c) => c.emailLookupStatus === "QUEUED").length;
    const emails = m.contacts
      .map((c) => c.email?.trim())
      .filter((e): e is string => Boolean(e))
      .join(", ");
    sheetMarques.addRow({
      marque: m.nom,
      emails,
      siteWeb: m.siteWeb || "",
      secteur: m.secteur || "",
      nb: m.contacts.length,
      avecEmail,
      sansEmail,
      queued,
    });
  }

  const sheetContacts = workbook.addWorksheet("Contacts");
  sheetContacts.columns = [
    { header: "Email", key: "email", width: 36 },
    { header: "Email suggéré", key: "emailSuggested", width: 32 },
    { header: "Marque", key: "marque", width: 32 },
    { header: "Prénom", key: "prenom", width: 16 },
    { header: "Nom", key: "nom", width: 18 },
    { header: "Statut email", key: "emailLookupStatus", width: 14 },
    { header: "Poste", key: "poste", width: 24 },
    { header: "Périmètre", key: "perimetre", width: 20 },
    { header: "Localisation", key: "localisation", width: 18 },
    { header: "Priorité", key: "priorite", width: 10 },
    { header: "Langue", key: "language", width: 8 },
    { header: "Sous-marques", key: "sousMarques", width: 28 },
    { header: "LinkedIn", key: "linkedinUrl", width: 36 },
    { header: "Site web marque", key: "siteWeb", width: 28 },
    { header: "Créé le", key: "createdAt", width: 14 },
  ];
  styleHeader(sheetContacts);

  for (const c of filtered) {
    sheetContacts.addRow({
      email: c.email || "",
      emailSuggested: c.emailSuggested || "",
      marque: c.marque.nom,
      prenom: c.prenom || "",
      nom: c.nom,
      emailLookupStatus: c.emailLookupStatus || "",
      poste: c.poste || "",
      perimetre: c.perimetre || "",
      localisation: c.localisation || "",
      priorite: c.priorite || "",
      language: c.language || "",
      sousMarques: c.sousMarques.map((s) => s.marque.nom).join(", "),
      linkedinUrl: c.linkedinUrl || "",
      siteWeb: c.marque.siteWeb || "",
      createdAt: format(c.createdAt, "dd/MM/yyyy"),
    });
  }

  const stamp = format(new Date(), "yyyy-MM-dd");
  const outPath = join(
    process.cwd(),
    `marques-contacts-influence-non-outreach-${stamp}.xlsx`
  );
  const buffer = await workbook.xlsx.writeBuffer();
  writeFileSync(outPath, Buffer.from(buffer));

  console.log(`\nFichier écrit : ${outPath}`);
  console.log(`→ ${marques.length} marques / ${filtered.length} contacts influence`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
