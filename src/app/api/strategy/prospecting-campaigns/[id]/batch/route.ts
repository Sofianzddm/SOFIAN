import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { normalizeMissionBrandKey, parseMissionPriority } from "@/lib/contact-missions";

const ALLOWED_ROLES = ["STRATEGY_PLANNER", "ADMIN", "HEAD_OF"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

const campaignModel = (prisma as unknown as { talentProspectingCampaign: any }).talentProspectingCampaign;
const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

type BatchRow = {
  targetBrand: string;
  strategyReason: string;
  recommendedAngle?: string | null;
  objective?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dos?: string | null;
  donts?: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    if (!campaignId) return NextResponse.json({ error: "campaignId requis." }, { status: 400 });

    const campaign = await campaignModel.findUnique({
      where: { id: campaignId },
      include: { talent: { select: { prenom: true, nom: true } } },
    });
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });

    const body = (await request.json()) as { items?: BatchRow[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Aucun item fourni pour l'import batch." }, { status: 400 });
    }

    const creatorName = `${campaign.talent?.prenom ?? ""} ${campaign.talent?.nom ?? ""}`.trim() || "Talent";
    const created = await prisma.$transaction(
      items
        .filter((item) => String(item.targetBrand || "").trim() && String(item.strategyReason || "").trim())
        .map((item) =>
          contactMissionModel.create({
            data: {
              campaignId,
              talentId: campaign.talentId,
              creatorName,
              targetBrand: String(item.targetBrand || "").trim(),
              targetBrandKey: normalizeMissionBrandKey(String(item.targetBrand || "").trim()),
              strategyReason: String(item.strategyReason || "").trim(),
              recommendedAngle: String(item.recommendedAngle || "").trim() || null,
              objective: String(item.objective || "").trim() || null,
              dos: String(item.dos || "").trim() || null,
              donts: String(item.donts || "").trim() || null,
              priority: parseMissionPriority(item.priority),
              stage: "TO_DRAFT",
              createdById: session.user.id,
            },
          })
        )
    );

    return NextResponse.json({ created: created.length }, { status: 201 });
  } catch (error) {
    console.error("POST /api/strategy/prospecting-campaigns/[id]/batch:", error);
    return NextResponse.json({ error: "Erreur lors de l'import batch." }, { status: 500 });
  }
}
