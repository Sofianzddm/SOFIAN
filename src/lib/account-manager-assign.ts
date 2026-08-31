import prisma from "@/lib/prisma";

/** Head of Sales dont les collabs doivent être suivies par Ambre. */
const LEYNA_EMAIL = "leyna@glowupagence.fr";
const AMBRE_EMAIL = "ambre@glowupagence.fr";

export function isAssignedAccountManager(
  user: { id: string; role?: string | null },
  accountManagerId: string | null | undefined
): boolean {
  return user.role === "CM" && Boolean(accountManagerId && accountManagerId === user.id);
}

/** True → refuser (CM hors de ses collabs). Autres rôles : false. */
export function denyIfUnassignedCm(
  user: { id: string; role?: string | null },
  accountManagerId: string | null | undefined
): boolean {
  return user.role === "CM" && !isAssignedAccountManager(user, accountManagerId);
}

function sameEmail(a: string | null | undefined, b: string): boolean {
  return Boolean(a && a.trim().toLowerCase() === b);
}

/**
 * AM à poser à la création d'une collab.
 * Aujourd'hui : toute collab créée par Leyna → Ambre (CM).
 */
export async function accountManagerFieldsForCreator(creator: {
  id: string;
  email?: string | null;
}): Promise<{ accountManagerId: string; dateAssignationAM: Date } | null> {
  const email = creator.email?.trim();
  const isLeyna = email
    ? sameEmail(email, LEYNA_EMAIL)
    : await prisma.user
        .findUnique({ where: { id: creator.id }, select: { email: true } })
        .then((u) => sameEmail(u?.email, LEYNA_EMAIL));

  if (!isLeyna) return null;

  const ambre = await prisma.user.findFirst({
    where: {
      email: { equals: AMBRE_EMAIL, mode: "insensitive" },
      role: "CM",
      actif: true,
    },
    select: { id: true },
  });
  if (!ambre) return null;

  return { accountManagerId: ambre.id, dateAssignationAM: new Date() };
}
