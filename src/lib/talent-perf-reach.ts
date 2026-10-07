/**
 * Mise en avant intelligente des perfs pour les mails casting / outreach.
 * - MUST : chiffres exceptionnels (millions TT, gros peak stories…) → toujours à citer
 * - NICE : bons chiffres → disponibles pour l'IA si naturel
 * - rien si pas de données / trop faibles
 */

export type TalentPerfReachInput = {
  igMoyenneVuesReels?: number | null;
  igMeilleurReelVues?: number | null;
  ttMoyenneVues?: number | null;
  ttMeilleurTiktokVues?: number | null;
  /** Peak vues stories (souvent storyViews30d / 7d saisis sur la fiche) */
  storyViewsMax?: number | null;
};

export type TalentPerfReachHighlight = {
  priority: "must" | "nice";
  /** Fragment FR pour le prompt / filet (ex. "meilleur TikTok 2,1M vues") */
  fr: string;
  /** Fragment EN */
  en: string;
};

function compactViews(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${v}M`;
  }
  if (n >= 100_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  if (n >= 1_000) {
    const v = (n / 1_000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${v}k`;
  }
  return String(Math.round(n));
}

function compactViewsEn(n: number): string {
  return compactViews(n).replace(",", ".");
}

const MUST = {
  bestTt: 1_000_000,
  bestIg: 100_000, // ex. Maé 123k Reels → toujours citer
  avgTt: 500_000,
  avgIg: 100_000,
  story: 100_000, // ex. Mareva 193k → toujours citer
} as const;

const NICE = {
  bestTt: 200_000,
  bestIg: 80_000,
  avgTt: 80_000,
  avgIg: 40_000,
  story: 40_000,
} as const;

type Part = { must: boolean; fr: string; en: string };

/**
 * Construit 0..1 highlight à partir des perfs mensuelles + peak stories.
 * Priorise : best TikTok / peak stories / best Reel / moyennes.
 */
export function buildTalentPerfReachHighlight(
  perf: TalentPerfReachInput | null | undefined
): TalentPerfReachHighlight | null {
  if (!perf) return null;

  const ttBest = typeof perf.ttMeilleurTiktokVues === "number" ? perf.ttMeilleurTiktokVues : 0;
  const igBest = typeof perf.igMeilleurReelVues === "number" ? perf.igMeilleurReelVues : 0;
  const ttAvg = typeof perf.ttMoyenneVues === "number" ? perf.ttMoyenneVues : 0;
  const igAvg = typeof perf.igMoyenneVuesReels === "number" ? perf.igMoyenneVuesReels : 0;
  const story = typeof perf.storyViewsMax === "number" ? perf.storyViewsMax : 0;

  const isMust =
    ttBest >= MUST.bestTt ||
    igBest >= MUST.bestIg ||
    ttAvg >= MUST.avgTt ||
    igAvg >= MUST.avgIg ||
    story >= MUST.story;

  const isNice =
    isMust ||
    ttBest >= NICE.bestTt ||
    igBest >= NICE.bestIg ||
    ttAvg >= NICE.avgTt ||
    igAvg >= NICE.avgIg ||
    story >= NICE.story;

  if (!isNice) return null;

  const parts: Part[] = [];

  if (ttBest >= NICE.bestTt) {
    parts.push({
      must: ttBest >= MUST.bestTt,
      fr: `meilleur TikTok ${compactViews(ttBest)} vues`,
      en: `best TikTok ${compactViewsEn(ttBest)} views`,
    });
  }

  if (story >= NICE.story) {
    parts.push({
      must: story >= MUST.story,
      fr: `jusqu'à ${compactViews(story)} vues en story`,
      en: `up to ${compactViewsEn(story)} story views`,
    });
  }

  if (igBest >= NICE.bestIg) {
    parts.push({
      must: igBest >= MUST.bestIg,
      fr: `meilleur Reel ${compactViews(igBest)} vues`,
      en: `best Reel ${compactViewsEn(igBest)} views`,
    });
  }

  // Moyennes seulement si vraiment distinctes du "meilleur"
  if (
    ttAvg >= NICE.avgTt &&
    !(ttBest > 0 && ttAvg >= ttBest * 0.85) &&
    !(ttBest >= MUST.bestTt && ttAvg < ttBest * 0.15)
  ) {
    parts.push({
      must: ttAvg >= MUST.avgTt,
      fr: `moy. ${compactViews(ttAvg)} vues TikTok`,
      en: `avg ${compactViewsEn(ttAvg)} TikTok views`,
    });
  }

  if (
    igAvg >= NICE.avgIg &&
    !(igBest > 0 && igAvg >= igBest * 0.85) &&
    !(igBest >= MUST.bestIg && igAvg < igBest * 0.15)
  ) {
    parts.push({
      must: igAvg >= MUST.avgIg,
      fr: `moy. ${compactViews(igAvg)} vues Reels`,
      en: `avg ${compactViewsEn(igAvg)} Reel views`,
    });
  }

  if (parts.length === 0) return null;

  // MUST d'abord, max 2 fragments pour rester scannable
  const ordered = [...parts.filter((p) => p.must), ...parts.filter((p) => !p.must)].slice(
    0,
    2
  );

  return {
    priority: isMust ? "must" : "nice",
    fr: ordered.map((p) => p.fr).join(" · "),
    en: ordered.map((p) => p.en).join(" · "),
  };
}
