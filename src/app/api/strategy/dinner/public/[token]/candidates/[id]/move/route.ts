import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCandidateStatus } from "@/app/api/strategy/dinner/_utils";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string; id: string }> }
) {
  try {
    const { token, id } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { clientAccessToken: token },
      select: { id: true, status: true, createdById: true },
    });
    if (!campaign) return NextResponse.json({ error: "Lien prive invalide" }, { status: 404 });
    if (campaign.status === "FINALIZED") {
      return NextResponse.json({ error: "Campagne finalisee, changement impossible" }, { status: 400 });
    }

    const candidate = await prisma.dinnerCreatorCandidate.findUnique({ where: { id } });
    if (!candidate || candidate.campaignId !== campaign.id) {
      return NextResponse.json({ error: "Createur introuvable" }, { status: 404 });
    }

    const body = (await request.json()) as { toStatus?: string; rejectionReason?: string | null };
    const toStatus = parseCandidateStatus(body.toStatus);
    if (!toStatus) return NextResponse.json({ error: "toStatus invalide" }, { status: 400 });
    const rejectionReason = (body.rejectionReason || "").trim();
    if (toStatus === "REJECTED" && !rejectionReason) {
      return NextResponse.json({ error: "Motif requis pour refuser un createur" }, { status: 400 });
    }

    const last = await prisma.dinnerCreatorCandidate.findFirst({
      where: { campaignId: campaign.id, status: toStatus },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const updated = await prisma.dinnerCreatorCandidate.update({
      where: { id },
      data: {
        status: toStatus,
        rejectionReason: toStatus === "REJECTED" ? rejectionReason : null,
        updatedById: campaign.createdById,
        position: (last?.position ?? -1) + 1,
      },
    });

    await prisma.dinnerCandidateEvent.create({
      data: {
        candidateId: updated.id,
        campaignId: campaign.id,
        type: "MOVED",
        fromStatus: candidate.status,
        toStatus: updated.status,
        payload: toStatus === "REJECTED" ? { rejectionReason } : undefined,
        actorId: campaign.createdById,
      },
    });

    return NextResponse.json({ candidate: updated });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/public/[token]/candidates/[id]/move:", error);
    return NextResponse.json({ error: "Erreur lors du changement de colonne" }, { status: 500 });
  }
}

