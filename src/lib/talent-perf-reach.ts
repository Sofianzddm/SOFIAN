/**
 * Mise en avant intelligente des perfs pour les mails casting / outreach.
 *
 * Logique RELATIVE aux abonnés :
 * - 100k vues pour une créa à 500k abonnés → pas waouh
 * - 120k vues pour une créa à 30k abonnés → waouh (4×)
 *
 * Absolu uniquement pour les vrais hits viraux (ex. ≥ 1M vues).
 */

export type TalentPerfReachInput = {
  igFollowers?: number | null;
  ttFollowers?: number | null;
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

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Ratio vues / abonnés. Sans abonnés → null (on bascule sur absolu viral). */
function viewsRatio(views: number, followers: number): number | null {
  if (views <= 0) return null;
  if (followers <= 0) return null;
  return views / followers;
}

/**
 * Seuils relatifs (vues ÷ abonnés) :
 * - MUST ≥ 2×  (ex. 30k abo → 60k+ vues)
 * - NICE ≥ 1,2× (ex. 30k abo → 36k+ vues)
 *
 * Absolu viral (toujours MUST, même gros comptes) :
 * - ≥ 1M vues contenu
 * - stories ≥ 150k ET ratio ≥ 0,5× (sinon gros compte avec stories "normales")
 */
const REL = {
  must: 2,
  nice: 1.2,
} as const;

const ABS_VIRAL = {
  content: 1_000_000,
  storyFloor: 150_000,
  storyRatioMust: 0.5,
  storyRatioNice: 0.25,
} as const;

type Tier = "must" | "nice" | null;

function tierFromRatio(
  views: number,
  followers: number,
  absoluteMust = ABS_VIRAL.content
): Tier {
  if (views <= 0) return null;
  if (views >= absoluteMust) return "must";
  const r = viewsRatio(views, followers);
  if (r === null) {
    // Pas d'abonnés connus : garder un filet absolu prudent
    if (views >= 500_000) return "must";
    if (views >= 150_000) return "nice";
    return null;
  }
  if (r >= REL.must) return "must";
  if (r >= REL.nice) return "nice";
  return null;
}

function tierStory(views: number, igFollowers: number): Tier {
  if (views <= 0) return null;
  const r = viewsRatio(views, igFollowers);
  if (views >= ABS_VIRAL.storyFloor) {
    if (r === null) return "must";
    if (r >= ABS_VIRAL.storyRatioMust) return "must";
    if (r >= ABS_VIRAL.storyRatioNice) return "nice";
    // Gros compte, stories "dans la norme" → on ne force pas
    return null;
  }
  if (r === null) return null;
  if (r >= REL.must) return "must";
  if (r >= REL.nice) return "nice";
  return null;
}

type Part = { must: boolean; fr: string; en: string };

/**
 * Construit 0..1 highlight à partir des perfs + peak stories, relatif aux abonnés.
 */
export function buildTalentPerfReachHighlight(
  perf: TalentPerfReachInput | null | undefined
): TalentPerfReachHighlight | null {
  if (!perf) return null;

  const igFollowers = num(perf.igFollowers);
  const ttFollowers = num(perf.ttFollowers);
  const ttBest = num(perf.ttMeilleurTiktokVues);
  const igBest = num(perf.igMeilleurReelVues);
  const ttAvg = num(perf.ttMoyenneVues);
  const igAvg = num(perf.igMoyenneVuesReels);
  const story = num(perf.storyViewsMax);

  const parts: Part[] = [];

  const push = (tier: Tier, fr: string, en: string) => {
    if (!tier) return;
    parts.push({ must: tier === "must", fr, en });
  };

  push(
    tierFromRatio(ttBest, ttFollowers),
    `meilleur TikTok ${compactViews(ttBest)} vues`,
    `best TikTok ${compactViewsEn(ttBest)} views`
  );

  push(
    tierStory(story, igFollowers),
    `jusqu'à ${compactViews(story)} vues en story`,
    `up to ${compactViewsEn(story)} story views`
  );

  push(
    tierFromRatio(igBest, igFollowers),
    `meilleur Reel ${compactViews(igBest)} vues`,
    `best Reel ${compactViewsEn(igBest)} views`
  );

  // Moyennes seulement si distinctes du meilleur
  if (!(ttBest > 0 && ttAvg >= ttBest * 0.85)) {
    push(
      tierFromRatio(ttAvg, ttFollowers),
      `moy. ${compactViews(ttAvg)} vues TikTok`,
      `avg ${compactViewsEn(ttAvg)} TikTok views`
    );
  }
  if (!(igBest > 0 && igAvg >= igBest * 0.85)) {
    push(
      tierFromRatio(igAvg, igFollowers),
      `moy. ${compactViews(igAvg)} vues Reels`,
      `avg ${compactViewsEn(igAvg)} Reel views`
    );
  }

  if (parts.length === 0) return null;

  const ordered = [...parts.filter((p) => p.must), ...parts.filter((p) => !p.must)].slice(
    0,
    2
  );
  const isMust = ordered.some((p) => p.must);

  return {
    priority: isMust ? "must" : "nice",
    fr: ordered.map((p) => p.fr).join(" · "),
    en: ordered.map((p) => p.en).join(" · "),
  };
}

/**
 * Extrait le plus gros volume de vues cité dans un texte d'analyse
 * (ex. « 10.9M vues », « jusqu'à 10M+ », « 3,4M »).
 */
export function extractMaxViewsFromText(text: string | null | undefined): number {
  if (!text) return 0;
  let max = 0;
  const re =
    /(\d{1,3}(?:[.,]\d+)?)\s*([mMkK]|millions?)|\b(\d{1,3}(?:[ \u00a0]\d{3})+|\d{6,})\s*(?:vues?|views?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[3]) {
      const n = Number(m[3].replace(/[\s\u00a0]/g, ""));
      if (Number.isFinite(n) && n > max) max = n;
      continue;
    }
    const raw = Number(String(m[1]).replace(",", "."));
    if (!Number.isFinite(raw)) continue;
    const unit = String(m[2] || "").toLowerCase();
    const n =
      unit.startsWith("m") ? raw * 1_000_000 : unit.startsWith("k") ? raw * 1_000 : raw;
    if (n > max) max = n;
  }
  return max;
}

