/**
 * Accès CRM Marques.
 *
 * - Nav / écriture courante : ADMIN, HEAD_OF, HEAD_OF_SALES (+ STRATEGY_PLANNER en lecture seule).
 * - Couche « complète » (Achats-AO, fichiers AO, sync) : ADMIN + HEAD_OF_SALES (Leyna).
 */

export const MARQUE_CRM_FULL_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

export const MARQUE_CRM_WRITE_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_SALES",
] as const;

export function canAccessFullMarqueCrm(
  role: string | undefined | null
): boolean {
  return (
    !!role &&
    (MARQUE_CRM_FULL_ROLES as readonly string[]).includes(role)
  );
}

/** Créer / éditer / supprimer une marque (hors lecture seule STRATEGY_PLANNER). */
export function canWriteMarqueCrm(role: string | undefined | null): boolean {
  return (
    !!role &&
    (MARQUE_CRM_WRITE_ROLES as readonly string[]).includes(role)
  );
}
