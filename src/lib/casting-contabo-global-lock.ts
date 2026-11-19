/**
 * Sérialisation globale Contabo (outreach ChatGPT VPS).
 * parallel=1 est par job — sans ce mutex, N jobs actifs envoient N marques.
 */
import prisma from "@/lib/prisma";

/** Clé advisory Postgres fixe (tous process / workers).
 *  bump 203/204 : les anciennes 201/202 ont pu rester accrochées en session
 *  (pg_advisory_lock + pool Prisma) et bloquer Fit→Contabo. */
export const CONTABO_OUTREACH_ADVISORY_LOCK = 88_442_203;

/** Clé advisory pour createOutreachDraftJob (anti double-job race). */
export const OUTREACH_DRAFT_CREATE_ADVISORY_LOCK = 88_442_204;

export async function countGlobalContaboOutreachRunning(
  excludeJobId?: string
): Promise<number> {
  return prisma.castingOutreachDraftItem.count({
    where: {
      status: "running",
      finishedAt: null,
      ...(excludeJobId ? { jobId: { not: excludeJobId } } : {}),
    },
  });
}

/**
 * Marques déjà fittées dans ce job encore en file Contabo (pending/running).
 * Sert à bloquer le Fit de la marque suivante tant que le VPS n’a pas fini.
 */
export async function countFitChainedContaboInFlight(args: {
  fitJobId: string;
  userId: string;
  market: string;
}): Promise<number> {
  const market = String(args.market || "");
  const doneBrands = await prisma.castingRosterFitBrand.findMany({
    where: { jobId: args.fitJobId, status: "done" },
    select: { groupKey: true },
  });
  const keys = doneBrands.map((b) => b.groupKey).filter(Boolean);
  if (keys.length === 0) return 0;

  if (market.startsWith("INDIV:")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indivItem = (prisma as any).castingIndivDraftItem;
    if (!indivItem?.count) return 0;
    return Number(
      await indivItem.count({
        where: {
          missionId: { in: keys },
          status: { in: ["pending", "running"] },
          job: {
            userId: args.userId,
            status: { in: ["pending", "running"] },
          },
        },
      })
    );
  }

  return prisma.castingOutreachDraftItem.count({
    where: {
      groupKey: { in: keys },
      status: { in: ["pending", "running"] },
      job: {
        userId: args.userId,
        market,
        status: { in: ["pending", "running"] },
      },
    },
  });
}
