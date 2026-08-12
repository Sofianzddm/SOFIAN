/**
 * Simulateur Snapchat — 3 étages strictement séparés.
 *
 * 1. computeBase  → € organique seul (CPM + multiplicateurs format)
 * 2. computeUplift → coefficient décimal = somme additive des droits
 * 3. computeTotal  → € final + statut
 *
 * total = base * (1 + somme_des_uplifts)
 * Les uplifts s’ADDITIONNENT. Aucune composition multiplicative.
 * Le CPM reste exclusivement l’étage 1.
 */

import {
  LICENSE_DURATION,
  LICENSE_DURATION_RANK,
  LINK_ATTACHMENT,
  REUSE_RIGHTS,
  REUSE_RIGHTS_RANK,
  RUSH_72H,
  SAVED_STORY,
  SECTOR_EXCLUSIVITY,
  SPOTLIGHT_RETENTION,
  STRICT_BRIEF,
  TOTAL_AUTO_MAX,
  UPLIFT_SUM_AUTO_MAX,
  WHITELISTING,
  WHITELISTING_MEDIA_BUDGET_PCT,
  type LicenseDurationId,
  type ReuseRightsId,
  type SectorExclusivityId,
  type WhitelistingId,
} from "@/lib/pricing-rights.config";

/** Story organique — ~3× un CPM ads Story médian FR (~7 €). */
export const STORY_CPM = 22;
/** Spotlight organique — inventaire plus froid, ~½ Story. */
export const SPOTLIGHT_CPM = 10;
/** Plancher collab Snapchat FR. */
export const SNAPCHAT_FLOOR = 300;

export const STORY_AUTO_MAX = 8_000;
export const SPOTLIGHT_AUTO_MAX = 12_000;
export const PACKAGE_AUTO_MAX = 15_000;

export const STORY_VIEWERS_WARN = 100_000;
export const SPOTLIGHT_VIEWS_WARN = 300_000;

export const SNAPCHAT_MARKET_NOTE =
  "Référentiel Glow Up moyenne haute : Story CPM 22 € · Spotlight CPM 10 € (organique seul). Droits en uplift additif séparés.";

export const SNAPCHAT_PUBLICATION_DISCLAIMER =
  "Cachet Snapchat HT = organique (étage 1) ± droits (étage 2). Hors boost pub / cession hors grille / frais exceptionnels non listés.";

export const SNAPCHAT_VIEWS_HINT =
  "Saisir les performances moyennes habituelles du créateur, pas une performance virale exceptionnelle.";

export type SnapchatPlatform = "story" | "spotlight";
export type SnapchatStatus = "OK" | "SUR_DEVIS";
export type SpotlightProduction = "simple" | "premium";

export type StorysetBand =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6_8"
  | "sur_devis";

export type CompletionBand =
  | "non_renseignee"
  | "lt_35"
  | "35_55"
  | "55_70"
  | "gte_70";

export type SpotlightDurationBand = "lte_30" | "31_60" | "gt_60";

// ─── Étape 1 — Base organique ───────────────────────────────────────────────

export type ComputeBaseInput = {
  platform: SnapchatPlatform;
  volume: number;
  /** Story : nombre de Snaps. Ignoré pour Spotlight. */
  snapCount?: number;
  completionRate?: number | null;
  durationSeconds?: number;
  production?: SpotlightProduction;
};

export type BaseResult = {
  platform: SnapchatPlatform;
  cpm: number;
  volume: number;
  base: number;
  status: SnapchatStatus;
  indicativeBase: number;
  warnings: string[];
  formatMultipliers: { label: string; value: string }[];
  /** Détail Story */
  storysetBand?: StorysetBand;
  storysetMultiplier?: number | null;
  completionBand?: CompletionBand;
  completionMultiplier?: number;
  /** Détail Spotlight */
  durationBand?: SpotlightDurationBand;
  durationMultiplier?: number;
  production?: SpotlightProduction;
  productionMultiplier?: number;
};

export function resolveStorysetBand(snapsCount: number): StorysetBand {
  const n = Math.floor(Number(snapsCount) || 0);
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  if (n === 4) return "4";
  if (n === 5) return "5";
  if (n >= 6 && n <= 8) return "6_8";
  return "sur_devis";
}

