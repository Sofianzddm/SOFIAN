/**
 * Construit une URL passant par le proxy `/api/download` afin de forcer le
 * téléchargement d'un fichier stocké en externe (Cloudinary / S3).
 *
 * L'attribut HTML `download` est ignoré par le navigateur en cross-origin :
 * le fichier s'ouvre au lieu d'être téléchargé. Ce proxy renvoie le fichier
 * avec `Content-Disposition: attachment`.
 */
export function downloadHref(url: string | null | undefined, filename?: string): string {
  if (!url) return "#";
  const params = new URLSearchParams({ url });
  if (filename) params.set("filename", filename);
  return `/api/download?${params.toString()}`;
}
