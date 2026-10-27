/**
 * Worker VPS — casting roster-fit + pipeline indiv draft (jobs Prisma).
 *
 * Env requis :
 *   DATABASE_URL
 *   XAI_API_KEY
 *   APP_URL=https://app.glowupagence.fr   (pour les appels casting brand/talent/email)
 *   CRON_SECRET=…                        (même que Vercel)
 *
 * Lancer :
 *   pnpm worker:casting-roster-fit
 *   pm2 start scripts/casting-roster-fit-vps/ecosystem.config.cjs
 */
import prisma from "../src/lib/prisma";
import { processRosterFitJobTick } from "../src/lib/casting-roster-fit-job";
import { processIndivDraftJobTick } from "../src/lib/casting-indiv-draft-job";

const POLL_IDLE_MS = Number(process.env.CASTING_FIT_POLL_MS || 5000);
const STUCK_BRAND_MS = Number(process.env.CASTING_FIT_STUCK_MS || 8 * 60 * 1000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function recoverStuck() {
  const cutoff = new Date(Date.now() - STUCK_BRAND_MS);
  const stuckBrands = await prisma.castingRosterFitBrand.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "pending",
      error: "Recovered stuck running brand (worker)",
      startedAt: null,
    },
  });
  if (stuckBrands.count > 0) {
    console.warn(
      `[casting-fit-worker] recovered ${stuckBrands.count} stuck roster brand(s)`
    );
  }
  const stuckItems = await prisma.castingIndivDraftItem.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "pending",
      error: "Recovered stuck running indiv item (worker)",
      startedAt: null,
    },
  });
  if (stuckItems.count > 0) {
    console.warn(
      `[casting-fit-worker] recovered ${stuckItems.count} stuck indiv item(s)`
    );
  }
}

/** Cap soft : jobs actifs, traités en parallèle (1 item / job / tick). */
const MAX_PARALLEL_JOBS = Number(process.env.CASTING_FIT_MAX_PARALLEL || 40);

async function loopOnce(): Promise<number> {
  await recoverStuck();

  const [rosterJobs, indivJobs] = await Promise.all([
    prisma.castingRosterFitJob.findMany({
      where: {
        status: { in: ["pending", "running"] },
        cancelRequested: false,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_PARALLEL_JOBS,
      select: { id: true },
    }),
    prisma.castingIndivDraftJob.findMany({
      where: {
        status: { in: ["pending", "running"] },
        cancelRequested: false,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_PARALLEL_JOBS,
      select: { id: true },
    }),
  ]);

  if (rosterJobs.length === 0 && indivJobs.length === 0) return 0;

  const results = await Promise.all([
    ...rosterJobs.map(async (j) => {
      const tick = await processRosterFitJobTick(j.id, 1);
      console.log(
        `[casting-fit-worker] roster job=${j.id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
      );
      return tick.processed;
    }),
    ...indivJobs.map(async (j) => {
      const tick = await processIndivDraftJobTick(j.id, 1);
      console.log(
        `[casting-fit-worker] indiv job=${j.id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
      );
      return tick.processed;
    }),
  ]);
  return results.reduce((a, b) => a + b, 0);
}

async function main() {
  console.log(
    `[casting-fit-worker] start · idle=${POLL_IDLE_MS}ms · stuck=${STUCK_BRAND_MS}ms · roster+indiv`
  );
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL manquante");
  }
  if (!process.env.XAI_API_KEY?.trim()) {
    throw new Error("XAI_API_KEY manquante");
  }
  if (
    process.env.CASTING_FIT_EXTERNAL_WORKER === "1" &&
    !process.env.APP_URL?.trim() &&
    !process.env.NEXTAUTH_URL?.trim()
  ) {
    console.warn(
      "[casting-fit-worker] APP_URL / NEXTAUTH_URL manquant — les jobs indiv appellent l’app pour brand/talent/email."
    );
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const n = await loopOnce();
      if (n === 0) await sleep(POLL_IDLE_MS);
      else await sleep(200);
    } catch (e) {
      console.error("[casting-fit-worker] loop error:", e);
      await sleep(Math.max(POLL_IDLE_MS, 10_000));
    }
  }
}

main().catch((e) => {
  console.error("[casting-fit-worker] fatal:", e);
  process.exit(1);
});
