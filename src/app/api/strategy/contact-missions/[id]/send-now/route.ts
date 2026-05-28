import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { executeCastingSend } from "@/lib/casting-auto-send";

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
        sentAt: true,
        scheduledSendAt: true,
        stage: true,
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }
    if (mission.sentAt) {
      return NextResponse.json({ error: "Mail deja envoye." }, { status: 409 });
    }
    if (!mission.scheduledSendAt) {
      return NextResponse.json(
        { error: "Aucun envoi planifie (annulation deja effectuee ?)." },
        { status: 409 }
      );
    }

    const outcome = await executeCastingSend(id);

    return NextResponse.json({
      ok: outcome.succeeded > 0,
      attempted: outcome.attempted,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      errors: outcome.errors,
    });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/send-now:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
