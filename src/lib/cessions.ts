/**
 * Simulateur de cessions de droits — Glow Up Agence (grille v3).
 *
 * Alignée feedback métier Glow Up :
 * - Paid compte marque = 30 % du budget média, avec minimum garanti
 * - Whitelisting / Spark = 30 % du budget média, minimum > paid
 * - Buyout : matrice FR/Monde × durée (plus de « perpétuel » auto)
 * - OOH : nb agglomérations + plancher budget
 *
 * Affiche UNIQUEMENT le montant de cession HT.
 */

import { SIM_FORMATS, type TarifKey, numOrNull } from "@/lib/emv-simulator";

// ─── Catalogue usages ───────────────────────────────────────────────────────

export type CessionUsageId =
  | "repost_organique"
  | "paid_brand"
  | "whitelisting"
  | "site_web"
  | "newsletter"
  | "emailing_crm"
  | "crm_auto"
  | "emailing_international"
  | "ecommerce"
  | "print"
  | "ooh"
  | "tv_broadcast"
  | "plv"
  | "press_kit"
  | "interne"
  | "full_buyout";

export type CessionUsage = {
  id: CessionUsageId;
  label: string;
  description: string;
  /** % cachet (réf. 3m FR) — ou % budget média si pricingMedia */
  coeff: number;
  rangeMin: number;
  rangeMax: number;
  category: "digital" | "amplification" | "offline" | "buyout" | "autre";
  replacesAll?: boolean;
  /** % du budget ads marque + minimum lié au cachet */
  pricingMedia?: boolean;
  /** Floor minimum = cachet × floorCachetCoeff × durée (réf. 3m) */
  floorCachetCoeff?: number;
  /** OOH : nb agglomérations + plancher budget */
  pricingOoh?: boolean;
  /** Buyout : matrice territoire × durée */
  pricingBuyout?: boolean;
  /** Aucun montant auto — validation direction (ex. base email internationale) */
  pricingSurDevis?: boolean;
};

export const CESSION_USAGES: CessionUsage[] = [
  {
    id: "repost_organique",
    label: "Droit image RS — repost organique",
    description: "Republication sur les comptes sociaux organiques de la marque",
    coeff: 0.12,
    rangeMin: 0.08,
    rangeMax: 0.18,
    category: "digital",
  },
  {
    id: "paid_brand",
    label: "Paid media — compte marque",
    description:
      "30 % du budget ads marque (max contractuel), avec minimum garanti",
    coeff: 0.3,
    rangeMin: 0.3,
    rangeMax: 0.3,
    category: "amplification",
    pricingMedia: true,
    /** ~20 % cachet à 3 mois */
    floorCachetCoeff: 0.2,
  },
  {
    id: "whitelisting",
    label: "Whitelisting / Spark Ads",
    description:
      "30 % du budget ads (max contractuel), minimum supérieur au paid — identité talent",
    coeff: 0.3,
    rangeMin: 0.3,
    rangeMax: 0.3,
    category: "amplification",
    pricingMedia: true,
    /** ~40 % cachet à 3 mois → Mélissa 8 900 € ≈ 3 500 € */
    floorCachetCoeff: 0.4,
  },
  {
    id: "site_web",
    label: "Site web / landing",
    description: "Site corporate, landing page, blog, page campagne",
    coeff: 0.15,
    rangeMin: 0.12,
    rangeMax: 0.2,
    category: "digital",
  },
  {
    id: "newsletter",
    label: "Newsletter – envoi unique",
    description: "Un seul envoi newsletter — 8 % du cachet (réf. 3m FR)",
    coeff: 0.08,
    rangeMin: 0.08,
    rangeMax: 0.08,
    category: "digital",
  },
  {
    id: "emailing_crm",
    label: "Emailing / CRM multienvois",
    description:
      "Plusieurs envois pendant la période (ex. 3 mois) — 12 % du cachet",
    coeff: 0.12,
    rangeMin: 0.12,
    rangeMax: 0.12,
    category: "digital",
  },
  {
    id: "crm_auto",
    label: "CRM automatisé / relances",
    description:
      "Scénarios automatisés, relances commerciales — 15 % du cachet",
    coeff: 0.15,
    rangeMin: 0.15,
    rangeMax: 0.15,
    category: "digital",
  },
  {
    id: "emailing_international",
    label: "Emailing — base internationale / très importante",
    description: "Base internationale ou volume très important — sur devis",
    coeff: 0,
    rangeMin: 0,
    rangeMax: 0,
    category: "digital",
    pricingSurDevis: true,
  },
  {
    id: "ecommerce",
    label: "E-commerce / PDP",
    description: "Fiche produit, carrousel PDP, marketplaces",
    coeff: 0.18,
    rangeMin: 0.12,
    rangeMax: 0.28,
    category: "digital",
  },
  {
    id: "print",
    label: "Print / catalogue",
    description:
      "Catalogue, encart presse — % cachet + plancher absolu (ex. national 12m+ : 3 000 €)",
    coeff: 0.4,
    rangeMin: 0.3,
    rangeMax: 0.5,
    category: "offline",
  },
  {
    id: "ooh",
    label: "OOH / DOOH",
    description:
      "Affichage rue, métro, gare, DOOH — grille agglomérations (1→×1 … 6–10→×3 ; +10 / transport sur devis)",
    coeff: 0.75,
    rangeMin: 0.55,
    rangeMax: 1.2,
    category: "offline",
    pricingOoh: true,
  },
  {
    id: "tv_broadcast",
    label: "TV / cinéma / broadcast",
    description:
      "Spot TV / cinéma — 110 % OK France courte durée ; plancher absolu 5 000 €",
    coeff: 1.1,
    rangeMin: 0.9,
    rangeMax: 2.0,
    category: "offline",
  },
  {
    id: "plv",
    label: "Point de vente / PLV",
    description:
      "Corner, kakémono, écran magasin — % cachet + plancher absolu (ex. national 12m+ : 2 500 €)",
    coeff: 0.4,
    rangeMin: 0.3,
    rangeMax: 0.5,
    category: "offline",
  },
  {
    id: "press_kit",
    label: "Press kit / RP",
    description: "Usage strictement éditorial (pas pub)",
    coeff: 0.1,
    rangeMin: 0.05,
    rangeMax: 0.15,
    category: "autre",
  },
  {
    id: "interne",
    label: "Usage interne / corporate",
    description: "Séminaire, recrutement, formation interne",
    coeff: 0.08,
    rangeMin: 0.05,
    rangeMax: 0.12,
    category: "autre",
  },
  {
    id: "full_buyout",
    label: "Full buyout — supports (hors paid illimité)",
    description:
      "Tous supports pour la durée × territoire choisis. N’inclut PAS de paid/whitelist illimité : budget ads max contractuel obligatoire.",
    coeff: 1.5,
    rangeMin: 1.2,
    rangeMax: 5.5,
    category: "buyout",
    /** Remplace les usages « supports », pas le paid/whitelist */
    replacesAll: true,
    pricingBuyout: true,
  },
];

