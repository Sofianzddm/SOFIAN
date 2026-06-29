import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy } from "@/app/api/strategy/_utils";

/**
 * Lecture / édition / suppression d'une proposition de partenariat.
 *  GET    → détail complet (édition agence)
 *  PATCH  → met à jour les blocs configurables
 *  DELETE → supprime la proposition
 */

const EDITABLE_STRING_FIELDS = [
  "nomMarque",
  "marqueId",
  "brandLogoUrl",
  "title",
  "subtitle",
  "coverPhotoUrl",
  "accentColor",
  "introMessage",
  "budgetCurrency",
  "eventLocation",
  "eventDateLabel",
  "contactName",
  "contactEmail",
  "status",
] as const;

const EDITABLE_JSON_FIELDS = ["casting", "castingGroups", "budgetLines", "budgetGroups", "deliverables", "photos", "logistics"] as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const proposal = await prisma.partnershipProposal.findUnique({ where: { id } });
    if (!proposal) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

    const agg = await prisma.partnershipProposalView.aggregate({
      where: { proposalId: id },
      _sum: { durationSec: true },
      _max: { durationSec: true, lastSeenAt: true },
      _count: { _all: true },
    });
    const sessions = agg._count?._all ?? 0;
    const totalTimeSec = agg._sum?.durationSec ?? 0;

    return NextResponse.json({
      proposal: {
        ...proposal,
        publicUrl: `/proposition/${proposal.publicToken}`,
        insights: {
          sessions,
          totalTimeSec,
          avgTimeSec: sessions > 0 ? Math.round(totalTimeSec / sessions) : 0,
          maxTimeSec: agg._max?.durationSec ?? 0,
          lastSeenAt: agg._max?.lastSeenAt ?? proposal.lastViewedAt ?? null,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/strategy/propositions/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const data: Prisma.PartnershipProposalUpdateInput = {};

    for (const field of EDITABLE_STRING_FIELDS) {
      if (field in body) {
        const raw = body[field];
        (data as Record<string, unknown>)[field] =
          raw === null ? null : String(raw);
      }
    }
    for (const field of EDITABLE_JSON_FIELDS) {
      if (field in body) {
        (data as Record<string, unknown>)[field] =
          (body[field] ?? []) as Prisma.InputJsonValue;
      }
    }
    if ("theme" in body) {
      data.theme =
        body.theme == null ? Prisma.DbNull : (body.theme as Prisma.InputJsonValue);
    }
    if ("emvConfig" in body) {
      data.emvConfig =
        body.emvConfig == null ? Prisma.DbNull : (body.emvConfig as Prisma.InputJsonValue);
    }

    const proposal = await prisma.partnershipProposal.update({ where: { id }, data });

    return NextResponse.json({
      proposal: { ...proposal, publicUrl: `/proposition/${proposal.publicToken}` },
    });
  } catch (error) {
    console.error("PATCH /api/strategy/propositions/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    await prisma.partnershipProposal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/strategy/propositions/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
