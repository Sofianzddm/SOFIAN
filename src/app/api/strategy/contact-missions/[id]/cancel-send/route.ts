import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["HEAD_OF_SALES", "ADMIN", "HEAD_OF"] as const;
const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const mission = await contactMissionModel.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        scheduledSendAt: true,
        sentAt: true,
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    if (mission.sentAt) {
      return NextResponse.json(
        { error: "Le mail a deja ete envoye, impossible d'annuler." },
        { status: 409 }
      );
    }
    if (!mission.scheduledSendAt) {
      return NextResponse.json(
        { error: "Aucun envoi planifie pour cette mission." },
        { status: 409 }
      );
    }

    const updated = await contactMissionModel.update({
      where: { id },
      data: {
        scheduledSendAt: null,
        stage: "DRAFTED_FOR_VALIDATION",
        status: "EMAIL_DRAFTED",
      },
    });

    return NextResponse.json({ mission: updated });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/cancel-send:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
