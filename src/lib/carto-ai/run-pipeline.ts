/**
 * Commit pipeline : import contacts CARTO → enrichissement auto → enrollment.
 * FR → fiche marque CRM · BENELUX → fiche benelux_companies.
 * Étape 2 lab : skipAutoEnrich → BrandEnrichPanel.
 */

import { prisma } from "@/lib/prisma";
import { findOrCreateMarque } from "@/lib/marque-resolver";
import { findOrCreateBeneluxCompany } from "@/lib/benelux-company";
import { contactPersonKey } from "@/lib/contact-person-key";
import { domainFromWebsite } from "@/lib/email-pattern";
import { compareEnrichmentProviders } from "@/lib/enrichment/compare";
import { writeMarqueContactEmail } from "@/lib/marque-contact-email";
import { writeBeneluxContactEmail } from "@/lib/benelux-contact-email";
import {
  queueMarqueEnrichissement,
  queueBeneluxEnrichissement,
  tryEnrollMarqueAfterEmailComplete,
  tryEnrollBeneluxAfterEmailComplete,
} from "@/lib/envoyer-marque-outreach";
import { CARTO_AI_MAX_CONTACTS } from "@/lib/carto-ai/constants";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";

function clean(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export type CartoAiFicheMarket = "FR" | "BENELUX";

export type CartoAiCommitResult = {
  marqueId: string;
  company: string;
  market: CartoAiFicheMarket;
  fichePath: string;
  created: number;
  skipped: number;
  emailsAuto: number;
  queued: number;
  enrolled: number;
  contactIds: string[];
};

function contactFields(row: CartoAiContactCandidate) {
  const marche =
    row.marche === "EU" || row.marche === "INT" ? row.marche : "FR";
  const noteBits = [
    marche === "FR" ? "France" : marche === "EU" ? "Europe" : "International",
    clean(row.note),
    row.sources?.length ? `Sources: ${row.sources.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const perimetre = clean(row.perimetre) || (noteBits || null);
  const priorite = clean(row.priorite)
    ? `${clean(row.priorite)} · ${marche}`
    : marche;
  return { perimetre, priorite };
}

async function commitFrance(opts: {
  company: string;
  marqueId?: string | null;
  domain?: string | null;
  language: "fr" | "en";
  selectedRows: CartoAiContactCandidate[];
  userId: string;
  skipAutoEnrich?: boolean;
}): Promise<CartoAiCommitResult> {
  const company = opts.company.trim();
  const rows = opts.selectedRows.slice(0, CARTO_AI_MAX_CONTACTS);

  let marqueId = opts.marqueId?.trim() || "";
  if (marqueId) {
    const exists = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true },
    });
    if (!exists) throw new Error("Fiche marque introuvable");
  } else {
    const resolved = await findOrCreateMarque({
      name: company || "Marque",
      source: "IMPORT",
      createDefaults: opts.domain
        ? {
            siteWeb: opts.domain.startsWith("http")
              ? opts.domain
              : `https://${opts.domain}`,
          }
        : undefined,
    });
    marqueId = resolved.marqueId;
  }

  const marque = await prisma.marque.findUnique({
    where: { id: marqueId },
    select: {
      id: true,
      nom: true,
      siteWeb: true,
      contacts: {
        where: { source: "CARTO" },
        select: { prenom: true, nom: true, email: true, linkedinUrl: true },
      },
    },
  });
  if (!marque) throw new Error("Marque introuvable");

  if (opts.domain && !marque.siteWeb) {
    await prisma.marque.update({
      where: { id: marqueId },
      data: {
        siteWeb: opts.domain.startsWith("http")
          ? opts.domain
          : `https://${opts.domain}`,
      },
    });
  }

  const existingNames = new Set(
    marque.contacts
      .map((c) => contactPersonKey(c.prenom, c.nom))
      .filter(Boolean)
  );
  const existingLinkedin = new Set(
    marque.contacts
      .map((c) => (c.linkedinUrl || "").trim().toLowerCase())
      .filter(Boolean)
  );

  let created = 0;
  let skipped = 0;
  const contactIds: string[] = [];

  for (const row of rows) {
    const prenom = clean(row.prenom);
    const nom = clean(row.nom) || prenom;
    if (!nom) {
      skipped += 1;
      continue;
    }
    const nameKey = contactPersonKey(prenom, nom);
    const li = clean(row.linkedinUrl)?.toLowerCase() || null;
    if (
      (nameKey && existingNames.has(nameKey)) ||
      (li && existingLinkedin.has(li))
    ) {
      const existing = await prisma.marqueContact.findFirst({
        where: {
          marqueId,
          source: "CARTO",
          OR: [
            ...(li
              ? [{ linkedinUrl: { equals: li, mode: "insensitive" as const } }]
              : []),
            {
              nom: { equals: nom, mode: "insensitive" },
              ...(prenom
                ? { prenom: { equals: prenom, mode: "insensitive" as const } }
                : {}),
            },
          ],
        },
        select: { id: true },
      });
      if (existing) contactIds.push(existing.id);
      skipped += 1;
      continue;
    }

    const fields = contactFields(row);
    const contact = await prisma.marqueContact.create({
      data: {
        marqueId,
        prenom,
        nom,
        email: null,
        poste: clean(row.poste),
        perimetre: fields.perimetre,
        localisation: clean(row.localisation),
        priorite: fields.priorite,
        linkedinUrl: clean(row.linkedinUrl),
        language: opts.language,
        source: "CARTO",
        outreachExcluded: false,
      },
    });
    contactIds.push(contact.id);
    if (nameKey) existingNames.add(nameKey);
    if (li) existingLinkedin.add(li);
    created += 1;
  }

  const queue = await queueMarqueEnrichissement({ marqueId });
  const queued = queue.ok ? queue.queued : 0;

  let emailsAuto = 0;
  let enrolled = 0;

  if (!opts.skipAutoEnrich) {
    const domain =
      opts.domain?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ||
      domainFromWebsite(marque.siteWeb);

    const enrichedIds: string[] = [];
    const toEnrich = await prisma.marqueContact.findMany({
      where: {
        id: { in: contactIds },
        marqueId,
        OR: [{ email: null }, { email: "" }],
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        linkedinUrl: true,
      },
    });

    for (const c of toEnrich) {
      try {
        const result = await compareEnrichmentProviders({
          prenom: c.prenom,
          nom: c.nom,
          linkedinUrl: c.linkedinUrl,
          company: marque.nom,
          domain,
        });
        if (result.agreement.length >= 1) {
          await writeMarqueContactEmail(c.id, marqueId, result.agreement[0]!);
          emailsAuto += 1;
          enrichedIds.push(c.id);
        }
      } catch (e) {
        console.warn(`[carto-ai] enrich ${c.id}:`, e);
      }
    }

    const enroll = await tryEnrollMarqueAfterEmailComplete({
      marqueId,
      userId: opts.userId,
      contactIds: enrichedIds.length ? enrichedIds : undefined,
    });
    enrolled = enroll.enrolled;
  }

  console.log(
    `[carto-ai] commit marque=${marque.nom} created=${created} auto=${emailsAuto} enrolled=${enrolled} skipAuto=${Boolean(opts.skipAutoEnrich)}`
  );

  return {
    marqueId,
    company: marque.nom,
    market: "FR",
    fichePath: `/marques/${marqueId}`,
    created,
    skipped,
    emailsAuto,
    queued: Math.max(0, queued - emailsAuto),
    enrolled,
    contactIds,
  };
}

