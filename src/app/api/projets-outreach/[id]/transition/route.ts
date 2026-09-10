import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canTransitionTo,
  isProjetsOutreachRole,
  isValidCampaignStatus,
  STATUS_LABEL,
  type CampaignStatus,
} from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string }> };

const EVENT_BY_STATUS: Record<CampaignStatus, string> = {
  BRIEF: "STATUS_CHANGED",
  BRANDS: "BRIEF_READY",
  DRAFTING: "READY_FOR_DRAFTING",
  SENDING: "READY_FOR_SENDING",
  ACTIVE: "ACTIVATED",
  CLOSED: "CLOSED",
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const body = (await request.json()) as { status?: string; note?: string };
    const nextStatus = String(body.status || "").trim().toUpperCase();
    if (!isValidCampaignStatus(nextStatus)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        talent: { select: { managerId: true } },
        _count: { select: { contactMissions: true } },
      },
    });
    if (!campaign) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    const from = campaign.status as CampaignStatus;
    if (from === nextStatus) {
      return NextResponse.json({ campaign });
    }

    if (!canTransitionTo(session.user.role, from, nextStatus)) {
      return NextResponse.json(
        {
          error: `Transition ${STATUS_LABEL[from]} → ${STATUS_LABEL[nextStatus]} non autorisée pour ton rôle.`,
        },
        { status: 403 }
      );
    }

    // Garde-fous métier
    if (nextStatus === "DRAFTING" && campaign._count.contactMissions === 0) {
      return NextResponse.json(
        { error: "Ajoute au moins une marque avant de passer en rédaction." },
        { status: 400 }
      );
    }

    const updated = await prisma.talentProspectingCampaign.update({
      where: { id: campaignId },
      data: {
        status: nextStatus,
        ...(nextStatus === "CLOSED" ? { isActive: false } : {}),
        ...(nextStatus === "ACTIVE" || nextStatus === "SENDING" || nextStatus === "DRAFTING"
          ? { isActive: true }
          : {}),
      },
    });

    const note = String(body.note || "").trim();
    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: EVENT_BY_STATUS[nextStatus],
        message:
          note ||
          `Statut : ${STATUS_LABEL[from]} → ${STATUS_LABEL[nextStatus]}`,
        payload: { from, to: nextStatus },
      },
    });

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    console.error("POST /api/projets-outreach/[id]/transition:", error);
    return NextResponse.json({ error: "Erreur lors de la transition" }, { status: 500 });
  }
}