/** Clause contractuelle — buyout ≠ paid illimité */
export const BUYOUT_PAID_EXCLUSION_CLAUSE =
  "Le buyout couvre les supports expressément sélectionnés, hors médiatisation payante illimitée. Tout paid media ou whitelisting reste soumis à un budget média maximal contractuel et à la tarification correspondante.";

export function cessionUsageById(id: string): CessionUsage | undefined {
  return CESSION_USAGES.find((u) => u.id === id);
}

// ─── Multiplicateurs ────────────────────────────────────────────────────────

export type CessionDureeId = "1m" | "3m" | "6m" | "12m" | "24m" | "sur_devis";

export const CESSION_DUREES: {
  id: CessionDureeId;
  label: string;
  mult: number;
  /** Estimation plancher seulement — à négocier */
  surDevis?: boolean;
}[] = [
  { id: "1m", label: "1 mois", mult: 0.75 },
  { id: "3m", label: "3 mois", mult: 1.0 },
  { id: "6m", label: "6 mois", mult: 1.5 },
  { id: "12m", label: "12 mois", mult: 2.2 },
  { id: "24m", label: "24 mois", mult: 2.9 },
  {
    id: "sur_devis",
    label: "Sur devis (min ×4–×6)",
    mult: 5.0,
    surDevis: true,
  },
];

export type CessionTerritoireId = "fr" | "fr_plus" | "ue" | "monde";

export const CESSION_TERRITOIRES: {
  id: CessionTerritoireId;
  label: string;
  mult: number;
}[] = [
  { id: "fr", label: "France", mult: 1.0 },
  { id: "fr_plus", label: "FR + Benelux / CH / DOM", mult: 1.15 },
  { id: "ue", label: "Europe (UE + UK)", mult: 1.4 },
  { id: "monde", label: "Monde", mult: 1.8 },
];

/**
 * Full buyout = % du cachet selon durée × territoire.
 * Monde 12 mois ≈ 450 % ; sur devis ≈ 500–550 % (plancher).
 */
export const BUYOUT_MATRIX: Record<
  CessionTerritoireId,
  Partial<Record<CessionDureeId, number>>
> = {
  fr: {
    "1m": 1.2,
    "3m": 1.5,
    "6m": 2.2,
    "12m": 3.0,
    "24m": 3.8,
    sur_devis: 4.5,
  },
  fr_plus: {
    "1m": 1.35,
    "3m": 1.7,
    "6m": 2.5,
    "12m": 3.4,
    "24m": 4.2,
    sur_devis: 5.0,
  },
  ue: {
    "1m": 1.6,
    "3m": 2.0,
    "6m": 2.8,
    "12m": 3.8,
    "24m": 4.6,
    sur_devis: 5.2,
  },
  monde: {
    "1m": 2.0,
    "3m": 2.5,
    "6m": 3.5,
    "12m": 4.5,
    "24m": 5.2,
    sur_devis: 5.5,
  },
};

export function buyoutMult(
  territoire: CessionTerritoireId,
  duree: CessionDureeId
): number {
  return BUYOUT_MATRIX[territoire]?.[duree] ?? BUYOUT_MATRIX.fr["3m"] ?? 1.5;
}

export type CessionExcluId =
  | "aucune"
  | "secteur_3m"
  | "secteur_6m"
  | "secteur_12m"
  | "totale_3m"
  | "totale_6m"
  | "totale_12m";

export const CESSION_EXCLUSIVITES: {
  id: CessionExcluId;
  label: string;
  coeff: number;
}[] = [
  { id: "aucune", label: "Aucune", coeff: 0 },
  { id: "secteur_3m", label: "Sectorielle 3 mois", coeff: 0.4 },
  { id: "secteur_6m", label: "Sectorielle 6 mois", coeff: 0.65 },
  { id: "secteur_12m", label: "Sectorielle 12 mois", coeff: 1.0 },
  { id: "totale_3m", label: "Totale 3 mois", coeff: 0.9 },
  { id: "totale_6m", label: "Totale 6 mois", coeff: 1.6 },
  { id: "totale_12m", label: "Totale 12 mois", coeff: 2.5 },
];

export type CessionModifId = "brand_safe" | "montage_libre" | "derivee";

export const CESSION_MODIFS: {
  id: CessionModifId;
  label: string;
  premium: number;
}[] = [
  { id: "brand_safe", label: "Recadrage / sous-titres (inclus)", premium: 0 },
  { id: "montage_libre", label: "Montage libre / re-cut", premium: 0.15 },
  { id: "derivee", label: "Création dérivée / mash-up / IA", premium: 0.35 },
];

export type CessionRetroId =
  | "avant"
  | "apres_signature"
  | "apres_livraison"
  | "renouvellement"
  | "regularisation";

