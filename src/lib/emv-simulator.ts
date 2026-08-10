/**
 * Catalogue formats / packages du simulateur EMV TM.
 * Aligné sur :
 * - `src/lib/emv.ts` (CPM / format / plateforme)
 * - FORMAT_OPTIONS des propositions Strategy
 * - clés `TalentTarifs` (négociations)
 */

import type { EmvCastingInput } from "@/lib/emv";

export type TarifKey =
  | "tarifStory"
  | "tarifStoryConcours"
  | "tarifPost"
  | "tarifPostConcours"
  | "tarifPostCommun"
  | "tarifReel"
  | "tarifReelConcours"
  | "tarifTiktokVideo"
  | "tarifTiktokConcours"
  | "tarifYoutubeVideo"
  | "tarifYoutubeShort";

export type ReachHint = "story" | "ig" | "tt" | "yt" | null;

export type SimFormat = {
  id: string;
  label: string;
  /** Valeur passée à `cpmForFormat` — même vocabulaire que les propositions. */
  format: string;
  platform: string;
  tarifKey: TarifKey;
  reachHint: ReachHint;
};

/** Formats simulables : EMV (Strategy) + tarif commercial (grille talent). */
export const SIM_FORMATS: SimFormat[] = [
  { id: "story", label: "Story IG", format: "Story", platform: "Instagram", tarifKey: "tarifStory", reachHint: "story" },
  {
    id: "story_concours",
    label: "Story Concours",
    format: "Story",
    platform: "Instagram",
    tarifKey: "tarifStoryConcours",
    reachHint: "story",
  },
  { id: "reel", label: "Reel", format: "Reel", platform: "Instagram", tarifKey: "tarifReel", reachHint: "ig" },
  {
    id: "reel_concours",
    label: "Reel Concours",
    format: "Reel",
    platform: "Instagram",
    tarifKey: "tarifReelConcours",
    reachHint: "ig",
  },
  { id: "post", label: "Post", format: "Post", platform: "Instagram", tarifKey: "tarifPost", reachHint: "ig" },
  {
    id: "post_concours",
    label: "Post Concours",
    format: "Post",
    platform: "Instagram",
    tarifKey: "tarifPostConcours",
    reachHint: "ig",
  },
  {
    id: "carrousel",
    label: "Carrousel",
    format: "Carrousel",
    platform: "Instagram",
    tarifKey: "tarifPost",
    reachHint: "ig",
  },
  {
    id: "tiktok",
    label: "TikTok",
    format: "TikTok",
    platform: "TikTok",
    tarifKey: "tarifTiktokVideo",
    reachHint: "tt",
  },
  {
    id: "tiktok_concours",
    label: "TikTok Concours",
    format: "TikTok",
    platform: "TikTok",
    tarifKey: "tarifTiktokConcours",
    reachHint: "tt",
  },
  {
    id: "yt_short",
    label: "YouTube Short",
    format: "YouTube Short",
    platform: "YouTube",
    tarifKey: "tarifYoutubeShort",
    reachHint: "yt",
  },
  {
    id: "yt_video",
    label: "Vidéo YouTube",
    format: "Vidéo YouTube",
    platform: "YouTube",
    tarifKey: "tarifYoutubeVideo",
    reachHint: "yt",
  },
];

export function simFormatById(id: string): SimFormat | undefined {
  return SIM_FORMATS.find((f) => f.id === id);
}

export type PackageTemplate = {
  id: string;
  label: string;
  hint: string;
  lines: { formatId: string; quantity: number }[];
};

/** Packages types — raccourcis de composition. */
export const PACKAGE_TEMPLATES: PackageTemplate[] = [
  {
    id: "stories3",
    label: "3 Stories",
    hint: "3 stories Instagram",
    lines: [{ formatId: "story", quantity: 3 }],
  },
  {
    id: "reel1",
    label: "1 Reel",
    hint: "1 reel Instagram",
    lines: [{ formatId: "reel", quantity: 1 }],
  },
  {
    id: "reel_stories",
    label: "1 Reel + 2 Stories",
    hint: "1 reel et 2 stories",
    lines: [
      { formatId: "reel", quantity: 1 },
      { formatId: "story", quantity: 2 },
    ],
  },
  {
    id: "post_stories",
    label: "1 Post + 2 Stories",
    hint: "1 post et 2 stories",
    lines: [
      { formatId: "post", quantity: 1 },
      { formatId: "story", quantity: 2 },
    ],
  },
  {
    id: "full_ig",
    label: "1 Reel + 1 Post + 3 Stories",
    hint: "1 reel, 1 post et 3 stories",
    lines: [
      { formatId: "reel", quantity: 1 },
      { formatId: "post", quantity: 1 },
      { formatId: "story", quantity: 3 },
    ],
  },
  {
    id: "tiktok1",
    label: "1 TikTok",
    hint: "1 vidéo TikTok",
    lines: [{ formatId: "tiktok", quantity: 1 }],
  },
  {
    id: "cross",
    label: "1 Reel + 1 TikTok",
    hint: "1 reel Instagram et 1 TikTok",
    lines: [
      { formatId: "reel", quantity: 1 },
      { formatId: "tiktok", quantity: 1 },
    ],
  },
];

