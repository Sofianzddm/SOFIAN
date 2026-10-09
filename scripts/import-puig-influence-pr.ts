/**
 * Importe Influence_PR_PUIG.xlsx (1 onglet = 1 marque).
 * - Onglets marques → CRM Marque (création si absente) + file enrichissement
 * - Onglet « Puig (groupe transverse) » → Partner agence Puig + file enrichissement
 * - Synthèse / Alumni ignorés
 * - N'ajoute que les contacts manquants (match LinkedIn ou prénom+nom)
 *
 * Usage:
 *   npx tsx scripts/import-puig-influence-pr.ts
 *   npx tsx scripts/import-puig-influence-pr.ts --dry-run
 */
import "dotenv/config";
import path from "path";
import ExcelJS from "exceljs";
import prisma from "../src/lib/prisma";
import { findOrCreateMarque } from "../src/lib/marque-resolver";
import {
  findOrCreatePartnerByName,
  linkPartnerToMarque,
} from "../src/lib/agency-partner";
import { contactPersonKey } from "../src/lib/contact-person-key";
import { queueMarqueEnrichissement } from "../src/lib/envoyer-marque-outreach";

const FILE =
  process.env.PUIG_PR_XLSX ||
  path.join(process.env.HOME || "", "Downloads", "Influence_PR_PUIG.xlsx");

const DRY = process.argv.includes("--dry-run");

const SKIP_SHEETS = new Set(["synthèse", "synthese", "alumni"]);

/** Onglets → Partner agence Puig (pas une marque). */
const AGENCY_SHEETS = new Set([
  "puig (groupe  transverse)",
  "puig (groupe / transverse)",
  "puig (groupe transverse)",
  "puig",
]);

/** Libellé onglet → nom CRM. */
const MARQUE_ALIASES: Record<string, string> = {
  "christian louboutin beaute": "Christian Louboutin (beauté)",
  "jean paul gaultier": "Jean Paul Gaultier (beauté)",
  "carolina herrera": "Carolina Herrera",
};

type RowIn = {
  sheet: string;
  prenom: string;
  nom: string;
  poste: string | null;
  priorite: string | null;
  perimetre: string | null;
  language: string;
  email: string | null;
  linkedinUrl: string | null;
  note: string | null;
};

function normLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).trim();
  }
  if (typeof v === "object" && "text" in v && typeof (v as { text: unknown }).text === "string") {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === "object" && "hyperlink" in v) {
    const h = v as { text?: string; hyperlink?: string };
    return String(h.text || h.hyperlink || "").trim();
  }
  if (typeof v === "object" && "richText" in v) {
    const rt = (v as { richText: { text: string }[] }).richText;
    return rt.map((t) => t.text).join("").trim();
  }
  return String(v).trim();
}

function normLinkedin(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .trim()
    .toLowerCase()
    .replace(/\/$/, "")
    .split("?")[0]
    .replace(/^http:\/\//, "https://")
    .replace("://fr.linkedin.com", "://www.linkedin.com")
    .replace("://linkedin.com", "://www.linkedin.com");
}

/** ★★★ → P1, ★★ → P2, ★ → P3 */
function prioriteFromStars(raw: string): string | null {
  const stars = (raw.match(/★/g) || []).length;
  if (stars >= 3) return "P1";
  if (stars === 2) return "P2";
  if (stars === 1) return "P3";
  return raw.trim() || null;
}

function languageFromCell(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("en") && !s.includes("fr")) return "en";
  return "fr";
}

function resolveMarqueName(sheetOrLabel: string): string {
  const key = normLabel(sheetOrLabel);
  return MARQUE_ALIASES[key] || sheetOrLabel.trim();
}

async function readRows(): Promise<RowIn[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const out: RowIn[] = [];

  for (const ws of wb.worksheets) {
    const sheetNorm = normLabel(ws.name);
    if (SKIP_SHEETS.has(sheetNorm)) continue;

    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const prioriteRaw = cellText(row.getCell(1).value);
      const prenom = cellText(row.getCell(2).value);
      const nom = cellText(row.getCell(3).value);
      const poste = cellText(row.getCell(4).value) || null;
      const perimetre = cellText(row.getCell(5).value) || null;
      const language = languageFromCell(cellText(row.getCell(8).value));
      const email = cellText(row.getCell(9).value) || null;
      const linkedinUrl = cellText(row.getCell(10).value) || null;
      const note = cellText(row.getCell(11).value) || null;
      if (!prenom && !nom) return;
      out.push({
        sheet: ws.name,
        prenom,
        nom,
        poste,
        priorite: prioriteFromStars(prioriteRaw),
        perimetre,
        language,
        email,
        linkedinUrl,
        note,
      });
    });
  }

  return out;
}

