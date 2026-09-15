import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { isProjetsOutreachRole } from "@/lib/projets-outreach";
import { fetchThreadClientReplies } from "@/lib/gmail";

const LEYNA_FROM = "leyna@glowupagence.fr";

type RouteContext = { params: Promise<{ missionId: string }> };

/**
 * GET — réponses client lues depuis le fil Gmail Leyna (contenu texte).
 * Permet au Casting / TM de voir ce que la marque a répondu sans ouvrir Gmail.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(_request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { missionId } = await context.params;
    const id = String(missionId || "").trim();
    if (!id) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }

    const mission = await prisma.contactMission.findUnique({
      where: { id },
      select: {
        id: true,
        targetBrand: true,
        sentMessageIds: true,
        replied: true,
        campaign: { select: { id: true, title: true } },
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    const byEmail =
      mission.sentMessageIds && typeof mission.sentMessageIds === "object"
        ? (mission.sentMessageIds as Record<
            string,
            { messageId?: string; threadId?: string; error?: string }
          >)
        : {};

    const threadIds = Array.from(
      new Set(
        Object.values(byEmail)
          .map((r) => String(r?.threadId || r?.messageId || "").trim())
          .filter(Boolean)
      )
    );

    if (threadIds.length === 0) {
      return NextResponse.json({
        missionId: mission.id,
        brand: mission.targetBrand,
        replies: [],
        message: "Aucun fil Gmail enregistré pour cette marque.",
      });
    }

    const repliesById = new Map<
      string,
      Awaited<ReturnType<typeof fetchThreadClientReplies>>[number]
    >();
    const errors: string[] = [];

    for (const threadId of threadIds.slice(0, 5)) {
      try {
        const rows = await fetchThreadClientReplies(LEYNA_FROM, threadId);
        for (const row of rows) {
          if (!repliesById.has(row.id)) repliesById.set(row.id, row);
        }
      } catch (e) {
        errors.push(
          e instanceof Error ? e.message : `Lecture thread ${threadId} impossible`
        );
      }
    }

    const replies = Array.from(repliesById.values()).sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return ta - tb;
    });

    return NextResponse.json({
      missionId: mission.id,
      brand: mission.targetBrand,
      campaignTitle: mission.campaign?.title ?? null,
      repliedFlag: Boolean(mission.replied),
      replies,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("GET /api/projets-outreach/missions/[missionId]/thread:", error);
    return NextResponse.json({ error: "Erreur lecture du fil" }, { status: 500 });
  }
}
