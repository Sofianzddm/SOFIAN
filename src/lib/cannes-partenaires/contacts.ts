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
