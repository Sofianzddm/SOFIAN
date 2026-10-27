/**
 * Worker job serveur : analyse casting roster marque par marque.
 * Survit à la fermeture de page (état Prisma + tick process / cron).
 */
import prisma from "@/lib/prisma";
import {
  normalizeBrandResearch,
  runRosterFitForBrand,
  type RosterFitItem,
} from "@/lib/casting-roster-fit-core";

export type CreateRosterFitJobBrandInput = {
  groupKey: string;
  brandName: string;
  company?: string | null;
  brandResearch: unknown;
};

export async function createRosterFitJob(args: {
  userId: string;
  market: string;
  talentIds: string[];
  brands: CreateRosterFitJobBrandInput[];
}): Promise<{ jobId: string }> {
  const talentIds = Array.from(
    new Set(args.talentIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
  const brands = args.brands
    .map((b, i) => ({
      groupKey: String(b.groupKey || "").trim(),
      brandName: String(b.brandName || "").trim(),
      company: b.company ? String(b.company).trim() : null,
      brandResearch: normalizeBrandResearch(b.brandResearch),
      sortOrder: i,
    }))
    .filter((b) => b.groupKey && b.brandName);

  if (talentIds.length === 0 || brands.length === 0) {
    throw new Error("talentIds et brands requis.");
  }

  const job = await prisma.castingRosterFitJob.create({
    data: {
      userId: args.userId,
      market: args.market || "FR",
      status: "pending",
      talentIds,
      totalBrands: brands.length,
      brands: {
        create: brands.map((b) => ({
          groupKey: b.groupKey,
          brandName: b.brandName,
          company: b.company,
          brandResearch: b.brandResearch as object,
          sortOrder: b.sortOrder,
          status: "pending",
        })),
      },
    },
    select: { id: true },
  });

  return { jobId: job.id };
}

export async function requestCancelRosterFitJob(jobId: string, userId: string) {
  const job = await prisma.castingRosterFitJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return null;
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    return job;
  }
  return prisma.castingRosterFitJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: job.status === "pending" ? "cancelled" : job.status,
      finishedAt: job.status === "pending" ? new Date() : job.finishedAt,
    },
  });
}

export async function getRosterFitJobForUser(jobId: string, userId: string) {
  return prisma.castingRosterFitJob.findFirst({
    where: { id: jobId, userId },
    include: {
      brands: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          groupKey: true,
          brandName: true,
          company: true,
          status: true,
          error: true,
          result: true,
          sortOrder: true,
          finishedAt: true,
        },
      },
    },
  });
}

