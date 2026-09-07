import type { Prisma } from "@prisma/client";

/** Comptes CEO : collabs privées créées par Sofian, invisibles pour tout le reste (y compris Maud). */
export const SOFIAN_EMAILS = [
  "s.zeddam@glowupagence.fr",
  "sofian@glowupagence.fr",
] as const;

export function isSofianEmail(email?: string | null): boolean {
  if (!email) return false;
  const n = email.trim().toLowerCase();
  return SOFIAN_EMAILS.some((e) => e === n);
}

export function canAccessPrivateCollab(
  collab: {
    isPrivate: boolean;
    createdById: string | null;
    createdBy?: { email?: string | null } | null;
    accountManagerId?: string | null;
    contratMarquePdfUrl?: string | null;
  },
  user: { id: string; role?: string; email?: string | null }
): boolean {
  if (!collab.isPrivate) return true;

  const creatorIsSofian = isSofianEmail(collab.createdBy?.email);
  if (creatorIsSofian) {
    return isSofianEmail(user.email) || Boolean(collab.createdById && collab.createdById === user.id);
  }

  if (user.role === "ADMIN") return true;
  if (collab.createdById && collab.createdById === user.id) return true;
  if (collab.accountManagerId && collab.accountManagerId === user.id) return true;
  if (user.role === "JURISTE" && collab.contratMarquePdfUrl) return true;
  return false;
}

/** À AND-er sur les listes : masque les collabs privées Sofian pour tout le monde sauf lui. */
export function hideSofianPrivateCollabsWhere(user: {
  email?: string | null;
}): Prisma.CollaborationWhereInput {
  if (isSofianEmail(user.email)) return {};
  return {
    NOT: {
      isPrivate: true,
      createdBy: {
        OR: SOFIAN_EMAILS.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
    },
  };
}