export function storysetMultiplier(band: StorysetBand): number | null {
  switch (band) {
    case "1":
      return 0.6;
    case "2":
      return 0.8;
    case "3":
      return 1;
    case "4":
      return 1.2;
    case "5":
      return 1.35;
    case "6_8":
      return 1.75;
    case "sur_devis":
      return null;
  }
}

export function resolveCompletionBand(
  completionRate: number | null | undefined
): CompletionBand {
  if (completionRate == null || !Number.isFinite(completionRate)) {
    return "non_renseignee";
  }
  if (completionRate < 35) return "lt_35";
  if (completionRate < 55) return "35_55";
  if (completionRate < 70) return "55_70";
  return "gte_70";
}

export function completionMultiplier(band: CompletionBand): number {
  switch (band) {
    case "non_renseignee":
      return 1;
    case "lt_35":
      return 0.9;
    case "35_55":
      return 1;
    case "55_70":
      return 1.1;
    case "gte_70":
      return 1.2;
  }
}

export function resolveSpotlightDurationBand(
  durationSeconds: number
): SpotlightDurationBand {
  const d = Number(durationSeconds) || 0;
  if (d <= 30) return "lte_30";
  if (d <= 60) return "31_60";
  return "gt_60";
}

export function spotlightDurationMultiplier(
  band: SpotlightDurationBand
): number {
  switch (band) {
    case "lte_30":
      return 1;
    case "31_60":
      return 1.2;
    case "gt_60":
      return 1.4;
  }
}

export function spotlightProductionMultiplier(
  production: SpotlightProduction
): number {
  return production === "premium" ? 1.2 : 1;
}

function formatMult(n: number): string {
  return `×${String(n).replace(".", ",")}`;
}

/**
 * Étape 1 — organique seul.
 * computeBase(platform, volume, snapCount) → € organique.
 */
