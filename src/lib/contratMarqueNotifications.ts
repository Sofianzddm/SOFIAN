import prisma from "@/lib/prisma";

/** Boîte partagée du juriste : les notifs qui le concernent y sont envoyées (pas sur son mail perso). */
export const CONTRAT_MARQUE_MAILBOX = "contrat@glowupagence.fr";

/** Ne jamais cibler cette boîte pour les notifs / mails du flux TM ↔ juriste. */
const EXCLUDED = CONTRAT_MARQUE_MAILBOX;

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
