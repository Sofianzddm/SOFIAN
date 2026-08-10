/**
 * Moteur de tarification UGC — Glow Up (grille moyenne haute).
 *
 * Séparé du moteur Influence (`cessions.ts`).
 * Commission Glow Up 30 % ≠ paid Influence 30 % ≠ paid UGC (fixes / 5 % budget).
 */

import { CESSION_DUREES, roundCession } from "@/lib/cessions";

// ─── Modes simulateur ───────────────────────────────────────────────────────

export type SimDealMode = "influence" | "ugc";

export const SIM_DEAL_MODES: {
  id: SimDealMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "influence",
    label: "Influence",
    hint: "Publication sur le compte talent — cession seule HT",
  },
  {
    id: "ugc",
    label: "UGC pur",
    hint: "Production + droits — pas de publication talent",
  },
];

// ─── Résultat typé (jamais 0 € pour SUR_DEVIS) ──────────────────────────────

export type UgcMoneyOk = {
  status: "OK";
  amount: number;
  requiresDirectionApproval: false;
};

export type UgcMoneySurDevis = {
  status: "SUR_DEVIS";
  amount: null;
  requiresDirectionApproval: true;
  reason: string;
};

export type UgcMoneyResult = UgcMoneyOk | UgcMoneySurDevis;

export function ugcMoneyOk(amount: number): UgcMoneyOk {
  const n = Number.isFinite(amount) && amount > 0 ? amount : 0;
  return { status: "OK", amount: n, requiresDirectionApproval: false };
}

export function ugcMoneySurDevis(reason: string): UgcMoneySurDevis {
  return {
    status: "SUR_DEVIS",
    amount: null,
    requiresDirectionApproval: true,
    reason,
  };
}

// ─── Formats production (multiplicateurs sur base audience) ──────────────────

export type UgcFormatId =
  | "video_simple"
  | "video_standard"
  | "video_premium"
  | "photo"
  | "photo_pack_5"
  | "voix_off";

export const UGC_FORMATS: {
  id: UgcFormatId;
  label: string;
  /** Multiplicateur sur la base audience (standard = ×1) */
  formatMult: number;
}[] = [
  { id: "video_simple", label: "Vidéo simple 15–30 s", formatMult: 0.75 },
  { id: "video_standard", label: "Vidéo standard 30–60 s", formatMult: 1 },
  { id: "video_premium", label: "Vidéo premium / multi-scènes", formatMult: 1.5 },
  { id: "photo", label: "Photo UGC", formatMult: 0.3 },
  { id: "photo_pack_5", label: "Pack de 5 photos", formatMult: 1.1 },
  { id: "voix_off", label: "Voix off seule", formatMult: 0.3 },
];

export function ugcFormatById(id: string) {
  return UGC_FORMATS.find((f) => f.id === id);
}

export function ugcFormatMult(id: UgcFormatId): number {
  return ugcFormatById(id)?.formatMult ?? 1;
}

/** Base standard générique (sans audience / fallback). */
export const UGC_GENERIC_STANDARD_BASE = 500;

// ─── Base UGC automatique selon audience ────────────────────────────────────

export type UgcAudienceTierId =
  | "lt10k"
  | "10_100k"
  | "100_250k"
  | "250_500k"
  | "500k_1m"
  | "1m_plus";

export type UgcAudienceBaseRate = {
  id: UgcAudienceTierId;
  label: string;
  shortLabel: string;
  minFollowers: number;
  maxFollowers: number | null;
  /** Base vidéo standard HT — null si SUR_DEVIS */
  baseRate: number | null;
  surDevis: boolean;
};

export const UGC_AUDIENCE_BASE_RATES: UgcAudienceBaseRate[] = [
  {
    id: "lt10k",
    label: "Moins de 10 000",
    shortLabel: "< 10 k",
    minFollowers: 0,
    maxFollowers: 9_999,
    baseRate: 500,
    surDevis: false,
  },
  {
    id: "10_100k",
    label: "10 000 à 99 999",
    shortLabel: "10–100 k",
    minFollowers: 10_000,
    maxFollowers: 99_999,
    baseRate: 600,
    surDevis: false,
  },
  {
    id: "100_250k",
    label: "100 000 à 249 999",
    shortLabel: "100–250 k",
    minFollowers: 100_000,
    maxFollowers: 249_999,
    baseRate: 750,
    surDevis: false,
  },
  {
    id: "250_500k",
    label: "250 000 à 499 999",
    shortLabel: "250–500 k",
    minFollowers: 250_000,
    maxFollowers: 499_999,
    baseRate: 900,
    surDevis: false,
  },
  {
    id: "500k_1m",
    label: "500 000 à 999 999",
    shortLabel: "500 k–1 M",
    minFollowers: 500_000,
    maxFollowers: 999_999,
    baseRate: 1_200,
    surDevis: false,
  },
  {
    id: "1m_plus",
    label: "1 000 000 et plus",
    shortLabel: "1 M+",
    minFollowers: 1_000_000,
    maxFollowers: null,
    baseRate: 1_500,
    surDevis: false,
  },
];

export type UgcAudiencePlatform = "instagram" | "tiktok" | "youtube" | "max";

export const UGC_AUDIENCE_PLATFORMS: {
  id: UgcAudiencePlatform;
  label: string;
}[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "max", label: "Audience principale / maximale" },
];

export type UgcPlatformAudiences = {
  instagram?: number | null;
  tiktok?: number | null;
  youtube?: number | null;
};

export function resolveUgcAudienceForPlatform(
  audiences: UgcPlatformAudiences | null | undefined,
  platform: UgcAudiencePlatform
): { followers: number | null; platformUsed: UgcAudiencePlatform; platformLabel: string } {
  const ig = Math.max(0, Number(audiences?.instagram) || 0);
  const tt = Math.max(0, Number(audiences?.tiktok) || 0);
  const yt = Math.max(0, Number(audiences?.youtube) || 0);
  const label =
    UGC_AUDIENCE_PLATFORMS.find((p) => p.id === platform)?.label ?? platform;

  if (platform === "instagram") {
    return { followers: ig > 0 ? ig : null, platformUsed: "instagram", platformLabel: label };
  }
  if (platform === "tiktok") {
    return { followers: tt > 0 ? tt : null, platformUsed: "tiktok", platformLabel: label };
  }
  if (platform === "youtube") {
    return { followers: yt > 0 ? yt : null, platformUsed: "youtube", platformLabel: label };
  }
  // max — jamais de somme
  const entries: { id: UgcAudiencePlatform; n: number; label: string }[] = [
    { id: "instagram", n: ig, label: "Instagram" },
    { id: "tiktok", n: tt, label: "TikTok" },
    { id: "youtube", n: yt, label: "YouTube" },
  ];
  const best = entries.reduce(
    (a, b) => (b.n > a.n ? b : a),
    entries[0]
  );
  if (best.n <= 0) {
    return { followers: null, platformUsed: "max", platformLabel: "Audience principale / maximale" };
  }
  return {
    followers: best.n,
    platformUsed: best.id,
    platformLabel: best.label,
  };
}

export function resolveUgcAudienceTier(
  followers: number | null | undefined
): UgcAudienceBaseRate {
  const n = Math.max(0, Math.floor(Number(followers) || 0));
  return (
    UGC_AUDIENCE_BASE_RATES.find(
      (t) =>
        !t.surDevis &&
        n >= t.minFollowers &&
        (t.maxFollowers == null || n <= t.maxFollowers)
    ) ?? UGC_AUDIENCE_BASE_RATES[0]
  );
}

