/**
 * Export Excel : marques / contacts influence (CARTO) hors cycle Outreach,
 * avec raison de blocage.
 *
 * Usage: npx tsx scripts/export-non-outreach-avec-raisons.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { execSync } from "child_process";
import prisma from "../src/lib/prisma";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

type Raison =
  | "Sans AO"
  | "Emails manquants / QUEUED"
  | "Emails introuvables (NOT_FOUND)"
  | "Conflit Benelux / autre pipeline"
  | "Déjà en cycle (autre contact email)"
  | "Prêt mais non enrôlé"
  | "Email invalide";

async function main() {
  console.log("Export non-outreach avec raisons…");

  const contacts = await prisma.marqueContact.findMany({
    where: {
      source: "CARTO",
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
          cartoFiles: { where: { kind: "AO" }, select: { id: true }, take: 1 },
          contacts: {
            where: { source: "AO", outreachExcluded: false },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  const emails = [
    ...new Set(
      contacts
        .map((c) => c.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e))
    ),
  ];

  const [clientTargets, agencyTargets, beneluxTargets] = await Promise.all([
    emails.length
      ? prisma.outreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true, marque: { select: { nom: true } } },
        })
      : [],
    emails.length
      ? prisma.agencyOutreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : [],
    emails.length
      ? prisma.beneluxOutreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : [],
  ]);

  const clientByEmail = new Map(
    clientTargets.map((t) => [t.email.toLowerCase(), t.marque?.nom || "?"])
  );
  const agencySet = new Set(agencyTargets.map((t) => t.email.toLowerCase()));
  const beneluxSet = new Set(beneluxTargets.map((t) => t.email.toLowerCase()));

  // Filtrer ceux déjà en cycle client via le même email (autre fiche)
  const filtered = contacts.filter((c) => {
    const e = c.email?.trim().toLowerCase();
    if (e && clientByEmail.has(e)) return false;
    return true;
  });

  type MarqueAgg = {
    id: string;
    nom: string;
    siteWeb: string | null;
    secteur: string | null;
    hasAo: boolean;
    contacts: typeof filtered;
    raisons: Set<Raison>;
  };

  const byMarque = new Map<string, MarqueAgg>();

  for (const c of filtered) {
    const hasAo =
      c.marque.cartoFiles.length > 0 || c.marque.contacts.length > 0;
    let agg = byMarque.get(c.marqueId);
    if (!agg) {
      agg = {
        id: c.marque.id,
        nom: c.marque.nom,
        siteWeb: c.marque.siteWeb,
        secteur: c.marque.secteur,
        hasAo,
        contacts: [],
        raisons: new Set(),
      };
      byMarque.set(c.marqueId, agg);
    }
    agg.contacts.push(c);
  }

  const contactRows: Array<{
    email: string;
    emailSuggested: string;
    marque: string;
    prenom: string;
    nom: string;
    raison: Raison;
    detail: string;
    emailLookupStatus: string;
    poste: string;
    hasAo: string;
    siteWeb: string;
    createdAt: string;
  }> = [];

  for (const agg of byMarque.values()) {
    let hasMissing = false;
    let hasQueued = false;
    let hasNotFoundOnly = false;
    let hasInvalid = false;
    let hasConflict = false;
    let hasValidReady = false;

    for (const c of agg.contacts) {
      const email = c.email?.trim() || "";
      const emailLc = email.toLowerCase();
      let raison: Raison;
      let detail = "";

      if (!agg.hasAo) {
        raison = "Sans AO";
        detail = "Importer la feuille AO / Achats";
      } else if (!email) {
        if (c.emailLookupStatus === "QUEUED") {
          raison = "Emails manquants / QUEUED";
          detail = c.emailSuggested
            ? `Suggestion: ${c.emailSuggested}`
            : "En file enrichissement";
          hasQueued = true;
        } else if (c.emailLookupStatus === "NOT_FOUND") {
          raison = "Emails introuvables (NOT_FOUND)";
          detail = "Marqué introuvable";
          hasNotFoundOnly = true;
        } else {
          raison = "Emails manquants / QUEUED";
          detail = "Pas d'email";
          hasMissing = true;
        }
      } else if (!isValidEmail(email)) {
        raison = "Email invalide";
        detail = email;
        hasInvalid = true;
      } else if (beneluxSet.has(emailLc) || agencySet.has(emailLc)) {
        const parts: string[] = [];
        if (beneluxSet.has(emailLc)) parts.push("Benelux");
        if (agencySet.has(emailLc)) parts.push("Agences");
        raison = "Conflit Benelux / autre pipeline";
        detail = `Déjà dans: ${parts.join(" + ")}`;
        hasConflict = true;
      } else if (clientByEmail.has(emailLc)) {
        raison = "Déjà en cycle (autre contact email)";
        detail = `Cycle sur ${clientByEmail.get(emailLc)}`;
      } else {
        raison = "Prêt mais non enrôlé";
        detail = "AO + email OK — relancer enrôlement";
        hasValidReady = true;
      }

      if (!agg.hasAo) agg.raisons.add("Sans AO");
      else agg.raisons.add(raison);

      contactRows.push({
        email: email,
        emailSuggested: c.emailSuggested || "",
        marque: agg.nom,
        prenom: c.prenom || "",
        nom: c.nom,
        raison,
        detail,
        emailLookupStatus: c.emailLookupStatus || "",
        poste: c.poste || "",
        hasAo: agg.hasAo ? "Oui" : "Non",
        siteWeb: agg.siteWeb || "",
        createdAt: format(c.createdAt, "dd/MM/yyyy"),
      });
    }

    // Raison dominante marque
    if (!agg.hasAo) {
      agg.raisons.clear();
      agg.raisons.add("Sans AO");
    } else if (hasMissing || hasQueued) {
      agg.raisons.clear();
      agg.raisons.add("Emails manquants / QUEUED");
    } else if (hasInvalid) {
      agg.raisons.clear();
      agg.raisons.add("Email invalide");
    } else if (hasConflict && !hasValidReady) {
      agg.raisons.clear();
      agg.raisons.add("Conflit Benelux / autre pipeline");
    } else if (hasValidReady) {
      agg.raisons.clear();
      agg.raisons.add("Prêt mais non enrôlé");
    } else if (hasNotFoundOnly) {
      agg.raisons.clear();
      agg.raisons.add("Emails introuvables (NOT_FOUND)");
    }
  }

  const marques = Array.from(byMarque.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom, "fr")
  );

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

  // --- Synthèse ---
  const sheetSynth = workbook.addWorksheet("Synthèse");
  sheetSynth.columns = [
    { header: "Raison", key: "raison", width: 40 },
    { header: "Nb marques", key: "nb", width: 14 },
  ];
  styleHeader(sheetSynth);

  const counts = new Map<string, number>();
  for (const m of marques) {
    const r = [...m.raisons][0] || "?";
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  for (const [raison, nb] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    sheetSynth.addRow({ raison, nb });
  }
  sheetSynth.addRow({});
  sheetSynth.addRow({ raison: "TOTAL marques", nb: marques.length });
  sheetSynth.addRow({ raison: "TOTAL contacts", nb: filtered.length });

  // --- Marques ---
  const sheetMarques = workbook.addWorksheet("Marques");
  sheetMarques.columns = [
    { header: "Marque", key: "marque", width: 36 },
    { header: "Raison", key: "raison", width: 36 },
    { header: "AO", key: "ao", width: 8 },
    { header: "Nb contacts hors cycle", key: "nb", width: 22 },
    { header: "Avec email", key: "avecEmail", width: 12 },
    { header: "Sans email", key: "sansEmail", width: 12 },
    { header: "QUEUED", key: "queued", width: 10 },
    { header: "Emails", key: "emails", width: 55 },
    { header: "Site web", key: "siteWeb", width: 32 },
    { header: "Secteur", key: "secteur", width: 22 },
  ];
  styleHeader(sheetMarques);

  for (const m of marques) {
    const avecEmail = m.contacts.filter((c) => Boolean(c.email?.trim())).length;
    const sansEmail = m.contacts.length - avecEmail;
    const queued = m.contacts.filter(
      (c) => c.emailLookupStatus === "QUEUED"
    ).length;
    sheetMarques.addRow({
      marque: m.nom,
      raison: [...m.raisons].join(" · "),
      ao: m.hasAo ? "Oui" : "Non",
      nb: m.contacts.length,
      avecEmail,
      sansEmail,
      queued,
      emails: m.contacts
        .map((c) => c.email?.trim())
        .filter((e): e is string => Boolean(e))
        .join(", "),
      siteWeb: m.siteWeb || "",
      secteur: m.secteur || "",
    });
  }

  // --- Contacts ---
  const sheetContacts = workbook.addWorksheet("Contacts");
  sheetContacts.columns = [
    { header: "Marque", key: "marque", width: 32 },
    { header: "Raison", key: "raison", width: 36 },
    { header: "Détail", key: "detail", width: 40 },
    { header: "Prénom", key: "prenom", width: 16 },
    { header: "Nom", key: "nom", width: 18 },
    { header: "Email", key: "email", width: 36 },
    { header: "Email suggéré", key: "emailSuggested", width: 32 },
    { header: "Statut email", key: "emailLookupStatus", width: 14 },
    { header: "AO", key: "hasAo", width: 8 },
    { header: "Poste", key: "poste", width: 28 },
    { header: "Site web", key: "siteWeb", width: 28 },
    { header: "Créé le", key: "createdAt", width: 14 },
  ];
  styleHeader(sheetContacts);

  for (const row of contactRows) {
    sheetContacts.addRow(row);
  }

  const stamp = format(new Date(), "yyyy-MM-dd");
  const outPath = join(
    process.cwd(),
    `marques-non-outreach-avec-raisons-${stamp}.xlsx`
  );
  const buffer = await workbook.xlsx.writeBuffer();
  writeFileSync(outPath, Buffer.from(buffer));

  console.log(`\nFichier écrit : ${outPath}`);
  console.log(`→ ${marques.length} marques / ${filtered.length} contacts`);
  console.log("Répartition :");
  for (const [raison, nb] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${raison}: ${nb}`);
  }

  try {
    execSync(`open "${outPath}"`);
    console.log("→ Fichier ouvert");
  } catch {
    console.log("(ouverture auto échouée — ouvre le fichier manuellement)");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
