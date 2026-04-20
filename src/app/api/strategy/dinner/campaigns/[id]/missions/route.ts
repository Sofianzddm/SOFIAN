import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy } from "@/app/api/strategy/dinner/_utils";
import { normalizeMissionBrandKey, parseMissionPriority } from "@/lib/contact-missions";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!canAccessDinnerStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: campaignId } = await context.params;
    const missions = await prisma.contactMission.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      missions: missions.map((m) => ({
        id: m.id,
        campaignId: m.campaignId,
        candidateId: m.candidateId,
        creatorName: m.creatorName,
        targetBrand: m.targetBrand,
        strategyReason: m.strategyReason,
        recommendedAngle: m.recommendedAngle,
        objective: m.objective,
        dos: m.dos,
        donts: m.donts,
        priority: m.priority,
        status: m.status,
        deadlineAt: m.deadlineAt,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/strategy/dinner/campaigns/[id]/missions:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des missions" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!canAccessDinnerStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: campaignId } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    const body = (await request.json()) as {
      candidateId?: string | null;
      creatorName?: string;
      targetBrand?: string;
      strategyReason?: string;
      recommendedAngle?: string | null;
      objective?: string | null;
      dos?: string | null;
      donts?: string | null;
      priority?: unknown;
      deadlineAt?: string | null;
    };

    const creatorName = String(body.creatorName || "").trim();
    const targetBrand = String(body.targetBrand || "").trim();
    const strategyReason = String(body.strategyReason || "").trim();
    if (!creatorName || !targetBrand || !strategyReason) {
      return NextResponse.json(
        { error: "creatorName, targetBrand et strategyReason sont requis." },
        { status: 400 }
      );
    }

    const targetBrandKey = normalizeMissionBrandKey(targetBrand);
    if (!targetBrandKey) {
      return NextResponse.json({ error: "Marque cible invalide." }, { status: 400 });
    }

    const candidateId = String(body.candidateId || "").trim() || null;
    if (candidateId) {
      const candidate = await prisma.dinnerCreatorCandidate.findFirst({
        where: { id: candidateId, campaignId },
        select: { id: true },
      });
      if (!candidate) {
        return NextResponse.json(
          { error: "Le createur n'appartient pas a cette campagne." },
          { status: 400 }
        );
      }
    }

    const mission = await prisma.contactMission.create({
      data: {
        campaignId,
        candidateId,
        creatorName,
        targetBrand,
        targetBrandKey,
        strategyReason,
        recommendedAngle: String(body.recommendedAngle || "").trim() || null,
        objective: String(body.objective || "").trim() || null,
        dos: String(body.dos || "").trim() || null,
        donts: String(body.donts || "").trim() || null,
        priority: parseMissionPriority(body.priority),
        deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : null,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    console.error("POST /api/strategy/dinner/campaigns/[id]/missions:", error);
    return NextResponse.json({ error: "Erreur lors de la creation de mission" }, { status: 500 });
  }
}