export function computeBase(
  platform: SnapchatPlatform,
  volume: number,
  snapCount?: number,
  extras?: Omit<ComputeBaseInput, "platform" | "volume" | "snapCount">
): BaseResult;
export function computeBase(input: ComputeBaseInput): BaseResult;
export function computeBase(
  platformOrInput: SnapchatPlatform | ComputeBaseInput,
  volume?: number,
  snapCount?: number,
  extras?: Omit<ComputeBaseInput, "platform" | "volume" | "snapCount">
): BaseResult {
  const input: ComputeBaseInput =
    typeof platformOrInput === "string"
      ? {
          platform: platformOrInput,
          volume: volume ?? 0,
          snapCount,
          ...extras,
        }
      : platformOrInput;

  const vol = Math.max(0, Number(input.volume) || 0);
  const warnings: string[] = [];

  if (input.platform === "story") {
    const snaps = Math.max(0, Math.floor(Number(input.snapCount) || 0));
    const storysetBand = resolveStorysetBand(snaps);
    const setMult = storysetMultiplier(storysetBand);
    const completionBand = resolveCompletionBand(input.completionRate);
    const compMult = completionMultiplier(completionBand);
    const cpm = STORY_CPM;
    const rawFloor = Math.max((vol / 1000) * cpm, SNAPCHAT_FLOOR);
    const formatMultipliers = [
      {
        label: "Storyset",
        value:
          setMult == null
            ? "SUR_DEVIS (> 8 Snaps)"
            : `${formatMult(setMult)} (${snaps || "—"} Snap${snaps > 1 ? "s" : ""})`,
      },
      { label: "Complétion", value: formatMult(compMult) },
    ];

    if (vol > STORY_VIEWERS_WARN) {
      warnings.push(
        "Volume Story élevé — confirmer la moyenne habituelle (pas viral)."
      );
    }

    if (setMult == null) {
      return {
        platform: "story",
        cpm,
        volume: vol,
        base: 0,
        status: "SUR_DEVIS",
        indicativeBase: 0,
        warnings: [
          ...warnings,
          "Storyset de plus de 8 Snaps — devis direction obligatoire",
        ],
        formatMultipliers,
        storysetBand,
        storysetMultiplier: null,
        completionBand,
        completionMultiplier: compMult,
      };
    }

    const indicativeBase = rawFloor * setMult * compMult;
    const overCap = indicativeBase > STORY_AUTO_MAX;
    if (overCap) {
      warnings.push(
        `Plafond auto Story ${STORY_AUTO_MAX} € HT dépassé (formule ≈ ${Math.round(indicativeBase)} €)`
      );
    }

    return {
      platform: "story",
      cpm,
      volume: vol,
      base: overCap ? 0 : indicativeBase,
      status: overCap ? "SUR_DEVIS" : "OK",
      indicativeBase,
      warnings,
      formatMultipliers,
      storysetBand,
      storysetMultiplier: setMult,
      completionBand,
      completionMultiplier: compMult,
    };
  }

  // Spotlight
  const durationSeconds = Math.max(0, Number(input.durationSeconds) || 0);
  const production = input.production === "premium" ? "premium" : "simple";
  const durationBand = resolveSpotlightDurationBand(durationSeconds);
  const durMult = spotlightDurationMultiplier(durationBand);
  const prodMult = spotlightProductionMultiplier(production);
  const cpm = SPOTLIGHT_CPM;
  const rawFloor = Math.max((vol / 1000) * cpm, SNAPCHAT_FLOOR);
  const indicativeBase = rawFloor * durMult * prodMult;
  const formatMultipliers = [
    {
      label: "Durée",
      value: `${formatMult(durMult)} (${durationSeconds || "—"} s)`,
    },
    {
      label: "Production",
      value:
        production === "premium"
          ? `${formatMult(prodMult)} (premium)`
          : `${formatMult(prodMult)} (simple)`,
    },
  ];

  if (vol > SPOTLIGHT_VIEWS_WARN) {
    warnings.push(
      "Volume Spotlight élevé — confirmer la moyenne habituelle (pas viral)."
    );
  }

  const overCap = indicativeBase > SPOTLIGHT_AUTO_MAX;
  if (overCap) {
    warnings.push(
      `Plafond auto Spotlight ${SPOTLIGHT_AUTO_MAX} € HT dépassé (formule ≈ ${Math.round(indicativeBase)} €)`
    );
  }

  return {
    platform: "spotlight",
    cpm,
    volume: vol,
    base: overCap ? 0 : indicativeBase,
    status: overCap ? "SUR_DEVIS" : "OK",
    indicativeBase,
    warnings,
    formatMultipliers,
    durationBand,
    durationMultiplier: durMult,
    production,
    productionMultiplier: prodMult,
  };
}

// ─── Étape 2 — Uplifts droits (additifs) ─────────────────────────────────────

export type RightsOptions = {
  reuseRights?: ReuseRightsId;
  licenseDuration?: LicenseDurationId;
  whitelisting?: WhitelistingId;
  sectorExclusivity?: SectorExclusivityId;
  linkAttachment?: boolean;
  savedStory?: boolean;
  spotlightRetention?: boolean;
  rush72h?: boolean;
  strictBrief?: boolean;
  /** Budget média € HT — pour whitelisting max(forfait, 12 %). */
  mediaBudget?: number | null;
  /** Éligibilité lien Snapchat du créateur. */
  creator?: { isLinkEligible?: boolean };
};

export type UpliftLine = {
  label: string;
  rate: number;
  amount: number;
};

export type UpliftResult = {
  upliftSum: number;
  lines: UpliftLine[];
  status: SnapchatStatus;
  warnings: string[];
};

export class SnapchatRightsConfigError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(" · "));
    this.name = "SnapchatRightsConfigError";
    this.errors = errors;
  }
}

/**
 * Garde-fous de configuration — lève SnapchatRightsConfigError, ne chiffre pas.
 */
