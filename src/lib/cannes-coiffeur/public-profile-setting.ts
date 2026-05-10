import type { Prisma } from "@prisma/client";

/** Clé `cannes_shared_settings` : portrait affiché sur la page publique `/r/cannes-coiffeur`. */
export const COIFFEUR_PUBLIC_PROFILE_SETTING_KEY = "coiffeur-public-profile";

/** `public_id` Cloudinary fixe : chaque upload écrase la même ressource (pas d’accumulation). */
export const COIFFEUR_PROFILE_CLOUDINARY_FOLDER = "glowup-cannes-coiffeur";
export const COIFFEUR_PROFILE_CLOUDINARY_PUBLIC_ID = "booking-page-portrait";

export function coiffeurProfileCloudinaryFullPublicId(): string {
  return `${COIFFEUR_PROFILE_CLOUDINARY_FOLDER}/${COIFFEUR_PROFILE_CLOUDINARY_PUBLIC_ID}`;
}

export function photoUrlFromStoredValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  /** JSON Postgres parfois reçu encore en chaîne depuis certains pipelines / anciennes écritures. */
  if (typeof value === "string") {
    const t = value.trim();
    try {
      return photoUrlFromStoredValue(JSON.parse(t) as unknown);
    } catch {
      return /^https?:\/\//i.test(t) ? t : null;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const url = (value as { photoUrl?: unknown }).photoUrl;
  if (typeof url === "string" && url.trim()) return url.trim();
  return null;
}

export function storedJsonForPhotoUrl(url: string | null): Prisma.InputJsonValue {
  return { photoUrl: url?.trim() ? url.trim() : null };
}
