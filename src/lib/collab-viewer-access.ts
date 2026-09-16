/**
 * Accès lecture seule aux collaborations talents (Influence).
 * Inès (STRATEGY_PLANNER) : toutes les collabs publiques, sans récaps CA.
 */

const COLLAB_VIEWER_EMAILS = [
  "ines@glowupagence.fr",
  "ines@glowup-agence.com",
];

export function isCollabViewerEmail(email?: string | null): boolean {
  if (!email) return false;
  return COLLAB_VIEWER_EMAILS.includes(email.trim().toLowerCase());
}

/** STRATEGY_PLANNER allowlistée : voit toutes les collabs talents (non privées). */
export function canViewAllTalentCollabs(
  role: string,
  email?: string | null
): boolean {
  if (role !== "STRATEGY_PLANNER") return false;
  return isCollabViewerEmail(email);
}

/** Lecture seule — aucune mutation collab. */
export function isCollabViewOnly(role: string, email?: string | null): boolean {
  return (
    role === "STRATEGY_PLANNER" && isCollabViewerEmail(email)
  );
}

/** Masquer récaps CA / commissions / exports agrégés (comme TM + viewers). */
export function shouldHideCollabFinancialRecaps(role: string): boolean {
  return role === "TM" || role === "STRATEGY_PLANNER";
}
