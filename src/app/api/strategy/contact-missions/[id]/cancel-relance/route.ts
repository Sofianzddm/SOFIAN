import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

// Stoppe / reactive les relances auto (J+3 puis J+10) d'une carte du pipeline
// prospection talent. `relanceCancelledAt` bloque les DEUX rounds : on peut donc
// stopper la relance 2 meme si la relance 1 est deja partie.
// - POST   : set `relanceCancelledAt = now()` → le cron ignorera la mission
// - DELETE : set `relanceCancelledAt = null` → le cron reprendra son traitement

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "ADMIN",
] as const;

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

function unauthorized() {
  return NextResponse.json({ error: "Non autorise" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) return unauthorized();
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return forbidden();
    }

    const { id } = await params;
    const mission = await contactMissionModel.findUnique({
      where: { id },
      select: {
        id: true,
        sentAt: true,
        replied: true,
        relanceSentAt: true,
        relance2SentAt: true,
        relanceCancelledAt: true,
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }
    if (!mission.sentAt) {
      return NextResponse.json(
        { error: "Le mail initial n'a pas encore ete envoye." },
        { status: 409 }
      );
    }
    // NB : on autorise le stop meme si `replied=true`. Une reponse d'UN contact
    // ne stoppe plus la relance des autres : tant qu'une relance reste a
    // envoyer, l'utilisateur peut encore la stopper manuellement.
    if (mission.relanceSentAt && mission.relance2SentAt) {
      return NextResponse.json(
        { error: "Les deux relances ont deja ete envoyees, plus rien a stopper." },
        { status: 409 }
      );
    }

    const updated = await contactMissionModel.update({
      where: { id },
      data: {
        relanceCancelledAt: mission.relanceCancelledAt ?? new Date(),
        relanceCancelledById: session.user.id,
      },
      select: {
        id: true,
        relanceCancelledAt: true,
        relanceCancelledById: true,
      },
    });

    return NextResponse.json({ mission: updated });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/cancel-relance:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) return unauthorized();
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return forbidden();
    }

    const { id } = await params;
    const mission = await contactMissionModel.findUnique({
      where: { id },
      select: {
        id: true,
        relanceCancelledAt: true,
        relanceSentAt: true,
        relance2SentAt: true,
        replied: true,
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }
    if (mission.relanceSentAt && mission.relance2SentAt) {
      return NextResponse.json(
        { error: "Les deux relances ont deja ete envoyees, reactivation inutile." },
        { status: 409 }
      );
    }
    if (mission.replied) {
      return NextResponse.json(
        { error: "Le client a deja repondu, aucune relance ne sera envoyee." },
        { status: 409 }
      );
    }

    const updated = await contactMissionModel.update({
      where: { id },
      data: {
        relanceCancelledAt: null,
        relanceCancelledById: null,
      },
      select: {
        id: true,
        relanceCancelledAt: true,
        relanceCancelledById: true,
      },
    });

    return NextResponse.json({ mission: updated });
  } catch (error) {
    console.error("DELETE /api/strategy/contact-missions/[id]/cancel-relance:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
