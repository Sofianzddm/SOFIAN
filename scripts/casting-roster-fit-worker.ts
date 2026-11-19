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
import { processOutreachDraftJobTick } from "../src/lib/casting-outreach-draft-job";
import { processProjectDraftJobTick } from "../src/lib/casting-project-draft-job";

const POLL_IDLE_MS = Number(process.env.CASTING_FIT_POLL_MS || 5000);
const STUCK_BRAND_MS = Number(process.env.CASTING_FIT_STUCK_MS || 8 * 60 * 1000);
/** Outreach Contabo = jusqu’à ~22 min — ne pas reset à 8 min (casse le poll). */
const STUCK_OUTREACH_MS = Number(
  process.env.CASTING_OUTREACH_STUCK_MS || 25 * 60 * 1000
);

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

  // Fails Neon / transient récents (< 30 min) → pending auto (Aparanjan).
  const neonFailCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const softFails = await prisma.castingRosterFitBrand.findMany({
    where: {
      status: "failed",
      finishedAt: { gte: neonFailCutoff },
      OR: [
        { error: { contains: "Can't reach database", mode: "insensitive" } },
        { error: { contains: "P1001", mode: "insensitive" } },
        { error: { contains: "P1017", mode: "insensitive" } },
        { error: { contains: "Protected deployment", mode: "insensitive" } },
        {
          error: {
            contains: "PrismaClientInitializationError",
            mode: "insensitive",
          },
        },
        { error: { contains: "Timed out fetching", mode: "insensitive" } },
      ],
    },
    select: { id: true, jobId: true, brandName: true },
    take: 40,
  });
  if (softFails.length > 0) {
    await prisma.castingRosterFitBrand.updateMany({
      where: { id: { in: softFails.map((b) => b.id) } },
      data: {
        status: "pending",
        error: "Reprise auto worker (blip Neon/réseau)",
        finishedAt: null,
        startedAt: null,
      },
    });
    const jobIds = [...new Set(softFails.map((b) => b.jobId))];
    for (const jobId of jobIds) {
      const failedLeft = await prisma.castingRosterFitBrand.count({
        where: { jobId, status: "failed" },
      });
      await prisma.castingRosterFitJob.updateMany({
        where: {
          id: jobId,
          status: { in: ["pending", "running", "failed"] },
          cancelRequested: false,
        },
        data: {
          failed: failedLeft,
          status: "running",
          finishedAt: null,
        },
      });
    }
    console.warn(
      `[casting-fit-worker] soft-requeued ${softFails.length} Neon/transient fail(s): ${softFails.map((b) => b.brandName).join(", ")}`
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indivItem = (prisma as any).castingIndivDraftItem;
  if (indivItem?.updateMany) {
    const stuckItems = await indivItem.updateMany({
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
  } else {
    console.warn(
      "[casting-fit-worker] castingIndivDraftItem absent du Prisma Client — resync schema + `pnpm exec prisma generate` + restart pm2."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outreachItem = (prisma as any).castingOutreachDraftItem;
  if (outreachItem?.updateMany) {
    const outreachCutoff = new Date(Date.now() - STUCK_OUTREACH_MS);
    const stuckOutreach = await outreachItem.updateMany({
      where: {
        status: "running",
        startedAt: { lt: outreachCutoff },
      },
      data: {
        status: "pending",
        error: "Recovered stuck running outreach draft item (worker)",
        startedAt: null,
      },
    });
    if (stuckOutreach.count > 0) {
      console.warn(
        `[casting-fit-worker] recovered ${stuckOutreach.count} stuck outreach draft item(s) (>${Math.round(STUCK_OUTREACH_MS / 60000)}min)`
      );
    }
  } else {
    console.warn(
      "[casting-fit-worker] castingOutreachDraftItem absent du Prisma Client — resync schema + `pnpm exec prisma generate` + restart pm2."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectItem = (prisma as any).castingProjectDraftItem;
  if (projectItem?.updateMany) {
    const stuckProject = await projectItem.updateMany({
      where: {
        status: "running",
        startedAt: { lt: cutoff },
      },
      data: {
        status: "pending",
        error: "Recovered stuck running project draft item (worker)",
        startedAt: null,
      },
    });
    if (stuckProject.count > 0) {
      console.warn(
        `[casting-fit-worker] recovered ${stuckProject.count} stuck project draft item(s)`
      );
    }
  } else {
    console.warn(
      "[casting-fit-worker] castingProjectDraftItem absent du Prisma Client — resync schema + `pnpm exec prisma generate` + restart pm2."
    );
  }

  // Contabo orphelins : ne pas tuer un run encore utile (VPS_PENDING / fail Neon récent).
  try {
    const { cancelOrphanOutreachContaboJobs } = await import(
      "../src/lib/carto-chat-vps/vps-client"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outreachItem = (prisma as any).castingOutreachDraftItem;
    const keepMarkers: string[] = [];
    if (outreachItem?.findMany) {
      const recentFailCutoff = new Date(Date.now() - 15 * 60 * 1000);
      const live = await outreachItem.findMany({
        where: {
          OR: [
            { status: { in: ["running", "pending"] } },
            { error: "VPS_PENDING" },
            {
              status: "failed",
              updatedAt: { gte: recentFailCutoff },
            },
          ],
        },
        select: { brandResearch: true, status: true, error: true },
        take: 300,
      });
      for (const it of live) {
        const m = String(
          (it.brandResearch as { _vps?: { endMarker?: string } } | null)?._vps
            ?.endMarker || ""
        ).trim();
        if (m) keepMarkers.push(m);
      }
    }
    const swept = await cancelOrphanOutreachContaboJobs({
      keepEndMarkers: keepMarkers,
    });
    if (swept.cancelled > 0 || swept.errors.length > 0) {
      console.warn(
        `[casting-fit-worker] Contabo orphan sweep cancelled=${swept.cancelled} kept=${swept.kept} errors=${swept.errors.join("; ") || "—"}`
      );
    }
  } catch (e) {
    console.warn(
      "[casting-fit-worker] Contabo orphan sweep fail:",
      e instanceof Error ? e.message : e
    );
  }
}

/** Cap soft : jobs actifs, traités en parallèle (1 item / job / tick). */
const MAX_PARALLEL_JOBS = Number(process.env.CASTING_FIT_MAX_PARALLEL || 40);

async function loopOnce(): Promise<number> {
  await recoverStuck();

  const rosterJobs = await prisma.castingRosterFitJob.findMany({
    where: {
      status: { in: ["pending", "running"] },
      cancelRequested: false,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PARALLEL_JOBS,
    select: { id: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indivJob = (prisma as any).castingIndivDraftJob;
  const indivJobs: { id: string }[] = indivJob?.findMany
    ? await indivJob.findMany({
        where: {
          status: { in: ["pending", "running"] },
          cancelRequested: false,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_PARALLEL_JOBS,
        select: { id: true },
      })
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outreachJob = (prisma as any).castingOutreachDraftJob;
  // Contabo = 1 tick / boucle, MAIS prioriser le job qui a un item `running`
  // (mail certifié en attente de save). Sinon l’ancien job FIFO bloque le
  // nouveau (cas Fleur du mal : Contabo done, worker pollait encore fascent).
  const outreachJobsRaw: { id: string; createdAt: Date }[] = outreachJob?.findMany
    ? await outreachJob.findMany({
        where: {
          status: { in: ["pending", "running"] },
          cancelRequested: false,
        },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true, createdAt: true },
      })
    : [];
  const outreachItemModel = (prisma as any).castingOutreachDraftItem;
  let outreachJobs: { id: string }[] = outreachJobsRaw;
  if (outreachJobsRaw.length > 1 && outreachItemModel?.findMany) {
    const runningItems = await outreachItemModel.findMany({
      where: {
        status: "running",
        jobId: { in: outreachJobsRaw.map((j: { id: string }) => j.id) },
      },
      select: { jobId: true },
      take: 20,
    });
    const runningJobIds = new Set(
      runningItems.map((r: { jobId: string }) => r.jobId)
    );
    outreachJobs = [
      ...outreachJobsRaw.filter((j) => runningJobIds.has(j.id)),
      ...outreachJobsRaw.filter((j) => !runningJobIds.has(j.id)),
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectJob = (prisma as any).castingProjectDraftJob;
  const projectJobs: { id: string }[] = projectJob?.findMany
    ? await projectJob.findMany({
        where: {
          status: { in: ["pending", "running"] },
          cancelRequested: false,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_PARALLEL_JOBS,
        select: { id: true },
      })
    : [];

  if (
    rosterJobs.length === 0 &&
    indivJobs.length === 0 &&
    outreachJobs.length === 0 &&
    projectJobs.length === 0
  ) {
    return 0;
  }

  // Fit : 1 seul job / boucle (sinon 2 ticks → 2 marques « running » en parallèle).
  // Intra-job : déjà 1 marque (gate running + Contabo dans processRosterFitJobTick).
  const fitResults: number[] = [];
  for (const j of rosterJobs.slice(0, 1)) {
    const tick = await processRosterFitJobTick(j.id, 1);
    console.log(
      `[casting-fit-worker] roster job=${j.id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
    );
    fitResults.push(tick.processed);
  }

  let contaboProcessed = 0;
  // Outreach Contabo : 1 tick utile / boucle. Si le 1er job ne process rien
  // (ex. Contabo busy pour un autre job), tente le suivant une fois.
  for (const j of outreachJobs.slice(0, 2)) {
    const tick = await processOutreachDraftJobTick(j.id, 1);
    console.log(
      `[casting-fit-worker] outreach-draft job=${j.id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
    );
    contaboProcessed += tick.processed;
    if (tick.processed > 0) break;
  }

  const otherResults = await Promise.all([
    ...indivJobs.map(async (j) => {
      const tick = await processIndivDraftJobTick(j.id, 1);
      console.log(
        `[casting-fit-worker] indiv job=${j.id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
      );
      return tick.processed;
    }),
    ...projectJobs.map(async (j) => {
      const tick = await processProjectDraftJobTick(j.id, 1);
      console.log(
        `[casting-fit-worker] project-draft job=${j.id} processed=${tick.processed} status=${tick.status} current=${tick.currentBrandName || "—"} done=${tick.done}`
      );
      return tick.processed;
    }),
  ]);

  return (
    fitResults.reduce((a, b) => a + b, 0) +
    contaboProcessed +
    otherResults.reduce((a, b) => a + b, 0)
  );
}

async function main() {
  console.log(
    `[casting-fit-worker] start · idle=${POLL_IDLE_MS}ms · stuck=${STUCK_BRAND_MS}ms · roster+indiv+outreach-draft+project-draft`
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
