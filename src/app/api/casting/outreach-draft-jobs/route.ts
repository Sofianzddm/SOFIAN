import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  createOutreachDraftJob,
  kickOutreachDraftJobProcess,
  type CreateOutreachDraftItemInput,
} from "@/lib/casting-outreach-draft-job";
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

/** Jobs outreach draft actifs (par marché optionnel). */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const market = request.nextUrl.searchParams.get("market")?.trim();

    const jobs = await prisma.castingOutreachDraftJob.findMany({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
        ...(market ? { market } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
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

    return NextResponse.json({ active: jobs[0] || null, jobs });
  } catch (e) {
    console.error("GET /api/casting/outreach-draft-jobs:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

/** Crée un job rédaction outreach (talent-research → generate-email → draft). */
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
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    const items: CreateOutreachDraftItemInput[] = [];
    for (const it of rawItems) {
      if (!it || typeof it !== "object") continue;
      const groupKey = String(it.groupKey || "").trim();
      const brandName = String(it.brandName || "").trim();
      const targetIds = Array.isArray(it.targetIds)
        ? it.targetIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
        : [];
      const talentIds = Array.isArray(it.talentIds)
        ? it.talentIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
        : [];
      const brandResearch =
        it.brandResearch && typeof it.brandResearch === "object"
          ? (it.brandResearch as Record<string, unknown>)
          : {};
      if (!groupKey || !brandName || targetIds.length === 0 || talentIds.length === 0) {
        continue;
      }
      // brandResearch optionnel : le worker fait l’analyse marque si vide.
      items.push({
        groupKey,
        brandName,
        company: it.company ? String(it.company) : null,
        pipeline: it.pipeline === "BENELUX" ? "BENELUX" : "FR",
        targetIds,
        talentIds,
        brandResearch,
        rosterFits: it.rosterFits,
      });
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            "items requis (groupKey, brandName, targetIds, talentIds, brandResearch).",
        },
        { status: 400 }
      );
    }

    const { jobId } = await createOutreachDraftJob({
      userId: session.user.id,
      market,
      items,
    });

    kickOutreachDraftJobProcess(jobId);

    const parallelActive = await prisma.castingOutreachDraftJob.count({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
      },
    });

    const external = process.env.CASTING_FIT_EXTERNAL_WORKER === "1";
    return NextResponse.json({
      jobId,
      totalBrands: items.length,
      parallelActive,
      worker: external ? "vps" : process.env.VERCEL ? "vercel" : "in-process",
      message: `Rédaction outreach serveur (${items.length}) — tu peux quitter.`,
    });
  } catch (e) {
    console.error("POST /api/casting/outreach-draft-jobs:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Impossible de créer le job.",
      },
      { status: 500 }
    );
  }
}
