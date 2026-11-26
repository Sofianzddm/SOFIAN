/**
 * Contacts pipeline Cannes Partenaires — isolés du CRM marques / outreach.
 *
 * Isolation par tag (historique) : source CANNES_CARTO sur marque_contacts.
 * Isolation vraie : table CannesContact rattachée à OpportuniteMarque.
 */

import type { Prisma } from "@prisma/client";

export const CANNES_CONTACT_SOURCE = "CANNES_CARTO";

/** Filtre Prisma : contacts tag Cannes uniquement (pas le legacy CARTO+exclu). */
export const cannesContactWhere: Prisma.MarqueContactWhereInput = {
  source: CANNES_CONTACT_SOURCE,
};

/**
 * Filtre CRM Marques : exclut CANNES_CARTO sans masquer source NULL.
 * Forme vérifiée Prisma : `source IS NULL OR source <> 'CANNES_CARTO'`.
 */
export const notCannesContactWhere: Prisma.MarqueContactWhereInput = {
  OR: [{ source: null }, { source: { not: CANNES_CONTACT_SOURCE } }],
};

/** Clause AND à ajouter pour ne jamais toucher aux contacts Cannes. */
export const excludeCannesContactAnd: Prisma.MarqueContactWhereInput = {
  OR: [{ source: null }, { source: { not: CANNES_CONTACT_SOURCE } }],
};
