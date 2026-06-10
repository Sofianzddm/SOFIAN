import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Centralisation de l'upload de fichiers sur Amazon S3.
 *
 * Remplace l'ancienne intégration Cloudinary. Deux usages :
 *   1. Upload côté serveur  -> `uploadBufferToS3` (le fichier transite par l'API).
 *   2. Upload direct client  -> `createPresignedUpload` (le navigateur PUT directement
 *      sur S3, sans passer par le serveur — pour les gros fichiers).
 *
 * Variables d'environnement requises :
 *   AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Optionnel :
 *   AWS_S3_PUBLIC_URL  (domaine CloudFront / custom ; défaut = URL S3 publique)
 */

export const S3_REGION = process.env.AWS_REGION ?? "eu-west-3";
export const S3_BUCKET = process.env.AWS_S3_BUCKET ?? "";

/** Base publique pour lire les fichiers (sans slash final). */
export const S3_PUBLIC_BASE = (
  process.env.AWS_S3_PUBLIC_URL ??
  `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`
).replace(/\/+$/, "");

export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_S3_BUCKET &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

/** URL publique d'un objet à partir de sa clé. */
export function publicUrlForKey(key: string): string {
  return `${S3_PUBLIC_BASE}/${key.replace(/^\/+/, "")}`;
}

/**
 * Extrait la clé S3 d'une URL publique (CloudFront ou S3).
 * Renvoie `null` si l'URL ne pointe pas vers notre stockage S3.
 */
export function s3KeyFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // URL custom / CloudFront configurée via AWS_S3_PUBLIC_URL
    if (S3_PUBLIC_BASE && url.startsWith(S3_PUBLIC_BASE)) {
      return decodeURIComponent(url.slice(S3_PUBLIC_BASE.length).replace(/^\/+/, ""));
    }
    const host = u.hostname;
    // Style virtual-hosted : bucket.s3.region.amazonaws.com/key
    if (host.includes(".s3.") || host.endsWith(".amazonaws.com")) {
      const path = u.pathname.replace(/^\/+/, "");
      // Style path : s3.region.amazonaws.com/bucket/key
      if (host.startsWith("s3.") && S3_BUCKET && path.startsWith(`${S3_BUCKET}/`)) {
        return decodeURIComponent(path.slice(S3_BUCKET.length + 1));
      }
      return decodeURIComponent(path);
    }
    return null;
  } catch {
    return null;
  }
}

export function isS3Url(url: string | null | undefined): boolean {
  if (!url) return false;
  return s3KeyFromUrl(url) !== null;
}

/** Construit une clé d'objet unique en nettoyant le chemin. */
export function buildKey(folder: string, name: string): string {
  const clean = (s: string) => s.replace(/^\/+|\/+$/g, "");
  return `${clean(folder)}/${clean(name)}`;
}

/**
 * Upload côté serveur d'un buffer/contenu binaire.
 * Renvoie l'URL publique de l'objet.
 */
export async function uploadBufferToS3(
  body: Buffer | Uint8Array,
  opts: { key: string; contentType?: string; cacheControl?: string }
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: opts.key,
      Body: body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl ?? "public, max-age=31536000, immutable",
    })
  );
  return publicUrlForKey(opts.key);
}

/** Supprime un objet à partir de son URL publique. No-op si l'URL n'est pas S3. */
export async function deleteFromS3(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const key = s3KeyFromUrl(url);
  if (!key) return;
  try {
    await client().send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })
    );
  } catch (e) {
    console.error("Erreur suppression S3:", e);
  }
}

/**
 * Upload côté serveur d'un `File` (FormData) ou d'une URL distante.
 * Optimise automatiquement les images (sharp) sauf si `optimize: false`.
 * Renvoie l'URL publique.
 */
export async function uploadFileToS3(
  source: File | { url: string },
  opts: {
    folder: string;
    /** Nom de base sans extension (l'extension est déduite du type). */
    baseName: string;
    optimize?: boolean;
    maxWidth?: number;
  }
): Promise<string> {
  let buffer: Buffer;
  let contentType: string;

  if (source instanceof File) {
    buffer = Buffer.from(await source.arrayBuffer());
    contentType = source.type || "application/octet-stream";
  } else {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`Téléchargement échoué: ${source.url}`);
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = res.headers.get("content-type") || "application/octet-stream";
  }

  let ext = extFromContentType(contentType);

  const isImage = contentType.startsWith("image/");
  if (isImage && opts.optimize !== false) {
    // Import dynamique pour éviter de charger sharp quand inutile.
    const { optimizeImage } = await import("@/lib/images");
    const optimized = await optimizeImage(buffer, { maxWidth: opts.maxWidth });
    buffer = optimized.buffer;
    contentType = optimized.contentType;
    ext = optimized.ext;
  }

  const key = buildKey(opts.folder, `${opts.baseName}.${ext}`);
  return uploadBufferToS3(buffer, { key, contentType });
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

export function extFromContentType(contentType: string): string {
  return CONTENT_TYPE_EXT[contentType.split(";")[0].trim()] ?? "bin";
}

/**
 * Génère une URL présignée pour un upload direct depuis le navigateur (PUT).
 * Le client fait ensuite : fetch(uploadUrl, { method: "PUT", body: file }).
 */
export async function createPresignedUpload(opts: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  // NB : on ne signe que Bucket/Key/ContentType. Ajouter d'autres en-têtes
  // (ex. CacheControl) obligerait le navigateur à les renvoyer à l'identique.
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
  });
  const uploadUrl = await getSignedUrl(client(), command, {
    expiresIn: opts.expiresIn ?? 600,
  });
  return { uploadUrl, publicUrl: publicUrlForKey(opts.key), key: opts.key };
}
