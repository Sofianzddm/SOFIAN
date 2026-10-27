/**
 * Worker VPS — analyse casting roster (jobs Prisma).
 *
 * Tourne en continu hors Vercel : enchaîne les marques sans timeout serverless.
 *
 * Env requis :
 *   DATABASE_URL
 *   XAI_API_KEY
 *
 * Lancer :
 *   pnpm worker:casting-roster-fit
 *   pm2 start scripts/casting-roster-fit-vps/ecosystem.config.cjs
 */
import prisma from "../src/lib/prisma";
import { processRosterFitJobTick } from "../src/lib/casting-roster-fit-job";

const POLL_IDLE_MS = Number(process.env.CASTING_FIT_POLL_MS || 5000);
const STUCK_BRAND_MS = Number(process.env.CASTING_FIT_STUCK_MS || 8 * 60 * 1000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function recoverStuckBrands() {
  const cutoff = new Date(Date.now() - STUCK_BRAND_MS);
  const stuck = await prisma.castingRosterFitBrand.updateMany({
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
  if (stuck.count > 0) {
    console.warn(
      `[casting-fit-worker] recovered ${stuck.count} stuck brand(s)`
    );
  }
}

/** Cap soft : tous les jobs actifs, traités en parallèle (1 marque / job / tick). */
const MAX_PARALLEL_JOBS = Number(process.env.CASTING_FIT_MAX_PARALLEL || 40);

async function pickJobIds(): Promise<string[]> {
  const jobs = await prisma.castingRosterFitJob.findMany({
    where: {
      status: { in: ["pending", "running"] },
      cancelRequested: false,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PARALLEL_JOBS,
    select: { id: true },
  });
  return jobs.map((j) => j.id);
}

async function loopOnce(): Promise<number> {
  await recoverStuckBrands();
  const ids = await pickJobIds();
  if (ids.length === 0) return 0;

  const results = await Promise.all(
    ids.map(async (id) => {
      const tick = await processRosterFitJobTick(id, 1);
      console.log(
        `[casting-fit-worker] job=${id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
      );
      return tick.processed;
    })
  );
  return results.reduce((a, b) => a + b, 0);
}

async function main() {
  console.log(
    `[casting-fit-worker] start · idle=${POLL_IDLE_MS}ms · stuck=${STUCK_BRAND_MS}ms`
  );
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL manquante");
  }
  if (!process.env.XAI_API_KEY?.trim()) {
    throw new Error("XAI_API_KEY manquante");
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
