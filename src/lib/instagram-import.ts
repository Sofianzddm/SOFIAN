/**
 * Récupération des photos Instagram d'un talent via Apify.
 *
 * Apify Instagram Scraper (`apify/instagram-profile-scraper` /
 * `apify/instagram-scraper`) renvoie les derniers posts publics d'un
 * compte Instagram (image HD, type, caption, etc.).
 *
 * Documentation : https://apify.com/apify/instagram-scraper
 *
 * On utilise le mode `run-sync-get-dataset-items` qui attend la fin du
 * run et renvoie directement les items du dataset (1 appel HTTP).
 */

const APIFY_ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items";

export interface ImportedPhoto {
  /** URL HD de l'image (signée Instagram, courte durée). */
  url: string;
  /** Type du post : "Image", "Sidecar" (carrousel), "Video". */
  type?: string;
  /** Caption éventuelle (utile pour ordonner ou filtrer). */
  caption?: string;
  /** Timestamp ISO. */
  timestamp?: string;
}

/**
 * Récupère les N dernières publications photo d'un compte Instagram public.
 * Filtre automatiquement les vidéos (on veut des photos).
 */
export async function fetchInstagramPhotos(
  handle: string,
  count: number = 9
): Promise<ImportedPhoto[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error(
      "APIFY_TOKEN manquant dans les variables d'environnement"
    );
  }

  const cleanHandle = handle.replace(/^@/, "").trim();
  if (!cleanHandle) {
    throw new Error("Handle Instagram vide");
  }

  // On demande un peu plus que `count` pour pouvoir filtrer les vidéos.
  const resultsLimit = Math.min(count * 2, 40);

  const response = await fetch(`${APIFY_ENDPOINT}?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${cleanHandle}/`],
      resultsType: "posts",
      resultsLimit,
      addParentData: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Erreur Apify (${response.status}) : ${text.slice(0, 200)}`);
  }

  const items = (await response.json()) as Array<{
    type?: string;
    displayUrl?: string;
    imageUrl?: string;
    images?: string[];
    caption?: string;
    timestamp?: string;
    videoUrl?: string;
  }>;

  const photos: ImportedPhoto[] = [];
  for (const it of items) {
    // On préfère un Image / Sidecar (carousel). On évite les vidéos.
    if (it.type === "Video" && !it.displayUrl && !it.imageUrl) continue;

    const url =
      it.displayUrl ||
      it.imageUrl ||
      (Array.isArray(it.images) && it.images[0]) ||
      null;
    if (!url) continue;

    photos.push({
      url,
      type: it.type,
      caption: it.caption,
      timestamp: it.timestamp,
    });

    if (photos.length >= count) break;
  }

  return photos;
}
