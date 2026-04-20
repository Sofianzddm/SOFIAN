import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

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

const campaignModel = (prisma as unknown as { talentProspectingCampaign: any }).talentProspectingCampaign;
const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const activeParam = String(request.nextUrl.searchParams.get("active") || "").trim();
    const mineParam = String(request.nextUrl.searchParams.get("mine") || "").trim().toLowerCase();
    const where: Record<string, unknown> = {};
    if (activeParam === "1" || activeParam === "true") where.isActive = true;
    if ((mineParam === "1" || mineParam === "true") && session.user.role === "STRATEGY_PLANNER") {
      where.createdById = session.user.id;
    }

    const campaigns = await campaignModel.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
      },
      take: 200,
    });

    const campaignIds = campaigns.map((c: any) => c.id);
    const stageAgg = campaignIds.length
      ? await contactMissionModel.groupBy({
          by: ["campaignId", "stage"],
          where: { campaignId: { in: campaignIds } },
          _count: { _all: true },
        })
      : [];

    const byCampaign: Record<string, { total: number; answered: number; byStage: Record<string, number> }> = {};
    for (const row of stageAgg as Array<{ campaignId: string; stage: string; _count: { _all: number } }>) {
      const k = row.campaignId;
      if (!byCampaign[k]) byCampaign[k] = { total: 0, answered: 0, byStage: {} };
      byCampaign[k].total += row._count._all;
      byCampaign[k].byStage[row.stage] = row._count._all;
      if (row.stage === "RESPONSE_RECEIVED" || row.stage === "IN_NEGOTIATION" || row.stage === "WON") {
        byCampaign[k].answered += row._count._all;
      }
    }

    return NextResponse.json({
      campaigns: campaigns.map((c: any) => {
        const stats = byCampaign[c.id] || { total: 0, answered: 0, byStage: {} };
        const responseRate = stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0;
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          isActive: c.isActive,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          createdAt: c.createdAt,
          talentId: c.talentId,
          talentName: `${c.talent?.prenom ?? ""} ${c.talent?.nom ?? ""}`.trim(),
          missionCount: stats.total,
          responseRate,
          byStage: stats.byStage,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/strategy/prospecting-campaigns:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des campagnes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      talentId?: string;
      startsAt?: string | null;
      endsAt?: string | null;
      isActive?: boolean;
    };
    const title = String(body.title || "").trim();
    const talentId = String(body.talentId || "").trim();
    if (!title || !talentId) {
      return NextResponse.json({ error: "title et talentId sont requis." }, { status: 400 });
    }

    const talent = await prisma.talent.findUnique({ where: { id: talentId }, select: { id: true } });
    if (!talent) return NextResponse.json({ error: "Talent introuvable." }, { status: 404 });

    const campaign = await campaignModel.create({
      data: {
        title,
        description: String(body.description || "").trim() || null,
        talentId,
        createdById: session.user.id,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("POST /api/strategy/prospecting-campaigns:", error);
    return NextResponse.json({ error: "Erreur lors de la creation de campagne" }, { status: 500 });
  }
}
