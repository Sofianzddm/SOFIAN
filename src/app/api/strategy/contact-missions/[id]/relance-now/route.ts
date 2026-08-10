import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  buildCastingRelanceDraft,
  executeCastingRelance,
} from "@/lib/casting-auto-send";

// GET  → prévisualisation (sujet + corps + destinataires) sans envoi
// POST → envoie la relance immédiatement (avec sujet/corps optionnels)
//
// Relance manuelle : possible même si une 1ʳᵉ relance a déjà été envoyée
// (round 2 « valeur ajoutée »). On peut aussi renvoyer après R2 (force).

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
      relance2SentAt: true,
      relanceCancelledAt: true,
      targetBrand: true,
      draftEmailSubject: true,
    },
  });
}

function preflight(mission: {
  sentAt: Date | null;
} | null) {
  if (!mission) return { error: "Mission introuvable.", status: 404 };
  if (!mission.sentAt)
    return { error: "Le mail initial n'a pas encore été envoyé.", status: 409 };
  // NB : la relance manuelle reste possible même si une relance a déjà été
  // envoyée (R1 → R2, ou renvoi manuel après R2). La détection se fait PAR
  // CONTACT (buildCastingRelanceDraft + executeCastingRelance excluent
  // automatiquement les contacts qui ont répondu).
  return null;
}

function resolveRound(mission: {
  relanceSentAt: Date | null;
}): 1 | 2 {
  return mission.relanceSentAt ? 2 : 1;
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

    const round = resolveRound(mission!);
    const draft = await buildCastingRelanceDraft(id, { round });
    return NextResponse.json({ draft, mission, round });
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
      round?: 1 | 2;
      /** Destinataires cochés côté UI ; si omis → tous les contacts éligibles. */
      includeEmails?: string[];
    };

    const round: 1 | 2 =
      body.round === 1 || body.round === 2 ? body.round : resolveRound(mission!);

    const includeEmails = Array.isArray(body.includeEmails)
      ? body.includeEmails.filter((e) => typeof e === "string" && e.trim())
      : undefined;

    if (includeEmails && includeEmails.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire sélectionné pour la relance." },
        { status: 400 }
      );
    }

    const outcome = await executeCastingRelance(id, {
      subjectOverride: body.subject,
      bodyOverride: body.body,
      round,
      includeEmails,
    });

    if (outcome.succeeded === 0) {
      const allHandled =
        outcome.attempted === 0 &&
        (outcome.skippedReplied > 0 || outcome.skippedBounced > 0);
      return NextResponse.json(
        {
          error: allHandled
            ? "Aucune relance à envoyer : tous les contacts ont déjà répondu (ou leur adresse est en échec de remise)."
            : outcome.errors[0] ||
              "Aucune relance envoyée (aucun destinataire valide ou échec Gmail).",
          outcome,
        },
        { status: allHandled ? 409 : 502 }
      );
    }

    return NextResponse.json({ ok: true, outcome, round });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/[id]/relance-now:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
