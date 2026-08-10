import { prisma } from "@/lib/prisma";

/**
 * Écrit l'email d'un contact marque. S'il existe déjà un frère sur la même
 * fiche avec cet email, le contact courant est un doublon : on le sort de la
 * file (`FOUND` + exclus) sans recopier l'email — un seul enrôlement outreach.
 */
export async function writeMarqueContactEmail(
  id: string,
  marqueId: string,
  email: string
): Promise<{ deduped: boolean }> {
  const sibling = await prisma.marqueContact.findFirst({
    where: {
      marqueId,
      email,
      id: { not: id },
    },
    select: { id: true },
  });

  if (sibling) {
    await prisma.marqueContact.update({
      where: { id },
      data: {
        emailLookupStatus: "FOUND",
        emailSuggested: null,
        emailLookupQueuedAt: null,
        outreachExcluded: true,
      },
    });
    return { deduped: true };
  }

  await prisma.marqueContact.update({
    where: { id },
    data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
  });
  return { deduped: false };
}
