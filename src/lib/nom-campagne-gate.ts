import prisma from "@/lib/prisma";
import { getTalentIdsAccessibles } from "@/lib/delegations";
import { NOM_CAMPAGNE_GATE_ROLES } from "@/lib/nom-campagne-gate-paths";

export { NOM_CAMPAGNE_GATE_ROLES, normalizeLabel } from "@/lib/nom-campagne-gate-paths";

export const NOM_MARQUE_LOCK_COOKIE = "glowup_nm_lock";

export type PendingNomCampagneItem = {
  id: string;
  reference: string;
  createdAt: string;
  marqueNom: string;
  contactAgence: string | null;
  contactKind: string | null;
  talentPrenom: string;
  talentNom: string;
};

async function scopeWhereForUser(user: {
  id: string;
  role?: string;
}): Promise<Record<string, unknown> | null> {
  const role = user.role || "";
  if (role === "TM") {
    const talentIds = await getTalentIdsAccessibles(user.id);
    if (talentIds.length === 0) return null;
    return {
      talentId: { in: talentIds },
      isPrivate: false,
      statut: { not: "PERDU" },
    };
  }
  if (role === "HEAD_OF_SALES") {
    return { createdById: user.id };
  }
  return {};
}

/**
 * Toutes les collabs du périmètre dont le nom de marque n'a pas encore
 * été resaisi/confirmé (nomMarqueVerifieAt null) — marque en direct OU agence.
 */
export async function listPendingNomCampagne(user: {
  id: string;
  role?: string;
}): Promise<PendingNomCampagneItem[]> {
  const scope = await scopeWhereForUser(user);
  if (scope === null) return [];

  const rows = await prisma.collaboration.findMany({
    where: {
      ...scope,
      nomMarqueVerifieAt: null,
    },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      contactKind: true,
      contactAgence: true,
      marque: { select: { nom: true } },
      negociation: { select: { contactKind: true, contactAgence: true } },
      talent: { select: { prenom: true, nom: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    createdAt: r.createdAt.toISOString(),
    marqueNom: r.marque.nom,
    contactAgence: r.contactAgence || r.negociation?.contactAgence || null,
    contactKind:
      r.contactKind || r.negociation?.contactKind || null,
    talentPrenom: r.talent.prenom,
    talentNom: r.talent.nom,
  }));
}

export async function countPendingNomCampagne(user: {
  id: string;
  role?: string;
}): Promise<number> {
  const scope = await scopeWhereForUser(user);
  if (scope === null) return 0;
  return prisma.collaboration.count({
    where: {
      ...scope,
      nomMarqueVerifieAt: null,
    },
  });
}

/** Bloque les APIs CRM si le TM / HoS a encore des noms de marque à confirmer. */
export async function assertNomMarqueGateCleared(user: {
  id: string;
  role?: string;
}): Promise<{ ok: true } | { ok: false; count: number }> {
  const role = user.role || "";
  if (
    !NOM_CAMPAGNE_GATE_ROLES.includes(
      role as (typeof NOM_CAMPAGNE_GATE_ROLES)[number]
    )
  ) {
    return { ok: true };
  }
  const count = await countPendingNomCampagne(user);
  if (count > 0) return { ok: false, count };
  return { ok: true };
}