export type UgcRateSource =
  | "manual"
  | "talent_custom"
  | "audience_auto"
  | "generic";

export type UgcProductionResolution = {
  productionValorisee: number;
  /** Base vidéo standard avant multiplicateur format */
  standardBase: number | null;
  formatMult: number;
  formatId: UgcFormatId;
  formatLabel: string;
  source: UgcRateSource;
  sourceLabel: string;
  tier: UgcAudienceBaseRate | null;
  followers: number | null;
  surDevis: boolean;
  surDevisReason: string | null;
};

/**
 * Priorité :
 * 1. prix manuel simulation (production finale)
 * 2. ugcBaseRate talent (base standard × format)
 * 3. base audience × format
 * 4. générique 500 × format
 */
export function resolveUgcProduction(input: {
  formatId: UgcFormatId;
  followers?: number | null;
  manualProduction?: number | null;
  talentUgcBaseRate?: number | null;
  /** Créateur sans audience → base 500 € standard */
  noAudience?: boolean;
}): UgcProductionResolution {
  const format = ugcFormatById(input.formatId) ?? UGC_FORMATS[1];
  const formatMult = format.formatMult;
  const manual = Math.max(0, Number(input.manualProduction) || 0);
  const talentRate = Math.max(0, Number(input.talentUgcBaseRate) || 0);

  if (manual > 0) {
    return {
      productionValorisee: manual,
      standardBase: null,
      formatMult,
      formatId: format.id,
      formatLabel: format.label,
      source: "manual",
      sourceLabel: "Prix manuel",
      tier: null,
      followers: input.followers ?? null,
      surDevis: false,
      surDevisReason: null,
    };
  }

  if (talentRate > 0) {
    return {
      productionValorisee: talentRate * formatMult,
      standardBase: talentRate,
      formatMult,
      formatId: format.id,
      formatLabel: format.label,
      source: "talent_custom",
      sourceLabel: "Tarif talent personnalisé",
      tier: null,
      followers: input.followers ?? null,
      surDevis: false,
      surDevisReason: null,
    };
  }

  if (input.noAudience) {
    const standardBase = UGC_GENERIC_STANDARD_BASE;
    return {
      productionValorisee: standardBase * formatMult,
      standardBase,
      formatMult,
      formatId: format.id,
      formatLabel: format.label,
      source: "generic",
      sourceLabel: "Créateur sans audience (500 €)",
      tier: UGC_AUDIENCE_BASE_RATES[0],
      followers: 0,
      surDevis: false,
      surDevisReason: null,
    };
  }

  const followers =
    input.followers != null && Number.isFinite(Number(input.followers))
      ? Math.max(0, Math.floor(Number(input.followers)))
      : null;

  if (followers == null) {
    const standardBase = UGC_GENERIC_STANDARD_BASE;
    return {
      productionValorisee: standardBase * formatMult,
      standardBase,
      formatMult,
      formatId: format.id,
      formatLabel: format.label,
      source: "generic",
      sourceLabel: "Tarif générique (aucune audience)",
      tier: UGC_AUDIENCE_BASE_RATES[0],
      followers: null,
      surDevis: false,
      surDevisReason: null,
    };
  }

  const tier = resolveUgcAudienceTier(followers);
  if (tier.surDevis || tier.baseRate == null) {
    return {
      productionValorisee: 0,
      standardBase: null,
      formatMult,
      formatId: format.id,
      formatLabel: format.label,
      source: "audience_auto",
      sourceLabel: "SUR_DEVIS",
      tier,
      followers,
      surDevis: true,
      surDevisReason: `${tier.label} — SUR_DEVIS`,
    };
  }

  return {
    productionValorisee: tier.baseRate * formatMult,
    standardBase: tier.baseRate,
    formatMult,
    formatId: format.id,
    formatLabel: format.label,
    source: "audience_auto",
    sourceLabel: "Automatique selon l’audience",
    tier,
    followers,
    surDevis: false,
    surDevisReason: null,
  };
}

/** @deprecated — l’audience est désormais dans la base ; garder pour compat. */
export type UgcCreatorType =
  | "createur_classique"
  | "influenceur_identifiable"
  | "tarif_personnalise";

export const UGC_CREATOR_TYPES: {
  id: UgcCreatorType;
  label: string;
  hint: string;
}[] = [
  {
    id: "createur_classique",
    label: "Créateur UGC classique",
    hint: "Sans audience → base 500 €",
  },
  {
    id: "influenceur_identifiable",
    label: "Influenceur / personnalité identifiable",
    hint: "Base UGC selon audience",
  },
  {
    id: "tarif_personnalise",
    label: "Tarif personnalisé fiche talent",
    hint: "Priorité au ugcBaseRate",
  },
];

/** @deprecated — remplacé par UGC_AUDIENCE_BASE_RATES */
export type UgcNotorietyTierId = UgcAudienceTierId;
/** @deprecated */
export const UGC_NOTORIETY_TIERS = UGC_AUDIENCE_BASE_RATES.map((t) => ({
  id: t.id,
  label: t.label,
  minFollowers: t.minFollowers,
  maxFollowers: t.maxFollowers,
  mult: t.baseRate != null ? t.baseRate / UGC_GENERIC_STANDARD_BASE : null,
  surDevis: t.surDevis,
}));

/** @deprecated — préférer resolveUgcProduction */
export function resolveUgcNotoriety(
  followers: number | null | undefined,
  creatorType: UgcCreatorType,
  forceDisabled = false
): { mult: number; label: string; surDevis: boolean; applied: boolean } {
  if (forceDisabled || creatorType === "createur_classique" || creatorType === "tarif_personnalise") {
    return { mult: 1, label: "Notoriété désactivée", surDevis: false, applied: false };
  }
  const tier = resolveUgcAudienceTier(followers);
  return {
    mult: 1,
    label: tier.shortLabel,
    surDevis: tier.surDevis,
    applied: false,
  };
}

// ─── Options production ─────────────────────────────────────────────────────

export type UgcProductionOptionsInput = {
  hooksExtra?: number;
  ctaExtra?: number;
  conceptScript?: boolean;
  rushesBruts?: boolean;
  revisionsExtra?: number;
  urgent?: boolean;
  formatDeclinations?: number;
  multiLieu?: number | null;
  fraisAccessoires?: number | null;
  fraisDeplacement?: number | null;
};

export const UGC_OPTION_RATES = {
  hook: 75,
  cta: 50,
  conceptScript: 150,
  rushesPct: 0.5,
  revision: 100,
  urgentPct: 0.3,
  formatDeclination: 75,
  multiLieuMin: 150,
} as const;

