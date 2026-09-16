import { prisma } from "@/lib/prisma";

/**
 * Filtre Prisma : contact encore enrôlable dans les listes de diffusion /
 * cycles outreach (ni exclusion opérationnelle, ni opt-out client).
 */
export const ENROLLABLE_CONTACT_WHERE = {
  outreachExcluded: false,
  diffusionOptOut: false,
} as const;

/** True si cet email a un opt-out client sur au moins une fiche MarqueContact. */
export async function emailHasDiffusionOptOut(email: string): Promise<boolean> {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;
  const hit = await prisma.marqueContact.findFirst({
    where: {
      diffusionOptOut: true,
      email: { equals: normalized, mode: "insensitive" },
    },
    select: { id: true },
  });
  return Boolean(hit);
}

/**
 * Pose / lève l'opt-out « liste de diffusion » sur un MarqueContact.
 * À true : conserve l'email, sort du cycle client, exclut aussi agence/Benelux
 * si le même email y existe, et pose outreachExcluded (sans pouvoir le lever
 * tant que l'opt-out reste actif).
 */
export async function setMarqueContactDiffusionOptOut(input: {
  contactId: string;
  marqueId: string;
  optedOut: boolean;
}): Promise<{
  contact: {
    id: string;
    diffusionOptOut: boolean;
    diffusionOptOutAt: Date | null;
    outreachExcluded: boolean;
  };
  removedClientTargets: number;
}> {
  const contact = await prisma.marqueContact.findFirst({
    where: { id: input.contactId, marqueId: input.marqueId },
    select: { id: true, email: true },
  });
  if (!contact) {
    throw new Error("Contact non trouvé.");
  }

  const email = (contact.email || "").trim().toLowerCase();

  if (!input.optedOut) {
    const updated = await prisma.marqueContact.update({
      where: { id: contact.id },
      data: {
        diffusionOptOut: false,
        diffusionOptOutAt: null,
        // On lève aussi l'exclusion opérationnelle : le contact redevient
        // enrôlable (manuel ou sweep) après réinscription.
        outreachExcluded: false,
      },
      select: {
        id: true,
        diffusionOptOut: true,
        diffusionOptOutAt: true,
        outreachExcluded: true,
      },
    });
    return { contact: updated, removedClientTargets: 0 };
  }

  const [updated, removedClient] = await prisma.$transaction([
    prisma.marqueContact.update({
      where: { id: contact.id },
      data: {
        diffusionOptOut: true,
        diffusionOptOutAt: new Date(),
        outreachExcluded: true,
        emailLookupStatus: null,
        emailLookupQueuedAt: null,
      },
      select: {
        id: true,
        diffusionOptOut: true,
        diffusionOptOutAt: true,
        outreachExcluded: true,
      },
    }),
    prisma.outreachTarget.deleteMany({
      where: {
        OR: [
          { marqueContactId: contact.id },
          ...(email ? [{ email }] : []),
        ],
      },
    }),
  ]);

  // Même personne dans un autre pipeline : on l'exclut aussi (email conservé).
  if (email) {
    await prisma.agencyContact.updateMany({
      where: { email: { equals: email, mode: "insensitive" } },
      data: { excluded: true },
    });
    await prisma.agencyOutreachTarget.deleteMany({
      where: { email },
    });
    await prisma.beneluxContact.updateMany({
      where: { email: { equals: email, mode: "insensitive" } },
      data: { excluded: true, outreachExcluded: true },
    });
    await prisma.beneluxOutreachTarget.deleteMany({
      where: { email },
    });
  }

  return { contact: updated, removedClientTargets: removedClient.count };
}
