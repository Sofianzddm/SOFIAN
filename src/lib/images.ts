import sharp from "sharp";

/**
 * Optimisation d'image côté serveur (remplace les transformations Cloudinary
 * `width`/`quality: auto`/`fetch_format: auto`).
 *
 * On borne la taille et on compresse en conservant le format quand c'est
 * pertinent. La livraison optimisée (WebP/AVIF, srcset) est gérée par
 * `next/image` à l'affichage.
 */
export async function optimizeImage(
  input: Buffer,
  opts: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    /** Force la sortie en webp (sinon conserve le format d'origine). */
    toWebp?: boolean;
  } = {}
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const { maxWidth = 1600, maxHeight, quality = 82, toWebp = false } = opts;

  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();

  pipeline = pipeline.resize({
    width: maxWidth,
    height: maxHeight,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (toWebp || meta.format === "webp") {
    const buffer = await pipeline.webp({ quality }).toBuffer();
    return { buffer, contentType: "image/webp", ext: "webp" };
  }
  if (meta.format === "png") {
    const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    return { buffer, contentType: "image/png", ext: "png" };
  }
  const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  return { buffer, contentType: "image/jpeg", ext: "jpg" };
}