export const CESSION_RETRO: {
  id: CessionRetroId;
  label: string;
  premium: number;
}[] = [
  { id: "avant", label: "Dans le brief (avant tournage)", premium: 0 },
  { id: "apres_signature", label: "Après signature, avant diffusion", premium: 0.15 },
  { id: "apres_livraison", label: "Après livraison / mise en ligne", premium: 0.3 },
  { id: "renouvellement", label: "Renouvellement en fin de période", premium: 0.2 },
  { id: "regularisation", label: "Régularisation (déjà exploité)", premium: 0.75 },
];

// ─── Tier abonnés ───────────────────────────────────────────────────────────

export type CessionTierId = "nano" | "micro" | "mid" | "macro" | "mega";

export const CESSION_TIERS: {
  id: CessionTierId;
  label: string;
  minFollowers: number;
  maxFollowers: number | null;
  mult: number;
}[] = [
  { id: "nano", label: "Nano (<10k)", minFollowers: 0, maxFollowers: 9_999, mult: 0.9 },
  { id: "micro", label: "Micro (10–100k)", minFollowers: 10_000, maxFollowers: 99_999, mult: 1.0 },
  { id: "mid", label: "Mid (100–500k)", minFollowers: 100_000, maxFollowers: 499_999, mult: 1.06 },
  { id: "macro", label: "Macro (500k–1M)", minFollowers: 500_000, maxFollowers: 999_999, mult: 1.14 },
  { id: "mega", label: "Mega (1M+)", minFollowers: 1_000_000, maxFollowers: null, mult: 1.25 },
];

export function resolveCessionTier(followers: number | null | undefined): {
  id: CessionTierId;
  label: string;
  mult: number;
  followers: number;
} {
  const n = Math.max(0, Math.floor(Number(followers) || 0));
  const tier =
    CESSION_TIERS.find(
      (t) => n >= t.minFollowers && (t.maxFollowers == null || n <= t.maxFollowers)
    ) ?? CESSION_TIERS[1];
  return { id: tier.id, label: tier.label, mult: tier.mult, followers: n };
}

/** Tier image : pas sur paid/whitelist (déjà au budget média). */
export function tierMultForUsage(tierMult: number, usageId: CessionUsageId): number {
  if (!Number.isFinite(tierMult) || tierMult <= 0) return 1;
  if (usageId === "paid_brand" || usageId === "whitelisting") return 1;
  return tierMult;
}

// ─── OOH / DOOH ─────────────────────────────────────────────────────────────

/**
 * Coefficient selon le nombre d'agglomérations / zones de diffusion.
 * Formule : max(cachet × 75 % × coeff × durée × densité, budget OOH × 2 %)
 */
export function oohAgglomerationsMult(nbAgglomerations: number): {
  mult: number;
  label: string;
  /** >10 / national : pas de montant automatique */
  surDevis: boolean;
} {
  const n = Math.max(0, Math.floor(Number(nbAgglomerations) || 0));
  if (n <= 0) return { mult: 0, label: "—", surDevis: false };
  if (n === 1) return { mult: 1.0, label: "1 agglomération", surDevis: false };
  if (n === 2) return { mult: 1.6, label: "2 agglomérations", surDevis: false };
  if (n <= 5) return { mult: 2.2, label: "3 à 5 agglomérations", surDevis: false };
  if (n <= 10) return { mult: 3.0, label: "6 à 10 agglomérations", surDevis: false };
  return {
    mult: 0,
    label: "Plus de 10 / national — sur devis",
    surDevis: true,
  };
}

/** @deprecated alias — préférer oohAgglomerationsMult */
export const oohVillesMult = oohAgglomerationsMult;

/** Exception Paris / transport (minimums ou sur devis). */
export type OohZoneSpecialId =
  | "standard"
  | "paris_intra"
  | "paris_etendu"
  | "transport";

export const CESSION_OOH_ZONE_SPECIAL: {
  id: OohZoneSpecialId;
  label: string;
  /** Plancher sur le coefficient agglomérations (null = sur devis). */
  minMult: number | null;
  surDevis: boolean;
  hint: string;
}[] = [
  {
    id: "standard",
    label: "Standard (hors exception Paris)",
    minMult: null,
    surDevis: false,
    hint: "Applique uniquement le coefficient selon le nb d’agglomérations",
  },
  {
    id: "paris_intra",
    label: "Paris intramuros",
    minMult: 1.25,
    surDevis: false,
    hint: "Minimum ×1,25 sur le coefficient zones",
  },
  {
    id: "paris_etendu",
    label: "Agglomération parisienne étendue",
    minMult: 1.5,
    surDevis: false,
    hint: "Minimum ×1,5 sur le coefficient zones",
  },
  {
    id: "transport",
    label: "Métro, gares ou aéroports",
    minMult: null,
    surDevis: true,
    hint: "Sur devis — pas de montant automatique",
  },
];

export function resolveOohZoneMult(
  nbAgglomerations: number,
  zoneSpecial: OohZoneSpecialId = "standard"
): {
  mult: number;
  label: string;
  surDevis: boolean;
  baseMult: number;
  parisFloorApplied: boolean;
} {
  const special =
    CESSION_OOH_ZONE_SPECIAL.find((z) => z.id === zoneSpecial) ??
    CESSION_OOH_ZONE_SPECIAL[0];

  if (special.surDevis) {
    return {
      mult: 0,
      label: special.label,
      surDevis: true,
      baseMult: 0,
      parisFloorApplied: false,
    };
  }

  const base = oohAgglomerationsMult(nbAgglomerations);
  if (base.surDevis || base.mult <= 0) {
    return {
      mult: base.mult,
      label: base.label,
      surDevis: base.surDevis,
      baseMult: base.mult,
      parisFloorApplied: false,
    };
  }

  let mult = base.mult;
  let parisFloorApplied = false;
  if (special.minMult != null && mult < special.minMult) {
    mult = special.minMult;
    parisFloorApplied = true;
  }

  const label = parisFloorApplied
    ? `${base.label} → ${special.label} (min ×${special.minMult})`
    : special.id === "standard"
      ? base.label
      : `${base.label} · ${special.label}`;

  return {
    mult,
    label,
    surDevis: false,
    baseMult: base.mult,
    parisFloorApplied,
  };
}

