import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * DELETE /api/strategy/contact-missions/[id]
 * Supprime une carte pipeline (hors marques déjà contactées).
 */
const ALLOWED = ["ADMIN", "HEAD_OF", "STRATEGY_PLANNER", "CASTING_MANAGER"] as const;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED.includes((session.user.role || "") as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: missionId } = await params;
    const mission = await prisma.contactMission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        targetBrand: true,
        creatorName: true,
        sentAt: true,
        stage: true,
        campaignId: true,
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    if (
      mission.sentAt ||
      mission.stage === "SENT" ||
      mission.stage === "RESPONSE_RECEIVED" ||
      mission.stage === "IN_NEGOTIATION" ||
      mission.stage === "WON"
    ) {
      return NextResponse.json(
        {
          error:
            "Impossible de supprimer une marque déjà contactée — passe-la en « Perdu » si besoin.",
        },
        { status: 400 }
      );
    }

    await prisma.contactMission.delete({ where: { id: missionId } });

    if (mission.campaignId) {
      await prisma.prospectingCampaignEvent.create({
        data: {
          campaignId: mission.campaignId,
          actorId: session.user.id,
          type: "BRANDS_ADDED",
          message: `Carte supprimée : ${mission.creatorName} → ${mission.targetBrand}`,
          payload: {
            removed: mission.targetBrand,
            missionId,
            source: "pipeline-delete",
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: `${mission.creatorName} → ${mission.targetBrand} supprimée.`,
    });
  } catch (error) {
    console.error("DELETE /api/strategy/contact-missions/[id]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
