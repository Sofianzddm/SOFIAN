import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessProjetsOutreach,
  canManagePrestatairesOnCampaign,
  needsPrestataires,
  isValidPrestataireCategorie,
  isValidPrestataireStatut,
  isValidPrestataireCanal,
  parseResponsableValue,
} from "@/lib/projets-outreach";
import { ensurePrestataireCrm } from "@/lib/ensure-prestataire-crm";

type RouteContext = { params: Promise<{ id: string }> };

async function loadCampaignAccess(campaignId: string) {
  return prisma.talentProspectingCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      talentId: true,
      createdById: true,
      ownerTmId: true,
      necessitePrestataires: true,
      talent: { select: { managerId: true } },
      campaignTalents: { select: { talentId: true } },
      prestataires: { select: { responsableId: true } },
    },
  });
}

function canView(
  role: string,
  userId: string,
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignAccess>>>
) {
  if (!canAccessProjetsOutreach(role)) return false;
  if (["STRATEGY_PLANNER", "CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"].includes(role)) {
    return true;
  }
  if (campaign.ownerTmId === userId) return true;
  if (campaign.talent.managerId === userId) return true;
  if (campaign.createdById === userId) return true;
  return campaign.prestataires.some((p) => p.responsableId === userId);
}

function campaignTalentIds(
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignAccess>>>
): Set<string> {
  const ids = new Set<string>([campaign.talentId]);
  for (const ct of campaign.campaignTalents) ids.add(ct.talentId);
  return ids;
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
  prestataireCrmId: string | null;
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
    prestataireCrmId: p.prestataireCrmId,
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

const includeResponsable = {
  responsable: { select: { id: true, prenom: true, nom: true, role: true } },
  responsableTalent: { select: { id: true, prenom: true, nom: true } },
} as const;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const campaign = await loadCampaignAccess(campaignId);
    if (!campaign) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    if (!canView(session.user.role || "", session.user.id, campaign)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const rows = await prisma.talentProspectingCampaignPrestataire.findMany({
      where: { campaignId },
      orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
      include: includeResponsable,
    });

    return NextResponse.json({ prestataires: rows.map(serialize) });
  } catch (error) {
    console.error("GET /api/projets-outreach/[id]/prestataires:", error);
    return NextResponse.json({ error: "Erreur lors du chargement" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const campaign = await loadCampaignAccess(campaignId);
    if (!campaign) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    if (
      !canManagePrestatairesOnCampaign(session.user.role, session.user.id, campaign)
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    if (!needsPrestataires(campaign)) {
      return NextResponse.json(
        {
          error: "Coche d’abord « Nécessite des prestataires » dans le brief.",
          code: "PRESTATAIRES_NOT_ENABLED",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const nom = String(body.nom || "").trim();
    const categorieRaw = String(body.categorie || "AUTRE").trim().toUpperCase();
    const statutRaw = String(body.statut || "A_CONTACTER").trim().toUpperCase();

    if (!nom) {
      return NextResponse.json({ error: "Nom du prestataire requis." }, { status: 400 });
    }
    if (!isValidPrestataireCategorie(categorieRaw)) {
      return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
    }
    if (!isValidPrestataireStatut(statutRaw)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
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
      const allowed = campaignTalentIds(campaign);
      if (!allowed.has(parsed.responsableTalentId)) {
        return NextResponse.json(
          { error: "Le talent responsable doit faire partie du projet." },
          { status: 400 }
        );
      }
    }

    const maxOrdre = await prisma.talentProspectingCampaignPrestataire.aggregate({
      where: { campaignId },
      _max: { ordre: true },
    });

    const prestataireCrmId = await ensurePrestataireCrm({
      nom,
      categorie: categorieRaw,
    });

    const created = await prisma.talentProspectingCampaignPrestataire.create({
      data: {
        campaignId,
        nom,
        categorie: categorieRaw,
        prestataireCrmId,
        responsableId: parsed.responsableId,
        responsableTalentId: parsed.responsableTalentId,
        statut: statutRaw,
        notes: String(body.notes || "").trim() || null,
        contactInfo: String(body.contactInfo || "").trim() || null,
        canal: (() => {
          const c = String(body.canal || "").trim().toUpperCase();
          return isValidPrestataireCanal(c) ? c : null;
        })(),
        prochaineRelanceAt: body.prochaineRelanceAt
          ? new Date(String(body.prochaineRelanceAt))
          : null,
        ordre:
          typeof body.ordre === "number"
            ? body.ordre
            : (maxOrdre._max.ordre ?? -1) + 1,
      },
      include: includeResponsable,
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESTATAIRE_ADDED",
        message: `Prestataire ajouté : ${nom}`,
        payload: {
          prestataireId: created.id,
          responsableId: parsed.responsableId,
          responsableTalentId: parsed.responsableTalentId,
          categorie: categorieRaw,
        },
      },
    });

    return NextResponse.json({ prestataire: serialize(created) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projets-outreach/[id]/prestataires:", error);
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}
