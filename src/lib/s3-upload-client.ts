/**
 * Upload direct navigateur → stockage (S3 présigné ou Cloudinary signé).
 * Bypass la limite ~4.5 Mo du body Vercel.
 */

export type PresignedUploadResponse = {
  provider?: "s3" | "cloudinary";
  uploadUrl?: string;
  publicUrl?: string;
  key?: string;
  /** Content-Type signé — le PUT S3 doit renvoyer exactement cette valeur. */
  contentType?: string;
  cloudName?: string;
  apiKey?: string;
  signature?: string;
  timestamp?: number;
  folder?: string;
  publicId?: string;
};

async function uploadViaS3(
  signed: PresignedUploadResponse,
  file: File,
  requestedContentType: string
): Promise<string> {
  const uploadUrl = signed.uploadUrl;
  const publicUrl = signed.publicUrl;
  if (!uploadUrl || !publicUrl) {
    throw new Error("Réponse S3 incomplète.");
  }

  const contentType = (signed.contentType || requestedContentType).trim();
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
        `Erreur upload S3 (${putRes.status}) : signature/checksum invalide.`
      );
    }
    throw new Error(
      `Erreur upload S3 (${putRes.status}). Vérifie le CORS du bucket si ça persiste.`
    );
  }
  return publicUrl;
}

async function uploadViaCloudinary(
  signed: PresignedUploadResponse,
  file: File
): Promise<string> {
  const { cloudName, apiKey, signature, timestamp, folder, publicId } = signed;
  if (!cloudName || !apiKey || !signature || !timestamp || !folder || !publicId) {
    throw new Error("Réponse Cloudinary incomplète.");
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", apiKey);
  fd.append("timestamp", String(timestamp));
  fd.append("signature", signature);
  fd.append("folder", folder);
  fd.append("public_id", publicId);

  const cloudRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    { method: "POST", body: fd }
  );
  if (!cloudRes.ok) {
    const detail = await cloudRes.text().catch(() => "");
    throw new Error(
      `Erreur upload Cloudinary (${cloudRes.status})${
        detail ? ` : ${detail.slice(0, 180)}` : ""
      }`
    );
  }
  const data = (await cloudRes.json()) as { secure_url?: string };
  if (!data.secure_url) {
    throw new Error("URL Cloudinary manquante après upload.");
  }
  return data.secure_url;
}

/** Demande une signature puis envoie le fichier (S3 ou Cloudinary). */
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

  const signed = (await sigRes.json()) as PresignedUploadResponse;
  const provider =
    signed.provider || (signed.uploadUrl ? "s3" : signed.signature ? "cloudinary" : null);

  if (provider === "s3") {
    return uploadViaS3(signed, file, requestedContentType);
  }
  if (provider === "cloudinary") {
    return uploadViaCloudinary(signed, file);
  }

  throw new Error("Réponse d’upload non reconnue (ni S3 ni Cloudinary).");
}
