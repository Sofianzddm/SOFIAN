import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCandidateSource } from "@/app/api/strategy/dinner/_utils";

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { clientAccessToken: token },
      include: {
        candidates: {
          include: {
            talent: {
              select: { id: true, prenom: true, nom: true, photo: true, instagram: true },
            },
          },
          orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!campaign) return NextResponse.json({ error: "Lien prive invalide" }, { status: 404 });

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        clientName: campaign.clientName,
        logoUrl: campaign.logoUrl,
        city: campaign.city,
        eventDate: campaign.eventDate,
        eventPhotos: Array.isArray(campaign.eventPhotos) ? campaign.eventPhotos : [],
        reportingSummary: campaign.reportingSummary,
        reportingKpis: campaign.reportingKpis,
        status: campaign.status.toLowerCase(),
      },
      candidates: campaign.candidates.map((c) => ({
        id: c.id,
        campaignId: c.campaignId,
        talentId: c.talentId,
        fullName: c.fullName,
        manualHandle: c.manualHandle,
        manualPlatform: c.manualPlatform,
        followers: c.followers,
        engagementRate: c.engagementRate,
        estimatedCost: c.estimatedCost,
        notePlanner: c.notePlanner,
        noteClient: c.noteClient,
        source: c.source.toLowerCase(),
        status: c.status.toLowerCase(),
        rejectionReason: c.rejectionReason,
        position: c.position,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/dinner/public/[token]:", error);
    return NextResponse.json({ error: "Erreur lors du chargement de la campagne" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { clientAccessToken: token },
      select: { id: true, status: true, createdById: true },
    });
    if (!campaign) return NextResponse.json({ error: "Lien prive invalide" }, { status: 404 });
    if (campaign.status === "FINALIZED") {
      return NextResponse.json({ error: "Campagne finalisee, ajout impossible" }, { status: 400 });
    }

    const body = (await request.json()) as {
      fullName?: string;
      manualHandle?: string;
      manualPlatform?: string;
      noteClient?: string | null;
      source?: string;
    };

    const fullName = (body.fullName || "").trim();
    const manualHandle = normalizeHandle(body.manualHandle || "");
    if (!fullName) {
      return NextResponse.json({ error: "fullName requis" }, { status: 400 });
    }

    if (manualHandle) {
      const duplicate = await prisma.dinnerCreatorCandidate.findFirst({
        where: {
          campaignId: campaign.id,
          manualHandle,
          manualPlatform: (body.manualPlatform || "").trim() || null,
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Ce createur existe deja dans la campagne" }, { status: 409 });
      }
    }

    const last = await prisma.dinnerCreatorCandidate.findFirst({
      where: { campaignId: campaign.id, status: "PROPOSED" },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const candidate = await prisma.dinnerCreatorCandidate.create({
      data: {
        campaignId: campaign.id,
        fullName,
        manualHandle: manualHandle || null,
        manualPlatform: (body.manualPlatform || "").trim() || null,
        source: parseCandidateSource(body.source) ?? "CLIENT",
        status: "PROPOSED",
        noteClient: body.noteClient ?? null,
        position: (last?.position ?? -1) + 1,
        // audit minimum: attribué au créateur de campagne
        createdById: campaign.createdById,
        updatedById: campaign.createdById,
      },
    });

    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/public/[token]:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout du createur" }, { status: 500 });
  }
}

