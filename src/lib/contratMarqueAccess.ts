import type { Collaboration, Role } from "@prisma/client";

export type ContratMarqueRole = Role | string;

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
  collaboration: Pick<Collaboration, "accountManagerId"> & {
    talent: { managerId?: string | null };
  }
): boolean {
  if (ROLES_CONTRAT_MARQUE_MANAGE.includes(role as (typeof ROLES_CONTRAT_MARQUE_MANAGE)[number])) {
    return true;
  }
  if (role === "TM" && collaboration.talent.managerId === userId) return true;
  return false;
}

/** Upload PDF / envoi au juriste (même périmètre que la lecture review, hors décisions juriste). */
export function canUploadContratMarque(
  userId: string,
  role: ContratMarqueRole,
  collaboration: { talent: { managerId?: string | null } }
): boolean {
  if (ROLES_CONTRAT_MARQUE_MANAGE.includes(role as (typeof ROLES_CONTRAT_MARQUE_MANAGE)[number])) {
    return true;
  }
  if (role === "TM" && collaboration.talent.managerId === userId) return true;
  return false;
}

export function canAnnotateContratMarque(role: ContratMarqueRole): boolean {
  return ["ADMIN", "HEAD_OF_INFLUENCE", "JURISTE"].includes(role as string);
}

export function isTmAssigne(userId: string, managerId: string | null): boolean {
  return Boolean(managerId && managerId === userId);
}
