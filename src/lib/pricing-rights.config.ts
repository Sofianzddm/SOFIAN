/**
 * Config isolée — multiplicateurs de droits Snapchat (étage 2).
 * Aucun nombre magique hors de ce fichier.
 */

export const REUSE_RIGHTS = {
  none: 0,
  owned: 0.2,
  thirdParty: 0.3,
} as const;

export const LICENSE_DURATION = {
  m1: 0,
  m3: 0.15,
  m6: 0.25,
  m12: 0.4,
  /** Illimité / perpétuel — jamais chiffré auto */
  perpetual: "SUR_DEVIS",
} as const;

export const WHITELISTING = {
  none: 0,
  tier1: 0.4,
  tier2: 0.6,
  tier3: 1.0,
} as const;

export const SECTOR_EXCLUSIVITY = {
  none: 0,
  m1: 0.15,
  m3: 0.3,
  m6: 0.5,
  m12: 0.8,
} as const;

export const LINK_ATTACHMENT = 0.1;
export const SAVED_STORY = 0.15;
export const SPOTLIGHT_RETENTION = 0.1;
export const RUSH_72H = 0.2;
export const STRICT_BRIEF = 0.15;

/** Si budget média fourni : max(uplift forfaitaire, % du budget). */
export const WHITELISTING_MEDIA_BUDGET_PCT = 0.12;

/** Somme des uplifts au-delà → SUR_DEVIS. */
export const UPLIFT_SUM_AUTO_MAX = 1.5;

/** Total final au-delà → SUR_DEVIS. */
export const TOTAL_AUTO_MAX = 20_000;

export type ReuseRightsId = keyof typeof REUSE_RIGHTS;
export type LicenseDurationId = keyof typeof LICENSE_DURATION;
export type WhitelistingId = keyof typeof WHITELISTING;
export type SectorExclusivityId = keyof typeof SECTOR_EXCLUSIVITY;

export const REUSE_RIGHTS_OPTIONS: {
  id: ReuseRightsId;
  label: string;
}[] = [
  { id: "none", label: "Aucun droit de réutilisation" },
  { id: "owned", label: "Droits marque (owned) +20 %" },
  { id: "thirdParty", label: "Droits tiers +30 %" },
];

export const LICENSE_DURATION_OPTIONS: {
  id: LicenseDurationId;
  label: string;
}[] = [
  { id: "m1", label: "1 mois" },
  { id: "m3", label: "3 mois +15 %" },
  { id: "m6", label: "6 mois +25 %" },
  { id: "m12", label: "12 mois +40 %" },
  { id: "perpetual", label: "Perpétuel — SUR_DEVIS" },
];

export const WHITELISTING_OPTIONS: {
  id: WhitelistingId;
  label: string;
}[] = [
  { id: "none", label: "Pas de whitelisting" },
  { id: "tier1", label: "Whitelist tier 1 +40 %" },
  { id: "tier2", label: "Whitelist tier 2 +60 %" },
  { id: "tier3", label: "Whitelist tier 3 +100 %" },
];

export const SECTOR_EXCLUSIVITY_OPTIONS: {
  id: SectorExclusivityId;
  label: string;
}[] = [
  { id: "none", label: "Pas d’exclusivité" },
  { id: "m1", label: "Exclu secteur 1 mois +15 %" },
  { id: "m3", label: "Exclu secteur 3 mois +30 %" },
  { id: "m6", label: "Exclu secteur 6 mois +50 %" },
  { id: "m12", label: "Exclu secteur 12 mois +80 %" },
];

/** Ordre de force pour les garde-fous (none < owned < thirdParty). */
export const REUSE_RIGHTS_RANK: Record<ReuseRightsId, number> = {
  none: 0,
  owned: 1,
  thirdParty: 2,
};

/** Ordre de durée pour les garde-fous. */
export const LICENSE_DURATION_RANK: Record<LicenseDurationId, number> = {
  m1: 1,
  m3: 3,
  m6: 6,
  m12: 12,
  perpetual: 99,
};
