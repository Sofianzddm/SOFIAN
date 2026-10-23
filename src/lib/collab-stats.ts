/** Types alignés sur les livrables collab (`TYPES_CONTENU` / fiche collab). */
export const COLLAB_STAT_TYPES = [
  "STORY",
  "STORY_CONCOURS",
  "POST",
  "POST_CONCOURS",
  "POST_COMMUN",
  "POST_CROSSPOST",
  "REEL",
  "REEL_CROSSPOST",
  "REEL_CONCOURS",
  "TIKTOK_VIDEO",
  "TIKTOK_VIDEO_CONCOURS",
  "YOUTUBE_VIDEO",
  "YOUTUBE_SHORT",
  "SNAPCHAT_STORY",
  "SNAPCHAT_SPOTLIGHT",
  "EVENT",
  "SHOOTING",
  "AMBASSADEUR",
  // Alias legacy (anciennes saisies stats)
  "TIKTOK",
] as const;

export type CollabStatType = (typeof COLLAB_STAT_TYPES)[number];

export const COLLAB_STAT_TYPE_LABELS: Record<CollabStatType, string> = {
  STORY: "Story",
  STORY_CONCOURS: "Story Concours",
  POST: "Post",
  POST_CONCOURS: "Post Concours",
  POST_COMMUN: "Post Commun",
  POST_CROSSPOST: "IG Post Crosspost",
  REEL: "Reel",
  REEL_CROSSPOST: "IG Réel Crosspost",
  REEL_CONCOURS: "IG Réel Jeu Concours",
  TIKTOK_VIDEO: "Vidéo TikTok",
  TIKTOK_VIDEO_CONCOURS: "TikTok Jeu Concours",
  YOUTUBE_VIDEO: "Vidéo YouTube",
  YOUTUBE_SHORT: "YouTube Short",
  SNAPCHAT_STORY: "Snapchat Story",
  SNAPCHAT_SPOTLIGHT: "Snapchat Spotlight",
  EVENT: "Event",
  SHOOTING: "Shooting",
  AMBASSADEUR: "Ambassadeur",
  TIKTOK: "Vidéo TikTok",
};

export const COLLAB_STAT_METRIC_KEYS = [
  "vues",
  "likes",
  "commentaires",
  "partages",
  "saves",
] as const;
export type CollabStatMetricKey = (typeof COLLAB_STAT_METRIC_KEYS)[number];

export const COLLAB_STAT_METRIC_LABELS: Record<CollabStatMetricKey, string> = {
  vues: "Vues",
  likes: "Likes",
  commentaires: "Commentaires",
  partages: "Partages",
  saves: "Saves",
};

const STORY_METRICS: CollabStatMetricKey[] = ["vues"];
const POST_METRICS: CollabStatMetricKey[] = [
  "likes",
  "commentaires",
  "partages",
  "saves",
];
const VIDEO_METRICS: CollabStatMetricKey[] = [
  "vues",
  "likes",
  "commentaires",
  "partages",
  "saves",
];
/** Formats hors feed social : screens + notes, pas de faux KPIs */
const OFFLINE_METRICS: CollabStatMetricKey[] = [];

/** Champs visibles / saisis selon le type de contenu */
export const COLLAB_STAT_FIELDS_BY_TYPE: Record<
  CollabStatType,
  CollabStatMetricKey[]
> = {
  STORY: STORY_METRICS,
  STORY_CONCOURS: STORY_METRICS,
  SNAPCHAT_STORY: STORY_METRICS,

  POST: POST_METRICS,
  POST_CONCOURS: POST_METRICS,
  POST_COMMUN: POST_METRICS,
  POST_CROSSPOST: POST_METRICS,

  REEL: VIDEO_METRICS,
  REEL_CROSSPOST: VIDEO_METRICS,
  REEL_CONCOURS: VIDEO_METRICS,
  TIKTOK_VIDEO: VIDEO_METRICS,
  TIKTOK_VIDEO_CONCOURS: VIDEO_METRICS,
  TIKTOK: VIDEO_METRICS,
  YOUTUBE_VIDEO: VIDEO_METRICS,
  YOUTUBE_SHORT: VIDEO_METRICS,
  SNAPCHAT_SPOTLIGHT: VIDEO_METRICS,

  EVENT: OFFLINE_METRICS,
  SHOOTING: OFFLINE_METRICS,
  AMBASSADEUR: OFFLINE_METRICS,
};

/** Types proposés dans le select (sans alias legacy). */
export const COLLAB_STAT_TYPES_SELECT = COLLAB_STAT_TYPES.filter(
  (t) => t !== "TIKTOK"
);

export function metricsForType(type: string): CollabStatMetricKey[] {
  if (isCollabStatType(type)) {
    return COLLAB_STAT_FIELDS_BY_TYPE[type];
  }
  return VIDEO_METRICS;
}

export function labelForStatType(type: string): string {
  if (isCollabStatType(type)) return COLLAB_STAT_TYPE_LABELS[type];
  return type;
}

export const COLLAB_STAT_WRITE_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "TM",
  "ASSISTANTE_TM",
] as const;

export function isCollabStatType(value: unknown): value is CollabStatType {
  return (
    typeof value === "string" &&
    (COLLAB_STAT_TYPES as readonly string[]).includes(value)
  );
}

export function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export function isAllowedCollabStatScreenshotUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "res.cloudinary.com" ||
        u.hostname.endsWith(".cloudinary.com"))
    );
  } catch {
    return false;
  }
}