async function commitBenelux(opts: {
  company: string;
  companyId?: string | null;
  domain?: string | null;
  language: "fr" | "en";
  selectedRows: CartoAiContactCandidate[];
  userId: string;
  skipAutoEnrich?: boolean;
}): Promise<CartoAiCommitResult> {
  const companyName = opts.company.trim();
  const rows = opts.selectedRows.slice(0, CARTO_AI_MAX_CONTACTS);

  let companyId = opts.companyId?.trim() || "";
  if (companyId) {
    const exists = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!exists) throw new Error("Fiche Benelux introuvable");
  } else {
    const resolved = await findOrCreateBeneluxCompany(
      companyName || "Entreprise",
      opts.userId
    );
    companyId = resolved.id;
  }

  const company = await prisma.beneluxCompany.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      nom: true,
      siteWeb: true,
      contacts: {
        where: { source: "CARTO" },
        select: { prenom: true, nom: true, email: true, linkedinUrl: true },
      },
    },
  });
  if (!company) throw new Error("Entreprise Benelux introuvable");

  if (opts.domain && !company.siteWeb) {
    await prisma.beneluxCompany.update({
      where: { id: companyId },
      data: {
        siteWeb: opts.domain.startsWith("http")
          ? opts.domain
          : `https://${opts.domain}`,
      },
    });
  }

  const existingNames = new Set(
    company.contacts
      .map((c) => contactPersonKey(c.prenom, c.nom))
      .filter(Boolean)
  );
  const existingLinkedin = new Set(
    company.contacts
      .map((c) => (c.linkedinUrl || "").trim().toLowerCase())
      .filter(Boolean)
  );

  let created = 0;
  let skipped = 0;
  const contactIds: string[] = [];

  for (const row of rows) {
    const prenom = clean(row.prenom);
    const nom = clean(row.nom) || prenom;
    if (!nom) {
      skipped += 1;
      continue;
    }
    const nameKey = contactPersonKey(prenom, nom);
    const li = clean(row.linkedinUrl)?.toLowerCase() || null;
    if (
      (nameKey && existingNames.has(nameKey)) ||
      (li && existingLinkedin.has(li))
    ) {
      const existing = await prisma.beneluxContact.findFirst({
        where: {
          companyId,
          source: "CARTO",
          OR: [
            ...(li
              ? [{ linkedinUrl: { equals: li, mode: "insensitive" as const } }]
              : []),
            {
              nom: { equals: nom, mode: "insensitive" },
              ...(prenom
                ? { prenom: { equals: prenom, mode: "insensitive" as const } }
                : {}),
            },
          ],
        },
        select: { id: true },
      });
      if (existing) contactIds.push(existing.id);
      skipped += 1;
      continue;
    }

    const fields = contactFields(row);
    const contact = await prisma.beneluxContact.create({
      data: {
        companyId,
        prenom: prenom || nom || "Contact",
        nom: prenom ? nom : null,
        email: null,
        poste: clean(row.poste),
        perimetre: fields.perimetre,
        localisation: clean(row.localisation),
        priorite: fields.priorite,
        linkedinUrl: clean(row.linkedinUrl),
        language: opts.language,
        source: "CARTO",
        outreachExcluded: false,
      },
    });
    contactIds.push(contact.id);
    if (nameKey) existingNames.add(nameKey);
    if (li) existingLinkedin.add(li);
    created += 1;
  }

  const queue = await queueBeneluxEnrichissement({ companyId });
  const queued = queue.ok ? queue.queued : 0;

  let emailsAuto = 0;
  let enrolled = 0;

  if (!opts.skipAutoEnrich) {
    const domain =
      opts.domain?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ||
      domainFromWebsite(company.siteWeb);

    const enrichedIds: string[] = [];
    const toEnrich = await prisma.beneluxContact.findMany({
      where: {
        id: { in: contactIds },
        companyId,
        OR: [{ email: null }, { email: "" }],
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        linkedinUrl: true,
      },
    });

    for (const c of toEnrich) {
      try {
        const result = await compareEnrichmentProviders({
          prenom: c.prenom,
          nom: c.nom || c.prenom || "",
          linkedinUrl: c.linkedinUrl,
          company: company.nom,
          domain,
        });
        if (result.agreement.length >= 1) {
          await writeBeneluxContactEmail(c.id, companyId, result.agreement[0]!);
          emailsAuto += 1;
          enrichedIds.push(c.id);
        }
      } catch (e) {
        console.warn(`[carto-ai] enrich BE ${c.id}:`, e);
      }
    }

    const enroll = await tryEnrollBeneluxAfterEmailComplete({
      companyId,
      userId: opts.userId,
      contactIds: enrichedIds.length ? enrichedIds : undefined,
    });
    enrolled = enroll.enrolled;
  }

  console.log(
    `[carto-ai] commit BE company=${company.nom} created=${created} auto=${emailsAuto} enrolled=${enrolled} skipAuto=${Boolean(opts.skipAutoEnrich)}`
  );

  return {
    marqueId: companyId,
    company: company.nom,
    market: "BENELUX",
    fichePath: `/marques/benelux/${companyId}`,
    created,
    skipped,
    emailsAuto,
    queued: Math.max(0, queued - emailsAuto),
    enrolled,
    contactIds,
  };
}

export async function commitCartoAiPipeline(opts: {
  company: string;
  /** Fiche FR (marqueId) ou Benelux (companyId). */
  marqueId?: string | null;
  domain?: string | null;
  language: "fr" | "en";
  market?: CartoAiFicheMarket;
  selectedRows: CartoAiContactCandidate[];
  userId: string;
  skipAutoEnrich?: boolean;
}): Promise<CartoAiCommitResult> {
  const company = opts.company.trim();
  if (!company && !opts.marqueId) throw new Error("Fiche requise");
  if (!opts.selectedRows.length) throw new Error("Aucun contact sélectionné");

  if (opts.market === "BENELUX") {
    return commitBenelux({
      company: company || "Entreprise",
      companyId: opts.marqueId,
      domain: opts.domain,
      language: opts.language,
      selectedRows: opts.selectedRows,
      userId: opts.userId,
      skipAutoEnrich: opts.skipAutoEnrich,
    });
  }

  return commitFrance({
    company: company || "Marque",
    marqueId: opts.marqueId,
    domain: opts.domain,
    language: opts.language,
    selectedRows: opts.selectedRows,
    userId: opts.userId,
    skipAutoEnrich: opts.skipAutoEnrich,
  });
}
