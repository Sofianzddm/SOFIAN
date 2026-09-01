import type { Collaboration, Role } from "@prisma/client";

export type ContratMarqueRole = Role | string;

export type ContratMarqueDelegationLite = {
  tmRelaiId?: string | null;
  actif?: boolean;
};

export type ContratMarqueTalentAccess = {
  managerId?: string | null;
  delegations?: ContratMarqueDelegationLite[] | null;
};

export type ContratMarqueCollabAccess = Pick<Collaboration, "accountManagerId" | "isPrivate"> & {
  talent: ContratMarqueTalentAccess;
  accountManager?: { role?: string | null } | null;
};

/** Select Prisma : TM assigné + relais actifs (accès contrat marque). */
export const contratMarqueTalentAccessSelect = {
  managerId: true,
  delegations: {
    where: { actif: true },
    select: { tmRelaiId: true },
  },
} as const;

/** Collab pôle Sales : privée ou AM Head of Sales. */
export function isSalesCollab(
  collab: Pick<Collaboration, "isPrivate"> & {
    accountManager?: { role?: string | null } | null;
  }
): boolean {
  if (collab.isPrivate) return true;
  return collab.accountManager?.role === "HEAD_OF_SALES";
}

const ROLES_INFLUENCE = new Set(["TM", "HEAD_OF_INFLUENCE"]);

function isInfluenceRoleExcludedFromSalesContrat(role: ContratMarqueRole): boolean {
  return ROLES_INFLUENCE.has(role as string);
}

/** Rôles pouvant lire / uploader un contrat marque (hors TM assigné). */
const ROLES_CONTRAT_MARQUE_MANAGE = [
  "ADMIN",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "JURISTE",
] as const;

export function canReadContratMarqueReview(
  userId: string,
  role: ContratMarqueRole,
  collaboration: ContratMarqueCollabAccess
): boolean {
  if (isSalesCollab(collaboration) && isInfluenceRoleExcludedFromSalesContrat(role)) {
    return false;
  }
  if (ROLES_CONTRAT_MARQUE_MANAGE.includes(role as (typeof ROLES_CONTRAT_MARQUE_MANAGE)[number])) {
    return true;
  }
  if (role === "TM" && isTmAssigneOuRelai(userId, collaboration.talent)) return true;
  if (role === "CM" && collaboration.accountManagerId === userId) return true;
  return false;
}

/** Upload PDF / envoi au juriste (même périmètre que la lecture review, hors décisions juriste). */
export function canUploadContratMarque(
  userId: string,
  role: ContratMarqueRole,
  collaboration: ContratMarqueCollabAccess
): boolean {
  if (isSalesCollab(collaboration) && isInfluenceRoleExcludedFromSalesContrat(role)) {
    return false;
  }
  if (ROLES_CONTRAT_MARQUE_MANAGE.includes(role as (typeof ROLES_CONTRAT_MARQUE_MANAGE)[number])) {
    return true;
  }
  if (role === "TM" && isTmAssigneOuRelai(userId, collaboration.talent)) return true;
  if (role === "CM" && collaboration.accountManagerId === userId) return true;
  return false;
}

export function canAnnotateContratMarque(
  role: ContratMarqueRole,
  collaboration?: Pick<Collaboration, "isPrivate"> & {
    accountManager?: { role?: string | null } | null;
  }
): boolean {
  if (collaboration && isSalesCollab(collaboration) && role === "HEAD_OF_INFLUENCE") {
    return false;
  }
  return ["ADMIN", "HEAD_OF_INFLUENCE", "JURISTE"].includes(role as string);
}

export function isTmAssigne(userId: string, managerId: string | null): boolean {
  return Boolean(managerId && managerId === userId);
}

/** TM du talent (manager) ou TM relai sur une délégation active. */
export function isTmAssigneOuRelai(userId: string, talent: ContratMarqueTalentAccess): boolean {
  if (isTmAssigne(userId, talent.managerId ?? null)) return true;
  return (talent.delegations ?? []).some(
    (d) => d.tmRelaiId === userId && d.actif !== false
  );
}
