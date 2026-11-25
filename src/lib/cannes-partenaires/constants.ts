/**
 * Module Cannes Partenaires — constantes access & slug projet.
 * Safe client (pas de Prisma).
 */

export const CANNES_PARTENAIRES_SLUG = "cannes-partenaires";
export const CANNES_PARTENAIRES_NOM = "Cannes Partenaires 2026";

export const CANNES_PARTENAIRES_ALLOWED_ROLES = [
  "ADMIN",
  "STRATEGY_PLANNER",
] as const;

export function canAccessCannesPartenaires(role: string | null | undefined): boolean {
  const r = String(role || "");
  return (CANNES_PARTENAIRES_ALLOWED_ROLES as readonly string[]).includes(r);
}

export const CANNES_OPP_STATUTS = [
  "A_QUALIFIER",
  "IDENTIFIEE",
  "CONTACTEE",
  "EN_NEGO",
  "SIGNEE",
  "PERDUE",
] as const;

export type CannesOppStatut = (typeof CANNES_OPP_STATUTS)[number];