/** Traite jusqu’à `limit` marques pending d’un job. */
export async function processRosterFitJobTick(
  jobId: string,
  limit = 1
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const job = await prisma.castingRosterFitJob.findUnique({
    where: { id: jobId },
  });
  if (!job) {
    return { processed: 0, done: true, status: "missing", currentBrandName: null };
  }

  if (job.cancelRequested || job.status === "cancelled") {
    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        finishedAt: job.finishedAt || new Date(),
        currentBrandName: null,
      },
    });
    return {
      processed: 0,
      done: true,
      status: "cancelled",
      currentBrandName: null,
    };
  }

  if (["completed", "failed"].includes(job.status)) {
    return {
      processed: 0,
      done: true,
      status: job.status,
      currentBrandName: null,
    };
  }

  if (job.status === "pending") {
    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt || new Date() },
    });
  }

  let processed = 0;
  let lastBrand: string | null = null;

  for (let i = 0; i < limit; i++) {
    const fresh = await prisma.castingRosterFitJob.findUnique({
      where: { id: jobId },
    });
    if (!fresh || fresh.cancelRequested) {
      await prisma.castingRosterFitJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          finishedAt: new Date(),
          currentBrandName: null,
        },
      });
      return {
        processed,
        done: true,
        status: "cancelled",
        currentBrandName: null,
      };
    }

    const next = await prisma.castingRosterFitBrand.findFirst({
      where: { jobId, status: "pending" },
      orderBy: { sortOrder: "asc" },
    });
    if (!next) break;

    lastBrand = next.brandName;
    // Claim atomique (évite double process si 2 workers).
    const claimed = await prisma.castingRosterFitBrand.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "running", startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) continue;

    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: { currentBrandName: next.brandName, status: "running" },
    });

    try {
      const research = normalizeBrandResearch(next.brandResearch);
      const talents = await runRosterFitForBrand({
        brandName: next.brandName,
        brandResearch: research,
        talentIds: job.talentIds,
      });
      await prisma.castingRosterFitBrand.update({
        where: { id: next.id },
        data: {
          status: "done",
          result: talents as object[],
          finishedAt: new Date(),
          error: null,
        },
      });
      await prisma.castingRosterFitJob.update({
        where: { id: jobId },
        data: { completed: { increment: 1 } },
      });
      processed += 1;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message.slice(0, 500) : "Erreur analyse casting";
      console.error(`[roster-fit-job] ${jobId} / ${next.brandName}:`, e);
      await prisma.castingRosterFitBrand.update({
        where: { id: next.id },
        data: {
          status: "failed",
          error: msg,
          finishedAt: new Date(),
        },
      });
      await prisma.castingRosterFitJob.update({
        where: { id: jobId },
        data: { failed: { increment: 1 } },
      });
      processed += 1;
    }
  }

  const remaining = await prisma.castingRosterFitBrand.count({
    where: { jobId, status: { in: ["pending", "running"] } },
  });

  if (remaining === 0) {
    const finalJob = await prisma.castingRosterFitJob.findUnique({
      where: { id: jobId },
    });
    const status =
      finalJob && finalJob.failed > 0 && finalJob.completed === 0
        ? "failed"
        : "completed";
    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: new Date(),
        currentBrandName: null,
        error:
          status === "failed"
            ? "Toutes les marques ont échoué."
            : null,
      },
    });
    return {
      processed,
      done: true,
      status,
      currentBrandName: null,
    };
  }

  return {
    processed,
    done: false,
    status: "running",
    currentBrandName: lastBrand,
  };
}

/**
 * Enchaîne les marques en process Node (idéal VPS / `next start` / local).
 * Sur Vercel serverless, le process meurt avec la requête → filet HTTP + cron.
 */
async function runInProcessChain(jobId: string): Promise<void> {
  try {
    const tick = await processRosterFitJobTick(jobId, 1);
    if (!tick.done) {
      setTimeout(() => {
        void runInProcessChain(jobId);
      }, 150);
    }
  } catch (e) {
    console.warn(`[roster-fit-job] in-process chain ${jobId}:`, e);
    kickRosterFitJobHttp(jobId);
  }
}

function kickRosterFitJobHttp(jobId: string): void {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000";
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    "";
  const url = `${base}/api/casting/roster-fit-jobs/${jobId}/process`;
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      "x-glowup-job-kick": "1",
    },
    body: JSON.stringify({}),
  }).catch((e) => {
    console.warn(`[roster-fit-job] kick HTTP failed ${jobId}:`, e);
  });
}

/** Kick non-bloquant du prochain tick (VPS in-process, sinon HTTP). */
export function kickRosterFitJobProcess(jobId: string): void {
  // Worker VPS externe (pm2) consomme les jobs pending — pas besoin de kick app.
  if (process.env.CASTING_FIT_EXTERNAL_WORKER === "1") {
    return;
  }
  // Vercel : une seule requête = un tick HTTP ; le process route se re-kick.
  if (process.env.VERCEL) {
    kickRosterFitJobHttp(jobId);
    return;
  }
  // VPS / local : chaîne in-process (survit à la fermeture de page).
  setTimeout(() => {
    void runInProcessChain(jobId);
  }, 50);
}

export function parseRosterFitResult(raw: unknown): RosterFitItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      talentId: String(x.talentId || "").trim(),
      recommended: Boolean(x.recommended),
      fitScore: Number(x.fitScore) || 0,
      whyFit: String(x.whyFit || ""),
      risks: String(x.risks || ""),
      suggestedAngle: String(x.suggestedAngle || ""),
      proofPoints: String(x.proofPoints || ""),
    }))
    .filter((x) => x.talentId);
}
