import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  getIndivDraftJobForUser,
  requestCancelIndivDraftJob,
} from "@/lib/casting-indiv-draft-job";
import prisma from "@/lib/prisma";

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
    const job = await getIndivDraftJobForUser(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    const doneMissionIds = job.items
      .filter((it) => it.status === "done")
      .map((it) => it.missionId);
    const draftsByMission = new Map<
      string,
      { subject: string | null; bodyHtml: string | null }
    >();
    if (doneMissionIds.length > 0) {
      const missions = await prisma.contactMission.findMany({
        where: { id: { in: doneMissionIds } },
        select: {
          id: true,
          draftEmailSubject: true,
          draftEmailBody: true,
        },
      });
      for (const m of missions) {
        draftsByMission.set(m.id, {
          subject: m.draftEmailSubject,
          bodyHtml: m.draftEmailBody,
        });
      }
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      talentId: job.talentId,
      totalMissions: job.totalMissions,
      completed: job.completed,
      failed: job.failed,
      currentBrandName: job.currentBrandName,
      cancelRequested: job.cancelRequested,
      items: job.items.map((it) => {
        const draft = draftsByMission.get(it.missionId);
        return {
          missionId: it.missionId,
          talentId: it.talentId,
          brandName: it.brandName,
          status: it.status,
          error: it.error,
          draftSubject: draft?.subject || null,
          draftBodyHtml: draft?.bodyHtml || null,
        };
      }),
    });
  } catch (e) {
    console.error("GET /api/casting/indiv-draft-jobs/[id]:", e);
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
    const job = await requestCancelIndivDraftJob(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: job.status });
  } catch (e) {
    console.error("DELETE /api/casting/indiv-draft-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
