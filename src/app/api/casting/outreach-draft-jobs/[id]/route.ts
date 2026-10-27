import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  getOutreachDraftJobForUser,
  requestCancelOutreachDraftJob,
} from "@/lib/casting-outreach-draft-job";

export const maxDuration = 30;

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
    const job = await getOutreachDraftJobForUser(id, session.user.id);
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
      items: job.items.map((it) => ({
        groupKey: it.groupKey,
        brandName: it.brandName,
        company: it.company,
        status: it.status,
        error: it.error,
        draftSubject: it.draftSubject,
        draftBodyHtml: it.draftBodyHtml,
      })),
    });
  } catch (e) {
    console.error("GET /api/casting/outreach-draft-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

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
    const job = await requestCancelOutreachDraftJob(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: job.status });
  } catch (e) {
    console.error("DELETE /api/casting/outreach-draft-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
