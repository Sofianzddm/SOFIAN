import prisma from "@/lib/prisma";

/** Ne jamais cibler cette boîte pour les notifs / mails du flux TM ↔ juriste. */
const EXCLUDED = "contrat@glowupagence.fr";

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