export function computeUgcProductionOptions(
  productionValorisee: number,
  opts: UgcProductionOptionsInput
): {
  optionsProduction: number;
  fraisReels: number;
  detail: { label: string; amount: number }[];
} {
  const detail: { label: string; amount: number }[] = [];
  let options = 0;
  const hooks = Math.max(0, Math.floor(Number(opts.hooksExtra) || 0));
  if (hooks > 0) {
    const a = hooks * UGC_OPTION_RATES.hook;
    options += a;
    detail.push({ label: `${hooks} hook(s)`, amount: a });
  }
  const ctas = Math.max(0, Math.floor(Number(opts.ctaExtra) || 0));
  if (ctas > 0) {
    const a = ctas * UGC_OPTION_RATES.cta;
    options += a;
    detail.push({ label: `${ctas} CTA`, amount: a });
  }
  if (opts.conceptScript) {
    options += UGC_OPTION_RATES.conceptScript;
    detail.push({ label: "Concept / script", amount: UGC_OPTION_RATES.conceptScript });
  }
  if (opts.rushesBruts) {
    const a = productionValorisee * UGC_OPTION_RATES.rushesPct;
    options += a;
    detail.push({ label: "Rushes bruts (+50 %)", amount: a });
  }
  const revs = Math.max(0, Math.floor(Number(opts.revisionsExtra) || 0));
  if (revs > 0) {
    const a = revs * UGC_OPTION_RATES.revision;
    options += a;
    detail.push({ label: `${revs} révision(s) extra`, amount: a });
  }
  const decl = Math.max(0, Math.floor(Number(opts.formatDeclinations) || 0));
  if (decl > 0) {
    const a = decl * UGC_OPTION_RATES.formatDeclination;
    options += a;
    detail.push({ label: `${decl} déclinaison(s)`, amount: a });
  }
  const multi = Math.max(0, Number(opts.multiLieu) || 0);
  if (multi > 0) {
    options += multi;
    detail.push({ label: "Tournage multi-lieu", amount: multi });
  }

  let optionsBeforeUrgent = options;
  if (opts.urgent) {
    const a = (productionValorisee + optionsBeforeUrgent) * UGC_OPTION_RATES.urgentPct;
    options += a;
    detail.push({ label: "Livraison urgente (+30 %)", amount: a });
  }

  const fraisAccessoires = Math.max(0, Number(opts.fraisAccessoires) || 0);
  const fraisDeplacement = Math.max(0, Number(opts.fraisDeplacement) || 0);
  const fraisReels = fraisAccessoires + fraisDeplacement;
  if (fraisAccessoires > 0) detail.push({ label: "Accessoires (frais réels)", amount: fraisAccessoires });
  if (fraisDeplacement > 0) detail.push({ label: "Déplacement (frais réels)", amount: fraisDeplacement });

  return { optionsProduction: options, fraisReels, detail };
}

// ─── Territoire UGC (séparé Influence) ───────────────────────────────────────

export type UgcTerritoireId = "fr" | "fr_plus" | "ue" | "monde";

export const UGC_TERRITOIRES: {
  id: UgcTerritoireId;
  label: string;
  mult: number;
}[] = [
  { id: "fr", label: "France", mult: 1 },
  { id: "fr_plus", label: "FR + Benelux / CH / DOM", mult: 1.1 },
  { id: "ue", label: "Europe + Royaume-Uni", mult: 1.2 },
  { id: "monde", label: "Monde", mult: 1.3 },
];

export function ugcTerritoireMult(id: UgcTerritoireId): number {
  return UGC_TERRITOIRES.find((t) => t.id === id)?.mult ?? 1;
}

// ─── Catalogue usages UGC (DISTINCT Influence) ───────────────────────────────

export type UgcUsageGroupId =
  | "digital_organique"
  | "paid_whitelist"
  | "ecommerce_crm"
  | "offline_retail"
  | "broadcast_affichage"
  | "buyout";

export const UGC_USAGE_GROUPS: {
  id: UgcUsageGroupId;
  label: string;
  order: number;
}[] = [
  { id: "digital_organique", label: "1. Digital organique", order: 1 },
  { id: "paid_whitelist", label: "2. Paid et whitelisting", order: 2 },
  { id: "ecommerce_crm", label: "3. E-commerce et CRM", order: 3 },
  { id: "offline_retail", label: "4. Offline et retail", order: 4 },
  { id: "broadcast_affichage", label: "5. Broadcast et affichage", order: 5 },
  { id: "buyout", label: "6. Buyout", order: 6 },
];

export type UgcUsageDureeId =
  | "1m"
  | "3m"
  | "6m"
  | "12m"
  | "24m"
  | "unique"
  | "multi_3m"
  | "crm_3m"
  | "sur_devis";

export type UgcUsagePricingMode =
  | "pct_production"
  | "pct_or_budget"
  | "sur_devis";

export type UgcUsageDureeTier = {
  dureeId: UgcUsageDureeId;
  label: string;
  /** null = SUR_DEVIS pour cette durée */
  pct: number | null;
  minimum?: number;
};

export type UgcUsageId =
  | "rs_organique"
  | "site_landing"
  | "ecommerce_pdp"
  | "newsletter_unique"
  | "newsletter_multi"
  | "crm_auto"
  | "emailing_international"
  | "interne"
  | "paid_brand"
  | "whitelisting"
  | "print"
  | "plv"
  | "press_kit"
  | "salons_events"
  | "retail_media"
  | "ooh"
  | "tv_broadcast"
  | "packaging"
  | "full_buyout";

export type UgcUsageDef = {
  id: UgcUsageId;
  label: string;
  support: string;
  group: UgcUsageGroupId;
  /** Affiché dans la section repliable « Autres supports / usages avancés » */
  advanced: boolean;
  pricingMode: UgcUsagePricingMode;
  durees: UgcUsageDureeTier[];
  /** % budget ads (paid / retail) */
  budgetPct?: number;
  /** Territoire UGC sur droits fixes uniquement */
  applyTerritoire: boolean;
  /** Minimum indicatif interne (SUR_DEVIS) — jamais prix définitif */
  indicativeMin?: number;
  requiredFields?: string[];
  calcHint: string;
};

