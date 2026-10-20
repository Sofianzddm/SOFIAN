import { prisma } from "@/lib/prisma";

/**
 * Filtre Prisma (MarqueContact FR) : contact encore enrôlable dans les listes
 * de diffusion / cycles outreach (ni exclusion opérationnelle, ni opt-out client).
 * Ne pas utiliser sur BeneluxContact (pas de colonne diffusionOptOut).
 */
export const ENROLLABLE_CONTACT_WHERE = {
  outreachExcluded: false,
  diffusionOptOut: false,
} as const;

/**
 * Filtre Prisma (BeneluxContact) : pas de colonne `diffusionOptOut` —
 * l'opt-out client est mappé sur `outreachExcluded` (+ `excluded`).
 */
export const ENROLLABLE_BENELUX_CONTACT_WHERE = {
  outreachExcluded: false,
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

/**
 * Opt-out one-click (List-Unsubscribe) : pose diffusionOptOut sur toutes les
 * fiches MarqueContact de cet email, et exclut agence / Benelux si besoin.
 */
export async function optOutDiffusionByEmail(email: string): Promise<{
  updatedContacts: number;
}> {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return { updatedContacts: 0 };

  const contacts = await prisma.marqueContact.findMany({
    where: {
      email: { equals: normalized, mode: "insensitive" },
      diffusionOptOut: false,
    },
    select: { id: true, marqueId: true },
  });

  for (const c of contacts) {
    await setMarqueContactDiffusionOptOut({
      contactId: c.id,
      marqueId: c.marqueId,
      optedOut: true,
    });
  }

  // Pas de fiche marque : exclure quand même les pipelines agence / Benelux.
  if (contacts.length === 0) {
    await prisma.agencyContact.updateMany({
      where: { email: { equals: normalized, mode: "insensitive" } },
      data: { excluded: true },
    });
    await prisma.agencyOutreachTarget.deleteMany({ where: { email: normalized } });
    await prisma.beneluxContact.updateMany({
      where: { email: { equals: normalized, mode: "insensitive" } },
      data: { excluded: true, outreachExcluded: true },
    });
    await prisma.beneluxOutreachTarget.deleteMany({ where: { email: normalized } });
  }

  return { updatedContacts: contacts.length };
}
