import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canCreateCampaign, isProjetsOutreachRole } from "@/lib/projets-outreach";
import {
  getOrCreateCollectingWave,
  WAVE_STATUS_LABEL,
} from "@/lib/brand-condensation";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const activeOnly =
      String(request.nextUrl.searchParams.get("active") || "1").trim() !== "0";

    const waves = await prisma.outreachWave.findMany({
      where: activeOnly
        ? { status: { in: ["COLLECTING", "REVIEWING_CONDENSATIONS", "OPEN_FOR_DRAFTING"] } }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        createdBy: { select: { prenom: true, nom: true } },
        _count: { select: { campaigns: true, clusters: true } },
        clusters: {
          select: {
            id: true,
            targetBrand: true,
            targetBrandKey: true,
            marqueId: true,
            decision: true,
            primaryMissionId: true,
            condensationGroupId: true,
            _count: { select: { missions: true } },
            missions: {
              select: {
                id: true,
                creatorName: true,
                talentId: true,
                campaignId: true,
                condensationRole: true,
                sentAt: true,
                campaign: { select: { title: true, status: true } },
              },
            },
          },
        },
        campaigns: {
          select: {
            id: true,
            title: true,
            status: true,
            talent: { select: { prenom: true, nom: true } },
            _count: { select: { contactMissions: true } },
          },
        },
      },
    });

    return NextResponse.json({
      waves: waves.map((w) => ({
        id: w.id,
        title: w.title,
        status: w.status,
        statusLabel: WAVE_STATUS_LABEL[w.status],
        createdAt: w.createdAt,
        completedAt: w.completedAt,
        validatedAt: w.validatedAt,
        createdByName: `${w.createdBy.prenom} ${w.createdBy.nom}`.trim(),
        campaignCount: w._count.campaigns,
        clusterCount: w._count.clusters,
        campaigns: w.campaigns.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          talentName: `${c.talent.prenom} ${c.talent.nom}`.trim(),
          missionCount: c._count.contactMissions,
        })),
        clusters: w.clusters.map((cl) => ({
          id: cl.id,
          targetBrand: cl.targetBrand,
          targetBrandKey: cl.targetBrandKey,
          marqueId: cl.marqueId,
          decision: cl.decision,
          primaryMissionId: cl.primaryMissionId,
          condensationGroupId: cl.condensationGroupId,
          missionCount: cl._count.missions,
          missions: cl.missions.map((m) => ({
            id: m.id,
            creatorName: m.creatorName,
            talentId: m.talentId,
            campaignId: m.campaignId,
            campaignTitle: m.campaign?.title ?? null,
            campaignStatus: m.campaign?.status ?? null,
            condensationRole: m.condensationRole,
            sentAt: m.sentAt,
          })),
        })),
      })),
    });
  } catch (error) {
    console.error("GET /api/projets-outreach/waves:", error);
    return NextResponse.json({ error: "Erreur chargement vagues" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canCreateCampaign(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const wave = await getOrCreateCollectingWave({
      actorId: session.user.id,
      title: body.title,
    });

    return NextResponse.json({ wave }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projets-outreach/waves:", error);
    return NextResponse.json({ error: "Erreur création vague" }, { status: 500 });
  }
}
