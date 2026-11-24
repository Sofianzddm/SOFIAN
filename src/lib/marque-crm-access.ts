/**
 * Accès CRM Marques.
 *
 * - Nav / écriture courante : ADMIN, HEAD_OF, HEAD_OF_SALES
 *   (+ STRATEGY_PLANNER et CM en lecture seule : clients / mails, hors Achats-AO).
 * - Couche « complète » (Achats-AO, fichiers AO, sync) : ADMIN + HEAD_OF_SALES (Leyna).
 * - Business Developer : pas le CRM complet — uniquement les marques
 *   explicitement assignées (`Marque.assignedToId`).
 *   Exception : notes & appels contact sur son portefeuille (logger un appel, etc.).
 * - Facturation collab (adresse / SIRET / TVA) : TM, CM, HEAD_OF_INFLUENCE
 *   en plus des rôles d’écriture CRM — nécessaire pour compléter une marque
 *   avant devis / facture sans ouvrir tout le CRM.
 */

import { isBusinessDeveloper } from "@/lib/business-developer";

export const MARQUE_CRM_FULL_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

export const MARQUE_CRM_WRITE_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_SALES",
] as const;

/** Rôles avec accès annuaire / fiche en consultation seule. */
export const MARQUE_CRM_READ_ONLY_ROLES = [
  "STRATEGY_PLANNER",
  "CM",
  "BUSINESS_DEVELOPER",
] as const;

/**
 * Rôles opé collab autorisés à compléter les infos de facturation d’une marque
 * (modal devis / facture), sans accès CRM écriture complète.
 */
export const MARQUE_BILLING_UPDATE_ROLES = [
  "TM",
  "CM",
  "HEAD_OF_INFLUENCE",
  "BUSINESS_DEVELOPER",
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

/** Créer / éditer / supprimer une marque (hors lecture seule / hors portefeuille BD). */
export function canWriteMarqueCrm(role: string | undefined | null): boolean {
  return (
    !!role &&
    (MARQUE_CRM_WRITE_ROLES as readonly string[]).includes(role)
  );
}

/**
 * Retirer / réinscrire un contact de la liste de diffusion.
 * Le casting manager le fait depuis la fiche marque (projets outreach),
 * sans accès à l’écriture CRM complète.
 */
export function canManageDiffusionOptOut(
  role: string | undefined | null
): boolean {
  return canWriteMarqueCrm(role) || role === "CASTING_MANAGER";
}

/**
 * Mettre à jour les champs de facturation (adresse, SIRET, TVA…) —
 * CRM write OU rôles opé collab (TM / CM / Head of Influence / BD assigné).
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

/** Consultation seule (Account Manager, Strategy Planner, Business Developer). */
export function isMarqueCrmReadOnly(role: string | undefined | null): boolean {
  return (
    !!role &&
    (MARQUE_CRM_READ_ONLY_ROLES as readonly string[]).includes(role)
  );
}

/**
 * Notes & appels contact : CRM write, ou BD sur marque assignée (portefeuille).
 * Le BD reste en lecture seule ailleurs sur la fiche.
 */
export function canWriteMarqueContactActivities(opts: {
  role: string | undefined | null;
  userId: string | undefined | null;
  assignedToId: string | null | undefined;
}): boolean {
  if (canWriteMarqueCrm(opts.role)) return true;
  if (!isBusinessDeveloper(opts.role) || !opts.userId) return false;
  return Boolean(opts.assignedToId && opts.assignedToId === opts.userId);
}

/** Filtre Prisma : portefeuille marques du Business Developer. */
export function marqueAssignedWhere(userId: string) {
  return { assignedToId: userId };
}

/**
 * BD : accès fiche uniquement si marque assignée.
 * Autres rôles : pas de contrainte d’assignation ici.
 */
export function canBusinessDeveloperAccessMarque(
  role: string | null | undefined,
  userId: string,
  assignedToId: string | null | undefined
): boolean {
  if (!isBusinessDeveloper(role)) return true;
  return Boolean(assignedToId && assignedToId === userId);
}
