import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  getRosterFitJobForUser,
  parseRosterFitResult,
  requestCancelRosterFitJob,
} from "@/lib/casting-roster-fit-job";

export const maxDuration = 60;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await ctx.params;
    const job = await getRosterFitJobForUser(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      market: job.market,
      totalBrands: job.totalBrands,
      completed: job.completed,
      failed: job.failed,
      currentBrandName: job.currentBrandName,
      cancelRequested: job.cancelRequested,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt,
      brands: job.brands.map((b) => ({
        groupKey: b.groupKey,
        brandName: b.brandName,
        company: b.company,
        status: b.status,
        error: b.error,
        sortOrder: b.sortOrder,
        finishedAt: b.finishedAt,
        brandResearch:
          b.status === "done" ? b.brandResearch : undefined,
        talents:
          b.status === "done" ? parseRosterFitResult(b.result) : undefined,
      })),
    });
  } catch (e) {
    console.error("GET /api/casting/roster-fit-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

/** Annule le job. */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await ctx.params;
    const job = await requestCancelRosterFitJob(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: job.status });
  } catch (e) {
    console.error("DELETE /api/casting/roster-fit-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
