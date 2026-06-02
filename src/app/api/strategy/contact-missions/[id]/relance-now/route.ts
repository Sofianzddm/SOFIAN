import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  buildCastingRelanceDraft,
  executeCastingRelance,
} from "@/lib/casting-auto-send";

// GET  → prévisualisation (sujet + corps + destinataires) sans envoi
// POST → envoie la relance immédiatement (avec sujet/corps optionnels)

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "ADMIN",
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

function unauthorized() {
  return NextResponse.json({ error: "Non autorise" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
}

async function loadMission(id: string) {
  return contactMissionModel.findUnique({
    where: { id },
    select: {
      id: true,
      sentAt: true,
      replied: true,
      relanceSentAt: true,
      relanceCancelledAt: true,
      targetBrand: true,
      draftEmailSubject: true,
    },
  });
}

function preflight(mission: {
  sentAt: Date | null;
  replied: boolean;
  relanceSentAt: Date | null;
} | null) {
  if (!mission) return { error: "Mission introuvable.", status: 404 };
  if (!mission.sentAt)
    return { error: "Le mail initial n'a pas encore été envoyé.", status: 409 };
  if (mission.replied)
    return { error: "Le client a répondu, relance bloquée.", status: 409 };
  if (mission.relanceSentAt)
    return { error: "Une relance a déjà été envoyée.", status: 409 };
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) return unauthorized();
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as AllowedRole)) return forbidden();

    const { id } = await params;
    const mission = await loadMission(id);
    const err = preflight(mission);
    if (err) return NextResponse.json({ error: err.error }, { status: err.status });

    const draft = await buildCastingRelanceDraft(id);
    return NextResponse.json({ draft, mission });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions/[id]/relance-now:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) return unauthorized();
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as AllowedRole)) return forbidden();

    const { id } = await params;
    const mission = await loadMission(id);
    const err = preflight(mission);
    if (err) return NextResponse.json({ error: err.error }, { status: err.status });

    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      body?: string;
    };

    const outcome = await executeCastingRelance(id, {
      subjectOverride: body.subject,
      bodyOverride: body.body,
    });

    if (outcome.succeeded === 0) {
      return NextResponse.json(
        {
          error:
            outcome.errors[0] ||
            "Aucune relance envoyée (aucun destinataire valide ou échec Gmail).",
          outcome,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/relance-now:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
