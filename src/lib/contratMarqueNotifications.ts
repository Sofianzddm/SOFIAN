import prisma from "@/lib/prisma";
import { isSalesCollab } from "@/lib/contratMarqueAccess";

/** Boîte partagée du juriste : les notifs qui le concernent y sont envoyées (pas sur son mail perso). */
export const CONTRAT_MARQUE_MAILBOX = "contrat@glowupagence.fr";

/** Ne jamais cibler cette boîte pour les notifs / mails du flux TM ↔ juriste. */
const EXCLUDED = CONTRAT_MARQUE_MAILBOX;

const ROLES_EXCLUDED_FROM_SALES_COLLAB_NOTIFS = new Set(["TM", "HEAD_OF_INFLUENCE"]);

export function isContratMarqueExcludedNotificationEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  return Boolean(e && e === EXCLUDED);
}

/** Utilisateurs juristes actifs (comptes app). */
export async function findJuristesContratMarque() {
  return prisma.user.findMany({
    where: { role: "JURISTE", actif: true },
    select: { id: true, email: true, prenom: true },
  });
}

export function shouldFilterSalesCollabNotifications(role: string): boolean {
  return ROLES_EXCLUDED_FROM_SALES_COLLAB_NOTIFS.has(role);
}

export async function getSalesCollabIdSet(collabIds: string[]): Promise<Set<string>> {
  if (collabIds.length === 0) return new Set();
  const rows = await prisma.collaboration.findMany({
    where: { id: { in: collabIds } },
    select: {
      id: true,
      isPrivate: true,
      accountManager: { select: { role: true } },
    },
  });
  return new Set(rows.filter(isSalesCollab).map((r) => r.id));
}

/** Masque les notifs liées aux collabs Sales pour TM et Head of Influence. */
export async function filterNotificationsForRole<T extends { collabId: string | null }>(
  notifications: T[],
  role: string
): Promise<T[]> {
  if (!shouldFilterSalesCollabNotifications(role)) return notifications;
  const collabIds = [...new Set(notifications.map((n) => n.collabId).filter(Boolean))] as string[];
  const hidden = await getSalesCollabIdSet(collabIds);
  return notifications.filter((n) => !n.collabId || !hidden.has(n.collabId));
}

/** Compte les non-lues en excluant les collabs Sales pour TM / Head of Influence. */
export async function countUnreadNotificationsForRole(userId: string, role: string): Promise<number> {
  if (!shouldFilterSalesCollabNotifications(role)) {
    return prisma.notification.count({
      where: { userId, lu: false },
    });
  }

  const unread = await prisma.notification.findMany({
    where: { userId, lu: false },
    select: { collabId: true },
  });
  const collabIds = [...new Set(unread.map((n) => n.collabId).filter(Boolean))] as string[];
  const hidden = await getSalesCollabIdSet(collabIds);
  return unread.filter((n) => !n.collabId || !hidden.has(n.collabId)).length;
}