/** Durées d'affichage OOH — ex. 1 agglo × 75 % × 1,067 ≈ 80 % du cachet. */
export const CESSION_OOH_DUREES: { id: CessionDureeId; label: string; mult: number }[] = [
  { id: "1m", label: "1 vague courte (1–2 sem.)", mult: 0.7 },
  { id: "3m", label: "1 mois", mult: 0.9 },
  { id: "6m", label: "3 mois / 2 vagues", mult: 1.067 },
  { id: "12m", label: "6 mois", mult: 1.4 },
  { id: "24m", label: "12 mois", mult: 1.75 },
  { id: "sur_devis", label: "Sur devis (long / illimité)", mult: 2.1 },
];

export const OOH_BUDGET_FLOOR_PCT = 0.02;
export const OOH_DENSE_PREMIUM = 0.15;

/**
 * Planchers absolus offline (€ HT), indépendants du cachet.
 * Appliqués via max(calcul % cachet, plancher) — même esprit que l’OOH.
 *
 * Réf. Glow Up moyen haut :
 * - Print national 12 mois+ : 3 000 €
 * - TV : 5 000 € (base)
 * - PLV national 12 mois+ : 2 500 €
 */
export function resolveOfflineAbsoluteFloor(
  usageId: CessionUsageId,
  duree: CessionDureeId,
  territoire: CessionTerritoireId
): { floor: number; label: string } {
  const terrMult =
    CESSION_TERRITOIRES.find((t) => t.id === territoire)?.mult ?? 1;

  if (usageId === "tv_broadcast") {
    // Plancher TV : 5 000 € base FR ; monte un peu en durée longue
    const byDuree: Record<CessionDureeId, number> = {
      "1m": 5_000,
      "3m": 5_000,
      "6m": 6_000,
      "12m": 7_500,
      "24m": 9_000,
      sur_devis: 10_000,
    };
    const floor = Math.round((byDuree[duree] ?? 5_000) * terrMult);
    return { floor, label: `Plancher TV ${floor.toLocaleString("fr-FR")} €` };
  }

  if (usageId === "print") {
    // Print national (FR) 12m+ = 3 000 €
    const byDuree: Record<CessionDureeId, number> = {
      "1m": 1_200,
      "3m": 1_500,
      "6m": 2_200,
      "12m": 3_000,
      "24m": 4_000,
      sur_devis: 5_000,
    };
    const floor = Math.round((byDuree[duree] ?? 1_500) * terrMult);
    return { floor, label: `Plancher print ${floor.toLocaleString("fr-FR")} €` };
  }

  if (usageId === "plv") {
    const byDuree: Record<CessionDureeId, number> = {
      "1m": 1_000,
      "3m": 1_200,
      "6m": 1_800,
      "12m": 2_500,
      "24m": 3_200,
      sur_devis: 4_000,
    };
    const floor = Math.round((byDuree[duree] ?? 1_200) * terrMult);
    return { floor, label: `Plancher PLV ${floor.toLocaleString("fr-FR")} €` };
  }

  return { floor: 0, label: "" };
}

export function hasOfflineAbsoluteFloor(usageId: CessionUsageId): boolean {
  return usageId === "print" || usageId === "plv" || usageId === "tv_broadcast";
}

// ─── Packages ───────────────────────────────────────────────────────────────

export type CessionPackageLine = {
  usageId: CessionUsageId;
  duree: CessionDureeId;
  territoire: CessionTerritoireId;
};

export type CessionPackage = {
  id: string;
  label: string;
  hint: string;
  lines: CessionPackageLine[];
  exclu?: CessionExcluId;
  modif?: CessionModifId;
};

export const CESSION_PACKAGES: CessionPackage[] = [
  {
    id: "organique",
    label: "Organique +",
    hint: "Repost organique 3 mois FR",
    lines: [{ usageId: "repost_organique", duree: "3m", territoire: "fr" }],
  },
  {
    id: "boost",
    label: "Boost social",
    hint: "Paid compte marque 3 mois — budget ads requis",
    lines: [{ usageId: "paid_brand", duree: "3m", territoire: "fr" }],
  },
  {
    id: "ampli_pro",
    label: "Amplification Pro",
    hint: "Whitelisting 6 mois — budget ads requis",
    lines: [{ usageId: "whitelisting", duree: "6m", territoire: "fr" }],
  },
  {
    id: "digital_site",
    label: "Site + Newsletter",
    hint: "Site web + NL envoi unique · 12 mois FR",
    lines: [
      { usageId: "site_web", duree: "12m", territoire: "fr" },
      { usageId: "newsletter", duree: "12m", territoire: "fr" },
    ],
  },
  {
    id: "digital_360",
    label: "Digital 360",
    hint: "Whitelist + site + emailing CRM + PDP · 12 mois FR",
    lines: [
      { usageId: "whitelisting", duree: "12m", territoire: "fr" },
      { usageId: "site_web", duree: "12m", territoire: "fr" },
      { usageId: "emailing_crm", duree: "12m", territoire: "fr" },
      { usageId: "ecommerce", duree: "12m", territoire: "fr" },
    ],
  },
  {
    id: "retail_print",
    label: "Retail & Print",
    hint: "PDP + print + PLV · 12 mois FR",
    lines: [
      { usageId: "ecommerce", duree: "12m", territoire: "fr" },
      { usageId: "print", duree: "12m", territoire: "fr" },
      { usageId: "plv", duree: "12m", territoire: "fr" },
    ],
  },
  {
    id: "buyout_fr",
    label: "Full buyout FR 12 mois",
    hint: "Supports FR 12 mois — hors paid illimité (matrice seule, sans montage)",
    lines: [{ usageId: "full_buyout", duree: "12m", territoire: "fr" }],
  },
  {
    id: "buyout_monde",
    label: "Full buyout Monde 12 mois",
    hint: "Supports monde 12 mois — hors paid illimité (~450 %, matrice seule)",
    lines: [{ usageId: "full_buyout", duree: "12m", territoire: "monde" }],
  },
];

