import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { normalizeMissionBrandKey } from "@/lib/contact-missions";

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const brandsParam = request.nextUrl.searchParams.get("brands");
    const brandKeys = (brandsParam || "")
      .split(",")
      .map((v) => normalizeMissionBrandKey(v))
      .filter(Boolean);

    if (brandKeys.length === 0) {
      return NextResponse.json({ missionsByBrand: {} });
    }

    const missions = await prisma.contactMission.findMany({
      where: {
        targetBrandKey: { in: brandKeys },
        status: { in: ["READY_FOR_CASTING", "EMAIL_DRAFTED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        campaign: { select: { id: true, name: true } },
        candidate: { select: { id: true, fullName: true } },
      },
      take: 300,
    });

    const byBrand: Record<string, unknown> = {};
    for (const key of brandKeys) {
      const m = missions.find((mission) => mission.targetBrandKey === key);
      if (!m) continue;
      byBrand[key] = {
        id: m.id,
        campaignId: m.campaignId,
        campaignName: m.campaign.name,
        candidateId: m.candidateId,
        candidateName: m.candidate?.fullName || null,
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
      };
    }

    return NextResponse.json({ missionsByBrand: byBrand });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des missions" }, { status: 500 });
  }
}