const D = {
  rs: [
    { dureeId: "3m" as const, label: "3 mois", pct: 0.1 },
    { dureeId: "6m" as const, label: "6 mois", pct: 0.2 },
    { dureeId: "12m" as const, label: "12 mois", pct: 0.35 },
    { dureeId: "24m" as const, label: "24 mois", pct: 0.6 },
    { dureeId: "sur_devis" as const, label: "Au-delà", pct: null },
  ],
  site: [
    { dureeId: "3m" as const, label: "3 mois", pct: 0.2 },
    { dureeId: "6m" as const, label: "6 mois", pct: 0.3 },
    { dureeId: "12m" as const, label: "12 mois", pct: 0.5 },
    { dureeId: "24m" as const, label: "24 mois", pct: 0.8 },
    { dureeId: "sur_devis" as const, label: "Au-delà", pct: null },
  ],
  pdp: [
    { dureeId: "3m" as const, label: "3 mois", pct: 0.3 },
    { dureeId: "6m" as const, label: "6 mois", pct: 0.45 },
    { dureeId: "12m" as const, label: "12 mois", pct: 0.7 },
    { dureeId: "24m" as const, label: "24 mois", pct: 1.1 },
    { dureeId: "sur_devis" as const, label: "Au-delà", pct: null },
  ],
  interne: [
    { dureeId: "3m" as const, label: "3 mois", pct: 0.2, minimum: 100 },
    { dureeId: "6m" as const, label: "6 mois", pct: 0.3, minimum: 150 },
    { dureeId: "12m" as const, label: "12 mois", pct: 0.5, minimum: 250 },
  ],
  paid: [
    { dureeId: "1m" as const, label: "1 mois", pct: 0.3 },
    { dureeId: "3m" as const, label: "3 mois", pct: 0.6 },
    { dureeId: "6m" as const, label: "6 mois", pct: 1.0 },
    { dureeId: "12m" as const, label: "12 mois", pct: 1.5 },
    { dureeId: "24m" as const, label: "24 mois", pct: 2.5 },
    { dureeId: "sur_devis" as const, label: "Au-delà", pct: null },
  ],
  wl: [
    { dureeId: "1m" as const, label: "1 mois", pct: 0.5 },
    { dureeId: "3m" as const, label: "3 mois", pct: 1.0 },
    { dureeId: "6m" as const, label: "6 mois", pct: 1.5 },
    { dureeId: "12m" as const, label: "12 mois", pct: 2.5 },
    { dureeId: "24m" as const, label: "24 mois", pct: 4.0 },
    { dureeId: "sur_devis" as const, label: "Au-delà", pct: null },
  ],
  print: [
    { dureeId: "3m" as const, label: "3 mois", pct: 1.0, minimum: 500 },
    { dureeId: "6m" as const, label: "6 mois", pct: 1.5, minimum: 750 },
    { dureeId: "12m" as const, label: "12 mois", pct: 2.5, minimum: 1250 },
    { dureeId: "24m" as const, label: "24 mois", pct: null },
  ],
  plv: [
    { dureeId: "3m" as const, label: "3 mois", pct: 1.5, minimum: 750 },
    { dureeId: "6m" as const, label: "6 mois", pct: 2.2, minimum: 1100 },
    { dureeId: "12m" as const, label: "12 mois", pct: 3.5, minimum: 1750 },
    { dureeId: "sur_devis" as const, label: "National / volume / +12 mois", pct: null },
  ],
  press: [
    { dureeId: "3m" as const, label: "Éditorial 3 mois", pct: 0.25, minimum: 150 },
    { dureeId: "6m" as const, label: "6 mois", pct: 0.4, minimum: 200 },
    { dureeId: "12m" as const, label: "12 mois", pct: 0.6, minimum: 300 },
  ],
  salons: [
    { dureeId: "3m" as const, label: "3 mois", pct: 0.75, minimum: 400 },
    { dureeId: "6m" as const, label: "6 mois", pct: 1.2, minimum: 600 },
    { dureeId: "12m" as const, label: "12 mois", pct: 2.0, minimum: 1000 },
    { dureeId: "sur_devis" as const, label: "Événement international majeur", pct: null },
  ],
  retail: [
    { dureeId: "3m" as const, label: "3 mois", pct: 1.0 },
    { dureeId: "6m" as const, label: "6 mois", pct: 1.5 },
    { dureeId: "12m" as const, label: "12 mois", pct: 2.5 },
    { dureeId: "sur_devis" as const, label: "Exploitation massive", pct: null },
  ],
};

/** Catalogue UGC — jamais les coeffs Influence. */
export const UGC_USAGE_CATALOG: UgcUsageDef[] = [
  {
    id: "rs_organique",
    label: "Réseaux sociaux organiques marque",
    support: "RS organiques",
    group: "digital_organique",
    advanced: false,
    pricingMode: "pct_production",
    durees: D.rs,
    applyTerritoire: false,
    calcHint: "% de la production valorisée",
  },
  {
    id: "site_landing",
    label: "Site web / landing",
    support: "Site / landing",
    group: "digital_organique",
    advanced: false,
    pricingMode: "pct_production",
    durees: D.site,
    applyTerritoire: false,
    calcHint: "% de la production valorisée",
  },
  {
    id: "interne",
    label: "Usage interne / corporate",
    support: "Interne (sans pub externe)",
    group: "digital_organique",
    advanced: false,
    pricingMode: "pct_production",
    durees: D.interne,
    applyTerritoire: false,
    calcHint: "max(% production, minimum)",
  },
  {
    id: "paid_brand",
    label: "Paid UGC — compte marque",
    support: "Paid ads marque",
    group: "paid_whitelist",
    advanced: false,
    pricingMode: "pct_or_budget",
    durees: D.paid,
    budgetPct: 0.05,
    applyTerritoire: true,
    calcHint: "max(prod × % × territoire, budget × 5 %)",
  },
  {
    id: "whitelisting",
    label: "Whitelisting / Spark Ads UGC",
    support: "Compte créateur",
    group: "paid_whitelist",
    advanced: false,
    pricingMode: "pct_or_budget",
    durees: D.wl,
    budgetPct: 0.08,
    applyTerritoire: true,
    calcHint:
      "max(prod × % × territoire, budget × 8 %, floor cachet Influence × 40 % × durée si compte talent)",
  },
  {
    id: "ecommerce_pdp",
    label: "E-commerce / PDP / marketplace",
    support: "PDP / marketplace",
    group: "ecommerce_crm",
    advanced: false,
    pricingMode: "pct_production",
    durees: D.pdp,
    applyTerritoire: false,
    calcHint: "% de la production valorisée",
  },
  {
    id: "newsletter_unique",
    label: "Newsletter — envoi unique",
    support: "Emailing",
    group: "ecommerce_crm",
    advanced: false,
    pricingMode: "pct_production",
    durees: [{ dureeId: "unique", label: "Un envoi", pct: 0.1, minimum: 100 }],
    applyTerritoire: false,
    calcHint: "max(+10 %, min 100 €)",
  },
  {
    id: "newsletter_multi",
    label: "Emailing — multienvois 3 mois",
    support: "Emailing",
    group: "ecommerce_crm",
    advanced: false,
    pricingMode: "pct_production",
    durees: [{ dureeId: "multi_3m", label: "Multienvois 3 mois", pct: 0.2, minimum: 150 }],
    applyTerritoire: false,
    calcHint: "max(+20 %, min 150 €)",
  },
  {
    id: "crm_auto",
    label: "CRM automatisé — 3 mois",
    support: "CRM",
    group: "ecommerce_crm",
    advanced: false,
    pricingMode: "pct_production",
    durees: [{ dureeId: "crm_3m", label: "CRM auto 3 mois", pct: 0.3, minimum: 200 }],
    applyTerritoire: false,
    calcHint: "max(+30 %, min 200 €)",
  },
  {
    id: "emailing_international",
    label: "Emailing — base internationale / très importante",
    support: "Emailing",
    group: "ecommerce_crm",
    advanced: false,
    pricingMode: "sur_devis",
    durees: [{ dureeId: "sur_devis", label: "Sur devis", pct: null }],
    applyTerritoire: false,
    calcHint: "SUR_DEVIS — pas de montant automatique",
  },
  {
    id: "print",
    label: "Print / catalogue",
    support: "Print",
    group: "offline_retail",
    advanced: true,
    pricingMode: "pct_production",
    durees: D.print,
    applyTerritoire: false,
    calcHint: "max(% production, minimum)",
  },
  {
    id: "plv",
    label: "PLV / point de vente",
    support: "PLV",
    group: "offline_retail",
    advanced: true,
    pricingMode: "pct_production",
    durees: D.plv,
    applyTerritoire: false,
    requiredFields: ["nbPointsDeVente", "enseignes"],
    calcHint: "max(% production, minimum) — national/volume = SUR_DEVIS",
  },
  {
    id: "press_kit",
    label: "Press kit / RP (éditorial)",
    support: "RP éditorial",
    group: "offline_retail",
    advanced: true,
    pricingMode: "pct_production",
    durees: D.press,
    applyTerritoire: false,
    calcHint: "Éditorial strict — pub → autre support",
  },
  {
    id: "salons_events",
    label: "Salons / événements / écrans pro",
    support: "Événementiel",
    group: "offline_retail",
    advanced: true,
    pricingMode: "pct_production",
    durees: D.salons,
    applyTerritoire: false,
    calcHint: "max(% production, minimum)",
  },
  {
    id: "retail_media",
    label: "Retail media",
    support: "Retail media",
    group: "offline_retail",
    advanced: true,
    pricingMode: "pct_or_budget",
    durees: D.retail,
    budgetPct: 0.05,
    applyTerritoire: false,
    requiredFields: ["budgetMedia"],
    calcHint: "max(% production, budget × 5 %) — budget obligatoire",
  },
  {
    id: "ooh",
    label: "OOH / DOOH",
    support: "Affichage",
    group: "broadcast_affichage",
    advanced: true,
    pricingMode: "sur_devis",
    durees: [{ dureeId: "sur_devis", label: "Sur devis", pct: null }],
    applyTerritoire: true,
    indicativeMin: 1500,
    requiredFields: [
      "agglomerations",
      "faces",
      "duree",
      "vagues",
      "transports",
      "budgetOoh",
      "territoire",
    ],
    calcHint: "SUR_DEVIS — min indicatif interne 1 500 €",
  },
  {
    id: "tv_broadcast",
    label: "TV / cinéma / broadcast",
    support: "Broadcast",
    group: "broadcast_affichage",
    advanced: true,
    pricingMode: "sur_devis",
    durees: [{ dureeId: "sur_devis", label: "Sur devis", pct: null }],
    applyTerritoire: true,
    indicativeMin: 2500,
    requiredFields: [
      "chaines",
      "typeDiffusion",
      "duree",
      "territoire",
      "vagues",
      "budgetMedia",
      "montage",
    ],
    calcHint: "SUR_DEVIS — min indicatif interne 2 500 €",
  },
  {
    id: "packaging",
    label: "Packaging produit",
    support: "Packaging",
    group: "offline_retail",
    advanced: true,
    pricingMode: "sur_devis",
    durees: [{ dureeId: "sur_devis", label: "Sur devis", pct: null }],
    applyTerritoire: true,
    indicativeMin: 2000,
    requiredFields: ["produits", "unites", "pays", "dureeCommerciale", "circuits"],
    calcHint: "SUR_DEVIS — min indicatif interne 2 000 €",
  },
  {
    id: "full_buyout",
    label: "Full buyout UGC",
    support: "Buyout supports listés",
    group: "buyout",
    advanced: false,
    pricingMode: "pct_production",
    durees: [
      { dureeId: "3m", label: "3 mois", pct: 1.5 },
      { dureeId: "6m", label: "6 mois", pct: 2.2 },
      { dureeId: "12m", label: "12 mois", pct: 3.0 },
      { dureeId: "24m", label: "24 mois", pct: 4.5 },
      { dureeId: "sur_devis", label: "Au-delà / perpétuel", pct: null },
    ],
    applyTerritoire: false, // zone FR/Monde via buyoutZone
    calcHint: "Matrice UGC FR/Monde — hors paid/WL/packaging/IA",
  },
];

