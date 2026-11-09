import { prisma } from "@/lib/prisma";

export type GiftSenderMailbox = {
  email: string;
  prenom: string;
  nom: string;
  /** Prénom Nom — pour signature template + From. */
  displayName: string;
};

/**
 * Boîte Gmail de la personne CONNECTÉE (1 user = 1 boîte).
 * Priorité : token lié à userId, sinon email plateforme = email Gmail (auto-lien).
 */
export async function resolveGiftSenderMailbox(
  userId: string
): Promise<GiftSenderMailbox | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      gmailToken: { select: { email: true, displayName: true } },
    },
  });
  if (!user) return null;

  const prenom = (user.prenom || "").trim();
  const nom = (user.nom || "").trim();
  const platformName = [prenom, nom].filter(Boolean).join(" ") || "Glow Up";

  if (user.gmailToken?.email) {
    return {
      email: user.gmailToken.email,
      prenom,
      nom,
      displayName: user.gmailToken.displayName?.trim() || platformName,
    };
  }

  // Fallback : boîte dont l'email = email plateforme, pas encore liée
  const platformEmail = (user.email || "").trim().toLowerCase();
  if (!platformEmail) return null;

  const byEmail = await prisma.gmailToken.findUnique({
    where: { email: platformEmail },
    select: { id: true, email: true, displayName: true, userId: true },
  });
  if (!byEmail) return null;
  if (byEmail.userId && byEmail.userId !== userId) return null;

  // Auto-lie à l'utilisateur connecté pour les prochains envois
  if (!byEmail.userId) {
    await prisma.gmailToken.update({
      where: { id: byEmail.id },
      data: {
        userId,
        displayName: byEmail.displayName?.trim() || platformName,
      },
    });
  }

  return {
    email: byEmail.email,
    prenom,
    nom,
    displayName: byEmail.displayName?.trim() || platformName,
  };
}
