import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessDinnerStrategy,
  parseCandidateSource,
  parseCandidateStatus,
} from "@/app/api/strategy/dinner/_utils";

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = String(session.user.role || "");
    if (!canAccessDinnerStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: campaignId } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }
    if (campaign.status === "FINALIZED") {
      return NextResponse.json({ error: "Campagne finalisee, ajout impossible" }, { status: 400 });
    }

    const body = (await request.json()) as {
      talentId?: string;
      fullName?: string;
      manualHandle?: string;
      manualPlatform?: string;
      followers?: number | null;
      engagementRate?: number | null;
      estimatedCost?: number | null;
      notePlanner?: string | null;
      noteClient?: string | null;
      source?: string;
      status?: string;
    };

    const talentId = (body.talentId || "").trim();
    const source = parseCandidateSource(body.source) ?? "PLANNER";
    const status = parseCandidateStatus(body.status) ?? "PROPOSED";

    let fullName = (body.fullName || "").trim();
    let manualHandle = normalizeHandle(body.manualHandle || "");

    if (!talentId && !fullName) {
      return NextResponse.json({ error: "fullName requis si talentId absent" }, { status: 400 });
    }

    let talentData: { prenom: string; nom: string } | null = null;
    if (talentId) {
      talentData = await prisma.talent.findUnique({
        where: { id: talentId },
        select: { prenom: true, nom: true },
      });
      if (!talentData) {
        return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
      }
      fullName = `${talentData.prenom} ${talentData.nom}`.trim();
    }

    if (talentId) {
      const duplicate = await prisma.dinnerCreatorCandidate.findFirst({
        where: { campaignId, talentId },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Ce createur est deja dans la campagne" }, { status: 409 });
      }
    } else if (manualHandle) {
      const duplicate = await prisma.dinnerCreatorCandidate.findFirst({
        where: {
          campaignId,
          manualHandle,
          manualPlatform: (body.manualPlatform || "").trim() || null,
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Ce handle est deja dans la campagne" }, { status: 409 });
      }
    }

    const last = await prisma.dinnerCreatorCandidate.findFirst({
      where: { campaignId, status },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition = (last?.position ?? -1) + 1;

    const candidate = await prisma.dinnerCreatorCandidate.create({
      data: {
        campaignId,
        talentId: talentId || null,
        fullName,
        manualHandle: manualHandle || null,
        manualPlatform: (body.manualPlatform || "").trim() || null,
        followers: body.followers ?? null,
        engagementRate: body.engagementRate ?? null,
        estimatedCost: body.estimatedCost ?? null,
        notePlanner: body.notePlanner ?? null,
        noteClient: body.noteClient ?? null,
        source,
        status,
        position: nextPosition,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });

    await prisma.dinnerCandidateEvent.create({
      data: {
        candidateId: candidate.id,
        campaignId,
        type: "CREATED",
        toStatus: candidate.status,
        actorId: session.user.id,
      },
    });

    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/campaigns/[id]/candidates:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout du createur" }, { status: 500 });
  }
}