export function ugcUsageById(id: string): UgcUsageDef | undefined {
  return UGC_USAGE_CATALOG.find((u) => u.id === id);
}

export function ugcUsagesByGroup(group: UgcUsageGroupId, advanced?: boolean) {
  return UGC_USAGE_CATALOG.filter(
    (u) => u.group === group && (advanced == null || u.advanced === advanced)
  );
}

export type UgcUsageLineInput = {
  id: string;
  usageId: UgcUsageId;
  enabled: boolean;
  dureeId: UgcUsageDureeId;
  territoire?: UgcTerritoireId;
  /** FR ou Monde pour buyout */
  buyoutZone?: "fr" | "monde";
  budgetMode?: UgcMediaBudgetMode;
  budgetAds?: number | null;
  reachUnique?: number | null;
  frequence?: number | null;
  cpm?: number | null;
  /** PLV */
  nbPointsDeVente?: number | null;
  enseignes?: string | null;
  meta?: Record<string, string | number | null>;
};

export type UgcUsageLineResult = {
  id: string;
  usageId: UgcUsageId;
  label: string;
  status: "OK" | "SUR_DEVIS" | "DISABLED" | "MISSING_BUDGET";
  amount: number | null;
  /** Arrondi commercial (ex. 690 → 700) */
  amountCommercial: number | null;
  indicativeMin: number | null;
  calcLabel: string;
  usedFloor: boolean;
  /** Floor cachet Influence appliqué (whitelist compte talent uniquement) */
  influenceFloor: number | null;
};

/** Floor whitelist Influence : cachet × 40 % × mult durée (grille Influence) */
export const UGC_WHITELIST_INFLUENCE_FLOOR_COEFF = 0.4;

export function ugcInfluenceWhitelistDureeMult(
  dureeId: UgcUsageDureeId
): number {
  return CESSION_DUREES.find((d) => d.id === dureeId)?.mult ?? 1;
}

/** Floor Influence uniquement si cachet Influence + compte talent (pas créateur anonyme). */
export function shouldApplyUgcInfluenceWhitelistFloor(
  influenceCachet: number | null | undefined,
  opts?: { noAudience?: boolean; hybridMode?: boolean }
): boolean {
  if (opts?.hybridMode) return false;
  if (opts?.noAudience) return false;
  return Math.max(0, Number(influenceCachet) || 0) > 0;
}

export type UgcUsageLineComputeOpts = {
  influenceCachet?: number | null;
  applyInfluenceWhitelistFloor?: boolean;
};

/**
 * Calcule une ligne d’usage UGC.
 * SUR_DEVIS → amount null (jamais 0 € facturable).
 */
