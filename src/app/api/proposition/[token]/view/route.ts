import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Tracking de consultation d'une proposition (analytics best-effort).
 *  POST sans viewId            → ouvre une session, renvoie { viewId }
 *  POST { viewId, duration }   → met à jour la durée active (ping / sendBeacon)
 *
 * Tolérant aux erreurs : ne doit jamais casser la consultation côté marque.
 */

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      viewId?: string;
      duration?: number;
      referrer?: string;
    };

    // Ping : mise à jour de la durée d'une session existante.
    if (body.viewId) {
      const duration = Math.max(0, Math.min(60 * 60 * 12, Math.round(Number(body.duration) || 0)));
      const view = await prisma.partnershipProposalView
        .update({
          where: { id: body.viewId },
          data: { durationSec: duration, lastSeenAt: new Date() },
          select: { proposalId: true },
        })
        .catch(() => null);
      if (view) {
        prisma.partnershipProposal
          .update({ where: { id: view.proposalId }, data: { lastViewedAt: new Date() } })
          .catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }

    // Création : nouvelle session de consultation.
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });
    if (!proposal) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const view = await prisma.partnershipProposalView.create({
      data: {
        proposalId: proposal.id,
        userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
        referrer: (body.referrer || request.headers.get("referer") || "")?.slice(0, 500) || null,
      },
      select: { id: true },
    });

    return NextResponse.json({ viewId: view.id });
  } catch (error) {
    console.error("POST /api/proposition/[token]/view:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
