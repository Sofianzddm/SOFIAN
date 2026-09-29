/**
 * Accès CRM Marques.
 *
 * - Nav / écriture courante : ADMIN, HEAD_OF, HEAD_OF_SALES
 *   (+ STRATEGY_PLANNER et CM en lecture seule : clients / mails, hors Achats-AO).
 * - Couche « complète » (Achats-AO, fichiers AO, sync) : ADMIN + HEAD_OF_SALES (Leyna).
 * - Facturation collab (adresse / SIRET / TVA) : TM, CM, HEAD_OF_INFLUENCE
 *   en plus des rôles d’écriture CRM — nécessaire pour compléter une marque
 *   avant devis / facture sans ouvrir tout le CRM.
 */

export const MARQUE_CRM_FULL_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

export const MARQUE_CRM_WRITE_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_SALES",
] as const;

/** Rôles avec accès annuaire / fiche en consultation seule. */
export const MARQUE_CRM_READ_ONLY_ROLES = ["STRATEGY_PLANNER", "CM"] as const;

/**
 * Rôles opé collab autorisés à compléter les infos de facturation d’une marque
 * (modal devis / facture), sans accès CRM écriture complète.
 */
export const MARQUE_BILLING_UPDATE_ROLES = [
  "TM",
  "CM",
  "HEAD_OF_INFLUENCE",
] as const;

export function canAccessFullMarqueCrm(
  role: string | undefined | null
): boolean {
  return (
    !!role &&
    (MARQUE_CRM_FULL_ROLES as readonly string[]).includes(role)
  );
}

/** Supprimer / muter un fichier carto ou AO. */
export function canMutateFullMarqueCrm(
  role: string | undefined | null
): boolean {
  return canAccessFullMarqueCrm(role);
}

/** Créer / éditer / supprimer une marque (hors lecture seule). */
export function canWriteMarqueCrm(role: string | undefined | null): boolean {
  return (
    !!role &&
    (MARQUE_CRM_WRITE_ROLES as readonly string[]).includes(role)
  );
}

/**
 * Mettre à jour les champs de facturation (adresse, SIRET, TVA…) —
 * CRM write OU rôles opé collab (TM / CM / Head of Influence).
 */
export function canUpdateMarqueBilling(
  role: string | undefined | null
): boolean {
  if (canWriteMarqueCrm(role)) return true;
  return (
    !!role &&
    (MARQUE_BILLING_UPDATE_ROLES as readonly string[]).includes(role)
  );
}

/** Consultation seule (Account Manager, Strategy Planner). */
export function isMarqueCrmReadOnly(role: string | undefined | null): boolean {
  return (
    !!role &&
    (MARQUE_CRM_READ_ONLY_ROLES as readonly string[]).includes(role)
  );
}
