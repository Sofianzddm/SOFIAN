/**
 * Upload direct navigateur → S3 via URL présignée (PUT).
 * Utilisé par les composants qui bypassent le serveur pour les gros fichiers.
 */

export type PresignedUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  /** Content-Type signé — le PUT doit renvoyer exactement cette valeur. */
  contentType?: string;
};

/** Demande une URL présignée puis envoie le fichier en PUT. */
export async function uploadFileViaPresignedUrl(
  signatureEndpoint: string,
  body: Record<string, unknown>,
  file: File
): Promise<string> {
  const requestedContentType =
    String(body.contentType || file.type || "application/octet-stream").trim() ||
    "application/octet-stream";

  const sigRes = await fetch(signatureEndpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      contentType: requestedContentType,
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

  const { uploadUrl, publicUrl, contentType: signedContentType } =
    (await sigRes.json()) as PresignedUploadResponse;

  // Doit matcher exactement le ContentType signé côté serveur.
  const contentType = (signedContentType || requestedContentType).trim();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    const looksLikeChecksum =
      /checksum|SignatureDoesNotMatch|BadDigest/i.test(detail) ||
      /x-amz-checksum/i.test(uploadUrl);
    if (looksLikeChecksum) {
      throw new Error(
        `Erreur upload S3 (${putRes.status}) : signature/checksum invalide. Relance après déploiement du fix S3.`
      );
    }
    throw new Error(
      `Erreur upload S3 (${putRes.status}). Vérifie le CORS du bucket si ça persiste.`
    );
  }

  return publicUrl;
}