export function computeUgcUsageLine(
  productionValorisee: number,
  line: UgcUsageLineInput,
  opts?: UgcUsageLineComputeOpts
): UgcUsageLineResult {
  const empty = (
    status: UgcUsageLineResult["status"],
    label: string,
    calcLabel: string,
    indicativeMin: number | null = null
  ): UgcUsageLineResult => ({
    id: line.id,
    usageId: line.usageId,
    label,
    status,
    amount: null,
    amountCommercial: null,
    indicativeMin,
    calcLabel,
    usedFloor: false,
    influenceFloor: null,
  });

  const def = ugcUsageById(line.usageId);
  if (!def || !line.enabled) {
    return empty("DISABLED", def?.label ?? line.usageId, "—");
  }

  if (def.pricingMode === "sur_devis") {
    return empty(
      "SUR_DEVIS",
      def.label,
      def.calcHint,
      def.indicativeMin ?? null
    );
  }

  // Buyout monde : coeffs distincts
  let tier = def.durees.find((d) => d.dureeId === line.dureeId) ?? def.durees[0];
  if (line.usageId === "full_buyout" && line.buyoutZone === "monde") {
    const mondePct: Record<string, number | null> = {
      "3m": 2.2,
      "6m": 3.0,
      "12m": 4.0,
      "24m": 5.5,
      sur_devis: null,
    };
    tier = {
      ...tier,
      pct: mondePct[line.dureeId] ?? null,
    };
  }

  if (tier.pct == null) {
    return empty(
      "SUR_DEVIS",
      def.label,
      `${def.label} — ${tier.label} SUR_DEVIS`,
      def.indicativeMin ?? tier.minimum ?? null
    );
  }

  const terr =
    def.applyTerritoire && line.territoire
      ? ugcTerritoireMult(line.territoire)
      : 1;

  if (def.pricingMode === "pct_or_budget") {
    const fixes = productionValorisee * tier.pct * terr;
    const budgetPct = def.budgetPct ?? 0.05;
    const budgetMode = line.budgetMode ?? "contractuel";
    let budget = Math.max(0, Number(line.budgetAds) || 0);
    if (budgetMode === "reach") {
      const est = estimateUgcBudgetFromReach(
        line.reachUnique ?? 0,
        line.frequence ?? 0,
        line.cpm ?? 0
      );
      budget = est.budgetEstime;
    }

    // Floor Influence : whitelist compte talent uniquement (pas paid marque)
    let influenceFloor = 0;
    if (
      def.id === "whitelisting" &&
      opts?.applyInfluenceWhitelistFloor &&
      (opts.influenceCachet ?? 0) > 0
    ) {
      influenceFloor =
        Math.max(0, Number(opts.influenceCachet) || 0) *
        UGC_WHITELIST_INFLUENCE_FLOOR_COEFF *
        ugcInfluenceWhitelistDureeMult(line.dureeId);
    }

    if (def.id === "retail_media" && budgetMode !== "inconnu" && budget <= 0) {
      return empty("SUR_DEVIS", def.label, "Budget média obligatoire");
    }

    // Budget contractuel sans montant → erreur (pas de tarif définitif)
    if (budgetMode === "contractuel" && budget <= 0) {
      const amount = Math.max(fixes, influenceFloor);
      return {
        id: line.id,
        usageId: line.usageId,
        label: def.label,
        status: "MISSING_BUDGET",
        amount,
        amountCommercial: roundCession(amount),
        indicativeMin: null,
        calcLabel:
          "Budget contractuel manquant — minimum affiché, copie bloquée",
        usedFloor: influenceFloor >= fixes && influenceFloor > 0,
        influenceFloor: influenceFloor > 0 ? influenceFloor : null,
      };
    }

    const fromBudget =
      budgetMode !== "inconnu" && budget > 0 ? budget * budgetPct : 0;

    // Mode inconnu = minimum garanti (fixes [+ floor Influence WL])
    // Mode contractuel/reach = max(fixes, budget%, floor Influence WL)
    const amount =
      budgetMode === "inconnu"
        ? Math.max(fixes, influenceFloor)
        : Math.max(fixes, fromBudget, influenceFloor);

    const usedFloor =
      (fromBudget > fixes && fromBudget >= influenceFloor) ||
      (influenceFloor > fixes && influenceFloor >= fromBudget);

    let calcLabel = def.calcHint;
    if (influenceFloor > 0 && influenceFloor >= fixes && influenceFloor >= fromBudget) {
      calcLabel = `Floor compte Influence ${Math.round(influenceFloor)} € (cachet × 40 % × durée)`;
    } else if (fromBudget > fixes) {
      calcLabel = `Budget ads × ${Math.round(budgetPct * 100)} %`;
    } else {
      calcLabel = `Fixes UGC +${Math.round(tier.pct * 100)} %`;
    }

    return {
      id: line.id,
      usageId: line.usageId,
      label: def.label,
      status: "OK",
      amount,
      amountCommercial: roundCession(amount),
      indicativeMin: null,
      calcLabel,
      usedFloor,
      influenceFloor: influenceFloor > 0 ? influenceFloor : null,
    };
  }

  // pct_production
  let amount = productionValorisee * tier.pct;
  let usedFloor = false;
  if (tier.minimum != null && amount < tier.minimum) {
    amount = tier.minimum;
    usedFloor = true;
  }

  return {
    id: line.id,
    usageId: line.usageId,
    label: def.label,
    status: "OK",
    amount,
    amountCommercial: roundCession(amount),
    indicativeMin: null,
    calcLabel: usedFloor
      ? `Plancher ${tier.minimum} €`
      : `+${Math.round(tier.pct * 100)} %`,
    usedFloor,
    influenceFloor: null,
  };
}

/** @deprecated alias compat — préférer UGC_USAGE_CATALOG */
export type UgcOrganicUsageId =
  | "rs_organique"
  | "site_pdp"
  | "newsletter_unique"
  | "newsletter_multi"
  | "crm_auto";

export type UgcOrganicDureeId = "3m" | "6m" | "12m" | "24m" | "sur_devis";

export const UGC_ORGANIC_RS = D.rs;
export const UGC_ORGANIC_SITE = D.site;

export type UgcOrganicLineInput = {
  id: string;
  usageId: UgcOrganicUsageId;
  duree?: UgcOrganicDureeId;
};

function applyOrganicDegressivite(amounts: number[]): number {
  const sorted = [...amounts].filter((a) => a > 0).sort((a, b) => b - a);
  const weights = [1, 0.9, 0.8];
  return sorted.reduce((s, amount, i) => s + amount * (weights[i] ?? 0.8), 0);
}

// ─── Paid / Whitelist UGC (raccourcis catalogue) ────────────────────────────

export type UgcMediaDureeId = "1m" | "3m" | "6m" | "12m" | "24m" | "sur_devis";

export const UGC_PAID_DUREES = D.paid;
export const UGC_WHITELIST_DUREES = D.wl;

export const UGC_PAID_BUDGET_PCT = 0.05;
export const UGC_WHITELIST_BUDGET_PCT = 0.08;

export type UgcMediaBudgetMode = "contractuel" | "reach" | "inconnu";

export type UgcMediaLineInput = {
  enabled: boolean;
  kind: "paid" | "whitelist";
  duree: UgcMediaDureeId;
  territoire: UgcTerritoireId;
  budgetMode: UgcMediaBudgetMode;
  budgetAds?: number | null;
  reachUnique?: number | null;
  frequence?: number | null;
  cpm?: number | null;
  assetId?: string | null;
};

export function estimateUgcBudgetFromReach(
  reach: number,
  frequence: number,
  cpm: number
): { impressions: number; budgetEstime: number } {
  const r = Math.max(0, Number(reach) || 0);
  const f = Math.max(0, Number(frequence) || 0);
  const c = Math.max(0, Number(cpm) || 0);
  const impressions = r * f;
  return { impressions, budgetEstime: (impressions / 1000) * c };
}

// ─── Exclusivité UGC ────────────────────────────────────────────────────────

export type UgcExcluId =
  | "aucune"
  | "secteur_1m"
  | "secteur_3m"
  | "secteur_6m"
  | "secteur_12m"
  | "totale_1m"
  | "totale_3m"
  | "totale_6m"
  | "totale_12m";

export const UGC_EXCLUSIVITES: {
  id: UgcExcluId;
  label: string;
  pct: number | null;
  surDevis: boolean;
  alertDirection: boolean;
}[] = [
  { id: "aucune", label: "Aucune", pct: 0, surDevis: false, alertDirection: false },
  { id: "secteur_1m", label: "Sectorielle 1 mois", pct: 0.15, surDevis: false, alertDirection: false },
  { id: "secteur_3m", label: "Sectorielle 3 mois", pct: 0.3, surDevis: false, alertDirection: false },
  { id: "secteur_6m", label: "Sectorielle 6 mois", pct: 0.6, surDevis: false, alertDirection: true },
  { id: "secteur_12m", label: "Sectorielle 12 mois", pct: 1.0, surDevis: false, alertDirection: true },
  { id: "totale_1m", label: "Totale 1 mois", pct: 0.4, surDevis: false, alertDirection: true },
  { id: "totale_3m", label: "Totale 3 mois", pct: 0.8, surDevis: false, alertDirection: true },
  { id: "totale_6m", label: "Totale 6 mois", pct: 1.5, surDevis: false, alertDirection: true },
  { id: "totale_12m", label: "Totale 12 mois", pct: null, surDevis: true, alertDirection: true },
];