function isAgencySheet(sheet: string): boolean {
  return AGENCY_SHEETS.has(normLabel(sheet));
}

async function main() {
  console.log(`Fichier: ${FILE}`);
  console.log(DRY ? "MODE DRY-RUN (aucune écriture)\n" : "MODE APPLY\n");

  const rows = await readRows();
  console.log(`Lignes lues: ${rows.length} (Synthèse + Alumni exclus)`);

  const agencyRows = rows.filter((r) => isAgencySheet(r.sheet));
  const marqueRows = rows.filter((r) => !isAgencySheet(r.sheet));

  const byMarque = new Map<string, RowIn[]>();
  for (const r of marqueRows) {
    const name = resolveMarqueName(r.sheet);
    const list = byMarque.get(name) || [];
    list.push(r);
    byMarque.set(name, list);
  }

  console.log(`→ Agence Puig: ${agencyRows.length}`);
  console.log(`→ Marques: ${marqueRows.length} contacts / ${byMarque.size} marques`);
  for (const [name, list] of byMarque) {
    console.log(`  • ${name}: ${list.length}`);
  }

  // Index global existant (éviter de recréer Agathe/Joe déjà placés ailleurs)
  const existingMarque = await prisma.marqueContact.findMany({
    select: { prenom: true, nom: true, linkedinUrl: true, email: true },
  });
  const existingAgency = await prisma.agencyContact.findMany({
    select: { prenom: true, nom: true, linkedinUrl: true, email: true },
  });
  const globalLi = new Set(
    [...existingMarque, ...existingAgency]
      .map((c) => normLinkedin(c.linkedinUrl))
      .filter(Boolean)
  );
  const globalKeys = new Set(
    [...existingMarque, ...existingAgency]
      .map((c) => contactPersonKey(c.prenom, c.nom))
      .filter(Boolean)
  );
  const globalEmails = new Set(
    [...existingMarque, ...existingAgency]
      .map((c) => (c.email || "").toLowerCase().trim())
      .filter(Boolean)
  );

  function alreadyKnown(r: RowIn): boolean {
    const key = contactPersonKey(r.prenom, r.nom || r.prenom);
    const li = normLinkedin(r.linkedinUrl);
    const em = (r.email || "").toLowerCase().trim();
    return (
      (!!li && globalLi.has(li)) ||
      (!!key && globalKeys.has(key)) ||
      (!!em && globalEmails.has(em))
    );
  }

  // Preview manquants
  console.log("\n--- Manquants ---");
  let missAgency = 0;
  for (const r of agencyRows) {
    if (alreadyKnown(r)) continue;
    missAgency += 1;
    console.log(`  [Agence] + ${r.prenom} ${r.nom}`);
  }
  let missMarque = 0;
  for (const [name, list] of byMarque) {
    for (const r of list) {
      if (alreadyKnown(r)) continue;
      missMarque += 1;
      console.log(`  [${name}] + ${r.prenom} ${r.nom}`);
    }
  }
  console.log(`Total manquants: ${missAgency + missMarque} (agence ${missAgency}, marques ${missMarque})`);

  if (DRY) {
    console.log("\nDry-run OK — relancer sans --dry-run pour appliquer.");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) throw new Error("Aucun ADMIN actif");

  const partner = await findOrCreatePartnerByName("Puig", admin.id);
  console.log(`\nPartner: ${partner.name} (${partner.id})`);

  // ——— Agence ———
  let agencyCreated = 0;
  let agencySkipped = 0;

  for (const r of agencyRows) {
    const key = contactPersonKey(r.prenom, r.nom || r.prenom);
    const li = normLinkedin(r.linkedinUrl);
    const em = (r.email || "").toLowerCase().trim();
    if (
      (li && globalLi.has(li)) ||
      (key && globalKeys.has(key)) ||
      (em && globalEmails.has(em))
    ) {
      agencySkipped += 1;
      continue;
    }
    await prisma.agencyContact.create({
      data: {
        partnerId: partner.id,
        prenom: r.prenom || r.nom || "Contact",
        nom: r.prenom ? r.nom || null : null,
        email: em || null,
        poste: r.poste,
        linkedinUrl: r.linkedinUrl,
        language: r.language,
        createdById: admin.id,
        emailLookupStatus: em ? "FOUND" : "QUEUED",
        emailLookupQueuedAt: em ? null : new Date(),
      },
    });
    if (key) globalKeys.add(key);
    if (li) globalLi.add(li);
    if (em) globalEmails.add(em);
    agencyCreated += 1;
  }
  console.log(
    `Agence: +${agencyCreated} créés, ${agencySkipped} déjà présents`
  );

  // ——— Marques ———
  let marqueCreated = 0;
  let marqueSkipped = 0;
  let marquesNew = 0;
  const queuedByMarque: { nom: string; queued: number; added: number }[] = [];

  for (const [marqueName, list] of byMarque) {
    const resolved = await findOrCreateMarque({
      name: marqueName,
      source: "IMPORT",
    });
    if (resolved.created) marquesNew += 1;

    const marque = await prisma.marque.findUniqueOrThrow({
      where: { id: resolved.marqueId },
      select: { id: true, nom: true },
    });

    await linkPartnerToMarque({
      marqueId: marque.id,
      partnerId: partner.id,
      source: "CARTO_PUIG",
      createdById: admin.id,
    });

    const existing = await prisma.marqueContact.findMany({
      where: { marqueId: marque.id },
      select: {
        prenom: true,
        nom: true,
        email: true,
        linkedinUrl: true,
        source: true,
      },
    });
    const nameKeys = new Set(
      existing
        .filter((c) => c.source !== "AO")
        .map((c) => contactPersonKey(c.prenom, c.nom))
        .filter(Boolean)
    );
    const linkedins = new Set(
      existing.map((c) => normLinkedin(c.linkedinUrl)).filter(Boolean)
    );
    const emails = new Set(
      existing.map((c) => (c.email || "").toLowerCase().trim()).filter(Boolean)
    );

    let added = 0;
    for (const r of list) {
      const key = contactPersonKey(r.prenom, r.nom || r.prenom);
      const li = normLinkedin(r.linkedinUrl);
      const em = (r.email || "").toLowerCase().trim();

      // Skip si déjà sur cette marque OU ailleurs (global)
      if (
        (key && nameKeys.has(key)) ||
        (li && linkedins.has(li)) ||
        (em && emails.has(em)) ||
        (li && globalLi.has(li)) ||
        (key && globalKeys.has(key)) ||
        (em && globalEmails.has(em))
      ) {
        marqueSkipped += 1;
        continue;
      }

      await prisma.marqueContact.create({
        data: {
          marqueId: marque.id,
          prenom: r.prenom || null,
          nom: r.nom || r.prenom || "Contact",
          email: em || null,
          poste: r.poste,
          priorite: r.priorite,
          perimetre: r.perimetre,
          linkedinUrl: r.linkedinUrl,
          language: r.language,
          source: "CARTO",
          emailLookupStatus: em ? "FOUND" : undefined,
        },
      });
      if (key) {
        nameKeys.add(key);
        globalKeys.add(key);
      }
      if (li) {
        linkedins.add(li);
        globalLi.add(li);
      }
      if (em) {
        emails.add(em);
        globalEmails.add(em);
      }
      marqueCreated += 1;
      added += 1;
    }

    const q = await queueMarqueEnrichissement({ marqueId: marque.id });
    queuedByMarque.push({
      nom: marque.nom,
      queued: q.ok ? q.queued : 0,
      added,
    });
  }

  console.log(
    `\nMarques: +${marqueCreated} contacts, ${marqueSkipped} déjà présents, ${marquesNew} marque(s) créée(s)`
  );
  console.log("File enrichissement:");
  for (const q of queuedByMarque) {
    console.log(`  • ${q.nom}: +${q.added} ajoutés, ${q.queued} en file`);
  }
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
