import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * POST — retire une mission de la file d'enrichissement
 * (contacts prêts / traité).
 */
const ALLOWED = ["ADMIN", "CASTING_MANAGER", "HEAD_OF", "HEAD_OF_SALES"] as const;

export async function POST(
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
        marqueId: true,
        campaignId: true,
        awaitingContactsCompletion: true,
        marque: { select: { nom: true } },
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    await prisma.contactMission.update({
      where: { id: missionId },
      data: { awaitingContactsCompletion: false },
    });

    const name = mission.marque?.nom || mission.targetBrand;
    if (mission.campaignId) {
      await prisma.prospectingCampaignEvent.create({
        data: {
          campaignId: mission.campaignId,
          type: "MARQUE_COMPLETION_RESOLVED",
          message: `${name} — contacts prêts (enrichissement)`,
          payload: {
            missionId,
            marqueId: mission.marqueId,
            marqueName: name,
            source: "resolve-enrichissement",
          },
          actorId: session.user.id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      missionId,
      awaitingContactsCompletion: false,
      message: `${name} retirée de la file d'enrichissement.`,
    });
  } catch (error) {
    console.error("POST .../resolve-enrichissement:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