// ─── Modifications UGC ──────────────────────────────────────────────────────

export type UgcModifId =
  | "inclus"
  | "montage_libre"
  | "mashup"
  | "ia_technique"
  | "clonage";

export const UGC_MODIFS: {
  id: UgcModifId;
  label: string;
  /** % des droits concernés */
  pctOnRights: number | null;
  surDevis: boolean;
}[] = [
  { id: "inclus", label: "Recadrage / sous-titrage (inclus)", pctOnRights: 0, surDevis: false },
  { id: "montage_libre", label: "Montage libre / re-cut", pctOnRights: 0.2, surDevis: false },
  { id: "mashup", label: "Mash-up / œuvre dérivée", pctOnRights: 0.5, surDevis: false },
  { id: "ia_technique", label: "IA technique (sans identité)", pctOnRights: 0.5, surDevis: false },
  { id: "clonage", label: "Clonage voix / visage / avatar", pctOnRights: null, surDevis: true },
];

// ─── Buyout UGC ─────────────────────────────────────────────────────────────

export type UgcBuyoutDureeId = "3m" | "6m" | "12m" | "24m" | "sur_devis";

export const UGC_BUYOUT: Record<
  "fr" | "monde",
  Partial<Record<UgcBuyoutDureeId, number | null>>
> = {
  fr: { "3m": 1.5, "6m": 2.2, "12m": 3.0, "24m": 4.5, sur_devis: null },
  monde: { "3m": 2.2, "6m": 3.0, "12m": 4.0, "24m": 5.5, sur_devis: null },
};

export const UGC_COMMISSION_PCT = 0.3;
export const UGC_CREATOR_SHARE = 0.7;

export function ugcPriceFromNetCreator(netCreator: number): {
  prixFacture: number;
  commission: number;
} {
  const net = Math.max(0, Number(netCreator) || 0);
  const prixFacture = net / UGC_CREATOR_SHARE;
  return { prixFacture, commission: prixFacture * UGC_COMMISSION_PCT };
}

export function ugcSplitFromPrixFacture(prixFacture: number): {
  netCreator: number;
  commission: number;
} {
  const p = Math.max(0, Number(prixFacture) || 0);
  return {
    netCreator: p * UGC_CREATOR_SHARE,
    commission: p * UGC_COMMISSION_PCT,
  };
}

// ─── Calcul principal ───────────────────────────────────────────────────────

export type UgcComputeInput = {
  formatId: UgcFormatId;
  /**
   * @deprecated — préférer manualProduction / talentUgcBaseRate / followers.
   * Conservé : si > 0 et pas d’autre source, traité comme production manuelle.
   */
  baseRate?: number;
  /** Prix manuel de production valorisée (priorité 1) */
  manualProduction?: number | null;
  /** ugcBaseRate fiche talent — base standard (priorité 2) */
  talentUgcBaseRate?: number | null;
  /** Créateur sans audience → base 500 € */
  noAudience?: boolean;
  /** @deprecated */
  creatorType?: UgcCreatorType;
  followers?: number | null;
  /** Hybride : floor WL Influence off côté UGC */
  hybridMode?: boolean;
  options?: UgcProductionOptionsInput;
  usageLines?: UgcUsageLineInput[];
  influenceCachet?: number | null;
  /** @deprecated — migrer vers usageLines */
  organicLines?: UgcOrganicLineInput[];
  paid?: UgcMediaLineInput | null;
  whitelist?: UgcMediaLineInput | null;
  exclu?: UgcExcluId;
  modif?: UgcModifId;
  buyout?: { enabled: boolean; zone: "fr" | "monde"; duree: UgcBuyoutDureeId } | null;
  manualValidatedAmount?: number | null;
  excludeFraisFromCommission?: boolean;
};

export type UgcComputeResult = {
  status: "OK" | "SUR_DEVIS";
  requiresDirectionApproval: boolean;
  surDevisReasons: string[];
  totalExact: number | null;
  totalCommercial: number | null;
  productionBase: number;
  /** @deprecated — toujours 1 (audience dans la base) */
  notorietyMult: number;
  notorietyApplied: boolean;
  productionValorisee: number;
  productionResolution: UgcProductionResolution;
  optionsProduction: number;
  optionsDetail: { label: string; amount: number }[];
  usageLineResults: UgcUsageLineResult[];
  droitsUsages: number;
  droitsOrganiques: number;
  droitsPaid: number;
  droitsWhitelist: number;
  exclusivite: number;
  modifPremium: number;
  buyoutAmount: number;
  fraisReels: number;
  netCreator: number | null;
  commissionGlowUp: number | null;
  alerts: string[];
  budgetAdsMissing: boolean;
  budgetReachProvisoire: boolean;
  influenceCachetForWhitelistFloor: number | null;
  copyBlocked: boolean;
};

