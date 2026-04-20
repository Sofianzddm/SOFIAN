import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy } from "@/app/api/strategy/dinner/_utils";

export async function PATCH(
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
      fullName?: string;
      manualHandle?: string | null;
      manualPlatform?: string | null;
      followers?: number | null;
      engagementRate?: number | null;
      estimatedCost?: number | null;
      notePlanner?: string | null;
      noteClient?: string | null;
    };

    const existing = await prisma.dinnerCreatorCandidate.findUnique({
      where: { id },
      select: { id: true, campaignId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Createur introuvable" }, { status: 404 });
    }

    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { id: existing.campaignId },
      select: { status: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }
    if (campaign.status === "FINALIZED") {
      return NextResponse.json({ error: "Campagne finalisee, modification impossible" }, { status: 400 });
    }

    const nextFullName = body.fullName === undefined ? undefined : body.fullName.trim();
    if (nextFullName !== undefined && !nextFullName) {
      return NextResponse.json({ error: "fullName invalide" }, { status: 400 });
    }

    const updated = await prisma.dinnerCreatorCandidate.update({
      where: { id },
      data: {
        fullName: nextFullName,
        manualHandle:
          body.manualHandle === undefined
            ? undefined
            : (body.manualHandle || "").trim().replace(/^@+/, "").toLowerCase() || null,
        manualPlatform:
          body.manualPlatform === undefined ? undefined : (body.manualPlatform || "").trim() || null,
        followers: body.followers === undefined ? undefined : body.followers,
        engagementRate: body.engagementRate === undefined ? undefined : body.engagementRate,
        estimatedCost: body.estimatedCost === undefined ? undefined : body.estimatedCost,
        notePlanner: body.notePlanner === undefined ? undefined : body.notePlanner,
        noteClient: body.noteClient === undefined ? undefined : body.noteClient,
        updatedById: session.user.id,
      },
    });

    return NextResponse.json({ candidate: updated });
  } catch (error) {
    console.error("Erreur PATCH /api/strategy/dinner/candidates/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise a jour du createur" }, { status: 500 });
  }
}

export async function DELETE(
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
    const existing = await prisma.dinnerCreatorCandidate.findUnique({
      where: { id },
      select: { id: true, campaignId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Createur introuvable" }, { status: 404 });
    }

    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { id: existing.campaignId },
      select: { status: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }
    if (campaign.status === "FINALIZED") {
      return NextResponse.json({ error: "Campagne finalisee, suppression impossible" }, { status: 400 });
    }

    await prisma.dinnerCreatorCandidate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/strategy/dinner/candidates/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression du createur" }, { status: 500 });
  }
}

