import { prisma } from "@/lib/prisma";

export type GiftSenderMailbox = {
  email: string;
  prenom: string;
  nom: string;
  /** Prénom Nom — pour signature template + From. */
  displayName: string;
  /** User lié à la boîte (pour sentById / relance auto). */
  userId: string | null;
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
      userId: user.id,
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
    userId: user.id,
  };
}

/**
 * Boîte Gmail par adresse (override ADMIN dans le wizard gift).
 * Utilise le user lié au token si présent, sinon le displayName du token.
 */
export async function resolveGiftSenderMailboxByEmail(
  emailRaw: string
): Promise<GiftSenderMailbox | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@")) return null;

  const token = await prisma.gmailToken.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      email: true,
      displayName: true,
      userId: true,
      user: { select: { id: true, prenom: true, nom: true } },
    },
  });
  if (!token) return null;

  const prenom = (token.user?.prenom || "").trim();
  const nom = (token.user?.nom || "").trim();
  const platformName =
    [prenom, nom].filter(Boolean).join(" ") ||
    token.displayName?.trim() ||
    token.email;

  return {
    email: token.email,
    prenom: prenom || platformName.split(/\s+/)[0] || "Glow",
    nom: nom || "",
    displayName: token.displayName?.trim() || platformName,
    userId: token.userId || token.user?.id || null,
  };
}
