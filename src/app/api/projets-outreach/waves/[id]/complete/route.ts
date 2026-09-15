import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canEditBrief, isProjetsOutreachRole } from "@/lib/projets-outreach";
import { rebuildWaveClusters } from "@/lib/brand-condensation";

type RouteContext = { params: Promise<{ id: string }> };

/** Strategy clique « Terminé » : scan marques partagées → review condensations. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role) || !canEditBrief(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const waveId = String(id || "").trim();
    const wave = await prisma.outreachWave.findUnique({
      where: { id: waveId },
      include: { _count: { select: { campaigns: true } } },
    });
    if (!wave) return NextResponse.json({ error: "Vague introuvable." }, { status: 404 });
    if (wave.status !== "COLLECTING" && wave.status !== "REVIEWING_CONDENSATIONS") {
      return NextResponse.json(
        {
          error: `Scan possible en collecte ou validation (actuel : ${wave.status}).`,
        },
        { status: 400 }
      );
    }
    if (wave._count.campaigns === 0) {
      return NextResponse.json(
        { error: "Ajoute au moins un projet à la vague avant de terminer." },
        { status: 400 }
      );
    }

    // Les contacts incomplets ne bloquent plus le scan : on avertit seulement.
    // La rédaction reste bloquée mission par mission via awaitingContactsCompletion.
    const awaiting = await prisma.contactMission.count({
      where: {
        campaign: { waveId },
        awaitingContactsCompletion: true,
      },
    });

    const { multiCount, soloCount } = await rebuildWaveClusters(waveId);

    const updated = await prisma.outreachWave.update({
      where: { id: waveId },
      data: {
        status: "REVIEWING_CONDENSATIONS",
        ...(wave.status === "COLLECTING"
          ? {
              completedAt: new Date(),
              completedById: session.user.id,
            }
          : {}),
      },
    });

    const baseMsg =
      multiCount > 0
        ? `${multiCount} marque(s) partagée(s) à valider (condenser ou solo).`
        : "Aucune marque partagée — tu peux valider pour ouvrir le Casting.";
    const awaitingNote =
      awaiting > 0
        ? ` ${awaiting} marque(s) encore sans contacts : la rédaction restera bloquée sur celles-là.`
        : "";
    const rescanNote =
      wave.status === "REVIEWING_CONDENSATIONS" ? " (rescan avec matching L'Oréal ≈ L'Oréal groupe)." : "";

    return NextResponse.json({
      wave: updated,
      multiCount,
      soloCount,
      awaitingContacts: awaiting,
      message: `${baseMsg}${awaitingNote}${rescanNote}`,
    });
  } catch (error) {
    console.error("POST /api/projets-outreach/waves/[id]/complete:", error);
    return NextResponse.json({ error: "Erreur lors de la clôture de collecte" }, { status: 500 });
  }
}
