/**
 * Résolution serveur de la boîte Gmail selon le portefeuille marque.
 * Ne pas importer depuis un Client Component (utilise Prisma).
 */

import prisma from "@/lib/prisma";
import {
  PORTFOLIO_FALLBACK_FROM_EMAIL,
  PORTFOLIO_FALLBACK_OWNER_FIRSTNAME,
  isMarquePortfolioRole,
  portfolioDisplayName,
  type PortfolioSender,
} from "@/lib/marque-portfolio";

function leynaSender(
  assignedToId: string | null = null,
  usedFallback = true
): PortfolioSender {
  return {
    fromEmail: PORTFOLIO_FALLBACK_FROM_EMAIL,
    ownerFirstname: PORTFOLIO_FALLBACK_OWNER_FIRSTNAME,
    assignedToId,
    usedFallback,
  };
}

/**
 * Résout la boîte Gmail d’envoi pour une marque (portefeuille).
 * Fallback Leyna si non attribué ou si aucun GmailToken pour l’assignee.
 */
export async function resolvePortfolioSender(
  marqueId: string | null | undefined
): Promise<PortfolioSender> {
  const id = String(marqueId || "").trim();
  if (!id) return leynaSender(null, true);

  const marque = await prisma.marque.findUnique({
    where: { id },
    select: {
      assignedToId: true,
      assignedTo: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          role: true,
          gmailToken: { select: { email: true } },
        },
      },
    },
  });

  const assignee = marque?.assignedTo;
  if (!assignee || !isMarquePortfolioRole(assignee.role)) {
    return leynaSender(marque?.assignedToId ?? null, true);
  }

  const candidate = (
    assignee.gmailToken?.email ||
    assignee.email ||
    ""
  )
    .trim()
    .toLowerCase();
  if (!candidate.includes("@")) {
    return leynaSender(assignee.id, true);
  }

  const token = await prisma.gmailToken.findUnique({
    where: { email: candidate },
    select: { id: true },
  });
  if (!token) {
    return leynaSender(assignee.id, true);
  }

  return {
    fromEmail: candidate,
    ownerFirstname: portfolioDisplayName(assignee),
    assignedToId: assignee.id,
    usedFallback: false,
  };
}