export function validateRightsOptions(options: RightsOptions): void {
  const errors: string[] = [];
  const reuse = options.reuseRights ?? "none";
  const license = options.licenseDuration ?? "m1";
  const whitelist = options.whitelisting ?? "none";

  if (whitelist !== "none") {
    if (REUSE_RIGHTS_RANK[reuse] < REUSE_RIGHTS_RANK.owned) {
      errors.push(
        "Whitelisting exige reuseRights ≥ owned (droits marque minimum)"
      );
    }
    if (LICENSE_DURATION_RANK[license] < LICENSE_DURATION_RANK.m3) {
      errors.push(
        "Whitelisting exige licenseDuration ≥ m3 (3 mois minimum)"
      );
    }
  }

  if (license !== "m1" && reuse === "none") {
    errors.push(
      "Une durée de licence > 1 mois exige reuseRights ≠ none"
    );
  }

  if (options.linkAttachment && options.creator?.isLinkEligible !== true) {
    errors.push(
      "linkAttachment indisponible : creator.isLinkEligible doit être true"
    );
  }

  if (errors.length > 0) {
    throw new SnapchatRightsConfigError(errors);
  }
}

/**
 * Étape 2 — somme additive des uplifts (coefficient décimal).
 * Ne touche pas au CPM. `base` sert uniquement au calcul des amounts devis.
 */
export function computeUplift(
  options: RightsOptions,
  base: number
): UpliftResult {
  validateRightsOptions(options);

  const lines: UpliftLine[] = [];
  const warnings: string[] = [];
  let upliftSum = 0;
  let status: SnapchatStatus = "OK";

  const reuse = options.reuseRights ?? "none";
  const license = options.licenseDuration ?? "m1";
  const whitelist = options.whitelisting ?? "none";
  const exclu = options.sectorExclusivity ?? "none";

  const push = (label: string, rate: number, amount = base * rate) => {
    if (rate === 0 && amount === 0) return;
    lines.push({ label, rate, amount });
    upliftSum += rate;
  };

  if (reuse !== "none") {
    push(
      reuse === "owned" ? "Droits marque (owned)" : "Droits tiers",
      REUSE_RIGHTS[reuse]
    );
  }

  if (license === "perpetual") {
    status = "SUR_DEVIS";
    warnings.push("Licence perpétuelle — SUR_DEVIS (non chiffrée auto)");
  } else if (license !== "m1") {
    const rate = LICENSE_DURATION[license];
    if (typeof rate === "number") {
      push(`Licence ${license.replace("m", "")} mois`, rate);
    }
  }

  if (whitelist !== "none") {
    const flatRate = WHITELISTING[whitelist];
    const flatAmount = base * flatRate;
    const budget = Math.max(0, Number(options.mediaBudget) || 0);
    if (budget > 0) {
      const budgetAmount = budget * WHITELISTING_MEDIA_BUDGET_PCT;
      const amount = Math.max(flatAmount, budgetAmount);
      const effectiveRate = base > 0 ? amount / base : flatRate;
      lines.push({
        label:
          amount > flatAmount
            ? `Whitelisting ${whitelist} (12 % budget média)`
            : `Whitelisting ${whitelist}`,
        rate: effectiveRate,
        amount,
      });
      upliftSum += effectiveRate;
    } else {
      push(`Whitelisting ${whitelist}`, flatRate);
    }
  }

  if (exclu !== "none") {
    push(
      `Exclusivité secteur ${exclu.replace("m", "")} mois`,
      SECTOR_EXCLUSIVITY[exclu]
    );
  }

  if (options.linkAttachment) {
    push("Lien / attachment", LINK_ATTACHMENT);
  }
  if (options.savedStory) {
    push("Story sauvegardée", SAVED_STORY);
  }
  if (options.spotlightRetention) {
    push("Rétention Spotlight", SPOTLIGHT_RETENTION);
  }
  if (options.rush72h) {
    push("Rush 72 h", RUSH_72H);
  }
  if (options.strictBrief) {
    push("Brief strict", STRICT_BRIEF);
  }

  if (upliftSum > UPLIFT_SUM_AUTO_MAX) {
    status = "SUR_DEVIS";
    warnings.push(
      `Somme des uplifts ${upliftSum.toFixed(2)} > ${UPLIFT_SUM_AUTO_MAX} — SUR_DEVIS`
    );
  }

  return { upliftSum, lines, status, warnings };
}

// ─── Étape 3 — Total ────────────────────────────────────────────────────────

