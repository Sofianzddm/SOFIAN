import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canWritePrestataireCrm } from "@/lib/prestataire-crm-access";
import { canManagePrestatairesOnCampaign } from "@/lib/projets-outreach";
import { getResponsableTmId } from "@/lib/delegations";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Ajoute une fiche CRM prestataire à un projet outreach
 * (crée la ligne TalentProspectingCampaignPrestataire liée).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const prestataireId = String(id || "").trim();
    const body = (await request.json()) as {
      campaignId?: string;
      responsableId?: string | null;
    };
    const campaignId = String(body.campaignId || "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId requis." }, { status: 400 });
    }

    const prestataire = await prisma.prestataire.findUnique({
      where: { id: prestataireId },
    });
    if (!prestataire) {
      return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });
    }

    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        title: true,
        necessitePrestataires: true,
        ownerTmId: true,
        createdById: true,
        talentId: true,
        talent: { select: { managerId: true } },
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }

    if (
      !canManagePrestatairesOnCampaign(session.user.role, session.user.id, campaign)
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes sur ce projet." }, { status: 403 });
    }

    // Active le flag presta si besoin
    if (!campaign.necessitePrestataires) {
      await prisma.talentProspectingCampaign.update({
        where: { id: campaignId },
        data: { necessitePrestataires: true },
      });
    }

    const existing = await prisma.talentProspectingCampaignPrestataire.findFirst({
      where: { campaignId, prestataireCrmId: prestataireId },
      select: { id: true, statut: true },
    });
    if (existing) {
      // Ré-ajout depuis le CRM → on remet « À contacter » pour relancer le suivi,
      // et on assigne à la personne qui relance (sinon invisible dans « mes prestas »).
      const updated = await prisma.talentProspectingCampaignPrestataire.update({
        where: { id: existing.id },
        data: {
          statut: "A_CONTACTER",
          nom: prestataire.nom,
          categorie: prestataire.categorie,
          contactInfo: prestataire.email || prestataire.telephone || null,
          responsableId: session.user.id,
          responsableTalentId: null,
        },
      });
      return NextResponse.json({
        link: updated,
        campaignId,
        campaignTitle: campaign.title,
        already: true,
        resetToContact: true,
      });
    }

    // Qui ajoute depuis le CRM est le contacteur par défaut (sinon l’onglet
    // « Prospection presta » filtre « assigné à moi » et la ligne disparaît).
    let responsableId: string | null =
      String(body.responsableId || "").trim() || session.user.id || null;
    if (!responsableId) {
      responsableId =
        campaign.ownerTmId ||
        (await getResponsableTmId(campaign.talentId)) ||
        campaign.talent.managerId ||
        null;
    }

    const maxOrdre = await prisma.talentProspectingCampaignPrestataire.aggregate({
      where: { campaignId },
      _max: { ordre: true },
    });

    const created = await prisma.talentProspectingCampaignPrestataire.create({
      data: {
        campaignId,
        prestataireCrmId: prestataireId,
        nom: prestataire.nom,
        categorie: prestataire.categorie,
        responsableId,
        statut: "A_CONTACTER",
        canal: null,
        contactInfo: prestataire.email || prestataire.telephone || null,
        ordre: (maxOrdre._max.ordre ?? -1) + 1,
      },
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESTATAIRE_ADDED",
        message: `Prestataire ajouté depuis le CRM : ${prestataire.nom}`,
        payload: {
          prestataireId,
          linkId: created.id,
          ville: prestataire.ville,
        },
      },
    });

    return NextResponse.json(
      {
        link: created,
        campaignId,
        campaignTitle: campaign.title,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/prestataires/[id]/ajouter-au-projet:", error);
    return NextResponse.json({ error: "Erreur lors de l’ajout" }, { status: 500 });
  }
}
