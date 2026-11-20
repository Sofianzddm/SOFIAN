import type { Prisma } from "@prisma/client";

/** Talents visibles sur le talent book public et les books partenaires. */
export const talentBookWhere: Prisma.TalentWhereInput = {
  isArchived: false,
  excluTalentbook: false,
};