export type PricingQuote = {
  base: number;
  upliftBreakdown: UpliftLine[];
  upliftSum: number;
  subtotal: number;
  total: number;
  /** Arrondi commercial Glow Up */
  totalCommercial: number;
  status: SnapchatStatus;
  warnings: string[];
  /** Montants indicatifs si SUR_DEVIS */
  indicativeTotal: number | null;
};

export function roundSnapchatCommercial(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const cleaned = Math.round(n * 100) / 100;
  const step = cleaned > 10_000 ? 100 : 50;
  return Math.ceil(cleaned / step - Number.EPSILON) * step;
}

/**
 * Étape 3 — total = base * (1 + upliftSum), floor 300, plafonds SUR_DEVIS.
 */
export function computeTotal(
  baseResult: BaseResult,
  upliftResult: UpliftResult
): PricingQuote {
  const warnings = [...baseResult.warnings, ...upliftResult.warnings];
  const baseForCalc =
    baseResult.status === "OK" ? baseResult.base : baseResult.indicativeBase;
  const upliftSum = upliftResult.upliftSum;
  const subtotal = baseForCalc * (1 + upliftSum);
  let total = subtotal;
  if (total > 0 && total < SNAPCHAT_FLOOR) {
    total = SNAPCHAT_FLOOR;
    warnings.push(`Floor ${SNAPCHAT_FLOOR} € HT appliqué`);
  }

  let status: SnapchatStatus = "OK";
  if (baseResult.status === "SUR_DEVIS") status = "SUR_DEVIS";
  if (upliftResult.status === "SUR_DEVIS") status = "SUR_DEVIS";
  if (total > TOTAL_AUTO_MAX) {
    status = "SUR_DEVIS";
    warnings.push(
      `Total ${Math.round(total)} € > plafond ${TOTAL_AUTO_MAX} € — SUR_DEVIS`
    );
  }

  const commercial = roundSnapchatCommercial(total);

  // Breakdown amounts recalculés sur la base utilisée
  const upliftBreakdown = upliftResult.lines.map((l) => ({
    ...l,
    amount: baseForCalc * l.rate,
  }));

  return {
    base: baseResult.status === "OK" ? baseResult.base : 0,
    upliftBreakdown,
    upliftSum,
    subtotal,
    total: status === "OK" ? total : 0,
    totalCommercial: status === "OK" ? commercial : 0,
    status,
    warnings,
    indicativeTotal: status === "SUR_DEVIS" ? total : null,
  };
}

/**
 * Pipeline complet : base → uplift → total.
 * Lève SnapchatRightsConfigError si options invalides.
 */
export function computeSnapchatQuote(input: {
  platform: SnapchatPlatform;
  volume: number;
  snapCount?: number;
  completionRate?: number | null;
  durationSeconds?: number;
  production?: SpotlightProduction;
  rights?: RightsOptions;
}): PricingQuote & { baseDetail: BaseResult } {
  const baseDetail = computeBase({
    platform: input.platform,
    volume: input.volume,
    snapCount: input.snapCount,
    completionRate: input.completionRate,
    durationSeconds: input.durationSeconds,
    production: input.production,
  });
  const baseForUplift =
    baseDetail.status === "OK" ? baseDetail.base : baseDetail.indicativeBase;
  const uplift = computeUplift(input.rights ?? {}, baseForUplift);
  const quote = computeTotal(baseDetail, uplift);
  return { ...quote, baseDetail };
}

export function formatSnapchatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

// ─── Compat UI existante (organique, sans droits) ───────────────────────────

export type SnapchatMoneyOk = {
  status: "OK";
  exact: number;
  commercial: number;
};

export type SnapchatMoneySurDevis = {
  status: "SUR_DEVIS";
  exact: null;
  commercial: null;
  reason: string;
};

export type SnapchatMoney = SnapchatMoneyOk | SnapchatMoneySurDevis;

export type StoryPricingInput = {
  viewersMoyens: number;
  snapsCount: number;
  completionRate?: number | null;
};

export type SpotlightPricingInput = {
  vuesMoyennes: number;
  durationSeconds: number;
  production: SpotlightProduction;
};

