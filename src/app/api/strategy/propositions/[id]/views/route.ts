import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy } from "@/app/api/strategy/_utils";

/**
 * Historique des sessions de consultation d'une proposition (usage interne).
 *  GET → { views: [{ id, startedAt, lastSeenAt, durationSec }] }
 */

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
    const views = await prisma.partnershipProposalView.findMany({
      where: { proposalId: id },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: { id: true, startedAt: true, lastSeenAt: true, durationSec: true },
    });

    return NextResponse.json({ views });
  } catch (error) {
    console.error("GET /api/strategy/propositions/[id]/views:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
