import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canEditBrief, isProjetsOutreachRole } from "@/lib/projets-outreach";
import { applyWaveClusterDecisions } from "@/lib/brand-condensation";

type RouteContext = { params: Promise<{ id: string }> };

/** Strategy valide toutes les décisions → Casting débloquée. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role) || !canEditBrief(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const waveId = String(id || "").trim();
    const wave = await prisma.outreachWave.findUnique({ where: { id: waveId } });
    if (!wave) return NextResponse.json({ error: "Vague introuvable." }, { status: 404 });
    if (wave.status !== "REVIEWING_CONDENSATIONS") {
      return NextResponse.json(
        { error: "La vague doit être en validation condensations." },
        { status: 400 }
      );
    }

    const pending = await prisma.outreachWaveBrandCluster.count({
      where: { waveId, decision: "PENDING" },
    });
    if (pending > 0) {
      return NextResponse.json(
        {
          error: `${pending} marque(s) partagée(s) sans décision. Choisis Condenser ou Solo pour chacune.`,
        },
        { status: 400 }
      );
    }

    try {
      await applyWaveClusterDecisions(waveId, session.user.id);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Validation impossible." },
        { status: 400 }
      );
    }

    const updated = await prisma.outreachWave.findUnique({ where: { id: waveId } });
    return NextResponse.json({
      wave: updated,
      message: "Condensations validées — Casting débloquée.",
    });
  } catch (error) {
    console.error("POST /api/projets-outreach/waves/[id]/validate:", error);
    return NextResponse.json({ error: "Erreur validation vague" }, { status: 500 });
  }
}
