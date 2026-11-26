/**
 * Contacts pipeline Cannes Partenaires — isolés du CRM marques / outreach.
 * source CANNES_CARTO (nouveau) ou legacy CARTO + outreachExcluded.
 */

import type { Prisma } from "@prisma/client";

export const CANNES_CONTACT_SOURCE = "CANNES_CARTO";

/** Filtre Prisma : contacts appartenant au module Cannes uniquement. */
export const cannesContactWhere: Prisma.MarqueContactWhereInput = {
  OR: [
    { source: CANNES_CONTACT_SOURCE },
    { source: "CARTO", outreachExcluded: true },
  ],
};

/**
 * Filtre Prisma pour le CRM Marques : exclut tout contact Cannes.
 * Utilise NOT + OR (pas `source: { not }` qui exclut aussi les NULL).
 */
export const notCannesContactWhere: Prisma.MarqueContactWhereInput = {
  NOT: {
    OR: [
      { source: CANNES_CONTACT_SOURCE },
      { source: "CARTO", outreachExcluded: true },
    ],
  },
};
