import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canEditBrief, isProjetsOutreachRole } from "@/lib/projets-outreach";
import { getOrCreateCollectingWave } from "@/lib/brand-condensation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Rattache à la vague tous les projets Outreach déjà existants
 * (créés via /projets-outreach, non clos) pour pouvoir scanner les marques partagées.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role) || !canEditBrief(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    let waveId = String(id || "").trim();

    // Si id = "active" → get or create collecting wave
    if (waveId === "active" || waveId === "current") {
      const wave = await getOrCreateCollectingWave({ actorId: session.user.id });
      waveId = wave.id;
    }

    const wave = await prisma.outreachWave.findUnique({ where: { id: waveId } });
    if (!wave) return NextResponse.json({ error: "Vague introuvable." }, { status: 404 });
    if (wave.status !== "COLLECTING") {
      return NextResponse.json(
        {
          error:
            "On ne peut rattacher des projets existants que pendant la collecte Strategy.",
        },
        { status: 400 }
      );
    }

    // Projets du parcours unifié, non clos, pas déjà dans cette vague
    const candidates = await prisma.talentProspectingCampaign.findMany({
      where: {
        status: { not: "CLOSED" },
        isActive: true,
        events: { some: { type: "CREATED" } },
        OR: [{ waveId: null }, { waveId: { not: waveId } }],
      },
      select: { id: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json({
        waveId,
        attached: 0,
        message: "Aucun projet existant à rattacher (déjà dans la vague ou aucun actif).",
      });
    }

    const campaignIds = candidates.map((c) => c.id);

    await prisma.talentProspectingCampaign.updateMany({
      where: { id: { in: campaignIds } },
      data: { waveId },
    });

    await prisma.contactMission.updateMany({
      where: {
        campaignId: { in: campaignIds },
        condensationStatus: { in: ["NONE"] },
      },
      data: { condensationStatus: "IN_WAVE" },
    });

    return NextResponse.json({
      waveId,
      attached: campaignIds.length,
      message: `${campaignIds.length} projet(s) existant(s) rattaché(s) à la vague. Tu peux cliquer « Terminé » pour scanner les marques partagées.`,
    });
  } catch (error) {
    console.error("POST /api/projets-outreach/waves/[id]/attach-existing:", error);
    return NextResponse.json({ error: "Erreur rattachement projets" }, { status: 500 });
  }
}
