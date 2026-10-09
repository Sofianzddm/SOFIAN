/**
 * One-shot : importe Cibles_Influence_PUIG.xlsx
 * - Contacts Puig / Groupe Puig / Puig France → CRM agence Partner « Puig » (+ file enrichissement)
 * - Contacts des marques filles → CRM Marque respectif (+ file enrichissement)
 * - Lien Marque ↔ Partner Puig
 *
 * Usage:
 *   npx tsx scripts/import-puig-cibles-enrichissement.ts
 *   npx tsx scripts/import-puig-cibles-enrichissement.ts --dry-run
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
  process.env.PUIG_XLSX ||
  path.join(
    process.env.HOME || "",
    "Downloads",
    "Cibles_Influence_PUIG.xlsx"
  );

const DRY = process.argv.includes("--dry-run");

/** Libellés Excel → fiche agence Puig (pas une marque). */
const AGENCY_LABELS = new Set(
  ["puig", "groupe puig", "puig france"].map((s) => s)
);

/**
 * Alias Excel → nom CRM préféré (évite de créer un doublon quand une fiche
 * existe déjà sous un libellé légèrement différent).
 */
const MARQUE_ALIASES: Record<string, string> = {
  "christian louboutin beaute": "Christian Louboutin (beauté)",
  "jean paul gaultier": "Jean Paul Gaultier (beauté)",
  "carolina herrera": "Carolina Herrera",
};

