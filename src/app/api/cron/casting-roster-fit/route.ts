import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  kickIndivDraftJobProcess,
  processIndivDraftJobTick,
} from "@/lib/casting-indiv-draft-job";
import {
  kickOutreachDraftJobProcess,
  processOutreachDraftJobTick,
} from "@/lib/casting-outreach-draft-job";
import {
  kickRosterFitJobProcess,
  processRosterFitJobTick,
} from "@/lib/casting-roster-fit-job";
import { appBaseUrl, internalJobHeaders } from "@/lib/internal-job-auth";

export const maxDuration = 300;

const staleOrPendingWhere = (staleBefore: Date) => ({
  status: { in: ["pending", "running"] },
  OR: [
    { status: "pending" },
    { status: "running", updatedAt: { lt: staleBefore } },
  ],
});

/**
 * Filet si CASTING_FIT_EXTERNAL_WORKER=1 : le kick app est un no-op,
 * donc on enchaîne via HTTP process (via `after`) pour ne pas attendre
 * uniquement le VPS / le prochain cron.
 */
function forceHttpProcess(path: string): void {
  if (process.env.CASTING_FIT_EXTERNAL_WORKER !== "1") return;
  const base = appBaseUrl();
  if (!base) return;
  const run = () => {
    void fetch(`${base}${path}`, {
      method: "POST",
      headers: internalJobHeaders(),
      body: "{}",
    }).catch(() => {});
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { after } = require("next/server") as typeof import("next/server");
    after(run);
  } catch {
    run();
  }
}

/**
 * Filet de sécurité : reprend les jobs casting coincés
 * (roster-fit + rédaction indiv/outreach).
 * Auth : Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const staleBefore = new Date(Date.now() - 4 * 60 * 1000);
    const where = staleOrPendingWhere(staleBefore);

    const [rosterJobs, indivJobs, outreachJobs] = await Promise.all([
      prisma.castingRosterFitJob.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true },
      }),
      prisma.castingIndivDraftJob.findMany({
        where: { ...where, cancelRequested: false },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true },
      }),
      prisma.castingOutreachDraftJob.findMany({
        where: { ...where, cancelRequested: false },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true },
      }),
    ]);

    const [rosterResults, indivResults, outreachResults] = await Promise.all([
      Promise.all(
        rosterJobs.map(async (j) => {
          const tick = await processRosterFitJobTick(j.id, 1);
          if (!tick.done) kickRosterFitJobProcess(j.id);
          return {
            jobId: j.id,
            processed: tick.processed,
            done: tick.done,
            status: tick.status,
          };
        })
      ),
      Promise.all(
        indivJobs.map(async (j) => {
          const tick = await processIndivDraftJobTick(j.id, 1);
          if (!tick.done) {
            kickIndivDraftJobProcess(j.id);
            forceHttpProcess(`/api/casting/indiv-draft-jobs/${j.id}/process`);
          }
          return {
            jobId: j.id,
            processed: tick.processed,
            done: tick.done,
            status: tick.status,
          };
        })
      ),
      Promise.all(
        outreachJobs.map(async (j) => {
          const tick = await processOutreachDraftJobTick(j.id, 1);
          if (!tick.done) {
            kickOutreachDraftJobProcess(j.id);
            forceHttpProcess(
              `/api/casting/outreach-draft-jobs/${j.id}/process`
            );
          }
          return {
            jobId: j.id,
            processed: tick.processed,
            done: tick.done,
            status: tick.status,
          };
        })
      ),
    ]);

    return NextResponse.json({
      ok: true,
      roster: { jobs: rosterResults.length, results: rosterResults },
      indivDraft: { jobs: indivResults.length, results: indivResults },
      outreachDraft: { jobs: outreachResults.length, results: outreachResults },
    });
  } catch (e) {
    console.error("GET /api/cron/casting-roster-fit:", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
