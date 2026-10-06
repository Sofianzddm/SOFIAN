import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessProjetsOutreach,
  canManagePrestatairesOnCampaign,
} from "@/lib/projets-outreach";

/**
 * Inbox prospection presta : lignes assignées à l'utilisateur (responsableId = moi),
 * ou aux talents dont je suis le TM.
 * Sur un projet précis (`campaignId`), les managers voient tous les prestas du projet
 * (sinon un ajout CRM attribué au TM disparaît pour Strategy / Admin).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessProjetsOutreach(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const userId = session.user.id;
    const role = session.user.role || "";
    const statutParam = String(request.nextUrl.searchParams.get("statut") || "")
      .trim()
      .toUpperCase();
    const campaignIdParam = String(request.nextUrl.searchParams.get("campaignId") || "").trim();
    const scopeAll =
      String(request.nextUrl.searchParams.get("scope") || "").trim().toLowerCase() === "all";

    const managedTalentIds = (
      await prisma.talent.findMany({
        where: { managerId: userId, isArchived: false },
        select: { id: true },
      })
    ).map((t) => t.id);

    let showAllOnCampaign = false;
    if (campaignIdParam && scopeAll) {
      const campaign = await prisma.talentProspectingCampaign.findUnique({
        where: { id: campaignIdParam },
        select: { ownerTmId: true, createdById: true },
      });
      if (
        campaign &&
        canManagePrestatairesOnCampaign(role, userId, campaign)
      ) {
        showAllOnCampaign = true;
      }
    }

    const where: Record<string, unknown> = {
      campaign: {
        isActive: true,
        necessitePrestataires: true,
        status: { not: "CLOSED" },
        ...(campaignIdParam ? { id: campaignIdParam } : {}),
      },
    };

    if (!showAllOnCampaign) {
      where.OR = [
        { responsableId: userId },
        ...(managedTalentIds.length > 0
          ? [{ responsableTalentId: { in: managedTalentIds } }]
          : []),
      ];
    }

    if (
      ["A_CONTACTER", "EN_COURS", "CONFIRME", "ANNULE"].includes(statutParam)
    ) {
      where.statut = statutParam;
    }

    const rows = await prisma.talentProspectingCampaignPrestataire.findMany({
      where,
      orderBy: [
        { prochaineRelanceAt: "asc" },
        { updatedAt: "desc" },
      ],
      include: {
        responsable: { select: { id: true, prenom: true, nom: true, role: true } },
        responsableTalent: { select: { id: true, prenom: true, nom: true } },
        prestataireCrm: {
          select: {
            id: true,
            email: true,
            contacts: {
              where: { email: { not: null } },
              select: { email: true, prenom: true, nom: true, principal: true },
              orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
            },
          },
        },
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            talent: {
              select: { id: true, prenom: true, nom: true, photo: true },
            },
          },
        },
      },
      take: 200,
    });

    // Backfill CRM si une ligne n'a pas encore de fiche.
    const { ensurePrestataireCrm } = await import("@/lib/ensure-prestataire-crm");
    for (const row of rows) {
      if (row.prestataireCrmId) continue;
      const crmId = await ensurePrestataireCrm({
        nom: row.nom,
        categorie: row.categorie,
      });
      await prisma.talentProspectingCampaignPrestataire.update({
        where: { id: row.id },
        data: { prestataireCrmId: crmId },
      });
      row.prestataireCrmId = crmId;
    }

    return NextResponse.json({
      scope: showAllOnCampaign ? "all" : "mine",
      prestataires: rows.map((p) => {
        const isTalent = Boolean(p.responsableTalentId && p.responsableTalent);
        return {
          id: p.id,
          nom: p.nom,
          categorie: p.categorie,
          statut: p.statut,
          canal: p.canal,
          contactInfo: p.contactInfo,
          notes: p.notes,
          dernierContactAt: p.dernierContactAt,
          prochaineRelanceAt: p.prochaineRelanceAt,
          responsableId: p.responsableId,
          responsableTalentId: p.responsableTalentId,
          prestataireCrmId: p.prestataireCrmId,
          responsableKind: isTalent ? "TALENT" : "USER",
          responsableName: isTalent
            ? `${p.responsableTalent!.prenom} ${p.responsableTalent!.nom}`.trim()
            : p.responsable
              ? `${p.responsable.prenom} ${p.responsable.nom}`.trim()
              : "—",
          campaignId: p.campaign.id,
          campaignTitle: p.campaign.title,
          campaignStatus: p.campaign.status,
          talentName: `${p.campaign.talent.prenom} ${p.campaign.talent.nom}`.trim(),
          talentPhoto: p.campaign.talent.photo,
          updatedAt: p.updatedAt,
          assignedToMe: p.responsableId === userId,
          draftEmailSubject: p.draftEmailSubject,
          draftEmailBody: p.draftEmailBody,
          sentAt: p.sentAt,
          crmEmails: (() => {
            const fromContacts = (p.prestataireCrm?.contacts || [])
              .map((c) => String(c.email || "").trim())
              .filter(Boolean);
            if (fromContacts.length > 0) return fromContacts;
            if (p.prestataireCrm?.email) return [p.prestataireCrm.email];
            return [] as string[];
          })(),
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/projets-outreach/mes-prestataires:", error);
    return NextResponse.json({ error: "Erreur lors du chargement" }, { status: 500 });
  }
}
