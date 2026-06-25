import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CASTING_SEND_DELAY_MS,
  preflightCastingSend,
} from "@/lib/casting-auto-send";

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
    const mission = await contactMissionModel.findUnique({ where: { id } });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    const preflight = await preflightCastingSend(
      {
        id: mission.id,
        draftEmailSubject: mission.draftEmailSubject,
        draftEmailBody: mission.draftEmailBody,
        clientContacts: mission.clientContacts,
        sentMessageIds: mission.sentMessageIds,
      },
      { force }
    );
    if (!preflight.ok) {
      return NextResponse.json(
        { error: preflight.error, canForce: preflight.canForce === true },
        { status: 400 }
      );
    }

    // Si la mission est deja envoyee (cas reenvoi pour nouveaux contacts),
    // on ne redescend pas le stage en TO_SEND : on garde la carte dans
    // "Envoye" et on programme juste l'envoi additionnel.
    const wasAlreadySent = Boolean(mission.sentAt);
    const scheduledSendAt = new Date(Date.now() + CASTING_SEND_DELAY_MS);
    const updated = await contactMissionModel.update({
      where: { id },
      data: {
        ...(wasAlreadySent
          ? {}
          : { stage: "TO_SEND" as const, status: "APPROVED_BY_SALES" as const }),
        scheduledSendAt,
        sendError: null,
        forceSend: force,
      },
    });

    return NextResponse.json({
      mission: updated,
      scheduledSendAt: scheduledSendAt.toISOString(),
      delayMs: CASTING_SEND_DELAY_MS,
      reachableContacts: preflight.contacts.length,
    });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/schedule-send:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
