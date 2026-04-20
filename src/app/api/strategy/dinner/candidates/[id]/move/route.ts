import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy, parseCandidateStatus } from "@/app/api/strategy/dinner/_utils";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = String(session.user.role || "");
    if (!canAccessDinnerStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      toStatus?: string;
      rejectionReason?: string | null;
      position?: number | null;
    };
    const toStatus = parseCandidateStatus(body.toStatus);
    if (!toStatus) return NextResponse.json({ error: "toStatus invalide" }, { status: 400 });

    const candidate = await prisma.dinnerCreatorCandidate.findUnique({ where: { id } });
    if (!candidate) return NextResponse.json({ error: "Createur introuvable" }, { status: 404 });

    const campaign = await prisma.dinnerCampaign.findUnique({ where: { id: candidate.campaignId } });
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    if (campaign.status === "FINALIZED") {
      return NextResponse.json({ error: "Campagne finalisee, changement impossible" }, { status: 400 });
    }

    const rejectionReason = (body.rejectionReason || "").trim();
    if (toStatus === "REJECTED" && !rejectionReason) {
      return NextResponse.json({ error: "Motif requis pour refuser un createur" }, { status: 400 });
    }

    const last = await prisma.dinnerCreatorCandidate.findFirst({
      where: { campaignId: candidate.campaignId, status: toStatus },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition =
      typeof body.position === "number" && Number.isFinite(body.position) && body.position >= 0
        ? Math.floor(body.position)
        : (last?.position ?? -1) + 1;

    const updated = await prisma.dinnerCreatorCandidate.update({
      where: { id },
      data: {
        status: toStatus,
        position: nextPosition,
        rejectionReason: toStatus === "REJECTED" ? rejectionReason : null,
        updatedById: session.user.id,
      },
    });

    await prisma.dinnerCandidateEvent.create({
      data: {
        candidateId: updated.id,
        campaignId: updated.campaignId,
        type: "MOVED",
        fromStatus: candidate.status,
        toStatus: updated.status,
        payload:
          toStatus === "REJECTED"
            ? {
                rejectionReason,
              }
            : undefined,
        actorId: session.user.id,
      },
    });

    return NextResponse.json({ candidate: updated });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/candidates/[id]/move:", error);
    return NextResponse.json({ error: "Erreur lors du changement de colonne" }, { status: 500 });
  }
}

