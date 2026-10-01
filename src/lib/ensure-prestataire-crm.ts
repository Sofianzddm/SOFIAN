import { prisma } from "@/lib/prisma";
import type { PrestataireCategorie } from "@/lib/projets-outreach";

/** Crée ou retrouve une fiche CRM pour un nom + catégorie. */
export async function ensurePrestataireCrm(opts: {
  nom: string;
  categorie: PrestataireCategorie | string;
}): Promise<string> {
  const nom = opts.nom.trim();
  const categorie = String(opts.categorie || "AUTRE").toUpperCase();

  const existing = await prisma.prestataire.findFirst({
    where: {
      nom: { equals: nom, mode: "insensitive" },
      categorie: categorie as PrestataireCategorie,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.prestataire.create({
    data: {
      nom,
      categorie: categorie as PrestataireCategorie,
    },
    select: { id: true },
  });
  return created.id;
}
