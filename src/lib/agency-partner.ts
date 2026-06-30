/**
 * Résolution / création d'une agence partenaire (model Partner) par nom, pour
 * la prospection agences. Permet de saisir une agence en champ libre : on
 * réutilise un Partner existant (nom insensible à la casse) ou on en crée un
 * nouveau avec un slug unique (talent book par défaut, /partners/{slug}).
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
): Promise<{ id: string; name: string; slug: string }> {
  const trimmed = name.trim();
  const existing = await prisma.partner.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (existing) return existing;
  const slug = await generateUniquePartnerSlug(slugifyPartner(trimmed));
  return prisma.partner.create({
    data: { name: trimmed, slug, createdBy },
    select: { id: true, name: true, slug: true },
  });
}
