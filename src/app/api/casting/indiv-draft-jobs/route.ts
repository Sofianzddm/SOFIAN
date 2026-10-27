import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  createIndivDraftJob,
  kickIndivDraftJobProcess,
} from "@/lib/casting-indiv-draft-job";
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

/** Liste les jobs indiv actifs (parallèle multi-talents OK). */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const talentId = request.nextUrl.searchParams.get("talentId")?.trim();

    const jobs = await prisma.castingIndivDraftJob.findMany({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
        ...(talentId ? { talentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        talentId: true,
        totalMissions: true,
        completed: true,
        failed: true,
        currentBrandName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ active: jobs[0] || null, jobs });
  } catch (e) {
    console.error("GET /api/casting/indiv-draft-jobs:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

/** Crée un job pipeline indiv (marque → talent → Leyna → rédaction). */
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
    const talentId =
      typeof body?.talentId === "string" ? body.talentId.trim() : null;
    const rawItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.missionIds)
        ? body.missionIds.map((id: unknown) => ({ missionId: id }))
        : [];

    const missionIds = rawItems
      .map((it: { missionId?: unknown }) => String(it?.missionId || "").trim())
      .filter(Boolean);

    if (missionIds.length === 0) {
      return NextResponse.json(
        { error: "items[].missionId requis." },
        { status: 400 }
      );
    }

    const missions = await prisma.contactMission.findMany({
      where: { id: { in: missionIds } },
      select: {
        id: true,
        talentId: true,
        targetBrand: true,
        marque: { select: { nom: true } },
        stage: true,
        sentAt: true,
      },
    });
    const byId = new Map(missions.map((m) => [m.id, m]));

    type DraftItem = {
      missionId: string;
      talentId: string;
      brandName: string;
    };
    const items: DraftItem[] = missionIds.flatMap((id: string) => {
      const m = byId.get(id);
      if (!m || m.sentAt || m.stage === "SENT") return [];
      return [
        {
          missionId: m.id,
          talentId: m.talentId,
          brandName: (m.marque?.nom || m.targetBrand || "").trim() || "Marque",
        },
      ];
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Aucune mission éligible (déjà envoyées ou introuvables)." },
        { status: 400 }
      );
    }

    const { jobId } = await createIndivDraftJob({
      userId: session.user.id,
      talentId,
      items,
    });

    kickIndivDraftJobProcess(jobId);

    const parallelActive = await prisma.castingIndivDraftJob.count({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
      },
    });

    const external = process.env.CASTING_FIT_EXTERNAL_WORKER === "1";
    return NextResponse.json({
      jobId,
      totalMissions: items.length,
      parallelActive,
      worker: external ? "vps" : process.env.VERCEL ? "vercel" : "in-process",
      message: `Job indiv lancé (${parallelActive} actif${
        parallelActive > 1 ? "s" : ""
      }) — tu peux quitter la page.`,
    });
  } catch (e) {
    console.error("POST /api/casting/indiv-draft-jobs:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Impossible de créer le job.",
      },
      { status: 500 }
    );
  }
}