export type TalentEmvSource = {
  id: string;
  prenom: string;
  nom: string;
  photo?: string | null;
  moyenneVuesStory?: number | null;
  stats?: {
    igFollowers?: number | null;
    igEngagement?: number | null;
    ttFollowers?: number | null;
    ttEngagement?: number | null;
    ytAbonnes?: number | null;
    storyViews30d?: number | null;
    storyViews7d?: number | null;
  } | null;
  tarifs?: Partial<Record<TarifKey | "ugcBaseRate", number | string | null>> | null;
};

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function castingFromTalent(talent: TalentEmvSource): EmvCastingInput {
  const stats = talent.stats;
  return {
    name: `${talent.prenom} ${talent.nom}`.trim(),
    followers: numOrNull(stats?.igFollowers) ?? 0,
    engagement: numOrNull(stats?.igEngagement) ?? 0,
    // Pas de reach IG moyen fiable hors stories → laisser le moteur estimer (abos × taux)
    // sauf si on a des vues story (utilisées ligne par ligne).
    reachInstagram: null,
    reachTiktok: null,
  };
}

/** Reach suggéré pour une ligne selon le format + données talent. */
export function suggestedReachForFormat(
  formatId: string,
  talent: TalentEmvSource | null
): number | null {
  if (!talent) return null;
  const fmt = simFormatById(formatId);
  if (!fmt) return null;
  const storyViews =
    numOrNull(talent.moyenneVuesStory) ??
    numOrNull(talent.stats?.storyViews30d) ??
    numOrNull(talent.stats?.storyViews7d);
  if (fmt.reachHint === "story") return storyViews;
  // IG feed/reel : pas de moyenne stockée → null (fallback abos × 60 % côté moteur)
  return null;
}

export function tarifUnitForFormat(
  formatId: string,
  tarifs: TalentEmvSource["tarifs"] | null | undefined
): number | null {
  const fmt = simFormatById(formatId);
  if (!fmt || !tarifs) return null;
  return numOrNull(tarifs[fmt.tarifKey]);
}

/**
 * Notation EMV vs tarif (ratio = EMV ÷ tarif).
 * ≥ ×2 Très bien · ≥ ×1,5 Bon · ≥ ×1 Moyen · sinon Faible
 */
export type EmvVerdict = "tres_bien" | "bon" | "moyen" | "faible";

export type EmvVerdictInfo = {
  id: EmvVerdict;
  label: string;
  hint: string;
  badge: string;
  badgeDark: string;
  accent: string;
};

export function scoreEmvRoi(roi: number | null | undefined): EmvVerdictInfo | null {
  if (roi == null || !Number.isFinite(roi) || roi <= 0) return null;
  if (roi >= 2) {
    return {
      id: "tres_bien",
      label: "Très bien",
      hint: "EMV ≥ 2× le tarif.",
      badge: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
      badgeDark: "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/40",
      accent: "text-emerald-300",
    };
  }
  if (roi >= 1.5) {
    return {
      id: "bon",
      label: "Bon",
      hint: "EMV entre 1,5× et 2× le tarif.",
      badge: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
      badgeDark: "bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/40",
      accent: "text-sky-300",
    };
  }
  if (roi >= 1) {
    return {
      id: "moyen",
      label: "Moyen",
      hint: "EMV proche du tarif (1× à 1,5×).",
      badge: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
      badgeDark: "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/40",
      accent: "text-amber-300",
    };
  }
  return {
    id: "faible",
    label: "Faible",
    hint: "EMV inférieur au tarif.",
    badge: "bg-red-100 text-red-800 ring-1 ring-red-200",
    badgeDark: "bg-red-400/20 text-red-200 ring-1 ring-red-400/40",
    accent: "text-red-300",
  };
}
