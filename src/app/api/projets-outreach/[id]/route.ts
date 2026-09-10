import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canEditBrief,
  canManageBrands,
  canSend,
  isProjetsOutreachRole,
} from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string }> };

async function loadCampaign(id: string) {
  return prisma.talentProspectingCampaign.findUnique({
    where: { id },
    include: {
      talent: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          managerId: true,
          photo: true,
          instagram: true,
        },
      },
      createdBy: { select: { id: true, prenom: true, nom: true, role: true } },
      ownerTm: { select: { id: true, prenom: true, nom: true } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          actor: { select: { id: true, prenom: true, nom: true } },
        },
      },
      contactMissions: {
        orderBy: { createdAt: "desc" },
        include: {
          marque: { select: { id: true, nom: true } },
        },
      },
    },
  });
}

function canViewCampaign(
  role: string,
  _userId: string,
  _campaign: {
    createdById: string;
    ownerTmId: string | null;
    talent: { managerId: string | null };
  }
): boolean {
  return isProjetsOutreachRole(role);
}

function serializeCampaign(c: NonNullable<Awaited<ReturnType<typeof loadCampaign>>>) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    isActive: c.isActive,
    senderEmail: c.senderEmail,
    objective: c.objective,
    deliverables: c.deliverables,
    budgetRange: c.budgetRange,
    timeline: c.timeline,
    dos: c.dos,
    donts: c.donts,
    angles: c.angles,
    assets: c.assets,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    talentId: c.talentId,
    talent: {
      id: c.talent.id,
      name: `${c.talent.prenom} ${c.talent.nom}`.trim(),
      prenom: c.talent.prenom,
      nom: c.talent.nom,
      photo: c.talent.photo,
      instagram: c.talent.instagram,
      managerId: c.talent.managerId,
    },
    ownerTmId: c.ownerTmId,
    ownerTmName: c.ownerTm ? `${c.ownerTm.prenom} ${c.ownerTm.nom}`.trim() : null,
    createdById: c.createdById,
    createdByName: `${c.createdBy.prenom} ${c.createdBy.nom}`.trim(),
    createdByRole: c.createdBy.role,
    events: c.events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      payload: e.payload,
      createdAt: e.createdAt,
      actorName: `${e.actor.prenom} ${e.actor.nom}`.trim(),
    })),
    missions: c.contactMissions.map((m) => ({
      id: m.id,
      targetBrand: m.targetBrand,
      marqueId: m.marqueId,
      marqueNom: m.marque?.nom ?? null,
      strategyReason: m.strategyReason,
      recommendedAngle: m.recommendedAngle,
      objective: m.objective,
      dos: m.dos,
      donts: m.donts,
      priority: m.priority,
      status: m.status,
      stage: m.stage,
      draftEmailSubject: m.draftEmailSubject,
      draftEmailBody: m.draftEmailBody,
      draftLanguage: m.draftLanguage,
      clientLanguage: m.clientLanguage,
      clientContacts: m.clientContacts,
      marqueContacts: [] as Array<{
        id: string;
        firstname: string;
        lastname: string;
        email: string;
        role: string;
        linkedinUrl: string;
      }>,
      scheduledSendAt: m.scheduledSendAt,
      sentAt: m.sentAt,
      replied: m.replied,
      openedAt: m.openedAt,
      openCount: m.openCount,
      clickCount: m.clickCount,
      relanceSentAt: m.relanceSentAt,
      relance2SentAt: m.relance2SentAt,
      sendError: m.sendError,
      createdAt: m.createdAt,
    })),
  };
}