export type StoryPricingDetail = {
  kind: "story";
  cpm: typeof STORY_CPM;
  viewersMoyens: number;
  snapsCount: number;
  storysetBand: StorysetBand;
  storysetMultiplier: number | null;
  completionBand: CompletionBand;
  completionMultiplier: number;
  storyBase: number;
  indicativeExact: number | null;
  volumeWarning: boolean;
  price: SnapchatMoney;
  multipliers: { label: string; value: string }[];
};

export type SpotlightPricingDetail = {
  kind: "spotlight";
  cpm: typeof SPOTLIGHT_CPM;
  vuesMoyennes: number;
  durationSeconds: number;
  durationBand: SpotlightDurationBand;
  durationMultiplier: number;
  production: SpotlightProduction;
  productionMultiplier: number;
  spotlightBase: number;
  indicativeExact: number | null;
  volumeWarning: boolean;
  price: SnapchatMoney;
  multipliers: { label: string; value: string }[];
};

export type SnapchatPackageInput = {
  includeStory: boolean;
  includeSpotlight: boolean;
  story?: StoryPricingInput | null;
  spotlight?: SpotlightPricingInput | null;
  rights?: RightsOptions;
};

export type SnapchatPackageResult = {
  story: StoryPricingDetail | null;
  spotlight: SpotlightPricingDetail | null;
  package: SnapchatMoney | null;
  total: SnapchatMoney | null;
  quote: PricingQuote | null;
  disclaimer: string;
};

function moneyOk(exact: number): SnapchatMoneyOk {
  return {
    status: "OK",
    exact,
    commercial: roundSnapchatCommercial(exact),
  };
}

function moneySurDevis(reason: string): SnapchatMoneySurDevis {
  return {
    status: "SUR_DEVIS",
    exact: null,
    commercial: null,
    reason,
  };
}

export function computeStoryPrice(
  input: StoryPricingInput
): StoryPricingDetail {
  const b = computeBase("story", input.viewersMoyens, input.snapsCount, {
    completionRate: input.completionRate,
  });
  return {
    kind: "story",
    cpm: STORY_CPM,
    viewersMoyens: input.viewersMoyens,
    snapsCount: input.snapsCount,
    storysetBand: b.storysetBand!,
    storysetMultiplier: b.storysetMultiplier ?? null,
    completionBand: b.completionBand!,
    completionMultiplier: b.completionMultiplier ?? 1,
    storyBase: Math.max(
      (Math.max(0, input.viewersMoyens) / 1000) * STORY_CPM,
      SNAPCHAT_FLOOR
    ),
    indicativeExact: b.indicativeBase,
    volumeWarning: b.warnings.some((w) => w.includes("Volume")),
    price:
      b.status === "OK"
        ? moneyOk(b.base)
        : moneySurDevis(b.warnings.join(" · ") || "SUR_DEVIS"),
    multipliers: b.formatMultipliers,
  };
}

export function computeSpotlightPrice(
  input: SpotlightPricingInput
): SpotlightPricingDetail {
  const b = computeBase("spotlight", input.vuesMoyennes, undefined, {
    durationSeconds: input.durationSeconds,
    production: input.production,
  });
  return {
    kind: "spotlight",
    cpm: SPOTLIGHT_CPM,
    vuesMoyennes: input.vuesMoyennes,
    durationSeconds: input.durationSeconds,
    durationBand: b.durationBand!,
    durationMultiplier: b.durationMultiplier ?? 1,
    production: input.production,
    productionMultiplier: b.productionMultiplier ?? 1,
    spotlightBase: Math.max(
      (Math.max(0, input.vuesMoyennes) / 1000) * SPOTLIGHT_CPM,
      SNAPCHAT_FLOOR
    ),
    indicativeExact: b.indicativeBase,
    volumeWarning: b.warnings.some((w) => w.includes("Volume")),
    price:
      b.status === "OK"
        ? moneyOk(b.base)
        : moneySurDevis(b.warnings.join(" · ") || "SUR_DEVIS"),
    multipliers: b.formatMultipliers,
  };
}

