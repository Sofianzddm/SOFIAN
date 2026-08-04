/**
 * Règles TM / Head of Influence :
 * - pas de devis = pas de collab (enforcement côté API create)
 * - collab+devis ⇒ ligne /prospection GAGNÉ (sans doublon)
 * - mois prosp = mois du devis
 */
import prisma from "@/lib/prisma";

export const TM_INFLUENCE_ROLES = ["TM", "HEAD_OF_INFLUENCE"] as const;

export function isTmInfluenceRole(role?: string | null): boolean {
  return !!role && (TM_INFLUENCE_ROLES as readonly string[]).includes(role);
}

const MOIS_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export async function getOrCreateFichierProspectionMois(
  userId: string,
  date: Date = new Date()
) {
  const mois = date.getMonth() + 1;
  const annee = date.getFullYear();

  const existing = await prisma.fichierProspection.findFirst({
    where: { userId, mois, annee },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { prenom: true },
  });
  const titre = `${user?.prenom || "TM"} - ${MOIS_LABELS[mois - 1]} ${annee}`;

  return prisma.fichierProspection.create({
    data: { userId, mois, annee, titre },
  });
}

export type SyncTmProspectionInput = {
  collaborationId: string;
  createdById: string;
  talentId: string;
  talentPrenom: string;
  talentNom: string;
  marqueNom: string;
  montantBrut: number;
  /** Si on vient de /prospection, on réutilise cette ligne */
  prospectionContactId?: string | null;
  devisDate?: Date;
};

/**
 * Lie ou crée une ligne prosp GAGNÉ pour une collab TM.
 * Idempotent via Collaboration.prospectionContactId (unique).
 */
export async function linkOrCreateProspectionForTmCollab(
  input: SyncTmProspectionInput
): Promise<{ contactId: string; created: boolean }> {
  const existing = await prisma.collaboration.findUnique({
    where: { id: input.collaborationId },
    select: { prospectionContactId: true },
  });
  if (existing?.prospectionContactId) {
    return { contactId: existing.prospectionContactId, created: false };
  }

  const devisDate = input.devisDate ?? new Date();
  const nomOpportunite = `${input.talentPrenom} x ${input.marqueNom}`.trim();
  const montant = Number(input.montantBrut) || 0;

  // 1) Contact déjà fourni (parcours /prospection)
  if (input.prospectionContactId) {
    const contact = await prisma.prospectionContact.findUnique({
      where: { id: input.prospectionContactId },
      select: { id: true, fichier: { select: { userId: true } } },
    });
    if (contact) {
      await prisma.$transaction([
        prisma.prospectionContact.update({
          where: { id: contact.id },
          data: {
            statut: "GAGNE",
            montantBrut: montant,
            talentId: input.talentId,
            nomOpportunite,
          },
        }),
        prisma.collaboration.update({
          where: { id: input.collaborationId },
          data: { prospectionContactId: contact.id },
        }),
      ]);
      return { contactId: contact.id, created: false };
    }
  }

  // 2) Déjà une collab liée à un contact du même talent+marque ce mois ? (rare)
  // 3) Créer dans le fichier du mois du devis
  const fichier = await getOrCreateFichierProspectionMois(
    input.createdById,
    devisDate
  );

  const contact = await prisma.prospectionContact.create({
    data: {
      fichierId: fichier.id,
      talentId: input.talentId,
      nomOpportunite,
      montantBrut: montant,
      statut: "GAGNE",
    },
  });

  await prisma.collaboration.update({
    where: { id: input.collaborationId },
    data: { prospectionContactId: contact.id },
  });

  return { contactId: contact.id, created: true };
}

/**
 * Après création d'un devis : sync prosp si le créateur / owner est TM Influence.
 */
export async function syncProspectionAfterDevis(opts: {
  collaborationId: string;
  actorUserId: string;
  actorRole?: string | null;
  devisDate?: Date;
  prospectionContactId?: string | null;
}): Promise<void> {
  const collab = await prisma.collaboration.findUnique({
    where: { id: opts.collaborationId },
    include: {
      talent: { select: { prenom: true, nom: true } },
      marque: { select: { nom: true } },
      createdBy: { select: { id: true, role: true } },
    },
  });
  if (!collab) return;
  if (collab.prospectionContactId) return;

  const ownerId = collab.createdById || opts.actorUserId;
  const ownerRole = collab.createdBy?.role || opts.actorRole;
  if (!isTmInfluenceRole(ownerRole) && !isTmInfluenceRole(opts.actorRole)) {
    return;
  }

  // Si createdBy n'est pas TM mais l'acteur l'est, on rattache au TM acteur
  const tmUserId = isTmInfluenceRole(collab.createdBy?.role)
    ? (collab.createdById as string)
    : isTmInfluenceRole(opts.actorRole)
      ? opts.actorUserId
      : null;
  if (!tmUserId) return;

  await linkOrCreateProspectionForTmCollab({
    collaborationId: collab.id,
    createdById: tmUserId,
    talentId: collab.talentId,
    talentPrenom: collab.talent.prenom,
    talentNom: collab.talent.nom,
    marqueNom: collab.marque.nom,
    montantBrut: Number(collab.montantBrut),
    prospectionContactId: opts.prospectionContactId,
    devisDate: opts.devisDate,
  });
}
