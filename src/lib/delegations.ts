import { prisma } from "@/lib/prisma";

export const talentAccessForGiftSelect = {
  managerId: true,
  delegations: {
    where: { actif: true },
    select: { tmRelaiId: true, actif: true },
  },
} as const;

type TalentAccessForGift = {
  managerId?: string | null;
  delegations?: { tmRelaiId?: string | null; actif?: boolean }[] | null;
};

/** TM propriétaire du gift, TM du talent, ou TM relai active. */
export function isTmSurGift(
  userId: string,
  demande: { tmId: string; talent?: TalentAccessForGift | null }
): boolean {
  if (demande.tmId === userId) return true;
  if (demande.talent?.managerId === userId) return true;
  return (demande.talent?.delegations ?? []).some(
    (d) => d.tmRelaiId === userId && d.actif !== false
  );
}

/**
 * Délégation active d'un talent. Un seul relai actif à la fois (invariant garanti
 * par `desactiverAutresDelegations`) ; on ordonne quand même pour rester
 * déterministe face aux données historiques.
 */
export async function getDelegationActive(talentId: string) {
  if (!talentId) return null;
  return prisma.delegationTM.findFirst({
    where: { talentId, actif: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, tmOrigineId: true, tmRelaiId: true },
  });
}

/**
 * LA règle unique du système : le responsable opérationnel d'un talent est le TM
 * relai s'il y a une délégation active, sinon le TM du talent (`managerId`).
 * Tout — notifications, ownership, droits d'écriture — doit passer par ici.
 */
export async function getResponsableTmId(talentId: string): Promise<string | null> {
  const delegation = await getDelegationActive(talentId);
  if (delegation?.tmRelaiId) return delegation.tmRelaiId;

  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: { managerId: true },
  });
  return talent?.managerId ?? null;
}

/**
 * Propriétaire TM du gift : relai active si le talent est délégué,
 * sinon la TM principale du talent.
 */
export async function resolveTmIdPourGift(
  talentId: string,
  fallbackTmId: string
): Promise<string> {
  return (await getResponsableTmId(talentId)) ?? fallbackTmId;
}

/**
 * Un seul relai actif par talent : coupe les autres délégations actives.
 * Retourne les délégations désactivées (pour rebasculer leur ownership).
 */
export async function desactiverAutresDelegations(
  talentId: string,
  delegationGardeeId: string
) {
  const autres = await prisma.delegationTM.findMany({
    where: { talentId, actif: true, id: { not: delegationGardeeId } },
    select: { id: true, talentId: true, tmOrigineId: true, tmRelaiId: true },
  });
  if (autres.length === 0) return autres;

  await prisma.delegationTM.updateMany({
    where: { id: { in: autres.map((d) => d.id) } },
    data: { actif: false },
  });
  return autres;
}

/** Gifts encore vivants ; les gifts clos gardent la TM qui les a traités. */
const STATUTS_GIFT_OUVERTS = [
  "BROUILLON",
  "EN_ATTENTE",
  "EN_COURS",
  "ATTENTE_MARQUE",
  "ACCEPTE",
  "ENVOYE",
] as const;

/**
 * Aligne l'ownership des dossiers en cours d'un talent (gifts + négociations,
 * qui portent un `tmId` conditionnant l'écriture et le dashboard) sur son
 * responsable courant.
 *
 * L'alignement est absolu, et non un transfert « de A vers B » : à appeler
 * après tout changement de délégation ou de TM, il rattrape de lui-même les
 * dossiers restés sur une TM tierce après une délégation mal terminée.
 */