type RowIn = {
  marqueRaw: string;
  prenom: string;
  nom: string;
  poste: string | null;
  priorite: string | null;
  perimetre: string | null;
  linkedinUrl: string | null;
  vague: "operationnels" | "decideurs";
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

function prioriteFromOrdre(ordre: string): string | null {
  const n = Number(ordre);
  if (n === 1) return "P1";
  if (n === 2) return "P2";
  if (n === 3) return "P3";
  if (n >= 4) return `P${n}`;
  return null;
}

async function readRows(): Promise<RowIn[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const out: RowIn[] = [];

  const ops = wb.getWorksheet("Opérationnels (cibles)");
  if (ops) {
    ops.eachRow((row, idx) => {
      if (idx === 1) return;
      const marqueRaw = cellText(row.getCell(1).value);
      const ordre = cellText(row.getCell(2).value);
      const prenom = cellText(row.getCell(3).value);
      const nom = cellText(row.getCell(4).value);
      const poste = cellText(row.getCell(5).value) || null;
      const niveau = cellText(row.getCell(6).value) || null;
      const linkedinUrl = cellText(row.getCell(7).value) || null;
      if (!marqueRaw || (!prenom && !nom)) return;
      out.push({
        marqueRaw,
        prenom,
        nom,
        poste,
        priorite: prioriteFromOrdre(ordre),
        perimetre: niveau,
        linkedinUrl,
        vague: "operationnels",
      });
    });
  }

  const dec = wb.getWorksheet("Décideurs (2e vague)");
  if (dec) {
    dec.eachRow((row, idx) => {
      if (idx === 1) return;
      const marqueRaw = cellText(row.getCell(1).value);
      const prenom = cellText(row.getCell(2).value);
      const nom = cellText(row.getCell(3).value);
      const poste = cellText(row.getCell(4).value) || null;
      const linkedinUrl = cellText(row.getCell(5).value) || null;
      if (!marqueRaw || (!prenom && !nom)) return;
      out.push({
        marqueRaw,
        prenom,
        nom,
        poste,
        priorite: "décideur",
        perimetre: "2e vague",
        linkedinUrl,
        vague: "decideurs",
      });
    });
  }

  return out;
}

function resolveMarqueName(raw: string): string {
  const key = normLabel(raw);
  return MARQUE_ALIASES[key] || raw.trim();
}

async function main() {
  console.log(`Fichier: ${FILE}`);
  console.log(DRY ? "MODE DRY-RUN (aucune écriture)\n" : "MODE APPLY\n");

  const rows = await readRows();
  console.log(`Lignes lues: ${rows.length}`);

  const agencyRows = rows.filter((r) => AGENCY_LABELS.has(normLabel(r.marqueRaw)));
  const marqueRows = rows.filter((r) => !AGENCY_LABELS.has(normLabel(r.marqueRaw)));

  console.log(`→ Agence Puig: ${agencyRows.length}`);
  console.log(`→ Marques: ${marqueRows.length}`);

  const byMarque = new Map<string, RowIn[]>();
  for (const r of marqueRows) {
    const name = resolveMarqueName(r.marqueRaw);
    const list = byMarque.get(name) || [];
    list.push(r);
    byMarque.set(name, list);
  }
  for (const [name, list] of byMarque) {
    console.log(`  • ${name}: ${list.length}`);
  }

  if (DRY) {
    console.log("\nDry-run OK — relancer sans --dry-run pour appliquer.");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Aucun ADMIN actif");

  const partner = await findOrCreatePartnerByName("Puig", admin.id);
  console.log(`\nPartner: ${partner.name} (${partner.id})`);

  // ——— Agence ———
  let agencyCreated = 0;
  let agencySkipped = 0;
  let agencyQueued = 0;

  const existingAgency = await prisma.agencyContact.findMany({
    where: { partnerId: partner.id },
    select: { prenom: true, nom: true, email: true, linkedinUrl: true },
  });
  const agencyNameKeys = new Set(
    existingAgency.map((c) => contactPersonKey(c.prenom, c.nom)).filter(Boolean)
  );
  const agencyLinkedin = new Set(
    existingAgency
      .map((c) => (c.linkedinUrl || "").toLowerCase().replace(/\/$/, ""))
      .filter(Boolean)
  );

  for (const r of agencyRows) {
    const key = contactPersonKey(r.prenom, r.nom || r.prenom);
    const li = (r.linkedinUrl || "").toLowerCase().replace(/\/$/, "");
    if ((key && agencyNameKeys.has(key)) || (li && agencyLinkedin.has(li))) {
      agencySkipped += 1;
      continue;
    }
    await prisma.agencyContact.create({
      data: {
        partnerId: partner.id,
        prenom: r.prenom || r.nom || "Contact",
        nom: r.prenom ? r.nom || null : null,
        poste: r.poste,
        linkedinUrl: r.linkedinUrl,
        language: "fr",
        createdById: admin.id,
        emailLookupStatus: "QUEUED",
        emailLookupQueuedAt: new Date(),
      },
    });
    if (key) agencyNameKeys.add(key);
    if (li) agencyLinkedin.add(li);
    agencyCreated += 1;
    agencyQueued += 1;
  }

  console.log(
    `Agence: +${agencyCreated} créés, ${agencySkipped} déjà présents, ${agencyQueued} en enrichissement`
  );

  // ——— Marques ———
  let marqueCreated = 0;
  let marqueSkipped = 0;
  const queuedByMarque: { nom: string; queued: number }[] = [];

  for (const [marqueName, list] of byMarque) {
    const resolved = await findOrCreateMarque({
      name: marqueName,
      source: "IMPORT",
    });
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
      select: { prenom: true, nom: true, email: true, linkedinUrl: true, source: true },
    });
    const nameKeys = new Set(
      existing
        .filter((c) => c.source !== "AO")
        .map((c) => contactPersonKey(c.prenom, c.nom))
        .filter(Boolean)
    );
    const linkedins = new Set(
      existing
        .map((c) => (c.linkedinUrl || "").toLowerCase().replace(/\/$/, ""))
        .filter(Boolean)
    );

    for (const r of list) {
      const key = contactPersonKey(r.prenom, r.nom || r.prenom);
      const li = (r.linkedinUrl || "").toLowerCase().replace(/\/$/, "");
      if ((key && nameKeys.has(key)) || (li && linkedins.has(li))) {
        marqueSkipped += 1;
        continue;
      }
      await prisma.marqueContact.create({
        data: {
          marqueId: marque.id,
          prenom: r.prenom || null,
          nom: r.nom || r.prenom || "Contact",
          poste: r.poste,
          priorite: r.priorite,
          perimetre: r.perimetre,
          linkedinUrl: r.linkedinUrl,
          language: "fr",
          source: "CARTO",
        },
      });
      if (key) nameKeys.add(key);
      if (li) linkedins.add(li);
      marqueCreated += 1;
    }

    const q = await queueMarqueEnrichissement({ marqueId: marque.id });
    queuedByMarque.push({
      nom: marque.nom,
      queued: q.ok ? q.queued : 0,
    });
  }

  console.log(`\nMarques: +${marqueCreated} créés, ${marqueSkipped} déjà présents`);
  console.log("File enrichissement:");
  for (const q of queuedByMarque) {
    console.log(`  • ${q.nom}: ${q.queued}`);
  }
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
