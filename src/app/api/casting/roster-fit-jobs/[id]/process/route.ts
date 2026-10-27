import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  kickRosterFitJobProcess,
  processRosterFitJobTick,
} from "@/lib/casting-roster-fit-job";
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

function isInternalKick(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") || "";
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    "";
  if (secret && auth === `Bearer ${secret}`) return true;
  // Kick local sans secret (dev) : header dédié + même host
  if (request.headers.get("x-glowup-job-kick") === "1" && !secret) {
    return process.env.NODE_ENV !== "production";
  }
  return false;
}

/**
 * Traite 1 marque du job puis se re-kick si besoin.
 * Auth : session user propriétaire OU Bearer CRON_SECRET.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const internal = isInternalKick(request);

    if (!internal) {
      const session = await getAppSession(request);
      if (!session?.user) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
      }
      if (!isAllowed(session.user.role)) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }
      const owned = await prisma.castingRosterFitJob.findFirst({
        where: { id, userId: session.user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
      }
    } else {
      const exists = await prisma.castingRosterFitJob.findUnique({
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

    const tick = await processRosterFitJobTick(id, 1);

    if (!tick.done) {
      // Enchaîne le prochain tick sans bloquer.
      kickRosterFitJobProcess(id);
    }

    return NextResponse.json(tick);
  } catch (e) {
    console.error("POST /api/casting/roster-fit-jobs/[id]/process:", e);
    return NextResponse.json(
      { error: "Erreur process job." },
      { status: 500 }
    );
  }
}
