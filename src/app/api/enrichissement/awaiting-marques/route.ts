import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { formatAwaitingSourcesLabel } from "@/lib/resolve-awaiting-enrichissement";

/**
 * GET — marques en attente d'enrichissement, groupées par fiche CRM.
 * Une marque demandée depuis le pipeline ET un projet = une seule ligne
 * avec sources = Les deux.
 */
const ALLOWED = ["ADMIN", "CASTING_MANAGER"] as const;

type SourceKind = "pipeline" | "projet" | "gift";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED.includes((session.user.role || "") as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const missions = await prisma.contactMission.findMany({
      where: {
        awaitingContactsCompletion: true,
        status: { not: "CANCELLED" },
        OR: [
          { campaignId: null },
          {
            campaign: {
              status: { not: "CLOSED" },
            },
          },
        ],
      },
      orderBy: [
        { contactsCompletionRequestedAt: "desc" },
        { updatedAt: "desc" },
      ],
      take: 300,
      select: {
        id: true,
        targetBrand: true,
        creatorName: true,
        strategyReason: true,
        stage: true,
        contactsCompletionRequestedAt: true,
        updatedAt: true,
        marqueId: true,
        campaignId: true,
        marque: {
          select: {
            id: true,
            nom: true,
          },
        },
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            talent: { select: { prenom: true, nom: true } },
          },
        },
        talent: { select: { prenom: true, nom: true } },
        createdBy: { select: { prenom: true, nom: true } },
      },
    });

    const marqueIds = Array.from(
      new Set(
        missions
          .map((m) => m.marqueId || m.marque?.id || null)
          .filter((id): id is string => Boolean(id))
      )
    );

    const contactCountByMarque = new Map<string, number>();
    const emailableCountByMarque = new Map<string, number>();

    if (marqueIds.length > 0) {
      const [totals, emailables] = await Promise.all([
        prisma.marqueContact.groupBy({
          by: ["marqueId"],
          where: {
            marqueId: { in: marqueIds },
            outreachExcluded: false,
            diffusionOptOut: false,
          },
          _count: { _all: true },
        }),
        prisma.marqueContact.groupBy({
          by: ["marqueId"],
          where: {
            marqueId: { in: marqueIds },
            outreachExcluded: false,
            diffusionOptOut: false,
            OR: [
              { email: { contains: "@" } },
              { emailSuggested: { contains: "@" } },
            ],
          },
          _count: { _all: true },
        }),
      ]);
      for (const row of totals) {
        contactCountByMarque.set(row.marqueId, row._count._all);
      }
      for (const row of emailables) {
        emailableCountByMarque.set(row.marqueId, row._count._all);
      }
    }

    type Group = {
      key: string;
      brandName: string;
      marqueId: string | null;
      emailableCount: number;
      contactCount: number;
      requestedAt: string | null;
      sources: SourceKind[];
      sourceLabel: string;
      fichePath: string | null;
      contexts: Array<{
        missionId: string;
        kind: SourceKind;
        label: string;
        path: string;
        talentName: string;
        creatorName: string;
        requestedByName: string | null;
        requestedAt: string | null;
      }>;
    };

    const groups = new Map<string, Group>();

    for (const m of missions) {
      const brandName = m.marque?.nom || m.targetBrand;
      const marqueId = m.marqueId || m.marque?.id || null;
      const reason = String(m.strategyReason || "");
      const isGift =
        /^gift\b/i.test(reason.trim()) ||
        reason.toLowerCase().includes("demande gift");
      const kind: SourceKind = m.campaignId
        ? "projet"
        : isGift
          ? "gift"
          : "pipeline";
      const key = marqueId || `mission:${m.id}`;
      const campaignTalent = m.campaign?.talent;
      const soloTalent = m.talent;
      const talentName = campaignTalent
        ? `${campaignTalent.prenom || ""} ${campaignTalent.nom || ""}`.trim()
        : soloTalent
          ? `${soloTalent.prenom || ""} ${soloTalent.nom || ""}`.trim()
          : "";
      const requester = m.createdBy
        ? `${m.createdBy.prenom || ""} ${m.createdBy.nom || ""}`.trim()
        : "";
      const requestedAt = m.contactsCompletionRequestedAt?.toISOString() ?? null;
      const contextLabel =
        kind === "gift"
          ? reason.split("—")[0]?.trim() || "Gifting"
          : kind === "pipeline"
            ? "Pipeline indiv"
            : m.campaign?.title
              ? `Projet outreach « ${m.campaign.title} »`
              : "Projet outreach";
      const contextPath =
        kind === "gift"
          ? "/gifts"
          : kind === "pipeline"
            ? "/strategy/projet-individuel-talent/pipeline"
            : `/projets-outreach/${m.campaignId}`;

      const emailableCount = marqueId
        ? emailableCountByMarque.get(marqueId) || 0
        : 0;
      const contactCount = marqueId
        ? contactCountByMarque.get(marqueId) || 0
        : 0;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          brandName,
          marqueId,
          emailableCount,
          contactCount,
          requestedAt,
          sources: [],
          sourceLabel: "",
          fichePath: marqueId ? `/marques/${marqueId}` : null,
          contexts: [],
        };
        groups.set(key, group);
      }

      if (!group.sources.includes(kind)) group.sources.push(kind);
      if (
        requestedAt &&
        (!group.requestedAt || requestedAt > group.requestedAt)
      ) {
        group.requestedAt = requestedAt;
      }
      group.emailableCount = Math.max(group.emailableCount, emailableCount);
      group.contactCount = Math.max(group.contactCount, contactCount);
      group.contexts.push({
        missionId: m.id,
        kind,
        label: contextLabel,
        path: contextPath,
        talentName: talentName || m.creatorName,
        creatorName: m.creatorName,
        requestedByName: requester || null,
        requestedAt,
      });
    }

    const items = Array.from(groups.values()).map((g) => {
      const projetTitles = g.contexts
        .filter((c) => c.kind === "projet")
        .map((c) =>
          c.label
            .replace(/^Projet outreach « | »$/g, "")
            .replace(/^Projet « | »$/g, "")
        )
        .filter((t) => t && t !== "Projet outreach");
      return {
        ...g,
        sourceLabel: formatAwaitingSourcesLabel(g.sources, projetTitles),
        both: g.sources.includes("pipeline") && g.sources.includes("projet"),
      };
    });

    items.sort((a, b) => {
      const ta = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const tb = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({
      count: items.length,
      missionCount: missions.length,
      items,
    });
  } catch (error) {
    console.error("GET /api/enrichissement/awaiting-marques:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