// ─── Budget ads (paid / whitelist) ──────────────────────────────────────────

/** Modes de saisie du budget média */
export type MediaBudgetMode = "contractuel" | "reach" | "aucun";

export const MEDIA_BUDGET_MODES: {
  id: MediaBudgetMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "contractuel",
    label: "Budget contractuel connu",
    hint: "Calcul définitif — plafond ads au contrat",
  },
  {
    id: "reach",
    label: "Budget estimé depuis le reach",
    hint: "Calcul indicatif — jamais un budget contractuel certain",
  },
  {
    id: "aucun",
    label: "Aucune donnée média",
    hint: "Application du minimum garanti uniquement",
  },
];

/**
 * impressions = reach unique × fréquence
 * budget = impressions ÷ 1 000 × CPM
 */
export function estimateBudgetFromReach(
  reachUnique: number,
  frequence: number,
  cpm: number
): { impressions: number; budgetEstime: number } {
  const reach = Math.max(0, Number(reachUnique) || 0);
  const freq = Math.max(0, Number(frequence) || 0);
  const cpmN = Math.max(0, Number(cpm) || 0);
  const impressions = reach * freq;
  return {
    impressions,
    budgetEstime: (impressions / 1000) * cpmN,
  };
}

export const BUDGET_REACH_DISCLAIMER =
  "Estimation provisoire calculée selon le reach, la fréquence et le CPM déclarés. Facturation minimale garantie, avec régularisation selon le budget média effectivement investi.";

export const BUDGET_REACH_CONTRACT_CLAUSES = [
  "Plafond provisoire de diffusion",
  "Transmission du relevé de dépenses",
  "Régularisation si le budget réel dépasse l’estimation",
  "Arrêt de la diffusion à l’échéance autorisée",
] as const;

export const CPM_SOURCE_PRIORITY = [
  "Média plan ou prévision Meta / TikTok de la marque",
  "Historique de campagnes de cette marque",
  "Benchmark Glow Up par plateforme, pays et objectif",
] as const;

/** Benchmarks Glow Up — positionnement moyen haut (indicatif). */
export type CpmBenchmarkId =
  | "meta_paid"
  | "tiktok_paid"
  | "meta_whitelist"
  | "tiktok_spark"
  | "custom";

export const CPM_BENCHMARKS_GLOWUP: {
  id: CpmBenchmarkId;
  label: string;
  shortLabel: string;
  cpm: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  /** Budget estimé pour 1M d’impressions (€) */
  budgetPer1M: number | null;
}[] = [
  {
    id: "meta_paid",
    label: "Instagram / Meta paid",
    shortLabel: "Meta Paid — 12 €",
    cpm: 12,
    rangeMin: 10,
    rangeMax: 15,
    budgetPer1M: 12_000,
  },
  {
    id: "tiktok_paid",
    label: "TikTok paid classique",
    shortLabel: "TikTok Paid — 8 €",
    cpm: 8,
    rangeMin: 7,
    rangeMax: 10,
    budgetPer1M: 8_000,
  },
  {
    id: "meta_whitelist",
    label: "Instagram whitelisting",
    shortLabel: "Meta Whitelist — 14 €",
    cpm: 14,
    rangeMin: 12,
    rangeMax: 18,
    budgetPer1M: 14_000,
  },
  {
    id: "tiktok_spark",
    label: "TikTok Spark Ads",
    shortLabel: "TikTok Spark Ads — 10 €",
    cpm: 10,
    rangeMin: 8,
    rangeMax: 12,
    budgetPer1M: 10_000,
  },
  {
    id: "custom",
    label: "CPM personnalisé",
    shortLabel: "CPM personnalisé",
    cpm: null,
    rangeMin: null,
    rangeMax: null,
    budgetPer1M: null,
  },
];

export const CPM_BENCHMARK_HINT =
  "Benchmark indicatif moyen haut. À remplacer prioritairement par le CPM du média plan ou de la plateforme lorsqu’il est disponible.";

export function cpmBenchmarkById(id: string | null | undefined) {
  return CPM_BENCHMARKS_GLOWUP.find((b) => b.id === id);
}

// ─── Calcul ─────────────────────────────────────────────────────────────────

export type CessionLineInput = {
  id: string;
  usageId: CessionUsageId;
  duree: CessionDureeId;
  territoire: CessionTerritoireId;
  /** Budget média / ads / OOH max contractuel (€) */
  budgetMedia?: number | null;
  /** Mode budget ads (paid / whitelist) */
  mediaBudgetMode?: MediaBudgetMode | null;
  /** Reach unique visé (mode reach) */
  reachUnique?: number | null;
  /** Fréquence moyenne (mode reach) */
  frequence?: number | null;
  /** CPM prévisionnel € (mode reach) — jamais auto-rempli sans choix user */
  cpmPrevisionnel?: number | null;
  /** Benchmark Glow Up sélectionné (ou custom) */
  cpmBenchmarkId?: CpmBenchmarkId | null;
  /** Nombre d’agglomérations / zones de diffusion */
  nbAgglomerations?: number | null;
  /** @deprecated alias de nbAgglomerations */
  nbVilles?: number | null;
  /** Exception Paris / transport */
  oohZoneSpecial?: OohZoneSpecialId | null;
  oohDense?: boolean;
};