export function computeSnapchatPackage(
  input: SnapchatPackageInput
): SnapchatPackageResult {
  const story =
    input.includeStory && input.story
      ? computeStoryPrice(input.story)
      : null;
  const spotlight =
    input.includeSpotlight && input.spotlight
      ? computeSpotlightPrice(input.spotlight)
      : null;

  let organicBase = 0;
  let organicStatus: SnapchatStatus = "OK";
  let organicIndicative = 0;
  let platform: SnapchatPlatform = "story";
  const warnings: string[] = [];

  const storyOk = story?.price.status === "OK" ? story.price.exact : null;
  const spotlightOk =
    spotlight?.price.status === "OK" ? spotlight.price.exact : null;

  if (story && spotlight) {
    if (story.price.status === "SUR_DEVIS" || spotlight.price.status === "SUR_DEVIS") {
      organicStatus = "SUR_DEVIS";
      organicIndicative =
        (story.indicativeExact ?? 0) + (spotlight.indicativeExact ?? 0);
      warnings.push(
        story.price.status === "SUR_DEVIS"
          ? story.price.reason
          : spotlight.price.status === "SUR_DEVIS"
            ? spotlight.price.reason
            : "SUR_DEVIS"
      );
    } else if (storyOk != null && spotlightOk != null) {
      const hi = Math.max(storyOk, spotlightOk);
      const lo = Math.min(storyOk, spotlightOk);
      organicBase = hi + lo * 0.9;
      organicIndicative = organicBase;
      if (organicBase > PACKAGE_AUTO_MAX) {
        organicStatus = "SUR_DEVIS";
        warnings.push(`Plafond package ${PACKAGE_AUTO_MAX} € dépassé`);
      }
    }
    platform = "story";
  } else if (story) {
    platform = "story";
    if (story.price.status === "OK") {
      organicBase = story.price.exact;
      organicIndicative = organicBase;
    } else {
      organicStatus = "SUR_DEVIS";
      organicIndicative = story.indicativeExact ?? 0;
      warnings.push(
        story.price.status === "SUR_DEVIS" ? story.price.reason : "SUR_DEVIS"
      );
    }
  } else if (spotlight) {
    platform = "spotlight";
    if (spotlight.price.status === "OK") {
      organicBase = spotlight.price.exact;
      organicIndicative = organicBase;
    } else {
      organicStatus = "SUR_DEVIS";
      organicIndicative = spotlight.indicativeExact ?? 0;
      warnings.push(
        spotlight.price.status === "SUR_DEVIS"
          ? spotlight.price.reason
          : "SUR_DEVIS"
      );
    }
  } else {
    return {
      story: null,
      spotlight: null,
      package: null,
      total: null,
      quote: null,
      disclaimer: SNAPCHAT_PUBLICATION_DISCLAIMER,
    };
  }

  const baseResult: BaseResult = {
    platform,
    cpm: platform === "story" ? STORY_CPM : SPOTLIGHT_CPM,
    volume: 0,
    base: organicStatus === "OK" ? organicBase : 0,
    status: organicStatus,
    indicativeBase: organicIndicative,
    warnings,
    formatMultipliers: [],
  };

  let quote: PricingQuote | null = null;
  try {
    const uplift = computeUplift(
      input.rights ?? {},
      organicStatus === "OK" ? organicBase : organicIndicative
    );
    quote = computeTotal(baseResult, uplift);
  } catch (e) {
    if (e instanceof SnapchatRightsConfigError) {
      quote = {
        base: organicStatus === "OK" ? organicBase : 0,
        upliftBreakdown: [],
        upliftSum: 0,
        subtotal: 0,
        total: 0,
        totalCommercial: 0,
        status: "SUR_DEVIS",
        warnings: e.errors,
        indicativeTotal: null,
      };
    } else {
      throw e;
    }
  }

  const totalMoney: SnapchatMoney | null = quote
    ? quote.status === "OK"
      ? moneyOk(quote.total)
      : moneySurDevis(quote.warnings.join(" · ") || "SUR_DEVIS")
    : null;

  const packageMoney =
    story && spotlight
      ? totalMoney
      : null;

  return {
    story,
    spotlight,
    package: packageMoney,
    total: totalMoney,
    quote,
    disclaimer: SNAPCHAT_PUBLICATION_DISCLAIMER,
  };
}
