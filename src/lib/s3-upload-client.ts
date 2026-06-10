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
  const sigRes = await fetch(signatureEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, contentType: file.type }),
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
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error("Erreur upload S3");
  }

  return publicUrl;
}
