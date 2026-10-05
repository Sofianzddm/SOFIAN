import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canEditBrief,
  canManageBrands,
  canSend,
  isProjetsOutreachRole,
} from "@/lib/projets-outreach";
import {
  isForbiddenCastingRecipient,
  loadCastingRecipientBlocklist,
} from "@/lib/casting-recipient-guard";

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
      campaignTalents: {
        orderBy: { sortOrder: "asc" },
        include: {
          talent: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              photo: true,
              instagram: true,
              niches: true,
              stats: {
                select: { igFollowers: true, ttFollowers: true },
              },
            },
          },
        },
      },
      createdBy: { select: { id: true, prenom: true, nom: true, role: true } },
      ownerTm: { select: { id: true, prenom: true, nom: true } },
      wave: {
        select: {
          id: true,
          title: true,
          status: true,
          completedAt: true,
          validatedAt: true,
        },
      },
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
  const talents =
    c.campaignTalents.length > 0
      ? c.campaignTalents.map((ct) => ({
          id: ct.talent.id,
          name: `${ct.talent.prenom} ${ct.talent.nom}`.trim(),
          prenom: ct.talent.prenom,
          nom: ct.talent.nom,
          photo: ct.talent.photo,
          instagram: ct.talent.instagram,
          niches: ct.talent.niches || [],
          igFollowers: ct.talent.stats?.igFollowers ?? 0,
          ttFollowers: ct.talent.stats?.ttFollowers ?? 0,
          note: ct.note,
          sortOrder: ct.sortOrder,
        }))
      : [
          {
            id: c.talent.id,
            name: `${c.talent.prenom} ${c.talent.nom}`.trim(),
            prenom: c.talent.prenom,
            nom: c.talent.nom,
            photo: c.talent.photo,
            instagram: c.talent.instagram,
            niches: [] as string[],
            igFollowers: 0,
            ttFollowers: 0,
            note: null as string | null,
            sortOrder: 0,
          },
        ];

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    mode: c.mode,
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
    talents,
    talentCount: talents.length,
    ownerTmId: c.ownerTmId,
    ownerTmName: c.ownerTm ? `${c.ownerTm.prenom} ${c.ownerTm.nom}`.trim() : null,
    waveId: c.waveId,
    wave: c.wave
      ? {
          id: c.wave.id,
          title: c.wave.title,
          status: c.wave.status,
          completedAt: c.wave.completedAt,
          validatedAt: c.wave.validatedAt,
        }
      : null,
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
      selectedTalentIds: Array.isArray(m.selectedTalentIds) ? m.selectedTalentIds : [],
      marqueContacts: [] as Array<{
        id: string;
        firstname: string;
        lastname: string;
        email: string;
        role: string;
        linkedinUrl: string;
        language: "fr" | "en";
      }>,
      scheduledSendAt: m.scheduledSendAt,
      sentAt: m.sentAt,
      sentMessageIds: m.sentMessageIds,
      replied: m.replied,
      openedAt: m.openedAt,
      lastOpenAt: m.lastOpenAt,
      openCount: m.openCount,
      clickedAt: m.clickedAt,
      lastClickAt: m.lastClickAt,
      lastClickUrl: m.lastClickUrl,
      clickCount: m.clickCount,
      awaitingContactsCompletion: m.awaitingContactsCompletion,
      contactsCompletionRequestedAt: m.contactsCompletionRequestedAt,
      condensationGroupId: m.condensationGroupId,
      condensationRole: m.condensationRole,
      condensationStatus: m.condensationStatus,
      condensationPeerNames: [] as string[],
      waveClusterId: m.waveClusterId,
      relanceSentAt: m.relanceSentAt,
      relance2SentAt: m.relance2SentAt,
      relanceCancelledAt: m.relanceCancelledAt,
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
      outreachExcluded: false,
      diffusionOptOut: false,
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
      language: true,
    },
    orderBy: [{ principal: "desc" }, { nom: "asc" }],
  });

  const blocklist = await loadCastingRecipientBlocklist();
  const byMarque = new Map<
    string,
    Array<{
      id: string;
      firstname: string;
      lastname: string;
      email: string;
      role: string;
      linkedinUrl: string;
      language: "fr" | "en";
    }>
  >();
  for (const r of rows) {
    // Exclure uniquement les Appels d'offres. source null/vide = OK (sinon
    // Prisma NOT source=AO excluait aussi les NULL → 0 contacts Nuxe).
    if (String(r.source || "").trim().toUpperCase() === "AO") continue;
    const email = String(r.email || r.emailSuggested || "").trim();
    if (!email || !email.includes("@")) continue;
    const firstname = String(r.prenom || "").trim();
    const lastname = String(r.nom || "").trim();
    if (
      isForbiddenCastingRecipient(
        { email, firstname, lastname },
        blocklist
      )
    ) {
      continue;
    }
    const list = byMarque.get(r.marqueId) || [];
    list.push({
      id: r.id,
      firstname,
      lastname,
      email,
      role: String(r.poste || "").trim(),
      linkedinUrl: String(r.linkedinUrl || "").trim(),
      language: String(r.language || "").toLowerCase() === "en" ? "en" : "fr",
    });
    byMarque.set(r.marqueId, list);
  }

  for (const m of campaign.missions) {
    m.marqueContacts = m.marqueId ? byMarque.get(m.marqueId) || [] : [];
  }
  return campaign;
}

async function attachCondensationPeers<
  T extends {
    missions: Array<{
      id: string;
      condensationGroupId: string | null;
      condensationPeerNames: string[];
    }>;
  }
>(campaign: T): Promise<T> {
  const groupIds = Array.from(
    new Set(
      campaign.missions
        .map((m) => m.condensationGroupId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (groupIds.length === 0) return campaign;

  const peers = await prisma.contactMission.findMany({
    where: { condensationGroupId: { in: groupIds } },
    select: {
      id: true,
      condensationGroupId: true,
      creatorName: true,
      campaign: { select: { talent: { select: { prenom: true, nom: true } } } },
    },
  });

  const byGroup = new Map<string, Array<{ id: string; name: string }>>();
  for (const p of peers) {
    if (!p.condensationGroupId) continue;
    const name = p.campaign?.talent
      ? `${p.campaign.talent.prenom} ${p.campaign.talent.nom}`.trim()
      : p.creatorName;
    const list = byGroup.get(p.condensationGroupId) || [];
    list.push({ id: p.id, name });
    byGroup.set(p.condensationGroupId, list);
  }

  for (const m of campaign.missions) {
    if (!m.condensationGroupId) continue;
    m.condensationPeerNames = (byGroup.get(m.condensationGroupId) || [])
      .filter((p) => p.id !== m.id)
      .map((p) => p.name)
      .filter(Boolean);
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

    const serialized = await attachMarqueContacts(serializeCampaign(campaign));
    return NextResponse.json({
      campaign: await attachCondensationPeers(serialized),
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
