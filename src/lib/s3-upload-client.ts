/**
 * Upload direct navigateur → S3 via URL présignée (PUT).
 * Utilisé par les composants qui bypassent le serveur pour les gros fichiers.
 */

export type PresignedUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
};

/** Demande une URL présignée puis envoie le fichier en PUT. */
export async function uploadFileViaPresignedUrl(
  signatureEndpoint: string,
  body: Record<string, unknown>,
  file: File
): Promise<string> {
  const contentType =
    String(body.contentType || file.type || "application/octet-stream").trim() ||
    "application/octet-stream";

  const sigRes = await fetch(signatureEndpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      contentType,
      fileName: body.fileName || file.name,
      size: body.size ?? file.size,
    }),
  });
  if (!sigRes.ok) {
    const err = await sigRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || "Erreur obtention URL présignée"
    );
  }

  const { uploadUrl, publicUrl } =
    (await sigRes.json()) as PresignedUploadResponse;

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(
      `Erreur upload S3 (${putRes.status}). Vérifie le CORS du bucket si ça persiste.`
    );
  }

  return publicUrl;
}