export type CessionComputeInput = {
  baseCachet: number;
  followers?: number | null;
  /**
   * Appliquer le mult. tier audience.
   * false (défaut) si le cachet est déjà celui du talent (personnalisé).
   * true seulement pour un tarif générique / grille standard.
   */
  applyTier?: boolean;
  lines: CessionLineInput[];
  exclu: CessionExcluId;
  modif: CessionModifId;
  retro: CessionRetroId;
};

export type CessionLineResult = {
  id: string;
  usageId: CessionUsageId;
  label: string;
  coeff: number;
  dureeMult: number;
  territoireMult: number;
  tierMult: number;
  /** Coefficient agglomérations (après plancher Paris éventuel) */
  villesMult: number;
  aggloMult: number;
  modifPremium: number;
  pricingMedia: boolean;
  pricingOoh: boolean;
  pricingBuyout: boolean;
  /** Budget utilisé pour le calcul (contractuel ou estimé) */
  budgetMedia: number;
  mediaBudgetMode: MediaBudgetMode | null;
  reachUnique: number;
  frequence: number;
  cpmPrevisionnel: number;
  impressionsEstimees: number;
  budgetEstime: number;
  /** Calcul indicatif depuis reach — pas un plafond contractuel certain */
  estimationProvisoire: boolean;
  nbAgglomerations: number;
  /** @deprecated alias */
  nbVilles: number;
  oohZoneSpecial: OohZoneSpecialId;
  parisFloorApplied: boolean;
  floorAmount: number;
  /** Plancher absolu offline (€) — indépendant du cachet */
  absoluteFloor: number;
  amountFromBudget: number;
  amount: number;
  amountFromCachet: number;
  amountFromBudgetFloor: number;
  usedFloor: boolean;
  surDevis: boolean;
  /** OOH >10 agglo / transport : SUR_DEVIS — pas de montant auto */
  oohNationalSurDevis: boolean;
  /** Usage catalogue sur devis (ex. emailing international) */
  usageSurDevis: boolean;
  /** Statut ligne bloquant (ex. SUR_DEVIS) */
  status: "OK" | "SUR_DEVIS" | "DISABLED";
  disabled: boolean;
};

export type CessionResult = {
  lines: CessionLineResult[];
  tier: ReturnType<typeof resolveCessionTier>;
  /** Tier effectivement appliqué (1 si cachet personnalisé) */
  tierApplied: number;
  applyTier: boolean;
  sousTotalUsages: number;
  sousTotalApresDegressivite: number;
  cap: number;
  capped: boolean;
  exclusivite: number;
  retroPremium: number;
  /** Montant exact avant arrondi commercial (null si total non calculable) */
  cessionExact: number | null;
  /** Montant commercial arrondi (null si SUR_DEVIS bloquant) */
  cession: number | null;
  /** false si une ligne SUR_DEVIS empêche tout total facturable */
  totalCalculable: boolean;
  pctDuCachet: number | null;
  alertHigh: boolean;
  alertExcluLongue: boolean;
  alertSurDevis: boolean;
  /** Buyout présent : paid/whitelist hors périmètre sauf ligne + budget */
  alertBuyoutExcludesPaid: boolean;
  /** Au moins une ligne OOH nationale (>10) ou transport sur devis */
  alertOohNationalSurDevis: boolean;
  /** Au moins une ligne usage catalogue sur devis (emailing international…) */
  alertUsageSurDevis: boolean;
  /** Au moins une ligne paid/whitelist en estimation reach */
  alertBudgetReachProvisoire: boolean;
  hasBuyout: boolean;
  hasPaidAlongsideBuyout: boolean;
};

const FLOOR = 250;
const LINE_FLOOR = 100;
const CAP_STANDARD = 3.25;
const CAP_BUYOUT = 6.0;
const ALERT_RATIO = 5;

function applyDegressivite(amounts: number[]): number {
  const sorted = [...amounts].filter((a) => a > 0).sort((a, b) => b - a);
  const weights = [1, 1, 0.9, 0.9, 0.8];
  return sorted.reduce((s, amount, i) => s + amount * (weights[i] ?? 0.8), 0);
}

export function roundCession(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Neutralise les artefacts float (ex. 20000×0,28 → 5600.000000000001)
  const cleaned = Math.round(n * 100) / 100;
  const step = cleaned > 10_000 ? 100 : 50;
  return Math.ceil(cleaned / step - Number.EPSILON) * step;
}

