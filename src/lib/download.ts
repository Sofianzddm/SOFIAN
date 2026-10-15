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

/**
 * Même proxy, mais en `inline` pour afficher le PDF dans un iframe / nouvel
 * onglet sans forcer le téléchargement ni naviguer vers Cloudinary.
 */
export function previewHref(url: string | null | undefined, filename?: string): string {
  if (!url) return "#";
  const params = new URLSearchParams({ url, disposition: "inline" });
  if (filename) params.set("filename", filename);
  return `/api/download?${params.toString()}`;
}