/**
 * Si l'analyse créateur cite des hits viraux (ex. millions TT) absents du CRM,
 * produit un highlight MUST pour forcer le pitch mail.
 */
export function buildReachFromResearchText(
  text: string | null | undefined,
  opts?: { ttFollowers?: number | null; platformHint?: "tiktok" | "reel" | "auto" }
): TalentPerfReachHighlight | null {
  const max = extractMaxViewsFromText(text);
  if (max < ABS_VIRAL.content) {
    // Aussi accepter un ratio fort vs abonnés TT même sous 1M
    const tt = num(opts?.ttFollowers);
    if (max > 0 && tt > 0 && max / tt >= REL.must) {
      const label = opts?.platformHint === "reel" ? "Reel" : "TikTok";
      return {
        priority: "must",
        fr: `hits ${label} jusqu'à ${compactViews(max)} vues (analyse)`,
        en: `${label} hits up to ${compactViewsEn(max)} views (research)`,
      };
    }
    return null;
  }
  const label =
    opts?.platformHint === "reel"
      ? "Reel"
      : opts?.platformHint === "tiktok"
        ? "TikTok"
        : max >= 1_000_000
          ? "TikTok"
          : "contenu";
  return {
    priority: "must",
    fr: `hits ${label} jusqu'à ${compactViews(max)} vues`,
    en: `${label} hits up to ${compactViewsEn(max)} views`,
  };
}

/** Fusionne CRM + analyse : priorise le MUST le plus fort. */
export function mergeReachHighlights(
  ...items: Array<TalentPerfReachHighlight | null | undefined>
): TalentPerfReachHighlight | null {
  const list = items.filter((x): x is TalentPerfReachHighlight => Boolean(x));
  if (list.length === 0) return null;
  const must = list.filter((x) => x.priority === "must");
  const pool = must.length ? must : list;
  // Garde le premier MUST (souvent TT viral) ; concat max 2 fragments uniques
  const frParts = Array.from(new Set(pool.flatMap((p) => p.fr.split(" · ")))).slice(0, 2);
  const enParts = Array.from(new Set(pool.flatMap((p) => p.en.split(" · ")))).slice(0, 2);
  return {
    priority: must.length ? "must" : "nice",
    fr: frParts.join(" · "),
    en: enParts.join(" · "),
  };
}
