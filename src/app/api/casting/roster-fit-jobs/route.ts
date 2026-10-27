import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  createRosterFitJob,
  kickRosterFitJobProcess,
  type CreateRosterFitJobBrandInput,
} from "@/lib/casting-roster-fit-job";
import { hasBrandResearchBrief, normalizeBrandResearch } from "@/lib/casting-roster-fit-core";
import prisma from "@/lib/prisma";

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

/** Liste les jobs récents de l’utilisateur (+ éventuellement un actif). */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const active = await prisma.castingRosterFitJob.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        market: true,
        totalBrands: true,
        completed: true,
        failed: true,
        currentBrandName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ active });
  } catch (e) {
    console.error("GET /api/casting/roster-fit-jobs:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

/** Crée un job + démarre le premier tick serveur. */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    if (!process.env.XAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Clé XAI_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const market =
      typeof body?.market === "string" ? body.market.trim() : "FR";
    const talentIds = Array.isArray(body?.talentIds)
      ? body.talentIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];
    const rawBrands = Array.isArray(body?.brands) ? body.brands : [];

    const brands: CreateRosterFitJobBrandInput[] = [];
    for (const b of rawBrands) {
      if (!b || typeof b !== "object") continue;
      const groupKey = String(b.groupKey || "").trim();
      const brandName = String(b.brandName || "").trim();
      const research = normalizeBrandResearch(b.brandResearch);
      if (!groupKey || !brandName || !hasBrandResearchBrief(research)) continue;
      brands.push({
        groupKey,
        brandName,
        company: b.company ? String(b.company) : null,
        brandResearch: research,
      });
    }

    if (talentIds.length === 0 || brands.length === 0) {
      return NextResponse.json(
        {
          error:
            "talentIds et brands (avec brandResearch) sont requis.",
        },
        { status: 400 }
      );
    }

    // Annule un éventuel job actif du même user pour éviter les doublons.
    const existing = await prisma.castingRosterFitJob.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
      },
    });
    if (existing) {
      await prisma.castingRosterFitJob.update({
        where: { id: existing.id },
        data: {
          cancelRequested: true,
          status: "cancelled",
          finishedAt: new Date(),
        },
      });
    }

    const { jobId } = await createRosterFitJob({
      userId: session.user.id,
      market,
      talentIds,
      brands,
    });

    // Kick app (no-op si CASTING_FIT_EXTERNAL_WORKER=1 → le VPS pm2 consomme).
    kickRosterFitJobProcess(jobId);

    const external = process.env.CASTING_FIT_EXTERNAL_WORKER === "1";
    return NextResponse.json({
      jobId,
      totalBrands: brands.length,
      worker: external ? "vps" : process.env.VERCEL ? "vercel" : "in-process",
      message: external
        ? "Job en file — le worker VPS l’enchaîne. Tu peux quitter la page."
        : "Job lancé sur le serveur — tu peux quitter la page, ça continue.",
    });
  } catch (e) {
    console.error("POST /api/casting/roster-fit-jobs:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Impossible de créer le job.",
      },
      { status: 500 }
    );
  }
}
