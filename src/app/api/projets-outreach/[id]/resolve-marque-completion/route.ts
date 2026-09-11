import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { isProjetsOutreachRole } from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST → débloque une marque après complétion des contacts CRM.
 * Body: { missionId: string }
 *
 * Accessible aux rôles projets-outreach (typiquement ADMIN après avoir
 * complété la fiche).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as { missionId?: string };
    const missionId = String(body.missionId || "").trim();
    if (!missionId) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }

    const mission = await prisma.contactMission.findFirst({
      where: { id: missionId, campaignId },
      select: {
        id: true,
        targetBrand: true,
        marqueId: true,
        awaitingContactsCompletion: true,
        marque: { select: { nom: true } },
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    await prisma.contactMission.update({
      where: { id: missionId },
      data: {
        awaitingContactsCompletion: false,
      },
    });

    const name = mission.marque?.nom || mission.targetBrand;
    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        type: "MARQUE_COMPLETION_RESOLVED",
        message: `${name} — contacts prêts, rédaction débloquée`,
        payload: {
          missionId,
          marqueId: mission.marqueId,
          marqueName: name,
        },
        actorId: session.user.id,
      },
    });

    const stillBlocked = await prisma.contactMission.count({
      where: { campaignId, awaitingContactsCompletion: true },
    });

    return NextResponse.json({
      ok: true,
      missionId,
      awaitingContactsCompletion: false,
      stillBlocked,
      message:
        stillBlocked > 0
          ? `${name} débloquée. ${stillBlocked} autre(s) marque(s) encore en attente.`
          : `${name} débloquée — rédaction autorisée sur le projet.`,
    });
  } catch (error) {
    console.error("POST /api/projets-outreach/[id]/resolve-marque-completion:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
