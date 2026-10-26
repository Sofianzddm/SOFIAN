/**
 * Récupération des stats publiques des comptes sociaux d'un talent via Apify.
 *
 * - Instagram : `apify/instagram-profile-scraper` → followers, following, posts
 * - TikTok    : `clockworks/free-tiktok-scraper`  → fans, hearts, videos
 *
 * On utilise les endpoints `run-sync-get-dataset-items` (1 seul appel HTTP,
 * synchrone, renvoie les items du dataset directement).
 *
 * Documentation :
 *  - https://apify.com/apify/instagram-profile-scraper
 *  - https://apify.com/clockworks/free-tiktok-scraper
 */

const APIFY_BASE = "https://api.apify.com/v2/acts";
const IG_ACTOR = "apify~instagram-profile-scraper";
const TT_ACTOR = "clockworks~free-tiktok-scraper";

export interface SocialSnapshot {
  /** Nombre d'abonnés (followers / fans). */
  followers: number | null;
  /** Nombre total de posts / vidéos (utile pour le debug). */
  posts?: number | null;
  /** True si on a pu récupérer la donnée. */
  ok: boolean;
  /** Raison de l'échec si `ok = false`. */
  error?: string;
}

function cleanHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const t = handle.replace(/^@/, "").trim();
  if (!t) return null;
  // On retire d'éventuelles URL complètes
  return t
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//, "")
    .replace(/\/+$/, "")
    .replace(/[?#].*$/, "")
    .trim() || null;
}

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error("APIFY_TOKEN manquant dans les variables d'environnement");
  }
  return token;
}

/**
 * Fetch Instagram profile stats (followers + posts count).
 * Renvoie toujours un SocialSnapshot — ne throw jamais (pour batch).
 */
export async function fetchInstagramProfile(
  handle: string | null | undefined
): Promise<SocialSnapshot> {
  const username = cleanHandle(handle);
  if (!username) return { followers: null, ok: false, error: "handle vide" };

  try {
    const token = getToken();
    const res = await fetch(
      `${APIFY_BASE}/${IG_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        followers: null,
        ok: false,
        error: `Apify IG ${res.status}: ${text.slice(0, 120)}`,
      };
    }

    const items = (await res.json()) as Array<{
      followersCount?: number;
      followsCount?: number;
      postsCount?: number;
      username?: string;
      private?: boolean;
      error?: string;
    }>;

    const first = items?.[0];
    if (!first || typeof first.followersCount !== "number") {
      return {
        followers: null,
        ok: false,
        error: first?.error || "profil introuvable",
      };
    }

    return {
      followers: first.followersCount,
      posts: typeof first.postsCount === "number" ? first.postsCount : null,
      ok: true,
    };
  } catch (e) {
    return {
      followers: null,
      ok: false,
      error: e instanceof Error ? e.message : "erreur inconnue",
    };
  }
}

/**
 * Fetch TikTok profile stats (fans = followers + nombre de vidéos).
 * Renvoie toujours un SocialSnapshot — ne throw jamais (pour batch).
 */
export async function fetchTiktokProfile(
  handle: string | null | undefined
): Promise<SocialSnapshot> {
  const username = cleanHandle(handle);
  if (!username) return { followers: null, ok: false, error: "handle vide" };

  try {
    const token = getToken();
    const res = await fetch(
      `${APIFY_BASE}/${TT_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [username],
          resultsPerPage: 1,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        followers: null,
        ok: false,
        error: `Apify TT ${res.status}: ${text.slice(0, 120)}`,
      };
    }

    // L'actor renvoie un item par vidéo. Le compte d'abonnés est dans
    // `authorMeta.fans` (présent sur chaque item). On lit le premier.
    const items = (await res.json()) as Array<{
      authorMeta?: {
        fans?: number;
        video?: number;
        heart?: number;
        name?: string;
      };
    }>;

    const meta = items?.[0]?.authorMeta;
    if (!meta || typeof meta.fans !== "number") {
      return {
        followers: null,
        ok: false,
        error: "profil introuvable ou aucune vidéo publique",
      };
    }

    return {
      followers: meta.fans,
      posts: typeof meta.video === "number" ? meta.video : null,
      ok: true,
    };
  } catch (e) {
    return {
      followers: null,
      ok: false,
      error: e instanceof Error ? e.message : "erreur inconnue",
    };
  }
}

/**
 * Dernières captions / textes TikTok via Apify (clockworks free scraper).
 * Pour analyse contenu / moments — ne throw jamais.
 */
export async function fetchTikTokRecentCaptions(
  handle: string | null | undefined,
  count: number = 12,
  options?: { timeoutMs?: number }
): Promise<{ captions: string[]; note: string }> {
  const username = cleanHandle(handle);
  if (!username) return { captions: [], note: "pas de handle TikTok" };
  if (!process.env.APIFY_TOKEN?.trim()) {
    return { captions: [], note: "APIFY_TOKEN absente — TikTok non scrapé" };
  }

  const timeoutMs =
    typeof options?.timeoutMs === "number" && options.timeoutMs > 0
      ? options.timeoutMs
      : 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = getToken();
    const res = await fetch(
      `${APIFY_BASE}/${TT_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [username],
          resultsPerPage: Math.min(Math.max(count, 5), 20),
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        captions: [],
        note: `TikTok Apify ${res.status}: ${text.slice(0, 100)}`,
      };
    }

    const items = (await res.json()) as Array<{
      text?: string;
      desc?: string;
      title?: string;
    }>;

    const captions: string[] = [];
    for (const it of items || []) {
      const raw = String(it.text || it.desc || it.title || "").trim();
      if (!raw) continue;
      captions.push(raw.length > 500 ? `${raw.slice(0, 500)}…` : raw);
      if (captions.length >= count) break;
    }

    return {
      captions,
      note: captions.length
        ? `${captions.length} captions TikTok`
        : "0 caption TikTok",
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        captions: [],
        note: `TikTok timeout (${Math.round(timeoutMs / 1000)}s)`,
      };
    }
    return {
      captions: [],
      note: `TikTok indisponible (${e instanceof Error ? e.message : "erreur"})`,
    };
  } finally {
    clearTimeout(timer);
  }
}
