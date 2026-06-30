/**
 * Résolution / création d'une entreprise prospect BENELUX (model BeneluxCompany)
 * par nom, pour la prospection BENELUX. Permet de saisir une entreprise en champ
 * libre : on réutilise une entreprise existante (nom insensible à la casse) ou
 * on en crée une nouvelle avec un slug unique INTERNE au module (jamais de
 * fusion avec une marque FR : tables séparées).
 */

import { prisma } from "@/lib/prisma";

export function slugifyBenelux(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

export async function generateUniqueBeneluxSlug(baseSlug: string): Promise<string> {
  const base = baseSlug || "entreprise";
  let slug = base;
  let counter = 1;
  for (;;) {
    const existing = await prisma.beneluxCompany.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function findOrCreateBeneluxCompany(
  name: string,
  createdById: string
): Promise<{ id: string; nom: string; slug: string }> {
  const trimmed = name.trim();
  const existing = await prisma.beneluxCompany.findFirst({
    where: { nom: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, nom: true, slug: true },
  });
  if (existing) return existing;
  const slug = await generateUniqueBeneluxSlug(slugifyBenelux(trimmed));
  return prisma.beneluxCompany.create({
    data: { nom: trimmed, slug, createdById },
    select: { id: true, nom: true, slug: true },
  });
}
