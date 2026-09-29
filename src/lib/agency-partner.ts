/**
 * Résolution / création d'une agence partenaire (model Partner) par nom, pour
 * la prospection agences. Permet de saisir une agence en champ libre : on
 * réutilise un Partner existant (nom insensible à la casse) ou on en crée un
 * nouveau avec un slug unique (talent book par défaut, /partners/{slug}).
 *
 * Lien Marque ↔ Partner : enregistrement CRM uniquement (pas d'enrôlement
 * Outreach Clients — le contact reste côté AgencyContact).
 */

import { prisma } from "@/lib/prisma";

export function slugifyPartner(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

export async function generateUniquePartnerSlug(baseSlug: string): Promise<string> {
  const base = baseSlug || "agence";
  let slug = base;
  let counter = 1;
  for (;;) {
    const existing = await prisma.partner.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function findOrCreatePartnerByName(
  name: string,
  createdBy: string
): Promise<{ id: string; name: string; slug: string; market: string }> {
  const trimmed = name.trim();
  const existing = await prisma.partner.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, slug: true, market: true },
  });
  if (existing) return existing;

  // Filet anti-doublon : même nom écrit différemment (accents, espaces,
  // ponctuation) → même slug normalisé → on réutilise la fiche existante.
  const baseSlug = slugifyPartner(trimmed);
  if (baseSlug) {
    const bySlug = await prisma.partner.findUnique({
      where: { slug: baseSlug },
      select: { id: true, name: true, slug: true, market: true },
    });
    if (bySlug) return bySlug;
  }

  const slug = await generateUniquePartnerSlug(baseSlug);
  return prisma.partner.create({
    data: { name: trimmed, slug, createdBy },
    select: { id: true, name: true, slug: true, market: true },
  });
}

/**
 * Attache une agence (Partner) à une fiche marque. Idempotent.
 * Ne crée pas de MarqueContact et n'enrôle pas l'outreach clients.
 */
export async function linkPartnerToMarque(input: {
  marqueId: string;
  partnerId: string;
  source?: string;
  createdById?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.marquePartner.findUnique({
    where: {
      marqueId_partnerId: {
        marqueId: input.marqueId,
        partnerId: input.partnerId,
      },
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.marquePartner.create({
    data: {
      marqueId: input.marqueId,
      partnerId: input.partnerId,
      source: (input.source || "INBOUND").trim() || "INBOUND",
      createdById: input.createdById || null,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}
