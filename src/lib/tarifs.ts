/**
 * Clés des champs tarifs (TalentTarifs).
 * Tarifs "publics" = affichés sur le talent book et le talent book partenaire.
 * Les autres sont internes uniquement (dashboard, négos, collabs).
 */
export const TARIF_KEYS_PUBLIC = [
  "tarifStory",
  "tarifStoryConcours",
  "tarifPost",
  "tarifPostConcours",
  "tarifPostCommun",
  "tarifReel",
  "tarifTiktokVideo",
  "tarifYoutubeVideo",
  "tarifYoutubeShort",
  "tarifEvent",
  "tarifShooting",
  "tarifAmbassadeur",
] as const;

/** Clés tarifs internes uniquement (non affichés sur book / partner) */
export const TARIF_KEYS_INTERNAL = [
  "tarifPostCrosspost",
  "tarifReelCrosspost",
  "tarifReelConcours",
  "tarifTiktokConcours",
  "tarifSnapchatStory",
  "tarifSnapchatSpotlight",
] as const;

export type TarifKeyPublic = (typeof TARIF_KEYS_PUBLIC)[number];
export type TarifKeyInternal = (typeof TARIF_KEYS_INTERNAL)[number];

/**
 * Retourne un objet tarifs ne contenant que les clés publiques (pour talent book / partner).
 */
export function getTarifsPublicOnly(tarifs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!tarifs || typeof tarifs !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const key of TARIF_KEYS_PUBLIC) {
    if (key in tarifs) out[key] = tarifs[key];
  }
  return out;
}
