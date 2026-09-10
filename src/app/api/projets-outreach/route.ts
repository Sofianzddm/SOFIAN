import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CAMPAIGN_STATUSES,
  canCreateCampaign,
  DEFAULT_SENDER_EMAIL,
  isProjetsOutreachRole,
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

    // Uniquement les projets du parcours unifié (créés via /projets-outreach),
    // pas les anciennes campagnes Strategy orphelines.
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
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          status: c.status,
          isActive: c.isActive,
          senderEmail: c.senderEmail,
          talentId: c.talentId,
          talentName: `${c.talent.prenom} ${c.talent.nom}`.trim(),
          talentPhoto: c.talent.photo,
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
      talentId?: string;
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
    const talentId = String(body.talentId || "").trim();
    if (!title || !talentId) {
      return NextResponse.json({ error: "title et talentId sont requis." }, { status: 400 });
    }

    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true, prenom: true, nom: true, managerId: true },
    });
    if (!talent) return NextResponse.json({ error: "Talent introuvable." }, { status: 404 });

    const ownerTmId = String(body.ownerTmId || "").trim() || talent.managerId || null;

    const campaign = await prisma.talentProspectingCampaign.create({
      data: {
        title,
        description: String(body.description || "").trim() || null,
        talentId,
        createdById: session.user.id,
        ownerTmId,
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
      },
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
      },
    });

    await appendEvent({
      campaignId: campaign.id,
      actorId: session.user.id,
      type: "CREATED",
      message: `Projet créé pour ${talent.prenom} ${talent.nom}`,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projets-outreach:", error);
    return NextResponse.json({ error: "Erreur lors de la création du projet" }, { status: 500 });
  }
}
