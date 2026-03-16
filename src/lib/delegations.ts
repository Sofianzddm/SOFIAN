import { prisma } from "@/lib/prisma";

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