export function computeUgc(input: UgcComputeInput): UgcComputeResult {
  const surDevisReasons: string[] = [];
  const alerts: string[] = [];
  let budgetAdsMissing = false;
  let budgetReachProvisoire = false;

  const hybrid = Boolean(input.hybridMode);
  const noAudience = Boolean(input.noAudience);

  const production = resolveUgcProduction({
    formatId: input.formatId,
    followers: noAudience ? null : input.followers,
    manualProduction: input.manualProduction ?? null,
    talentUgcBaseRate: input.talentUgcBaseRate ?? null,
    noAudience,
  });

  if (production.surDevis && production.surDevisReason) {
    surDevisReasons.push(production.surDevisReason);
  }

  const productionValorisee = production.productionValorisee;
  const opts = computeUgcProductionOptions(
    productionValorisee,
    input.options ?? {}
  );

  // Construire usageLines depuis input moderne ou legacy
  const usageLines: UgcUsageLineInput[] = [...(input.usageLines ?? [])];

  // Legacy organic → usageLines
  for (const ol of input.organicLines ?? []) {
    const mappedId: UgcUsageId =
      ol.usageId === "site_pdp" ? "site_landing" : (ol.usageId as UgcUsageId);
    usageLines.push({
      id: ol.id,
      usageId: mappedId,
      enabled: true,
      dureeId: (ol.duree ?? "3m") as UgcUsageDureeId,
    });
  }
  if (input.paid?.enabled) {
    usageLines.push({
      id: "paid-legacy",
      usageId: "paid_brand",
      enabled: true,
      dureeId: input.paid.duree as UgcUsageDureeId,
      territoire: input.paid.territoire,
      budgetMode: input.paid.budgetMode,
      budgetAds: input.paid.budgetAds,
      reachUnique: input.paid.reachUnique,
      frequence: input.paid.frequence,
      cpm: input.paid.cpm,
    });
  }
  if (input.whitelist?.enabled) {
    usageLines.push({
      id: "wl-legacy",
      usageId: "whitelisting",
      enabled: true,
      dureeId: input.whitelist.duree as UgcUsageDureeId,
      territoire: input.whitelist.territoire,
      budgetMode: input.whitelist.budgetMode,
      budgetAds: input.whitelist.budgetAds,
    });
  }
  if (input.buyout?.enabled) {
    usageLines.push({
      id: "buyout-legacy",
      usageId: "full_buyout",
      enabled: true,
      dureeId: input.buyout.duree as UgcUsageDureeId,
      buyoutZone: input.buyout.zone,
    });
  }

  const hasBuyout = usageLines.some(
    (l) => l.enabled && l.usageId === "full_buyout"
  );

  // Buyout désactive les droits organiques redondants (pas paid/wl)
  const organicIds = new Set([
    "rs_organique",
    "site_landing",
    "ecommerce_pdp",
    "newsletter_unique",
    "newsletter_multi",
    "crm_auto",
    "interne",
    "print",
    "plv",
    "press_kit",
    "salons_events",
  ]);

  const applyWlFloor = shouldApplyUgcInfluenceWhitelistFloor(
    input.influenceCachet,
    { noAudience, hybridMode: hybrid }
  );
  const influenceCachetForWhitelistFloor = applyWlFloor
    ? Math.max(0, Number(input.influenceCachet) || 0)
    : null;
  const lineOpts: UgcUsageLineComputeOpts = {
    influenceCachet: influenceCachetForWhitelistFloor,
    applyInfluenceWhitelistFloor: applyWlFloor,
  };

  const usageLineResults: UgcUsageLineResult[] = [];
  const organicAmounts: number[] = [];
  let droitsPaid = 0;
  let droitsWhitelist = 0;
  let buyoutAmount = 0;
  let autresDroits = 0;

  for (const line of usageLines) {
    if (!line.enabled) continue;
    if (hasBuyout && organicIds.has(line.usageId) && line.usageId !== "full_buyout") {
      alerts.push(`Buyout actif : ${line.usageId} désactivé (redondant)`);
      continue;
    }
    // Hybride : paid/wl UGC désactivés (passent par Influence)
    if (
      hybrid &&
      (line.usageId === "paid_brand" || line.usageId === "whitelisting")
    ) {
      alerts.push(
        `${line.usageId} UGC ignoré en hybride — utiliser le moteur Influence`
      );
      continue;
    }

    const res = computeUgcUsageLine(productionValorisee, line, lineOpts);
    usageLineResults.push(res);

    if (res.status === "SUR_DEVIS") {
      surDevisReasons.push(`${res.label} — SUR_DEVIS`);
      continue;
    }
    if (res.status === "MISSING_BUDGET") {
      budgetAdsMissing = true;
      alerts.push(
        `${res.label} : budget contractuel manquant — saisissez le budget ads max ou passez en « Budget inconnu — minimum garanti ».`
      );
    }
    if (res.amount == null || res.amount <= 0) continue;

    if (line.usageId === "paid_brand") {
      droitsPaid += res.amount;
      if (line.budgetMode === "reach") budgetReachProvisoire = true;
    } else if (line.usageId === "whitelisting") {
      droitsWhitelist += res.amount;
      if (line.budgetMode === "reach") budgetReachProvisoire = true;
    } else if (line.usageId === "full_buyout") {
      buyoutAmount += res.amount;
    } else if (organicIds.has(line.usageId)) {
      organicAmounts.push(res.amount);
    } else {
      // retail_media etc. — hors dégressivité organique
      autresDroits += res.amount;
      if (
        line.usageId === "retail_media" &&
        line.budgetMode === "contractuel" &&
        !(line.budgetAds && line.budgetAds > 0)
      ) {
        budgetAdsMissing = true;
      }
    }
  }

  const droitsOrganiques = applyOrganicDegressivite(organicAmounts);
  const droitsUsages =
    droitsOrganiques + droitsPaid + droitsWhitelist + buyoutAmount + autresDroits;

  if (
    droitsPaid > 0 &&
    droitsWhitelist > 0 &&
    droitsWhitelist < droitsPaid
  ) {
    alerts.push("Whitelisting inférieur au paid — vérifier durée/territoire/budget");
  }

  // Exclu
  const excluMeta =
    UGC_EXCLUSIVITES.find((e) => e.id === (input.exclu ?? "aucune")) ??
    UGC_EXCLUSIVITES[0];
  if (excluMeta.surDevis) surDevisReasons.push(`Exclusivité ${excluMeta.label}`);
  if (excluMeta.alertDirection) {
    alerts.push("Exclusivité longue / totale — validation direction");
  }
  const exclusivite =
    excluMeta.pct != null ? productionValorisee * excluMeta.pct : 0;

  const modifMeta =
    UGC_MODIFS.find((m) => m.id === (input.modif ?? "inclus")) ?? UGC_MODIFS[0];
  if (modifMeta.surDevis) {
    surDevisReasons.push(modifMeta.label);
  }
  const rightsBase = droitsUsages;
  const modifPremium =
    modifMeta.pctOnRights != null ? rightsBase * modifMeta.pctOnRights : 0;

  const isSurDevis = surDevisReasons.length > 0;
  const manual = Math.max(0, Number(input.manualValidatedAmount) || 0);
  const copyBlocked =
    (isSurDevis && manual <= 0) || budgetAdsMissing;

  if (isSurDevis && manual <= 0) {
    return {
      status: "SUR_DEVIS",
      requiresDirectionApproval: true,
      surDevisReasons,
      totalExact: null,
      totalCommercial: null,
      productionBase: production.standardBase ?? productionValorisee,
      notorietyMult: 1,
      notorietyApplied: false,
      productionValorisee,
      productionResolution: production,
      optionsProduction: opts.optionsProduction,
      optionsDetail: opts.detail,
      usageLineResults,
      droitsUsages,
      droitsOrganiques,
      droitsPaid,
      droitsWhitelist,
      exclusivite,
      modifPremium,
      buyoutAmount,
      fraisReels: opts.fraisReels,
      netCreator: null,
      commissionGlowUp: null,
      alerts,
      budgetAdsMissing,
      budgetReachProvisoire,
      influenceCachetForWhitelistFloor,
      copyBlocked: true,
    };
  }

  const totalExact =
    isSurDevis && manual > 0
      ? manual
      : productionValorisee +
        opts.optionsProduction +
        droitsUsages +
        exclusivite +
        modifPremium +
        opts.fraisReels;

  const totalCommercial = roundCession(totalExact);
  const commissionBase = input.excludeFraisFromCommission
    ? Math.max(0, totalCommercial - opts.fraisReels)
    : totalCommercial;
  const split = ugcSplitFromPrixFacture(commissionBase);

  return {
    status: "OK",
    requiresDirectionApproval: isSurDevis,
    surDevisReasons,
    totalExact,
    totalCommercial,
    productionBase: production.standardBase ?? productionValorisee,
    notorietyMult: 1,
    notorietyApplied: false,
    productionValorisee,
    productionResolution: production,
    optionsProduction: opts.optionsProduction,
    optionsDetail: opts.detail,
    usageLineResults,
    droitsUsages,
    droitsOrganiques,
    droitsPaid,
    droitsWhitelist,
    exclusivite,
    modifPremium,
    buyoutAmount,
    fraisReels: opts.fraisReels,
    netCreator: split.netCreator,
    commissionGlowUp: split.commission,
    alerts,
    budgetAdsMissing,
    budgetReachProvisoire,
    influenceCachetForWhitelistFloor,
    copyBlocked,
  };
}

export function formatUgcMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}
