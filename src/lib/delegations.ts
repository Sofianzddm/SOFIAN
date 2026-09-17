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

/**
 * Bascule tout l'ownership opérationnel d'un talent d'un TM vers un autre :
 * gifts + négociations (les deux portent un `tmId` qui conditionne l'écriture
 * et le dashboard "mes dossiers").
 */
export async function basculerOwnershipDelegation({
  talentId,
  fromTmId,
  toTmId,
}: {
  talentId: string;
  fromTmId: string;
  toTmId: string;
}): Promise<{ gifts: number; negociations: number }> {
  if (!talentId || !fromTmId || !toTmId || fromTmId === toTmId) {
    return { gifts: 0, negociations: 0 };
  }

  const [gifts, negociations] = await Promise.all([
    prisma.demandeGift.updateMany({
      where: { talentId, tmId: fromTmId },
      data: { tmId: toTmId },
    }),
    // Les négos closes (archivées / converties) gardent leur TM d'origine :
    // elles sont de l'historique, pas du travail en cours.
    prisma.negociation.updateMany({
      where: {
        talentId,
        tmId: fromTmId,
        collaborationId: null,
        statut: { notIn: ["ANNULEE"] },
      },
      data: { tmId: toTmId },
    }),
  ]);

  return { gifts: gifts.count, negociations: negociations.count };
}

/** À l'activation du relai : ownership → TM relai. À la désactivation : → TM principale. */
export async function basculerOwnershipPourDelegation(
  delegation: {
    talentId: string;
    tmOrigineId: string;
    tmRelaiId: string;
    talent?: { managerId?: string | null } | null;
  },
  sens: "vers_relai" | "vers_origine"
): Promise<{ gifts: number; negociations: number }> {
  const origine = delegation.talent?.managerId || delegation.tmOrigineId;
  if (sens === "vers_relai") {
    return basculerOwnershipDelegation({
      talentId: delegation.talentId,
      fromTmId: origine,
      toTmId: delegation.tmRelaiId,
    });
  }
  return basculerOwnershipDelegation({
    talentId: delegation.talentId,
    fromTmId: delegation.tmRelaiId,
    toTmId: origine,
  });
}

/**
 * Changement de TM d'un talent : les délégations le concernant doivent suivre.
 * - Délégation active dont le nouveau manager est le relai → elle n'a plus de
 *   sens (relai == manager), on la coupe.
 * - Sinon on resynchronise `tmOrigineId` et on récupère l'ownership resté sur
 *   l'ancien manager pour le renvoyer vers le responsable courant.
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

  const responsableId = (await getResponsableTmId(talentId)) ?? nouveauManagerId;
  if (ancienManagerId) {
    await basculerOwnershipDelegation({
      talentId,
      fromTmId: ancienManagerId,
      toTmId: responsableId,
    });
  }
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

