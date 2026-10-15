import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canEditBrief, isProjetsOutreachRole } from "@/lib/projets-outreach";
import {
  applyClusterDecision,
  clusterHasMultiProjectHold,
} from "@/lib/brand-condensation";

type RouteContext = { params: Promise<{ id: string }> };

/** Strategy décide Condenser / Solo pour un cluster — appliqué immédiatement. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role) || !canEditBrief(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: waveId } = await context.params;
    const body = (await request.json()) as {
      clusterId?: string;
      decision?: "CONDENSE" | "SOLO";
      primaryMissionId?: string | null;
      all?: boolean;
    };

    const decision = body.decision;
    if (decision !== "CONDENSE" && decision !== "SOLO") {
      return NextResponse.json(
        { error: "decision (CONDENSE|SOLO) requis." },
        { status: 400 }
      );
    }

    const wave = await prisma.outreachWave.findUnique({ where: { id: waveId } });
    if (!wave) return NextResponse.json({ error: "Vague introuvable." }, { status: 404 });
    if (wave.status !== "REVIEWING_CONDENSATIONS") {
      return NextResponse.json(
        { error: "Les décisions ne sont possibles qu'en phase de validation." },
        { status: 400 }
      );
    }

    if (body.all === true) {
      const clusters = await prisma.outreachWaveBrandCluster.findMany({
        where: { waveId },
        include: {
          missions: { select: { id: true, brandCooldownUntil: true } },
        },
      });

      let updatedCount = 0;
      let forcedHold = 0;
      for (const cluster of clusters) {
        const forceHold = clusterHasMultiProjectHold(cluster.missions);
        const effectiveDecision =
          forceHold && decision === "SOLO" ? "CONDENSE" : decision;
        if (forceHold && decision === "SOLO") forcedHold += 1;

        await prisma.outreachWaveBrandCluster.update({
          where: { id: cluster.id },
          data: {
            decision: effectiveDecision,
            primaryMissionId:
              effectiveDecision === "CONDENSE"
                ? cluster.primaryMissionId || cluster.missions[0]?.id || null
                : null,
          },
        });
        await applyClusterDecision(cluster.id);
        updatedCount += 1;
      }

      return NextResponse.json({
        updated: updatedCount,
        decision,
        forcedHold,
        message:
          decision === "CONDENSE"
            ? `${updatedCount} marque(s) condensée(s).`
            : `${updatedCount} marque(s) en solo` +
              (forcedHold > 0
                ? ` (${forcedHold} en attente multi-projets restées condensées).`
                : "."),
      });
    }

    const clusterId = String(body.clusterId || "").trim();
    if (!clusterId) {
      return NextResponse.json(
        { error: "clusterId requis (ou all: true)." },
        { status: 400 }
      );
    }

    const cluster = await prisma.outreachWaveBrandCluster.findFirst({
      where: { id: clusterId, waveId },
      include: {
        missions: { select: { id: true, brandCooldownUntil: true } },
      },
    });
    if (!cluster) return NextResponse.json({ error: "Cluster introuvable." }, { status: 404 });

    if (decision === "SOLO" && clusterHasMultiProjectHold(cluster.missions)) {
      return NextResponse.json(
        {
          error:
            "Cette marque est en attente sur plusieurs projets : Solo interdit — elle reste condensée (1 mail à J+30).",
          code: "HOLD_FORCE_CONDENSE",
        },
        { status: 400 }
      );
    }

    let primaryMissionId = cluster.primaryMissionId;
    if (decision === "CONDENSE" && body.primaryMissionId) {
      const pid = String(body.primaryMissionId).trim();
      if (!cluster.missions.some((m) => m.id === pid)) {
        return NextResponse.json(
          { error: "primaryMissionId doit appartenir au cluster." },
          { status: 400 }
        );
      }
      primaryMissionId = pid;
    }

    const updated = await prisma.outreachWaveBrandCluster.update({
      where: { id: clusterId },
      data: {
        decision,
        primaryMissionId: decision === "CONDENSE" ? primaryMissionId : null,
      },
    });

    const applied = await applyClusterDecision(clusterId);

    return NextResponse.json({ cluster: updated, applied });
  } catch (error) {
    console.error("PATCH /api/projets-outreach/waves/[id]/clusters:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur mise à jour cluster",
      },
      { status: 500 }
    );
  }
}
