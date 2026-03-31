import type { Collaboration, Role } from "@prisma/client";

export type ContratMarqueRole = Role | string;

export function canReadContratMarqueReview(
  userId: string,
  role: ContratMarqueRole,
  collaboration: Pick<Collaboration, "accountManagerId"> & {
    talent: { managerId: string | null };
  }
): boolean {
  if (["ADMIN", "HEAD_OF_INFLUENCE", "JURISTE"].includes(role as string)) return true;
  if (role === "TM" && collaboration.talent.managerId === userId) return true;
  return false;
}

export function canAnnotateContratMarque(role: ContratMarqueRole): boolean {
  return ["ADMIN", "HEAD_OF_INFLUENCE", "JURISTE"].includes(role as string);
}

export function isTmAssigne(userId: string, managerId: string | null): boolean {
  return Boolean(managerId && managerId === userId);
}
