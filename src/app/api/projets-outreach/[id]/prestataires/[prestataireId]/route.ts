import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessProjetsOutreach,
  canEditPrestataireLine,
  canManagePrestatairesOnCampaign,
  isValidPrestataireCategorie,
  isValidPrestataireStatut,
  isValidPrestataireCanal,
  parseResponsableValue,
} from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string; prestataireId: string }> };

const includeResponsable = {
  responsable: { select: { id: true, prenom: true, nom: true, role: true } },
  responsableTalent: { select: { id: true, prenom: true, nom: true } },
} as const;

async function loadRow(campaignId: string, prestataireId: string) {
  return prisma.talentProspectingCampaignPrestataire.findFirst({
    where: { id: prestataireId, campaignId },
    include: {
      campaign: {
        select: {
          id: true,
          talentId: true,
          createdById: true,
          ownerTmId: true,
          talent: { select: { managerId: true } },
          campaignTalents: { select: { talentId: true } },
        },
      },
      ...includeResponsable,
    },
  });
}

type PrestataireRow = {
  id: string;
  nom: string;
  categorie: string;
  statut: string;
  canal: string | null;
  notes: string | null;
  contactInfo: string | null;
  dernierContactAt: Date | null;
  prochaineRelanceAt: Date | null;
  ordre: number;
  responsableId: string | null;
  responsableTalentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  responsable: { id: string; prenom: string; nom: string; role: string } | null;
  responsableTalent: { id: string; prenom: string; nom: string } | null;
};

function serialize(p: PrestataireRow) {
  const isTalent = Boolean(p.responsableTalentId && p.responsableTalent);
  return {
    id: p.id,
    nom: p.nom,
    categorie: p.categorie,
    statut: p.statut,
    canal: p.canal,
    notes: p.notes,
    contactInfo: p.contactInfo,
    dernierContactAt: p.dernierContactAt,
    prochaineRelanceAt: p.prochaineRelanceAt,
    ordre: p.ordre,
    responsableId: p.responsableId,
    responsableTalentId: p.responsableTalentId,
    responsableKind: isTalent ? ("TALENT" as const) : ("USER" as const),
    responsableName: isTalent
      ? `${p.responsableTalent!.prenom} ${p.responsableTalent!.nom}`.trim()
      : p.responsable
        ? `${p.responsable.prenom} ${p.responsable.nom}`.trim()
        : "—",
    responsableRole: isTalent ? "TALENT" : p.responsable?.role || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessProjetsOutreach(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, prestataireId } = await context.params;
    const campaignId = String(id || "").trim();
    const rowId = String(prestataireId || "").trim();
    const existing = await loadRow(campaignId, rowId);
    if (!existing) return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });

    if (
      !canEditPrestataireLine(
        session.user.role,
        session.user.id,
        existing.campaign,
        existing.responsableId
      )
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    const canReassign = canManagePrestatairesOnCampaign(
      session.user.role,
      session.user.id,
      existing.campaign
    );

    if (body.nom !== undefined) {
      const nom = String(body.nom || "").trim();
      if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
      data.nom = nom;
    }
    if (body.categorie !== undefined) {
      const cat = String(body.categorie || "").trim().toUpperCase();
      if (!isValidPrestataireCategorie(cat)) {
        return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
      }
      data.categorie = cat;
    }
    if (body.statut !== undefined) {
      const st = String(body.statut || "").trim().toUpperCase();
      if (!isValidPrestataireStatut(st)) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
      }
      data.statut = st;
    }
    if (body.notes !== undefined) data.notes = String(body.notes || "").trim() || null;
    if (body.contactInfo !== undefined)
      data.contactInfo = String(body.contactInfo || "").trim() || null;
    if (body.ordre !== undefined && typeof body.ordre === "number") data.ordre = body.ordre;
    if (body.canal !== undefined) {
      const c = String(body.canal || "").trim().toUpperCase();
      if (!c) data.canal = null;
      else if (!isValidPrestataireCanal(c)) {
        return NextResponse.json({ error: "Canal invalide." }, { status: 400 });
      } else data.canal = c;
    }
    if (body.prochaineRelanceAt !== undefined) {
      data.prochaineRelanceAt = body.prochaineRelanceAt
        ? new Date(String(body.prochaineRelanceAt))
        : null;
    }
    if (body.markContacted === true) {
      data.dernierContactAt = new Date();
      if (!data.statut && existing.statut === "A_CONTACTER") {
        data.statut = "EN_COURS";
      }
    }
    if (body.dernierContactAt !== undefined) {
      data.dernierContactAt = body.dernierContactAt
        ? new Date(String(body.dernierContactAt))
        : null;
    }

    const wantsReassign =
      body.responsable !== undefined ||
      body.responsableId !== undefined ||
      body.responsableTalentId !== undefined;

    if (wantsReassign) {
      if (!canReassign) {
        return NextResponse.json(
          { error: "Seul Strategy / le owner TM peut réassigner le responsable." },
          { status: 403 }
        );
      }
      const rawResponsable =
        body.responsable !== undefined
          ? String(body.responsable || "")
          : body.responsableId
            ? `user:${body.responsableId}`
            : body.responsableTalentId
              ? `talent:${body.responsableTalentId}`
              : "";
      const parsed = parseResponsableValue(rawResponsable);
      if (!parsed || (!parsed.responsableId && !parsed.responsableTalentId)) {
        return NextResponse.json(
          { error: "Responsable obligatoire (talent du projet ou équipe interne)." },
          { status: 400 }
        );
      }

      if (parsed.responsableId) {
        const responsable = await prisma.user.findFirst({
          where: { id: parsed.responsableId, actif: true },
          select: { id: true },
        });
        if (!responsable) {
          return NextResponse.json({ error: "Membre d’équipe introuvable." }, { status: 400 });
        }
      }

      if (parsed.responsableTalentId) {
        const allowed = new Set<string>([existing.campaign.talentId]);
        for (const ct of existing.campaign.campaignTalents) allowed.add(ct.talentId);
        if (!allowed.has(parsed.responsableTalentId)) {
          return NextResponse.json(
            { error: "Le talent responsable doit faire partie du projet." },
            { status: 400 }
          );
        }
      }

      data.responsableId = parsed.responsableId;
      data.responsableTalentId = parsed.responsableTalentId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
    }

    const updated = await prisma.talentProspectingCampaignPrestataire.update({
      where: { id: rowId },
      data,
      include: includeResponsable,
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESTATAIRE_UPDATED",
        message: `Prestataire mis à jour : ${updated.nom}`,
        payload: { prestataireId: rowId, fields: Object.keys(data) },
      },
    });

    return NextResponse.json({ prestataire: serialize(updated) });
  } catch (error) {
    console.error("PATCH /api/projets-outreach/[id]/prestataires/[prestataireId]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id, prestataireId } = await context.params;
    const campaignId = String(id || "").trim();
    const rowId = String(prestataireId || "").trim();
    const existing = await loadRow(campaignId, rowId);
    if (!existing) return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });

    if (
      !canManagePrestatairesOnCampaign(session.user.role, session.user.id, existing.campaign)
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    await prisma.talentProspectingCampaignPrestataire.delete({ where: { id: rowId } });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESTATAIRE_REMOVED",
        message: `Prestataire retiré : ${existing.nom}`,
        payload: { prestataireId: rowId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/projets-outreach/[id]/prestataires/[prestataireId]:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
