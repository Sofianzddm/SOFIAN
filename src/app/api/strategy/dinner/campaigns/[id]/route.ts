import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy, parseCampaignStatus } from "@/app/api/strategy/dinner/_utils";

function normalizeLogoUrl(value?: string | null): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function normalizeEventPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .map((url) => (/^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`));
}

export async function GET(
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

    const { id } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { id },
      include: {
        candidates: {
          include: {
            talent: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                photo: true,
                instagram: true,
              },
            },
          },
          orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        projetSlug: campaign.projetSlug,
        name: campaign.name,
        clientName: campaign.clientName,
        logoUrl: campaign.logoUrl,
        clientAccessToken: campaign.clientAccessToken,
        clientUrl: `/dinner-client/${campaign.clientAccessToken}`,
        city: campaign.city,
        eventDate: campaign.eventDate,
        eventPhotos: Array.isArray(campaign.eventPhotos) ? campaign.eventPhotos : [],
        reportingSummary: campaign.reportingSummary,
        reportingKpis: campaign.reportingKpis,
        budgetMin: campaign.budgetMin,
        budgetMax: campaign.budgetMax,
        status: campaign.status.toLowerCase(),
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
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
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        talent: c.talent,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/dinner/campaigns/[id]:", error);
    return NextResponse.json({ error: "Erreur lors du chargement de la campagne diner" }, { status: 500 });
  }
}

export async function PATCH(
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

    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      clientName?: string;
      logoUrl?: string | null;
      city?: string | null;
      eventDate?: string | null;
      eventPhotos?: string[];
      reportingSummary?: string | null;
      reportingKpis?: Record<string, unknown> | null;
      status?: string;
    };

    const existing = await prisma.dinnerCampaign.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    const nextName = body.name === undefined ? undefined : body.name.trim();
    const nextClientName = body.clientName === undefined ? undefined : body.clientName.trim();
    if (nextName !== undefined && !nextName) {
      return NextResponse.json({ error: "name invalide" }, { status: 400 });
    }
    if (nextClientName !== undefined && !nextClientName) {
      return NextResponse.json({ error: "clientName invalide" }, { status: 400 });
    }

    const updated = await prisma.dinnerCampaign.update({
      where: { id },
      data: {
        name: nextName,
        clientName: nextClientName,
        logoUrl: body.logoUrl === undefined ? undefined : normalizeLogoUrl(body.logoUrl),
        city: body.city === undefined ? undefined : body.city?.trim() || null,
        eventDate:
          body.eventDate === undefined ? undefined : body.eventDate ? new Date(body.eventDate) : null,
        eventPhotos: body.eventPhotos === undefined ? undefined : normalizeEventPhotos(body.eventPhotos),
        reportingSummary:
          body.reportingSummary === undefined ? undefined : body.reportingSummary?.trim() || null,
        reportingKpis:
          body.reportingKpis === undefined
            ? undefined
            : body.reportingKpis === null
              ? undefined
              : (body.reportingKpis as Prisma.InputJsonValue),
        status: body.status === undefined ? undefined : parseCampaignStatus(body.status) ?? undefined,
      },
    });

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    console.error("Erreur PATCH /api/strategy/dinner/campaigns/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise a jour de la campagne" }, { status: 500 });
  }
}

