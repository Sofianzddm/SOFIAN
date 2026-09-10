import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { normalizeMissionBrandKey, parseMissionPriority } from "@/lib/contact-missions";
import { linkMarqueFromBrandName } from "@/lib/marque-resolver";
import { canManageBrands } from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string }> };

type BrandItem = {
  targetBrand?: string;
  marqueId?: string | null;
  strategyReason?: string;
  recommendedAngle?: string | null;
  objective?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dos?: string | null;
  donts?: string | null;
  clientContacts?: Array<{
    firstname?: string;
    lastname?: string;
    email?: string;
    role?: string;
  }> | null;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canManageBrands(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      include: { talent: { select: { prenom: true, nom: true } } },
    });
    if (!campaign) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    const body = (await request.json()) as { items?: BrandItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Aucune marque fournie." }, { status: 400 });
    }

    const creatorName =
      `${campaign.talent?.prenom ?? ""} ${campaign.talent?.nom ?? ""}`.trim() || "Talent";

    const created = [];
    for (const item of items) {
      let targetBrand = String(item.targetBrand || "").trim();
      let marqueId = String(item.marqueId || "").trim() || null;

      if (marqueId) {
        const marque = await prisma.marque.findUnique({
          where: { id: marqueId },
          select: { id: true, nom: true },
        });
        if (!marque) continue;
        if (!targetBrand) targetBrand = marque.nom;
        marqueId = marque.id;
      } else if (targetBrand) {
        const linked = await linkMarqueFromBrandName({
          brandName: targetBrand,
          source: "CONTACT_MISSION",
        });
        marqueId = linked?.marqueId ?? null;
      }

      const strategyReason = String(item.strategyReason || "").trim();
      if (!targetBrand) continue;

      const mission = await prisma.contactMission.create({
        data: {
          campaignId,
          talentId: campaign.talentId,
          creatorName,
          targetBrand,
          targetBrandKey: normalizeMissionBrandKey(targetBrand),
          marqueId,
          strategyReason,
          recommendedAngle: String(item.recommendedAngle || "").trim() || null,
          objective: String(item.objective || "").trim() || campaign.objective || null,
          dos: String(item.dos || "").trim() || campaign.dos || null,
          donts: String(item.donts || "").trim() || campaign.donts || null,
          priority: parseMissionPriority(item.priority),
          stage: "TO_DRAFT",
          clientContacts: item.clientContacts ?? undefined,
          createdById: session.user.id,
        },
      });
      created.push(mission);
    }

    if (created.length === 0) {
      return NextResponse.json(
        { error: "Aucune marque valide (nom requis)." },
        { status: 400 }
      );
    }

    // Si encore en BRIEF/BRANDS, passer automatiquement en BRANDS
    if (campaign.status === "BRIEF" || campaign.status === "BRANDS") {
      await prisma.talentProspectingCampaign.update({
        where: { id: campaignId },
        data: { status: "BRANDS" },
      });
    }

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "BRANDS_ADDED",
        message: `${created.length} marque(s) ajoutée(s)`,
        payload: {
          count: created.length,
          brands: created.map((m) => m.targetBrand),
        },
      },
    });

    return NextResponse.json({ created: created.length, missions: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projets-outreach/[id]/brands:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout des marques" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canManageBrands(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const body = (await request.json()) as { missionId?: string };
    const missionId = String(body.missionId || "").trim();
    if (!missionId) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }

    const mission = await prisma.contactMission.findFirst({
      where: { id: missionId, campaignId },
    });
    if (!mission) return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });

    if (mission.sentAt || mission.stage === "SENT" || mission.stage === "RESPONSE_RECEIVED") {
      return NextResponse.json(
        { error: "Impossible de retirer une marque déjà contactée." },
        { status: 400 }
      );
    }

    await prisma.contactMission.delete({ where: { id: missionId } });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "BRANDS_ADDED",
        message: `Marque retirée : ${mission.targetBrand}`,
        payload: { removed: mission.targetBrand, missionId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/projets-outreach/[id]/brands:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
