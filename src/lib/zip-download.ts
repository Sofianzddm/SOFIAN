import JSZip from "jszip";
import { extFromContentType } from "@/lib/s3";

/**
 * Génération d'archives ZIP à partir de fichiers hébergés en externe
 * (Cloudinary / S3). Utilisé pour les téléchargements groupés de factures.
 */

export interface ZipEntry {
  /** URL du fichier à récupérer. */
  url: string | null | undefined;
  /** Nom de base souhaité dans le zip (sans extension obligatoire). */
  name: string;
}

export interface BuildZipResult {
  buffer: Buffer;
  /** Nombre de fichiers effectivement ajoutés. */
  added: number;
  /** Noms des entrées qui n'ont pas pu être récupérées. */
  failed: string[];
}

/** Nettoie un nom de fichier pour un usage sûr dans un zip. */
function sanitizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "fichier";
}

/** Garantit un nom unique dans l'archive (suffixe -2, -3, … si collision). */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Récupère chaque fichier et construit une archive ZIP en mémoire.
 * Les fichiers introuvables sont ignorés (et listés dans `failed`).
 */
export async function buildZipFromUrls(entries: ZipEntry[]): Promise<BuildZipResult> {
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  let added = 0;

  const results = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.url) return { entry, ok: false as const };
      try {
        const res = await fetch(entry.url, { cache: "no-store" });
        if (!res.ok) return { entry, ok: false as const };
        const arrayBuffer = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "";
        return {
          entry,
          ok: true as const,
          data: Buffer.from(arrayBuffer),
          contentType,
        };
      } catch {
        return { entry, ok: false as const };
      }
    })
  );

  for (const result of results) {
    if (!result.ok) {
      failed.push(result.entry.name);
      continue;
    }
    let name = sanitizeName(result.entry.name);
    // Ajoute une extension si le nom n'en a pas, déduite du content-type.
    if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
      const ext = extFromContentType(result.contentType || "");
      if (ext && ext !== "bin") name = `${name}.${ext}`;
    }
    zip.file(uniqueName(name, used), result.data);
    added += 1;
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { buffer, added, failed };
}

/** Construit les en-têtes HTTP d'une réponse de téléchargement ZIP. */
export function zipResponseHeaders(filename: string, length: number): Headers {
  const safe = filename.replace(/["\r\n]/g, "");
  return new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${safe}"`,
    "Content-Length": String(length),
    "Cache-Control": "private, max-age=0, no-store",
  });
}