export async function alignerOwnershipSurResponsable(
  talentId: string,
  responsableId?: string | null
): Promise<{ gifts: number; negociations: number }> {
  if (!talentId) return { gifts: 0, negociations: 0 };
  const tmId = responsableId ?? (await getResponsableTmId(talentId));
  if (!tmId) return { gifts: 0, negociations: 0 };

  const [gifts, negociations] = await Promise.all([
    prisma.demandeGift.updateMany({
      where: {
        talentId,
        statut: { in: [...STATUTS_GIFT_OUVERTS] },
        tmId: { not: tmId },
      },
      data: { tmId },
    }),
    // Les négos converties ou annulées sont de l'historique : on n'y touche pas.
    prisma.negociation.updateMany({
      where: {
        talentId,
        collaborationId: null,
        statut: { notIn: ["ANNULEE"] },
        tmId: { not: tmId },
      },
      data: { tmId },
    }),
  ]);

  return { gifts: gifts.count, negociations: negociations.count };
}

/**
 * Changement de TM d'un talent : les délégations le concernant doivent suivre.
 * Une délégation dont le nouveau manager est le relai n'a plus de sens, on la
 * coupe ; sinon on resynchronise `tmOrigineId`. L'ownership est réaligné sur le
 * responsable qui en résulte.
 */
export async function syncDelegationsApresChangementManager({
  talentId,
  ancienManagerId,
  nouveauManagerId,
}: {
  talentId: string;
  ancienManagerId: string | null;
  nouveauManagerId: string;
}): Promise<void> {
  if (!talentId || !nouveauManagerId || ancienManagerId === nouveauManagerId) return;

  const active = await getDelegationActive(talentId);

  if (active && active.tmRelaiId === nouveauManagerId) {
    await prisma.delegationTM.update({
      where: { id: active.id },
      data: { actif: false },
    });
  }

  await prisma.delegationTM.updateMany({
    where: { talentId, actif: true },
    data: { tmOrigineId: nouveauManagerId },
  });

  await alignerOwnershipSurResponsable(talentId);
}

export async function getTalentIdsAccessibles(userId: string): Promise<string[]> {
  const talentsPropres = await prisma.talent.findMany({
    where: { managerId: userId, isArchived: false },
    select: { id: true },
  });

  const delegations = await prisma.delegationTM.findMany({
    where: { tmRelaiId: userId, actif: true },
    select: { talentId: true },
  });

  const ids = [
    ...talentsPropres.map((t) => t.id),
    ...delegations.map((d) => d.talentId),
  ];

  return [...new Set(ids)];
}

export function whereClauseTalentsAccessibles(userId: string) {
  return {
    OR: [
      { managerId: userId },
      {
        delegations: {
          some: {
            tmRelaiId: userId,
            actif: true,
          },
        },
      },
    ],
  };
}

/**
 * Destinataire(s) d'une notification liée à un talent : le responsable courant,
 * c'est-à-dire la TM relai si le talent est délégué, sinon sa TM.
 */
export async function getDestinatairesNotification(talentId: string): Promise<string[]> {
  const responsableId = await getResponsableTmId(talentId);
  return responsableId ? [responsableId] : [];
}

/**
 * Log une action effectuée pendant une délégation active.
 * Si aucune délégation active n'existe pour ce talent + auteur, ne fait rien.
 */
export async function logDelegationActivite({
  talentId,
  auteurId,
  type,
  entiteType,
  entiteId,
  entiteRef,
  detail,
  ancienneValeur,
  nouvelleValeur,
}: {
  talentId: string;
  auteurId: string;
  type: string;
  entiteType: string;
  entiteId: string;
  entiteRef?: string;
  detail?: string;
  ancienneValeur?: string;
  nouvelleValeur?: string;
}) {
  const delegation = await prisma.delegationTM.findFirst({
    where: {
      talentId,
      tmRelaiId: auteurId,
      actif: true,
    },
    select: { id: true },
  });

  if (!delegation) return;

  await prisma.delegationActivite.create({
    data: {
      delegationId: delegation.id,
      talentId,
      auteurId,
      type,
      entiteType,
      entiteId,
      entiteRef,
      detail,
      ancienneValeur,
      nouvelleValeur,
    },
  });
}

