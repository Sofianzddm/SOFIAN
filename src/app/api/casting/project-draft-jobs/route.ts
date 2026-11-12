import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  createProjectDraftJob,
  kickProjectDraftJobProcess,
} from "@/lib/casting-project-draft-job";
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

/** Job projet actif pour une campagne (reprise wizard après fermeture). */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const campaignId = request.nextUrl.searchParams.get("campaignId")?.trim();
    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId requis." },
        { status: 400 }
      );
    }

    const jobs = await prisma.castingProjectDraftJob.findMany({
      where: {
        userId: session.user.id,
        campaignId,
        status: { in: ["pending", "running"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        campaignId: true,
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
    console.error("GET /api/casting/project-draft-jobs:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

/** Crée / append un job rédaction projet (marque → talent → Leyna → mail). */
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
    const campaignId =
      typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId requis." },
        { status: 400 }
      );
    }

    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campagne introuvable." },
        { status: 404 }
      );
    }

    const rawItems = Array.isArray(body?.items) ? body.items : [];
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
      where: { id: { in: missionIds }, campaignId },
      select: {
        id: true,
        talentId: true,
        targetBrand: true,
        selectedTalentIds: true,
        marque: { select: { nom: true } },
        stage: true,
        status: true,
        sentAt: true,
        draftEmailSubject: true,
        draftEmailBody: true,
      },
    });
    const byId = new Map(missions.map((m) => [m.id, m]));

    const contextByMission = new Map<string, string | null>();
    const talentIdsByMission = new Map<string, string[]>();
    for (const raw of rawItems) {
      const id = String(raw?.missionId || "").trim();
      if (!id) continue;
      if (raw?.draftContext !== undefined) {
        contextByMission.set(
          id,
          String(raw.draftContext || "").trim() || null
        );
      }
      if (Array.isArray(raw?.talentIds)) {
        talentIdsByMission.set(
          id,
          raw.talentIds
            .map((t: unknown) => String(t || "").trim())
            .filter(Boolean)
            .slice(0, 8)
        );
      }
    }

    type ProjectDraftItem = {
      missionId: string;
      brandName: string;
      talentIds: string[];
      draftContext?: string | null;
    };
    const items: ProjectDraftItem[] = missionIds.flatMap((id: string) => {
      const m = byId.get(id);
      if (!m || m.sentAt || m.stage === "SENT") return [] as ProjectDraftItem[];
      const alreadyDrafted =
        Boolean(String(m.draftEmailSubject || "").trim()) &&
        Boolean(String(m.draftEmailBody || "").trim()) &&
        (m.stage === "DRAFTED_FOR_VALIDATION" ||
          m.status === "EMAIL_DRAFTED");
      if (alreadyDrafted) return [] as ProjectDraftItem[];
      const fromBody = talentIdsByMission.get(id);
      const talentIds =
        fromBody && fromBody.length > 0
          ? fromBody
          : Array.isArray(m.selectedTalentIds) && m.selectedTalentIds.length > 0
            ? m.selectedTalentIds
            : m.talentId
              ? [m.talentId]
              : [];
      return [
        {
          missionId: m.id,
          brandName: (m.marque?.nom || m.targetBrand || "").trim() || "Marque",
          talentIds,
          draftContext: contextByMission.has(id)
            ? contextByMission.get(id)!
            : undefined,
        },
      ];
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Aucune mission éligible (déjà envoyées ou hors campagne)." },
        { status: 400 }
      );
    }

    // Persiste le contexte ops (wizard) avant génération.
    await Promise.all(
      items
        .filter((it: ProjectDraftItem) => it.draftContext !== undefined)
        .map((it: ProjectDraftItem) =>
          prisma.contactMission.update({
            where: { id: it.missionId },
            data: { draftContext: it.draftContext ?? null },
          })
        )
    );

    const { jobId, totalMissions, appended } = await createProjectDraftJob({
      userId: session.user.id,
      campaignId,
      items: items.map((it: ProjectDraftItem) => ({
        missionId: it.missionId,
        brandName: it.brandName,
        talentIds: it.talentIds,
      })),
    });

    kickProjectDraftJobProcess(jobId);

    const parallelActive = await prisma.castingProjectDraftJob.count({
      where: {
        userId: session.user.id,
        campaignId,
        status: { in: ["pending", "running"] },
      },
    });

    const jobProgress = await prisma.castingProjectDraftJob.findUnique({
      where: { id: jobId },
      select: {
        totalMissions: true,
        completed: true,
        failed: true,
        currentBrandName: true,
      },
    });

    const external = process.env.CASTING_FIT_EXTERNAL_WORKER === "1";
    return NextResponse.json({
      jobId,
      totalMissions: jobProgress?.totalMissions ?? totalMissions,
      completed: jobProgress?.completed ?? 0,
      failed: jobProgress?.failed ?? 0,
      currentBrandName: jobProgress?.currentBrandName ?? null,
      appended,
      parallelActive,
      worker: external ? "vps" : process.env.VERCEL ? "vercel" : "in-process",
      message:
        appended > 0
          ? `Job projet lancé (${appended} marque${appended > 1 ? "s" : ""}) — tu peux quitter la page.`
          : `Job projet déjà en cours — tu peux quitter la page.`,
    });
  } catch (e) {
    console.error("POST /api/casting/project-draft-jobs:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Impossible de créer le job.",
      },
      { status: 500 }
    );
  }
}