export function computeCession(input: CessionComputeInput): CessionResult {
  const base = Math.max(0, Number(input.baseCachet) || 0);
  const applyTier = Boolean(input.applyTier);
  const tier = resolveCessionTier(input.followers);
  const tierApplied = applyTier ? tier.mult : 1;
  const modif = CESSION_MODIFS.find((m) => m.id === input.modif) ?? CESSION_MODIFS[0];
  const exclu = CESSION_EXCLUSIVITES.find((e) => e.id === input.exclu) ?? CESSION_EXCLUSIVITES[0];
  const retro = CESSION_RETRO.find((r) => r.id === input.retro) ?? CESSION_RETRO[0];

  const hasBuyout = input.lines.some((l) => cessionUsageById(l.usageId)?.pricingBuyout);
  const hasPaidAlongsideBuyout = input.lines.some((l) => {
    const u = cessionUsageById(l.usageId);
    if (!u?.pricingMedia) return false;
    const mode = l.mediaBudgetMode ?? (Number(l.budgetMedia) > 0 ? "contractuel" : "aucun");
    if (mode === "contractuel") return (Number(l.budgetMedia) || 0) > 0;
    if (mode === "reach") {
      const { budgetEstime } = estimateBudgetFromReach(
        Number(l.reachUnique) || 0,
        Number(l.frequence) || 0,
        Number(l.cpmPrevisionnel) || 0
      );
      return budgetEstime > 0;
    }
    return false;
  });
  const hasLongBuyout = input.lines.some((l) => {
    const u = cessionUsageById(l.usageId);
    return u?.pricingBuyout && (l.duree === "sur_devis" || l.duree === "24m");
  });

  let alertSurDevis = false;
  let alertOohNationalSurDevis = false;
  let alertUsageSurDevis = false;
  let alertBudgetReachProvisoire = false;

  const lineResults: CessionLineResult[] = input.lines.map((l) => {
    const usage = cessionUsageById(l.usageId);
    const dureeMeta = CESSION_DUREES.find((d) => d.id === l.duree);
    const terr = CESSION_TERRITOIRES.find((t) => t.id === l.territoire);
    // Buyout remplace les supports classiques, MAIS paid/whitelist restent calculables
    // (budget ads max contractuel obligatoire — pas de médiatisation payante illimitée).
    const disabled = Boolean(
      hasBuyout && !usage?.pricingBuyout && !usage?.pricingMedia
    );
    const coeff = usage?.coeff ?? 0;
    const pricingMedia = Boolean(usage?.pricingMedia);
    const pricingOoh = Boolean(usage?.pricingOoh);
    const pricingBuyout = Boolean(usage?.pricingBuyout);
    const usageSurDevis = Boolean(usage?.pricingSurDevis);
    if (usageSurDevis && !disabled) alertUsageSurDevis = true;
    const budgetMediaInput = Math.max(0, Number(l.budgetMedia) || 0);
    const mediaBudgetMode: MediaBudgetMode | null = pricingMedia
      ? l.mediaBudgetMode ??
        (budgetMediaInput > 0 ? "contractuel" : "aucun")
      : null;
    const reachUnique = Math.max(0, Number(l.reachUnique) || 0);
    const frequence = Math.max(0, Number(l.frequence) || 0);
    const cpmPrevisionnel = Math.max(0, Number(l.cpmPrevisionnel) || 0);
    const reachEst =
      mediaBudgetMode === "reach"
        ? estimateBudgetFromReach(reachUnique, frequence, cpmPrevisionnel)
        : { impressions: 0, budgetEstime: 0 };
    const impressionsEstimees = reachEst.impressions;
    const budgetEstime = reachEst.budgetEstime;
    let budgetMedia = budgetMediaInput;
    let estimationProvisoire = false;
    if (mediaBudgetMode === "reach") {
      budgetMedia = budgetEstime;
      estimationProvisoire = budgetEstime > 0;
      if (estimationProvisoire) alertBudgetReachProvisoire = true;
    } else if (mediaBudgetMode === "aucun") {
      budgetMedia = 0;
    }
    const nbAgglomerations = Math.max(
      0,
      Math.floor(Number(l.nbAgglomerations ?? l.nbVilles) || 0)
    );
    const oohZoneSpecial: OohZoneSpecialId = l.oohZoneSpecial ?? "standard";
    const modifPremium = modif.premium;
    const surDevis = Boolean(dureeMeta?.surDevis);
    if (surDevis && !disabled) alertSurDevis = true;

    let dureeMult = dureeMeta?.mult ?? 1;
    let territoireMult = terr?.mult ?? 1;
    let tierMult = 1;
    let villesMult = 1;
    let parisFloorApplied = false;
    let floorAmount = 0;
    let amountFromBudget = 0;
    let amountFromCachet = 0;
    let amountFromBudgetFloor = 0;
    let amount = 0;
    let usedFloor = false;
    let oohNationalSurDevis = false;

    if (!disabled) {
      if (usageSurDevis) {
        // Catalogue sur devis — aucun montant auto
        amount = 0;
        amountFromCachet = 0;
      } else if (pricingMedia) {
        dureeMult = dureeMeta?.mult ?? 1;
        territoireMult = 1;
        floorAmount = base * (usage?.floorCachetCoeff ?? 0.2) * dureeMult;
        if (mediaBudgetMode === "aucun") {
          // Aucune donnée média → minimum garanti uniquement
          amountFromBudget = 0;
          usedFloor = true;
          amount = floorAmount * (1 + modifPremium);
          amountFromCachet = amount;
        } else {
          amountFromBudget = budgetMedia * coeff;
          const raw = Math.max(amountFromBudget, floorAmount);
          usedFloor = budgetMedia <= 0 || amountFromBudget < floorAmount;
          amount = raw * (1 + modifPremium);
          amountFromCachet = floorAmount * (1 + modifPremium);
        }
      } else if (pricingOoh) {
        const oohDuree =
          CESSION_OOH_DUREES.find((d) => d.id === l.duree) ?? CESSION_OOH_DUREES[1];
        const zoneInfo = resolveOohZoneMult(nbAgglomerations, oohZoneSpecial);
        dureeMult = oohDuree.mult;
        territoireMult =
          l.territoire === "fr" || zoneInfo.surDevis ? 1 : terr?.mult ?? 1;
        villesMult = zoneInfo.mult;
        parisFloorApplied = zoneInfo.parisFloorApplied;
        oohNationalSurDevis = zoneInfo.surDevis;
        if (oohNationalSurDevis) {
          alertOohNationalSurDevis = true;
          // SUR_DEVIS — aucun montant (pas 0 € facturable)
          amount = 0;
          amountFromCachet = 0;
          amountFromBudgetFloor = 0;
        } else {
          const dense = l.oohDense ? OOH_DENSE_PREMIUM : 0;
          // max(cachet × 75% × coeff agglo × durée × densité × (1+montage), budget × 2%)
          amountFromCachet =
            base *
            coeff *
            villesMult *
            dureeMult *
            territoireMult *
            (1 + dense) *
            (1 + modifPremium);
          amountFromBudgetFloor =
            budgetMediaInput * OOH_BUDGET_FLOOR_PCT * (1 + modifPremium);
          amount = Math.max(amountFromCachet, amountFromBudgetFloor);
          usedFloor = amountFromBudgetFloor > amountFromCachet;
        }
      } else if (pricingBuyout) {
        const bm = buyoutMult(l.territoire, l.duree);
        dureeMult = bm;
        territoireMult = 1;
        amount = base * bm * (1 + modifPremium);
        amountFromCachet = amount;
      } else {
        // Tier uniquement si tarif générique (applyTier)
        tierMult = applyTier ? tierMultForUsage(tierApplied, l.usageId) : 1;
        amountFromCachet =
          base * coeff * tierMult * dureeMult * territoireMult * (1 + modifPremium);
        // Print / PLV / TV : max(calcul, plancher absolu) — comme OOH
        const offlineFloor = resolveOfflineAbsoluteFloor(
          l.usageId,
          l.duree,
          l.territoire
        );
        if (offlineFloor.floor > 0) {
          amountFromBudgetFloor = offlineFloor.floor;
          amount = Math.max(amountFromCachet, offlineFloor.floor);
          usedFloor = offlineFloor.floor > amountFromCachet;
        } else {
          amount = amountFromCachet;
        }
      }
    }

    const status: CessionLineResult["status"] = disabled
      ? "DISABLED"
      : oohNationalSurDevis || usageSurDevis
        ? "SUR_DEVIS"
        : "OK";

    return {
      id: l.id,
      usageId: l.usageId,
      label: usage?.label ?? l.usageId,
      coeff,
      dureeMult,
      territoireMult,
      tierMult,
      villesMult,
      aggloMult: villesMult,
      modifPremium,
      pricingMedia,
      pricingOoh,
      pricingBuyout,
      budgetMedia,
      mediaBudgetMode,
      reachUnique,
      frequence,
      cpmPrevisionnel,
      impressionsEstimees,
      budgetEstime,
      estimationProvisoire,
      nbAgglomerations,
      nbVilles: nbAgglomerations,
      oohZoneSpecial,
      parisFloorApplied,
      floorAmount,
      absoluteFloor: hasOfflineAbsoluteFloor(l.usageId)
        ? amountFromBudgetFloor ||
          resolveOfflineAbsoluteFloor(l.usageId, l.duree, l.territoire).floor
        : 0,
      amountFromBudget,
      amount,
      amountFromCachet,
      amountFromBudgetFloor,
      usedFloor,
      surDevis,
      oohNationalSurDevis,
      usageSurDevis,
      status,
      disabled,
    };
  });

  const activeLines = lineResults.filter((l) => !l.disabled && l.amount > 0);
  const activeCount = activeLines.length;
  const sousTotalUsages = activeLines.reduce((s, l) => s + l.amount, 0);

  const cachetAmounts = activeLines
    .filter((l) => !l.pricingMedia && !l.pricingOoh && !l.pricingBuyout)
    .map((l) => l.amount);
  const specialAmounts = activeLines
    .filter((l) => l.pricingMedia || l.pricingOoh || l.pricingBuyout)
    .map((l) => l.amount);
  let sousTotalCachet = applyDegressivite(cachetAmounts);
  const sousTotalSpecial = specialAmounts.reduce((s, a) => s + a, 0);

  const maxTerr = Math.max(
    1,
    ...lineResults
      .filter((l) => !l.disabled && !l.pricingMedia && !l.pricingOoh && !l.pricingBuyout)
      .map((l) => l.territoireMult),
    1
  );
  const capMult = hasBuyout || hasLongBuyout ? CAP_BUYOUT : CAP_STANDARD;
  const cap = base * capMult * maxTerr * tierApplied;
  const capped = base > 0 && cachetAmounts.length > 0 && sousTotalCachet > cap;
  if (capped) sousTotalCachet = cap;

  const sousTotalApresDegressivite = sousTotalCachet + sousTotalSpecial;

  const exclusivite = base * exclu.coeff * tierApplied;
  const retroPremium = retro.premium;
  // Rétro majore les droits déjà exploités, PAS l’exclusivité future
  let cessionExactRaw =
    sousTotalApresDegressivite * (1 + retroPremium) + exclusivite;
  const hasAnyBase = base > 0 || sousTotalSpecial > 0;
  if (hasAnyBase && cessionExactRaw > 0) {
    cessionExactRaw = Math.max(
      cessionExactRaw,
      FLOOR,
      LINE_FLOOR * Math.max(1, activeCount)
    );
  }

  // SUR_DEVIS (OOH national / transport / emailing international…) → aucun total facturable
  const totalCalculable = !alertOohNationalSurDevis && !alertUsageSurDevis;
  const cessionExact = totalCalculable ? cessionExactRaw : null;
  const cession = totalCalculable ? roundCession(cessionExactRaw) : null;

  const pctDuCachet =
    totalCalculable && base > 0 && cession != null ? cession / base : null;
  const alertExcluLongue = exclu.id === "totale_6m" || exclu.id === "totale_12m";

  return {
    lines: lineResults,
    tier,
    tierApplied,
    applyTier,
    sousTotalUsages,
    sousTotalApresDegressivite,
    cap,
    capped,
    exclusivite,
    retroPremium,
    cessionExact,
    cession,
    totalCalculable,
    pctDuCachet,
    alertHigh:
      totalCalculable &&
      !hasBuyout &&
      base > 0 &&
      (pctDuCachet ?? 0) > ALERT_RATIO,
    alertExcluLongue,
    alertSurDevis,
    alertBuyoutExcludesPaid: hasBuyout,
    alertOohNationalSurDevis,
    alertUsageSurDevis,
    alertBudgetReachProvisoire,
    hasBuyout,
    hasPaidAlongsideBuyout: hasBuyout && hasPaidAlongsideBuyout,
  };
}

export function formatCessionMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function formatCessionPct(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  return `${Math.round(ratio * 100)} %`;
}

export const CESSION_BASE_FORMATS = SIM_FORMATS;

export function suggestedBaseCachet(
  formatId: string,
  tarifs: Partial<Record<TarifKey, number | string | null>> | null | undefined
): number | null {
  const fmt = SIM_FORMATS.find((f) => f.id === formatId);
  if (!fmt || !tarifs) return null;
  return numOrNull(tarifs[fmt.tarifKey]);
}
