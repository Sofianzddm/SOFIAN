/**
 * Portefeuille clients marques : helpers / constantes (safe client + serveur).
 * La résolution Gmail async est dans `marque-portfolio-server.ts`.
 */

export const MARQUE_PORTFOLIO_ROLES = [
  "HEAD_OF_SALES",
  "BUSINESS_DEVELOPER",
] as const;

export type MarquePortfolioRole = (typeof MARQUE_PORTFOLIO_ROLES)[number];

/** Boîte / identité par défaut (fallback). */
export const PORTFOLIO_FALLBACK_FROM_EMAIL = "leyna@glowupagence.fr";
export const PORTFOLIO_FALLBACK_OWNER_FIRSTNAME = "Leyna";

export function isMarquePortfolioRole(
  role: string | null | undefined
): role is MarquePortfolioRole {
  return (
    !!role &&
    (MARQUE_PORTFOLIO_ROLES as readonly string[]).includes(role)
  );
}

/** Prénom d’affichage court (Leyna / Joey). */
export function portfolioDisplayName(user: {
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
}): string {
  const prenom = (user.prenom || "").trim();
  if (prenom) {
    return prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase();
  }
  const email = (user.email || "").split("@")[0] || "—";
  return email.charAt(0).toUpperCase() + email.slice(1);
}

/** Prénom dérivé d’une adresse expéditrice connue. */
export function ownerFirstnameFromEmail(email: string | null | undefined): string {
  const e = (email || "").trim().toLowerCase();
  if (!e) return PORTFOLIO_FALLBACK_OWNER_FIRSTNAME;
  if (e.startsWith("leyna@")) return "Leyna";
  if (e.startsWith("joey@")) return "Joey";
  const local = e.split("@")[0] || "";
  if (!local) return PORTFOLIO_FALLBACK_OWNER_FIRSTNAME;
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

export function applyOwnerPlaceholders(
  text: string,
  ownerFirstname: string
): string {
  if (!text) return text;
  const name = (ownerFirstname || "").trim() || PORTFOLIO_FALLBACK_OWNER_FIRSTNAME;
  return text.replace(/\{\{\s*owner\.firstname\s*\}\}/gi, name);
}

export type PortfolioSender = {
  fromEmail: string;
  ownerFirstname: string;
  assignedToId: string | null;
  /** true si on est retombé sur Leyna (non attribué ou token manquant). */
  usedFallback: boolean;
};
