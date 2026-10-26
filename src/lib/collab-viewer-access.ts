/**
 * Accès lecture seule / restreint aux collaborations talents (Influence).
 * - Inès (STRATEGY_PLANNER allowlistée) : toutes les collabs publiques, sans mutation.
 * - ASSISTANTE_TM : toutes les collabs publiques ; mutations métier interdites ;
 *   stats + uploads screenshots autorisés (voir canWriteCollabStats).
 */

import { COLLAB_STAT_WRITE_ROLES } from "@/lib/collab-stats";

const COLLAB_VIEWER_EMAILS = [
  "ines@glowupagence.fr",
  "ines@glowup-agence.com",
];

export function isCollabViewerEmail(email?: string | null): boolean {
  if (!email) return false;
  return COLLAB_VIEWER_EMAILS.includes(email.trim().toLowerCase());
}

/** Voit toutes les collabs talents (non privées Sales). */
export function canViewAllTalentCollabs(
  role: string,
  email?: string | null
): boolean {
  if (role === "ASSISTANTE_TM") return true;
  if (role !== "STRATEGY_PLANNER") return false;
  return isCollabViewerEmail(email);
}

/**
 * Pas de mutation métier collab (statut, devis, facture, édition…).
 * ASSISTANTE_TM : aussi « view only » côté métier, mais peut écrire les stats
 * (canWriteCollabStats).
 */
export function isCollabViewOnly(role: string, email?: string | null): boolean {
  if (role === "ASSISTANTE_TM") return true;
  return role === "STRATEGY_PLANNER" && isCollabViewerEmail(email);
}

/** Stats publications + uploads screenshots. */
export function canWriteCollabStats(role: string): boolean {
  return (COLLAB_STAT_WRITE_ROLES as readonly string[]).includes(role);
}

/** Masquer récaps CA / commissions / exports agrégés (comme TM + viewers). */
export function shouldHideCollabFinancialRecaps(role: string): boolean {
  return (
    role === "TM" ||
    role === "STRATEGY_PLANNER" ||
    role === "ASSISTANTE_TM"
  );
}
