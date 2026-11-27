import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  autoPromoteOpenProjetMissionsNeedingEnrichissement,
  formatAwaitingSourcesLabel,
  missionReasonLooksLikeGift,
} from "@/lib/resolve-awaiting-enrichissement";

/**
 * GET — marques en attente d'enrichissement, groupées par fiche CRM.
 * Une marque demandée depuis le pipeline ET un projet = une seule ligne
 * avec sources = Les deux.
 */
const ALLOWED = ["ADMIN", "CASTING_MANAGER"] as const;

type SourceKind = "pipeline" | "projet" | "gift";

const AWAITING_MISSION_SELECT = {
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
} as const;

const AWAITING_BASE_WHERE = {
  awaitingContactsCompletion: true,
  status: { not: "CANCELLED" as const },
  OR: [
    { campaignId: null },
    {
      campaign: {
        status: { not: "CLOSED" as const },
      },
    },
  ],
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED.includes((session.user.role || "") as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    // Remonte auto les projets outreach ouverts avec ≤ 1 email utilisable.
    await autoPromoteOpenProjetMissionsNeedingEnrichissement().catch((err) => {
      console.warn("[awaiting-marques] auto-promote soft:", err);
    });

    // File générale plafonnée + TOUJOURS les missions gift (sinon elles
    // disparaissent du filtre Gifting dès que le pipeline dépasse le plafond).
    const [recentMissions, giftMissions] = await Promise.all([
      prisma.contactMission.findMany({
        where: AWAITING_BASE_WHERE,
        orderBy: [
          { contactsCompletionRequestedAt: "desc" },
          { updatedAt: "desc" },
        ],
        take: 300,
        select: AWAITING_MISSION_SELECT,
      }),
      prisma.contactMission.findMany({
        where: {
          awaitingContactsCompletion: true,
          status: { not: "CANCELLED" },
          campaignId: null,
          OR: [
            { strategyReason: { startsWith: "Gift ", mode: "insensitive" } },
            {
              strategyReason: { contains: "Demande Gift", mode: "insensitive" },
            },
            {
              strategyReason: { contains: "demande gift", mode: "insensitive" },
            },
            { strategyReason: { contains: "GIFT-", mode: "insensitive" } },
          ],
        },
        orderBy: [
          { contactsCompletionRequestedAt: "desc" },
          { updatedAt: "desc" },
        ],
        take: 200,
        select: AWAITING_MISSION_SELECT,
      }),
    ]);

    const byId = new Map<string, (typeof recentMissions)[number]>();
    for (const m of recentMissions) byId.set(m.id, m);
    for (const m of giftMissions) byId.set(m.id, m);
    const missions = Array.from(byId.values());

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

    // Marques aussi liées à une demande gift (même si la mission est projet /
    // pipeline) → source « gift » pour le filtre Gifting.
    const giftsByMarque = new Map<
      string,
      Array<{ id: string; reference: string; talentName: string }>
    >();
    if (marqueIds.length > 0) {
      const [giftLinks, giftPrincipals] = await Promise.all([
        prisma.demandeGiftMarque.findMany({
          where: { marqueId: { in: marqueIds } },
          select: {
            marqueId: true,
            demandeGift: {
              select: {
                id: true,
                reference: true,
                talent: { select: { prenom: true, nom: true } },
              },
            },
          },
          take: 500,
        }),
        prisma.demandeGift.findMany({
          where: { marqueId: { in: marqueIds } },
          select: {
            id: true,
            reference: true,
            marqueId: true,
            talent: { select: { prenom: true, nom: true } },
          },
          take: 500,
        }),
      ]);
      const pushGift = (
        mid: string,
        g: {
          id: string;
          reference: string;
          talent?: { prenom?: string | null; nom?: string | null } | null;
        }
      ) => {
        const list = giftsByMarque.get(mid) || [];
        if (list.some((x) => x.id === g.id)) return;
        list.push({
          id: g.id,
          reference: g.reference,
          talentName: `${g.talent?.prenom || ""} ${g.talent?.nom || ""}`.trim(),
        });
        giftsByMarque.set(mid, list);
      };
      for (const row of giftLinks) {
        if (row.demandeGift?.id) pushGift(row.marqueId, row.demandeGift);
      }
      for (const g of giftPrincipals) {
        if (g.marqueId) pushGift(g.marqueId, g);
      }
    }

    for (const m of missions) {
      const brandName = m.marque?.nom || m.targetBrand;
      const marqueId = m.marqueId || m.marque?.id || null;
      const reason = String(m.strategyReason || "");
      const isGift = missionReasonLooksLikeGift(reason);
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
      const linkedGifts = marqueId ? giftsByMarque.get(marqueId) || [] : [];
      const primaryGift = linkedGifts[0] || null;
      const contextLabel =
        kind === "gift"
          ? reason.split("—")[0]?.trim() ||
            (primaryGift ? `Gifting ${primaryGift.reference}` : "Gifting")
          : kind === "pipeline"
            ? "Pipeline indiv"
            : m.campaign?.title
              ? `Projet outreach « ${m.campaign.title} »`
              : "Projet outreach";
      const contextPath =
        kind === "gift"
          ? primaryGift
            ? `/gifts/${primaryGift.id}`
            : "/gifts"
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

      // Lien gift CRM même si la mission active est projet / pipeline.
      if (linkedGifts.length > 0 && !group.sources.includes("gift")) {
        group.sources.push("gift");
      }
      for (const g of linkedGifts) {
        const giftLabel = `Gifting ${g.reference}`;
        if (group.contexts.some((c) => c.kind === "gift" && c.label === giftLabel)) {
          continue;
        }
        group.contexts.push({
          missionId: m.id,
          kind: "gift",
          label: giftLabel,
          path: `/gifts/${g.id}`,
          talentName: g.talentName || talentName || m.creatorName,
          creatorName: m.creatorName,
          requestedByName: requester || null,
          requestedAt,
        });
      }
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