async function attachMarqueContacts<T extends { missions: Array<{ marqueId: string | null; marqueContacts: unknown[] }> }>(
  campaign: T
): Promise<T> {
  const marqueIds = Array.from(
    new Set(
      campaign.missions
        .map((m) => m.marqueId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (marqueIds.length === 0) return campaign;

  const rows = await prisma.marqueContact.findMany({
    where: {
      marqueId: { in: marqueIds },
    },
    select: {
      id: true,
      marqueId: true,
      prenom: true,
      nom: true,
      email: true,
      emailSuggested: true,
      poste: true,
      principal: true,
      linkedinUrl: true,
      source: true,
    },
    orderBy: [{ principal: "desc" }, { nom: "asc" }],
  });

  const byMarque = new Map<
    string,
    Array<{
      id: string;
      firstname: string;
      lastname: string;
      email: string;
      role: string;
      linkedinUrl: string;
    }>
  >();
  for (const r of rows) {
    // Exclure uniquement les Appels d'offres. source null/vide = OK (sinon
    // Prisma NOT source=AO excluait aussi les NULL → 0 contacts Nuxe).
    if (String(r.source || "").trim().toUpperCase() === "AO") continue;
    const email = String(r.email || r.emailSuggested || "").trim();
    if (!email || !email.includes("@")) continue;
    const list = byMarque.get(r.marqueId) || [];
    list.push({
      id: r.id,
      firstname: String(r.prenom || "").trim(),
      lastname: String(r.nom || "").trim(),
      email,
      role: String(r.poste || "").trim(),
      linkedinUrl: String(r.linkedinUrl || "").trim(),
    });
    byMarque.set(r.marqueId, list);
  }

  for (const m of campaign.missions) {
    m.marqueContacts = m.marqueId ? byMarque.get(m.marqueId) || [] : [];
  }
  return campaign;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = await context.params;
    const campaign = await loadCampaign(String(id || "").trim());
    if (!campaign) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    if (!canViewCampaign(session.user.role || "", session.user.id, campaign)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    return NextResponse.json({
      campaign: await attachMarqueContacts(serializeCampaign(campaign)),
    });
  } catch (error) {
    console.error("GET /api/projets-outreach/[id]:", error);
    return NextResponse.json({ error: "Erreur lors du chargement du projet" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canEditBrief(session.user.role) && !canSend(session.user.role) && !canManageBrands(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const existing = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      include: { talent: { select: { managerId: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (canEditBrief(session.user.role)) {
      if (body.title !== undefined) data.title = String(body.title || "").trim();
      if (body.description !== undefined)
        data.description = String(body.description || "").trim() || null;
      if (body.objective !== undefined) data.objective = String(body.objective || "").trim() || null;
      if (body.deliverables !== undefined)
        data.deliverables = String(body.deliverables || "").trim() || null;
      if (body.budgetRange !== undefined)
        data.budgetRange = String(body.budgetRange || "").trim() || null;
      if (body.timeline !== undefined) data.timeline = String(body.timeline || "").trim() || null;
      if (body.dos !== undefined) data.dos = String(body.dos || "").trim() || null;
      if (body.donts !== undefined) data.donts = String(body.donts || "").trim() || null;
      if (body.angles !== undefined) data.angles = String(body.angles || "").trim() || null;
      if (body.assets !== undefined) data.assets = body.assets;
      if (body.ownerTmId !== undefined) {
        data.ownerTmId = String(body.ownerTmId || "").trim() || null;
      }
      if (body.startsAt !== undefined) {
        data.startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;
      }
      if (body.endsAt !== undefined) {
        data.endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
      }
      if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    }

    // senderEmail : Admin / Sales / Strategy
    if (
      body.senderEmail !== undefined &&
      (canManageBrands(session.user.role) || canSend(session.user.role))
    ) {
      data.senderEmail = String(body.senderEmail || "").trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
    }

    await prisma.talentProspectingCampaign.update({
      where: { id: campaignId },
      data,
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "BRIEF_UPDATED",
        message: "Brief / infos projet mises à jour",
        payload: { fields: Object.keys(data) },
      },
    });

    const campaign = await loadCampaign(campaignId);
    return NextResponse.json({
      campaign: campaign ? await attachMarqueContacts(serializeCampaign(campaign)) : null,
    });
  } catch (error) {
    console.error("PATCH /api/projets-outreach/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
