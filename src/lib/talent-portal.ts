/**
 * Date de démarrage du portail talent :
 * seules les collaborations publiées à partir du 1er juillet 2026 (heure de Paris)
 * sont visibles par les talents (collabs, factures à envoyer, historique).
 *
 * Une collab est considérée publiée dès que `datePublication` est renseignée
 * (passage au statut PUBLIE). Les statuts suivants (FACTURE_RECUE, PAYE, …)
 * ne retirent pas l'accès à l'upload de la facture talent.
 */
export const TALENT_PORTAL_DATE_DEBUT = new Date("2026-07-01T00:00:00+02:00");

/** Filtre Prisma : collabs publiées depuis le lancement du portail. */
export const talentPortalPublishedWhere = {
  datePublication: { gte: TALENT_PORTAL_DATE_DEBUT },
} as const;
