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
  "HEAD_OF_SALES", "BUSINESS_DEVELOPER",
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
        draftEmailSubject: true,
        draftEmailBody: true,
      },
    });
    const byId = new Map(missions.map((m) => [m.id, m]));

    // Déjà en file / en cours sur un autre job → évite le double Grok (ex. double-clic).
    const busyRows = await prisma.castingIndivDraftItem.findMany({
      where: {
        missionId: { in: missionIds },
        status: { in: ["pending", "running"] },
        job: {
          userId: session.user.id,
          status: { in: ["pending", "running"] },
        },
      },
      select: { missionId: true },
    });
    const busyMissionIds = new Set(busyRows.map((r) => r.missionId));

    type DraftItem = {
      missionId: string;
      talentId: string;
      brandName: string;
      draftContext?: string | null;
    };
    const contextByMission = new Map<string, string | null>();
    for (const raw of rawItems) {
      const id = String(raw?.missionId || "").trim();
      if (!id || raw?.draftContext === undefined) continue;
      contextByMission.set(id, String(raw.draftContext || "").trim() || null);
    }

    let skippedSent = 0;
    let skippedDrafted = 0;
    let skippedBusy = 0;

    const items: DraftItem[] = missionIds.flatMap((id: string) => {
      const m = byId.get(id);
      if (!m || !m.talentId) return [];
      if (m.sentAt || m.stage === "SENT") {
        skippedSent += 1;
        return [];
      }
      // Déjà un brouillon prêt → ne pas rerun le trio Grok.
      if (
        m.stage === "DRAFTED_FOR_VALIDATION" &&
        String(m.draftEmailSubject || "").trim() &&
        String(m.draftEmailBody || "").trim()
      ) {
        skippedDrafted += 1;
        return [];
      }
      if (busyMissionIds.has(m.id)) {
        skippedBusy += 1;
        return [];
      }
      return [
        {
          missionId: m.id,
          talentId: m.talentId,
          brandName: (m.marque?.nom || m.targetBrand || "").trim() || "Marque",
          draftContext: contextByMission.has(id)
            ? contextByMission.get(id)!
            : undefined,
        },
      ];
    });

    if (items.length === 0) {
      const parts = [
        skippedSent ? `${skippedSent} déjà envoyée(s)` : null,
        skippedDrafted ? `${skippedDrafted} déjà draftée(s)` : null,
        skippedBusy ? `${skippedBusy} déjà en file` : null,
      ].filter(Boolean);
      return NextResponse.json(
        {
          error: parts.length
            ? `Aucune mission éligible (${parts.join(", ")}).`
            : "Aucune mission éligible (déjà envoyées ou introuvables).",
          skippedSent,
          skippedDrafted,
          skippedBusy,
        },
        { status: 400 }
      );
    }

    // Persiste le contexte ops (wizard) avant génération → le mail s'y adapte.
    await Promise.all(
      items
        .filter((it) => it.draftContext !== undefined)
        .map((it) =>
          prisma.contactMission.update({
            where: { id: it.missionId },
            data: { draftContext: it.draftContext ?? null },
          })
        )
    );

    const { jobId } = await createIndivDraftJob({
      userId: session.user.id,
      talentId,
      items: items.map(({ missionId, talentId: tid, brandName }) => ({
        missionId,
        talentId: tid,
        brandName,
      })),
    });

    kickIndivDraftJobProcess(jobId);

    const parallelActive = await prisma.castingIndivDraftJob.count({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "running"] },
      },
    });

    const external = process.env.CASTING_FIT_EXTERNAL_WORKER === "1";
    const skippedBits = [
      skippedSent ? `${skippedSent} envoyée(s)` : null,
      skippedDrafted ? `${skippedDrafted} draftée(s)` : null,
      skippedBusy ? `${skippedBusy} en file` : null,
    ].filter(Boolean);
    return NextResponse.json({
      jobId,
      totalMissions: items.length,
      skippedSent,
      skippedDrafted,
      skippedBusy,
      parallelActive,
      worker: external ? "vps" : process.env.VERCEL ? "vercel" : "in-process",
      message: `Job indiv lancé (${items.length} mission${
        items.length > 1 ? "s" : ""
      }${skippedBits.length ? ` · skip ${skippedBits.join(", ")}` : ""} · ${parallelActive} actif${
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
