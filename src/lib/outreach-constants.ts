/** Constantes partagées du cycle outreach clients (sans imports pour éviter les cycles). */

/** Relance 1 : jours ouvrés après le mail initial (comme casting). */
export const OUTREACH_RELANCE_BUSINESS_DAYS = 3;
/** Relance 2 : jours ouvrés après la relance 1 (comme casting / projets-outreach). */
export const OUTREACH_RELANCE2_BUSINESS_DAYS = 10;
/**
 * Rattrapage R2 : uniquement si la R1 est partie à partir de cette date (Paris).
 * Les cycles avec R1 avant cette date restent sur R1 seule (pas d’envoi R2
 * rétroactif) ; les nouveaux cycles suivent R1 J+3 puis R2 J+10 normalement.
 */
export const OUTREACH_RELANCE2_CATCHUP_SINCE_ISO = "2026-09-25T00:00:00+02:00";

export function outreachRelance2Eligible(
  relance1SentAt: Date | string | null | undefined
): boolean {
  if (!relance1SentAt) return false;
  const r1 =
    relance1SentAt instanceof Date
      ? relance1SentAt
      : new Date(relance1SentAt);
  if (Number.isNaN(r1.getTime())) return false;
  return r1.getTime() >= new Date(OUTREACH_RELANCE2_CATCHUP_SINCE_ISO).getTime();
}
/** Jours calendaires avant le retour du client en file « À recontacter ». */
export const OUTREACH_RECONTACT_DAYS = 45;
/**
 * Après une réponse inbound à une marque en direct : délai avant le premier
 * mail de prospection (évite de démarcher la marque juste après lui avoir
 * répondu sur une collab). Les agences, elles, entrent tout de suite en
 * « à contacter » — une agence gère plusieurs marques.
 */
export const INBOUND_MARQUE_RECONTACT_DAYS = 30;
