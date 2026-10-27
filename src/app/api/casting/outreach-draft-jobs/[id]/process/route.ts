import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { isInternalJobAuth } from "@/lib/internal-job-auth";
import {
  kickOutreachDraftJobProcess,
  processOutreachDraftJobTick,
} from "@/lib/casting-outreach-draft-job";
import prisma from "@/lib/prisma";

export const maxDuration = 300;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const internal = isInternalJobAuth(request);

    if (!internal) {
      const session = await getAppSession(request);
      if (!session?.user) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
      }
      if (!isAllowed(session.user.role)) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }
      const owned = await prisma.castingOutreachDraftJob.findFirst({
        where: { id, userId: session.user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
      }
    } else {
      const exists = await prisma.castingOutreachDraftJob.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
      }
    }

    if (!process.env.XAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "XAI_API_KEY manquante." },
        { status: 500 }
      );
    }

    const tick = await processOutreachDraftJobTick(id, 1);

    if (!tick.done) {
      kickOutreachDraftJobProcess(id);
    }

    return NextResponse.json(tick);
  } catch (e) {
    console.error("POST /api/casting/outreach-draft-jobs/[id]/process:", e);
    return NextResponse.json(
      { error: "Erreur process job." },
      { status: 500 }
    );
  }
}
