// Moteur de calcul EMV (Earned Media Value) partagé entre le builder et le deck public.
// Méthode (marché France 2026) : EMV = Reach estimé ÷ 1000 × CPM du format.
// Un seul chiffre d'EMV par livrable. Le CPM dépend du type de contenu (story, reel, post…).
// La valeur saisie à la main (mediaValue) reste prioritaire (override) ligne par ligne.

export type EmvConfig = {
  // CPM (€ / 1000 personnes touchées) par type de contenu.
  formatCpm: {
    story: number;
    reel: number;
    post: number;
    carrousel: number;
    tiktok: number;
    ytShort: number;
    ytVideo: number;
    default: number;
  };
  // Repli quand le reach moyen du créateur n'est pas renseigné : reach = abonnés × ce taux.
  defaultReachRate: number;
};

export const DEFAULT_EMV_CONFIG: EmvConfig = {
  formatCpm: {
    story: 7,
    reel: 20,
    post: 16,
    carrousel: 17,
    tiktok: 20,
    ytShort: 22,
    ytVideo: 40,
    default: 20,
  },
  defaultReachRate: 0.6,
};

export function resolveEmvConfig(partial?: Partial<EmvConfig> | null): EmvConfig {
  if (!partial || typeof partial !== "object") return DEFAULT_EMV_CONFIG;
  return {
    formatCpm: {
      ...DEFAULT_EMV_CONFIG.formatCpm,
      ...((partial.formatCpm as EmvConfig["formatCpm"]) || {}),
    },
    defaultReachRate:
      typeof partial.defaultReachRate === "number"
        ? partial.defaultReachRate
        : DEFAULT_EMV_CONFIG.defaultReachRate,
  };
}

export function cpmForFormat(
  format: string | null | undefined,
  platform: string | null | undefined,
  config: EmvConfig
): number {
  const f = `${format || ""} ${platform || ""}`.toLowerCase();
  if (/story|stories|storie/.test(f)) return config.formatCpm.story;
  if (/carrousel|carousel/.test(f)) return config.formatCpm.carrousel;
  if (/short/.test(f)) return config.formatCpm.ytShort;
  if (/reel|réel/.test(f)) return config.formatCpm.reel;
  if (/tiktok|tik tok/.test(f)) return config.formatCpm.tiktok;
  if (/youtube|yt|vidéo|video/.test(f)) return config.formatCpm.ytVideo;
  if (/post|feed|photo|publication/.test(f)) return config.formatCpm.post;
  return config.formatCpm.default;
}

export type PlatformGroup = "instagram" | "tiktok" | "youtube";

// Détermine la plateforme du livrable pour choisir le bon reach (IG vs TikTok vs YouTube).
export function platformGroupFor(
  format: string | null | undefined,
  platform: string | null | undefined
): PlatformGroup {
  const f = `${format || ""} ${platform || ""}`.toLowerCase();
  if (/tiktok|tik tok/.test(f)) return "tiktok";
  if (/youtube|yt|short/.test(f)) return "youtube";
  return "instagram";
}

export type EmvDeliverableInput = {
  talent?: string | null;
  format?: string | null;
  platform?: string | null;
  quantity?: number | null;
  mediaValue?: number | null;
  reach?: number | null; // reach saisi directement sur le livrable (prioritaire)
};

export type EmvCastingInput = {
  name: string;
  followers?: number | null;
  engagement?: number | null; // en pourcentage, ex: 4.8
  reach?: number | null; // legacy : reach moyen Instagram par contenu
  reachInstagram?: number | null; // reach moyen Instagram par contenu
  reachTiktok?: number | null; // reach moyen TikTok par contenu
};

export type EmvLineResult = {
  reach: number; // personnes touchées totales (reach moyen × quantité)
  cpm: number; // CPM appliqué selon le format
  interactions: number;
  emv: number; // calcul automatique
  override: number | null; // valeur saisie à la main
  retained: number; // override ?? emv
  matched: boolean; // a-t-on de quoi calculer ?
  estimated: boolean; // reach déduit des abonnés (pas de reach moyen renseigné)
  platform: PlatformGroup; // plateforme retenue pour le reach
  missingReach: boolean; // reach de la plateforme manquant → ne rien afficher
};

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

export function computeLineEmv(
  deliverable: EmvDeliverableInput,
  casting: EmvCastingInput[],
  config: EmvConfig
): EmvLineResult {
  const target = norm(deliverable.talent);
  const member = target
    ? casting.find((c) => norm(c.name) === target) ||
      casting.find((c) => target && norm(c.name) && norm(c.name).includes(target))
    : undefined;

  const engagementPct = Number(member?.engagement) || 0;
  const followers = Number(member?.followers) || 0;
  const qty = Number(deliverable.quantity) || 1;
  const cpm = cpmForFormat(deliverable.format, deliverable.platform, config);
  const platform = platformGroupFor(deliverable.format, deliverable.platform);

  // Le reach saisi directement sur le livrable est toujours prioritaire.
  const ownReach =
    deliverable.reach !== null && deliverable.reach !== undefined ? Number(deliverable.reach) || 0 : null;

  let perContentReach = 0;
  let estimated = false;
  if (ownReach && ownReach > 0) {
    perContentReach = ownReach;
  } else if (platform === "tiktok") {
    // Reach TikTok dédié uniquement — pas de repli sur les abonnés Instagram.
    perContentReach = Number(member?.reachTiktok) || 0;
  } else if (platform === "youtube") {
    // Pas de champ reach YouTube dédié : on exige un reach saisi sur le livrable.
    perContentReach = 0;
  } else {
    const igReach = Number(member?.reachInstagram) || Number(member?.reach) || 0;
    if (igReach > 0) {
      perContentReach = igReach;
    } else if (followers > 0) {
      perContentReach = followers * config.defaultReachRate;
      estimated = true;
    }
  }

  const reach = perContentReach * qty;
  const interactions = reach * (engagementPct / 100);
  const emv = (reach / 1000) * cpm;

  const override =
    deliverable.mediaValue === null || deliverable.mediaValue === undefined
      ? null
      : Number(deliverable.mediaValue);

  return {
    reach,
    cpm,
    interactions,
    emv,
    override,
    retained: override ?? emv,
    matched: reach > 0,
    estimated,
    platform,
    missingReach: reach <= 0 && override == null,
  };
}

export type EmvTotals = {
  emv: number;
  reach: number;
  interactions: number;
  lines: EmvLineResult[];
};

export function computeEmvTotals(
  deliverables: EmvDeliverableInput[],
  casting: EmvCastingInput[],
  config: EmvConfig
): EmvTotals {
  const lines = deliverables.map((d) => computeLineEmv(d, casting, config));
  return {
    emv: lines.reduce((s, l) => s + l.retained, 0),
    reach: lines.reduce((s, l) => s + l.reach, 0),
    interactions: lines.reduce((s, l) => s + l.interactions, 0),
    lines,
  };
}
