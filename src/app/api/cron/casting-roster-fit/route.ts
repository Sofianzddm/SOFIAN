import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  kickRosterFitJobProcess,
  processRosterFitJobTick,
} from "@/lib/casting-roster-fit-job";

export const maxDuration = 300;

/**
 * Filet de sécurité : reprend les jobs running/pending coincés.
 * Auth : Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Jobs running sans update depuis > 4 min → re-kick
    const staleBefore = new Date(Date.now() - 4 * 60 * 1000);
    const jobs = await prisma.castingRosterFitJob.findMany({
      where: {
        status: { in: ["pending", "running"] },
        OR: [
          { status: "pending" },
          { status: "running", updatedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true },
    });

    const results = await Promise.all(
      jobs.map(async (j) => {
        const tick = await processRosterFitJobTick(j.id, 1);
        if (!tick.done) kickRosterFitJobProcess(j.id);
        return {
          jobId: j.id,
          processed: tick.processed,
          done: tick.done,
        };
      })
    );

    return NextResponse.json({ ok: true, jobs: results.length, results });
  } catch (e) {
    console.error("GET /api/cron/casting-roster-fit:", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
