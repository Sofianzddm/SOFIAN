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
 * Propriétaire TM du gift : relai active si le talent est délégué,
 * sinon la TM principale du talent.
 */
export async function resolveTmIdPourGift(
  talentId: string,
  fallbackTmId: string
): Promise<string> {
  const relai = await prisma.delegationTM.findFirst({
    where: { talentId, actif: true },
    select: { tmRelaiId: true },
  });
  if (relai?.tmRelaiId) return relai.tmRelaiId;

  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: { managerId: true },
  });
  return talent?.managerId ?? fallbackTmId;
}

export async function basculerGiftsDelegation({
  talentId,
  fromTmId,
  toTmId,
}: {
  talentId: string;
  fromTmId: string;
  toTmId: string;
}): Promise<number> {
  if (!talentId || !fromTmId || !toTmId || fromTmId === toTmId) return 0;
  const result = await prisma.demandeGift.updateMany({
    where: { talentId, tmId: fromTmId },
    data: { tmId: toTmId },
  });
  return result.count;
}

/** À l'activation du relai : gifts → TM relai. À la désactivation : gifts → TM principale. */
export async function basculerGiftsPourDelegation(
  delegation: {
    talentId: string;
    tmOrigineId: string;
    tmRelaiId: string;
    talent?: { managerId?: string | null } | null;
  },
  sens: "vers_relai" | "vers_origine"
): Promise<number> {
  const origine = delegation.talent?.managerId || delegation.tmOrigineId;
  if (sens === "vers_relai") {
    return basculerGiftsDelegation({
      talentId: delegation.talentId,
      fromTmId: origine,
      toTmId: delegation.tmRelaiId,
    });
  }
  return basculerGiftsDelegation({
    talentId: delegation.talentId,
    fromTmId: delegation.tmRelaiId,
    toTmId: origine,
  });
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
 * Retourne le(s) destinataire(s) pour une notification liée à un talent.
 * Si le talent est délégué activement, la notif va à la TM relai (pas l'origine).
 */
export async function getDestinatairesNotification(talentId: string): Promise<string[]> {
  const delegationsActives = await prisma.delegationTM.findMany({
    where: { talentId, actif: true },
    select: { tmRelaiId: true },
  });

  if (delegationsActives.length > 0) {
    return delegationsActives.map((d) => d.tmRelaiId);
  }

  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: { managerId: true },
  });

  return talent?.managerId ? [talent.managerId] : [];
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

