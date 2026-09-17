/** Constantes partagées du cycle outreach clients (sans imports pour éviter les cycles). */

export const OUTREACH_RELANCE_BUSINESS_DAYS = 3;
/** Jours calendaires avant le retour du client en file « À recontacter ». */
export const OUTREACH_RECONTACT_DAYS = 45;
/**
 * Après une réponse inbound à une marque en direct : délai avant le premier
 * mail de prospection (évite de démarcher la marque juste après lui avoir
 * répondu sur une collab). Les agences, elles, entrent tout de suite en
 * « à contacter » — une agence gère plusieurs marques.
 */
export const INBOUND_MARQUE_RECONTACT_DAYS = 30;
