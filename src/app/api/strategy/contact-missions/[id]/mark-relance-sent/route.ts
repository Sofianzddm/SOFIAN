import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

// Marque manuellement une mission comme "relance envoyée" sans rien réexpédier.
// Sert au rattrapage quand l'envoi Gmail a réussi mais que la DB n'a pas pu
// être mise à jour (timeout, bug, etc.).

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "ADMIN",
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const mission = await contactMissionModel.findUnique({
      where: { id },
      select: { id: true, relanceSentAt: true, replied: true, sentAt: true },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }
    if (mission.relanceSentAt) {
      return NextResponse.json(
        { error: "Cette mission est déjà marquée comme relancée." },
        { status: 409 }
      );
    }
    if (!mission.sentAt) {
      return NextResponse.json(
        { error: "Le mail initial n'a même pas été envoyé." },
        { status: 409 }
      );
    }

    const updated = await contactMissionModel.update({
      where: { id },
      data: {
        relanceSentAt: new Date(),
        status: "RELANCED",
        relanceCancelledAt: null,
        relanceCancelledById: null,
      },
      select: { id: true, relanceSentAt: true, status: true },
    });

    return NextResponse.json({ ok: true, mission: updated });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/mark-relance-sent:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
