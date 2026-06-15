import { prisma } from "@/lib/prisma";

/** Slug lisible de base depuis le nom de l'événement. */
export function baseEventSlug(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Génère un slug unique pour un événement. En cas de collision, suffixe -2, -3…
 * `currentId` permet d'ignorer l'événement lui-même lors d'une mise à jour.
 */
export async function uniqueEventSlug(
  nom: string,
  currentId?: string
): Promise<string> {
  const base = baseEventSlug(nom) || "evenement";
  let slug = base;
  let n = 1;
  // Boucle bornée : on s'arrête dès qu'aucun autre événement n'utilise le slug.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.photoEvent.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === currentId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}
