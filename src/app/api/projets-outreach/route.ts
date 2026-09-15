import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CAMPAIGN_STATUSES,
  canCreateCampaign,
  DEFAULT_SENDER_EMAIL,
  isProjetsOutreachRole,
  isValidCampaignMode,
  type CampaignMode,
  type CampaignStatus,
} from "@/lib/projets-outreach";

async function appendEvent(opts: {
  campaignId: string;
  actorId: string;
  type: string;
  message?: string;
  payload?: Record<string, unknown>;
}) {
  await prisma.prospectingCampaignEvent.create({
    data: {
      campaignId: opts.campaignId,
      actorId: opts.actorId,
      type: opts.type,
      message: opts.message ?? null,
      ...(opts.payload ? { payload: opts.payload as object } : {}),
    },
  });
}

function talentLabel(t: { prenom: string; nom: string }) {
  return `${t.prenom || ""} ${t.nom || ""}`.trim();
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const statusParam = String(request.nextUrl.searchParams.get("status") || "")
      .trim()
      .toUpperCase();
    const mineParam = String(request.nextUrl.searchParams.get("mine") || "")
      .trim()
      .toLowerCase();
    const activeParam = String(request.nextUrl.searchParams.get("active") || "").trim();

    const where: Record<string, unknown> = {
      events: { some: { type: "CREATED" } },
    };
    if ((CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)) {
      where.status = statusParam as CampaignStatus;
    }
    if (activeParam === "1" || activeParam === "true") where.isActive = true;
    if (activeParam === "0" || activeParam === "false") where.isActive = false;

    const role = session.user.role;
    const userId = session.user.id;

    if (mineParam === "1" || mineParam === "true") {
      where.AND = [{ OR: [{ createdById: userId }, { ownerTmId: userId }] }];
    }

    const campaigns = await prisma.talentProspectingCampaign.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        talent: { select: { id: true, prenom: true, nom: true, managerId: true, photo: true } },
        campaignTalents: {
          orderBy: { sortOrder: "asc" },
          include: {
            talent: {
              select: { id: true, prenom: true, nom: true, photo: true },
            },
          },
        },
        createdBy: { select: { id: true, prenom: true, nom: true, role: true } },
        ownerTm: { select: { id: true, prenom: true, nom: true } },
        _count: { select: { contactMissions: true } },
      },
      take: 200,
    });

    const campaignIds = campaigns.map((c) => c.id);
    const stageAgg =
      campaignIds.length > 0
        ? await prisma.contactMission.groupBy({
            by: ["campaignId", "stage"],
            where: { campaignId: { in: campaignIds } },
            _count: { _all: true },
          })
        : [];

    const byCampaign: Record<
      string,
      { total: number; sent: number; answered: number; byStage: Record<string, number> }
    > = {};
    for (const row of stageAgg) {
      if (!row.campaignId) continue;
      const k = row.campaignId;
      if (!byCampaign[k]) byCampaign[k] = { total: 0, sent: 0, answered: 0, byStage: {} };
      byCampaign[k].total += row._count._all;
      byCampaign[k].byStage[row.stage] = row._count._all;
      if (
        row.stage === "SENT" ||
        row.stage === "RESPONSE_RECEIVED" ||
        row.stage === "IN_NEGOTIATION" ||
        row.stage === "WON" ||
        row.stage === "LOST"
      ) {
        byCampaign[k].sent += row._count._all;
      }
      if (
        row.stage === "RESPONSE_RECEIVED" ||
        row.stage === "IN_NEGOTIATION" ||
        row.stage === "WON"
      ) {
        byCampaign[k].answered += row._count._all;
      }
    }

    return NextResponse.json({
      campaigns: campaigns.map((c) => {
        const stats = byCampaign[c.id] || { total: 0, sent: 0, answered: 0, byStage: {} };
        const talents =
          c.campaignTalents.length > 0
            ? c.campaignTalents.map((ct) => ({
                id: ct.talent.id,
                name: talentLabel(ct.talent),
                photo: ct.talent.photo,
              }))
            : [
                {
                  id: c.talent.id,
                  name: talentLabel(c.talent),
                  photo: c.talent.photo,
                },
              ];
        const talentNames = talents.map((t) => t.name).filter(Boolean);
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          status: c.status,
          mode: c.mode,
          isActive: c.isActive,
          senderEmail: c.senderEmail,
          talentId: c.talentId,
          talentName:
            c.mode === "MULTI" && talentNames.length > 1
              ? talentNames.join(", ")
              : talentLabel(c.talent),
          talentPhoto: c.talent.photo,
          talents,
          talentCount: talents.length,
          ownerTmId: c.ownerTmId,
          ownerTmName: c.ownerTm
            ? `${c.ownerTm.prenom} ${c.ownerTm.nom}`.trim()
            : null,
          createdById: c.createdById,
          createdByName: `${c.createdBy.prenom} ${c.createdBy.nom}`.trim(),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          missionCount: stats.total,
          sentCount: stats.sent,
          answeredCount: stats.answered,
          byStage: stats.byStage,
          objective: c.objective,
          budgetRange: c.budgetRange,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/projets-outreach:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des projets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canCreateCampaign(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      mode?: string;
      talentId?: string;
      talentIds?: string[];
      objective?: string | null;
      deliverables?: string | null;
      budgetRange?: string | null;
      timeline?: string | null;
      dos?: string | null;
      donts?: string | null;
      angles?: string | null;
      ownerTmId?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
    };

    const title = String(body.title || "").trim();
    const rawMode = String(body.mode || "SOLO").trim().toUpperCase();
    const mode: CampaignMode = isValidCampaignMode(rawMode) ? rawMode : "SOLO";

    const fromArray = Array.isArray(body.talentIds)
      ? body.talentIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const single = String(body.talentId || "").trim();
    const talentIds =
      fromArray.length > 0 ? Array.from(new Set(fromArray)) : single ? [single] : [];

    if (!title) {
      return NextResponse.json({ error: "title est requis." }, { status: 400 });
    }
    if (mode === "SOLO" && talentIds.length !== 1) {
      return NextResponse.json(
        { error: "Mode Solo : sélectionne exactement 1 talent." },
        { status: 400 }
      );
    }
    if (mode === "MULTI" && talentIds.length < 2) {
      return NextResponse.json(
        { error: "Mode Multiples : sélectionne au moins 2 talents." },
        { status: 400 }
      );
    }

    const talents = await prisma.talent.findMany({
      where: { id: { in: talentIds } },
      select: { id: true, prenom: true, nom: true, managerId: true },
    });
    if (talents.length !== talentIds.length) {
      return NextResponse.json({ error: "Un ou plusieurs talents introuvables." }, { status: 404 });
    }

    const byId = new Map(talents.map((t) => [t.id, t]));
    const ordered = talentIds.map((id) => byId.get(id)!);
    const primary = ordered[0];
    const ownerTmId =
      String(body.ownerTmId || "").trim() || primary.managerId || null;

    const { getOrCreateCollectingWave } = await import("@/lib/brand-condensation");
    const wave = await getOrCreateCollectingWave({ actorId: session.user.id });

    const campaign = await prisma.talentProspectingCampaign.create({
      data: {
        title,
        description: String(body.description || "").trim() || null,
        talentId: primary.id,
        mode,
        createdById: session.user.id,
        ownerTmId,
        waveId: wave.id,
        status: "BRIEF",
        objective: String(body.objective || "").trim() || null,
        deliverables: String(body.deliverables || "").trim() || null,
        budgetRange: String(body.budgetRange || "").trim() || null,
        timeline: String(body.timeline || "").trim() || null,
        dos: String(body.dos || "").trim() || null,
        donts: String(body.donts || "").trim() || null,
        angles: String(body.angles || "").trim() || null,
        senderEmail: DEFAULT_SENDER_EMAIL,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        isActive: true,
        campaignTalents: {
          create: ordered.map((t, i) => ({
            talentId: t.id,
            sortOrder: i,
          })),
        },
      },
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
        campaignTalents: {
          include: { talent: { select: { id: true, prenom: true, nom: true } } },
        },
      },
    });

    const names = ordered.map(talentLabel).join(", ");
    await appendEvent({
      campaignId: campaign.id,
      actorId: session.user.id,
      type: "CREATED",
      message:
        mode === "MULTI"
          ? `Projet multi créé · ${ordered.length} talents : ${names}`
          : `Projet créé pour ${talentLabel(primary)}`,
      payload: { mode, talentIds },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projets-outreach:", error);
    return NextResponse.json({ error: "Erreur lors de la création du projet" }, { status: 500 });
  }
}
