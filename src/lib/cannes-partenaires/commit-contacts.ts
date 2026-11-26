/**
 * Commit carto → CannesContact (table isolée), jamais marque_contacts.
 */

import { prisma } from "@/lib/prisma";
import { contactPersonKey } from "@/lib/contact-person-key";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";
import { CARTO_AI_MAX_CONTACTS } from "@/lib/carto-ai/constants";
import { enrollMarqueInCannesPartenaires } from "@/lib/cannes-partenaires/enroll";
import { findOrCreateMarque } from "@/lib/marque-resolver";

function clean(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export type CannesCartoCommitResult = {
  marqueId: string;
  company: string;
  market: "FR";
  fichePath: string;
  created: number;
  skipped: number;
  emailsAuto: number;
  queued: number;
  enrolled: number;
  contactIds: string[];
  cannesOpportunite: {
    opportuniteId: string;
    created: boolean;
    nomMarque: string;
    contactsCopied: number;
  };
};

export async function commitCannesCartoContacts(opts: {
  company: string;
  domain?: string | null;
  language: "fr" | "en";
  selectedRows: CartoAiContactCandidate[];
  createdById?: string | null;
}): Promise<CannesCartoCommitResult> {
  const company = opts.company.trim() || "Marque";
  const rows = opts.selectedRows.slice(0, CARTO_AI_MAX_CONTACTS);

  const resolved = await findOrCreateMarque({
    name: company,
    source: "OPPORTUNITE_MARQUE",
    createDefaults: opts.domain
      ? {
          siteWeb: opts.domain.startsWith("http")
            ? opts.domain
            : `https://${opts.domain}`,
        }
      : undefined,
  });
  const marqueId = resolved.marqueId;

  if (opts.domain) {
    const m = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { siteWeb: true },
    });
    if (m && !m.siteWeb) {
      await prisma.marque.update({
        where: { id: marqueId },
        data: {
          siteWeb: opts.domain.startsWith("http")
            ? opts.domain
            : `https://${opts.domain}`,
        },
      });
    }
  }

  const enroll = await enrollMarqueInCannesPartenaires({
    marqueId,
    createdById: opts.createdById,
    angleNote: "Import carto Cannes Partenaires",
  });

  const existing = await prisma.cannesPartenairesContact.findMany({
    where: { opportuniteId: enroll.opportuniteId },
    select: { id: true, prenom: true, nom: true, linkedinUrl: true },
  });
  const existingNames = new Set(
    existing.map((c) => contactPersonKey(c.prenom, c.nom)).filter(Boolean)
  );
  const existingLi = new Set(
    existing
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
      (li && existingLi.has(li))
    ) {
      const hit = existing.find((c) => {
        const k = contactPersonKey(c.prenom, c.nom);
        const cli = (c.linkedinUrl || "").trim().toLowerCase();
        return (nameKey && k === nameKey) || (li && cli === li);
      });
      if (hit) {
        contactIds.push(hit.id);
        await prisma.cannesPartenairesContact.update({
          where: { id: hit.id },
          data: { language: opts.language === "en" ? "en" : "fr" },
        });
      }
      skipped += 1;
      continue;
    }

    const noteBits = [
      row.marche === "EU" ? "Europe" : row.marche === "INT" ? "International" : "France",
      clean(row.note),
      row.sources?.length ? `Sources: ${row.sources.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const contact = await prisma.cannesPartenairesContact.create({
      data: {
        opportuniteId: enroll.opportuniteId,
        prenom,
        nom,
        email: null,
        poste: clean(row.poste),
        perimetre: clean(row.perimetre) || noteBits || null,
        localisation: clean(row.localisation),
        priorite: clean(row.priorite),
        linkedinUrl: clean(row.linkedinUrl),
        language: opts.language === "en" ? "en" : "fr",
        emailLookupStatus: null,
      },
    });
    contactIds.push(contact.id);
    if (nameKey) existingNames.add(nameKey);
    if (li) existingLi.add(li);
    created += 1;
  }

  await syncOpportuniteContactsJson(enroll.opportuniteId);

  return {
    marqueId,
    company,
    market: "FR",
    fichePath: `/cannes-partenaires/crm/${enroll.opportuniteId}`,
    created,
    skipped,
    emailsAuto: 0,
    queued: 0,
    enrolled: 0,
    contactIds,
    cannesOpportunite: enroll,
  };
}

export async function syncOpportuniteContactsJson(
  opportuniteId: string
): Promise<number> {
  const rows = await prisma.cannesPartenairesContact.findMany({
    where: { opportuniteId },
    orderBy: [{ nom: "asc" }],
    select: { prenom: true, nom: true, email: true, poste: true },
  });
  const contacts = rows.map((c) => ({
    firstName: (c.prenom || "").trim(),
    lastName: (c.nom || "").trim(),
    email: (c.email || "").trim().toLowerCase(),
    role: (c.poste || "").trim(),
  }));
  const withEmail = contacts.filter((c) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)
  );
  await prisma.opportuniteMarque.update({
    where: { id: opportuniteId },
    data: {
      contacts,
      contactQualifie: withEmail.length > 0,
      statut: withEmail.length > 0 ? undefined : undefined,
    },
  });
  return contacts.length;
}
