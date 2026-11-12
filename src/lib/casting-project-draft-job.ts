import prisma from "@/lib/prisma";
import { getLeynaExchangeContext } from "@/lib/leyna-exchange-context";
import { buildDraftPrepBrief } from "@/lib/draft-prep-brief";
import { getCondensationSiblingBriefs } from "@/lib/brand-condensation";
import { loadPresentationExcerptFromUrl } from "@/lib/campaign-presentation-text";
import {
  appBaseUrl,
  internalJobHeaders,
} from "@/lib/internal-job-auth";

export type CreateProjectDraftItemInput = {
  missionId: string;
  brandName: string;
  talentIds?: string[];
};

export async function createProjectDraftJob(args: {
  userId: string;
  campaignId: string;
  items: CreateProjectDraftItemInput[];
}): Promise<{ jobId: string; totalMissions: number; appended: number }> {
  const campaignId = String(args.campaignId || "").trim();
  if (!campaignId) throw new Error("campaignId requis.");

  const items = args.items
    .map((it, i) => ({
      missionId: String(it.missionId || "").trim(),
      brandName: String(it.brandName || "").trim() || "Marque",
      talentIds: (it.talentIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, 8),
      sortOrder: i,
    }))
    .filter((it) => it.missionId);

  if (items.length === 0) {
    throw new Error("Aucune mission à traiter.");
  }

  // Réutilise le job actif de la même campagne (append) — comme outreach.
  const active = await prisma.castingProjectDraftJob.findFirst({
    where: {
      userId: args.userId,
      campaignId,
      status: { in: ["pending", "running"] },
      cancelRequested: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      totalMissions: true,
      items: { select: { missionId: true, status: true, sortOrder: true } },
    },
  });

  if (active) {
    const existingIds = new Set(
      active.items
        .filter((it) => ["pending", "running", "done"].includes(it.status))
        .map((it) => it.missionId)
    );
    const maxSort = active.items.reduce(
      (m, it) => Math.max(m, Number(it.sortOrder || 0)),
      -1
    );
    const toAdd = items.filter((it) => !existingIds.has(it.missionId));
    if (toAdd.length === 0) {
      return {
        jobId: active.id,
        totalMissions: active.totalMissions,
        appended: 0,
      };
    }
    const now = new Date();
    const nextTotal = active.totalMissions + toAdd.length;
    await prisma.$transaction([
      prisma.castingProjectDraftItem.createMany({
        data: toAdd.map((it, i) => ({
          jobId: active.id,
          missionId: it.missionId,
          brandName: it.brandName,
          talentIds: it.talentIds,
          sortOrder: maxSort + 1 + i,
          status: "pending",
          updatedAt: now,
        })),
      }),
      prisma.castingProjectDraftJob.update({
        where: { id: active.id },
        data: {
          totalMissions: nextTotal,
          // Garder "running" si le worker tourne déjà (évite une fenêtre "pending"
          // pendant laquelle un autre tick pourrait finaliser trop tôt).
          status: "running",
          finishedAt: null,
          error: null,
        },
      }),
    ]);
    return {
      jobId: active.id,
      totalMissions: nextTotal,
      appended: toAdd.length,
    };
  }

  const job = await prisma.castingProjectDraftJob.create({
    data: {
      userId: args.userId,
      campaignId,
      status: "pending",
      totalMissions: items.length,
      items: {
        create: items.map((it) => ({
          missionId: it.missionId,
          brandName: it.brandName,
          talentIds: it.talentIds,
          sortOrder: it.sortOrder,
          status: "pending",
        })),
      },
    },
    select: { id: true, totalMissions: true },
  });

  return {
    jobId: job.id,
    totalMissions: job.totalMissions,
    appended: items.length,
  };
}

export async function requestCancelProjectDraftJob(
  jobId: string,
  userId: string
) {
  const job = await prisma.castingProjectDraftJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return null;
  return prisma.castingProjectDraftJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: job.status === "pending" ? "cancelled" : job.status,
      finishedAt: job.status === "pending" ? new Date() : job.finishedAt,
    },
  });
}

export async function getProjectDraftJobForUser(jobId: string, userId: string) {
  return prisma.castingProjectDraftJob.findFirst({
    where: { id: jobId, userId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
}

async function internalPost<T = Record<string, unknown>>(
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${appBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: internalJobHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

type BrandResearch = {
  recentCampaigns?: string;
  newProducts?: string;
  availabilityFrEu?: string;
  brandPositioning?: string;
  influenceStrategy?: string;
  error?: string;
};

type TalentResearchItem = {
  talentId: string;
  name: string;
  whoTheyAre: string;
  whatTheyDo?: string;
  profileAnalysis?: string;
  contentThemes: string;
  whyRelevant: string;
  proofPoints: string;
  sourcesUsed?: string;
};

type TalentRow = {
  id: string;
  name: string;
  prenom?: string;
  nom?: string;
  instagram?: string | null;
  niches: string[];
  igFollowers: number;
  ttFollowers: number;
};

async function noteMissionDraftFailure(
  missionId: string,
  reason: string
): Promise<void> {
  const mid = String(missionId || "").trim();
  const msg = String(reason || "").trim().slice(0, 600);
  if (!mid || !msg) return;
  try {
    const row = await prisma.contactMission.findUnique({
      where: { id: mid },
      select: { castingResearchSnapshot: true },
    });
    const prev =
      row?.castingResearchSnapshot &&
      typeof row.castingResearchSnapshot === "object" &&
      !Array.isArray(row.castingResearchSnapshot)
        ? (row.castingResearchSnapshot as Record<string, unknown>)
        : {};
    await prisma.contactMission.update({
      where: { id: mid },
      data: {
        castingResearchSnapshot: {
          ...prev,
          draftFailure: {
            reason: msg,
            at: new Date().toISOString(),
          },
        },
      },
    });
  } catch (e) {
    console.warn(`[project-draft-job] noteMissionDraftFailure ${mid}:`, e);
  }
}

function talentDisplayName(t: {
  prenom?: string | null;
  nom?: string | null;
  name?: string;
}): string {
  if (t.name) return t.name;
  return `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent";
}

async function resolveProjectPayload(args: {
  mission: {
    id: string;
    talentId: string | null;
    targetBrand: string | null;
    strategyReason: string | null;
    recommendedAngle: string | null;
    objective: string | null;
    dos: string | null;
    donts: string | null;
    draftContext: string | null;
    selectedTalentIds: string[];
    condensationGroupId: string | null;
    condensationStatus: string | null;
    condensationRole: string | null;
    creatorName: string | null;
  };
  brandName: string;
  campaign: {
    id: string;
    title: string;
    description: string | null;
    mode: string;
    objective: string | null;
    deliverables: string | null;
    angles: string | null;
    timeline: string | null;
    budgetRange: string | null;
    dos: string | null;
    donts: string | null;
    presentationPdfUrl?: string | null;
    talentId: string;
    talent: { id: string; prenom: string; nom: string };
    campaignTalents: Array<{
      talentId: string;
      talent: {
        id: string;
        prenom: string;
        nom: string;
        instagram: string | null;
        niches: string[];
        stats: { igFollowers: number | null; ttFollowers: number | null } | null;
      };
    }>;
  };
  itemTalentIds: string[];
}): Promise<{
  projectPayload: Record<string, unknown>;
  talents: TalentRow[];
}> {
  const { mission, brandName, campaign, itemTalentIds } = args;
  const primaryName = talentDisplayName(campaign.talent);
  const presentationExcerpt =
    (await loadPresentationExcerptFromUrl(campaign.presentationPdfUrl)) || null;

  const allTalents: TalentRow[] = campaign.campaignTalents.map((ct) => {
    const t = ct.talent;
    return {
      id: t.id,
      name: talentDisplayName(t),
      prenom: t.prenom,
      nom: t.nom,
      instagram: t.instagram,
      niches: Array.isArray(t.niches) ? t.niches.map(String) : [],
      igFollowers: Number(t.stats?.igFollowers ?? 0) || 0,
      ttFollowers: Number(t.stats?.ttFollowers ?? 0) || 0,
    };
  });

  // Fallback si campaignTalents vide (SOLO legacy)
  if (allTalents.length === 0 && campaign.talent?.id) {
    allTalents.push({
      id: campaign.talent.id,
      name: primaryName,
      prenom: campaign.talent.prenom,
      nom: campaign.talent.nom,
      niches: [],
      igFollowers: 0,
      ttFollowers: 0,
    });
  }

  const byId = new Map(allTalents.map((t) => [t.id, t]));

  const baseBrief = (talentId: string, creatorName: string) => ({
    talentId,
    projectTitle: campaign.title,
    projectDescription: campaign.description,
    creatorName,
    targetBrand: brandName,
    strategyReason: mission.strategyReason,
    recommendedAngle: mission.recommendedAngle,
    objective: mission.objective || campaign.objective,
    deliverables: campaign.deliverables,
    angles: campaign.angles,
    timeline: campaign.timeline,
    budgetRange: campaign.budgetRange,
    dos: mission.dos || campaign.dos,
    donts: mission.donts || campaign.donts,
    draftContext: mission.draftContext,
    ...(presentationExcerpt ? { presentationExcerpt } : {}),
  });

  // Condensation cross-projets
  if (
    mission.condensationGroupId ||
    mission.condensationStatus === "CONDENSED" ||
    mission.condensationRole === "PRIMARY" ||
    mission.condensationRole === "MEMBER"
  ) {
    try {
      const briefs = await getCondensationSiblingBriefs(mission.id);
      if (briefs && briefs.length >= 2) {
        const talentIds = Array.from(
          new Set(
            briefs
              .map((b) => String(b.talentId || "").trim())
              .filter(Boolean)
          )
        ).slice(0, 8);
        const talents = talentIds
          .map((id) => byId.get(id))
          .filter((t): t is TalentRow => Boolean(t));
        // Complète depuis les briefs si talent hors campagne
        for (const b of briefs) {
          const tid = String(b.talentId || "").trim();
          if (!tid || byId.has(tid)) continue;
          const row: TalentRow = {
            id: tid,
            name: String(b.creatorName || "Talent"),
            niches: [],
            igFollowers: 0,
            ttFollowers: 0,
          };
          byId.set(tid, row);
          talents.push(row);
        }
        return {
          projectPayload: {
            sharedProject: false,
            projectBriefs: briefs,
          },
          talents: talents.slice(0, 8),
        };
      }
    } catch (e) {
      console.warn(
        `[project-draft-job] condensation briefs ${mission.id}:`,
        e
      );
    }
  }

  // MULTI
  if (campaign.mode === "MULTI" && allTalents.length >= 2) {
    const selectedIds =
      itemTalentIds.length > 0
        ? itemTalentIds
        : Array.isArray(mission.selectedTalentIds) &&
            mission.selectedTalentIds.length > 0
          ? mission.selectedTalentIds
          : allTalents.map((t) => t.id);
    const forMail = selectedIds
      .map((id) => byId.get(id))
      .filter((t): t is TalentRow => Boolean(t));
    const pool = forMail.length >= 1 ? forMail : allTalents;
    if (pool.length >= 2) {
      return {
        projectPayload: {
          sharedProject: true,
          projectBriefs: pool.map((t) => baseBrief(t.id, t.name)),
        },
        talents: pool.slice(0, 8),
      };
    }
    return {
      projectPayload: {
        projectBrief: baseBrief(pool[0].id, pool[0].name),
      },
      talents: pool.slice(0, 1),
    };
  }

  // SOLO
  const soloId =
    itemTalentIds[0] ||
    mission.talentId ||
    campaign.talentId ||
    allTalents[0]?.id;
  const solo = (soloId && byId.get(soloId)) || allTalents[0];
  if (!solo) {
    throw new Error("Aucun talent sur la campagne.");
  }
  return {
    projectPayload: {
      projectBrief: baseBrief(solo.id, solo.name),
    },
    talents: [solo],
  };
}

async function processOneProjectItem(itemId: string): Promise<{
  ok: boolean;
  brandName: string;
  error?: string;
}> {
  const item = await prisma.castingProjectDraftItem.findUnique({
    where: { id: itemId },
  });
  if (!item) return { ok: false, brandName: "?", error: "Item manquant" };

  const mission = await prisma.contactMission.findUnique({
    where: { id: item.missionId },
    include: {
      marque: { select: { id: true, nom: true } },
      campaign: {
        select: {
          id: true,
          title: true,
          description: true,
          mode: true,
          objective: true,
          deliverables: true,
          angles: true,
          timeline: true,
          budgetRange: true,
          dos: true,
          donts: true,
          presentationPdfUrl: true,
          talentId: true,
          talent: { select: { id: true, prenom: true, nom: true } },
          campaignTalents: {
            orderBy: { sortOrder: "asc" },
            select: {
              talentId: true,
              talent: {
                select: {
                  id: true,
                  prenom: true,
                  nom: true,
                  instagram: true,
                  niches: true,
                  stats: { select: { igFollowers: true, ttFollowers: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!mission) {
    return { ok: false, brandName: item.brandName, error: "Mission introuvable" };
  }
  if (!mission.campaign) {
    return {
      ok: false,
      brandName: item.brandName,
      error: "Mission sans campagne projet",
    };
  }
  if (mission.sentAt || mission.stage === "SENT") {
    return { ok: true, brandName: item.brandName };
  }
  if (
    mission.recontactHoldUntil &&
    mission.recontactHoldUntil.getTime() > Date.now()
  ) {
    return { ok: true, brandName: item.brandName };
  }
  // Déjà rédigé (ex. reprise session après job terminé hors écran).
  if (
    String(mission.draftEmailSubject || "").trim() &&
    String(mission.draftEmailBody || "").trim() &&
    (mission.stage === "DRAFTED_FOR_VALIDATION" ||
      mission.status === "EMAIL_DRAFTED")
  ) {
    return {
      ok: true,
      brandName:
        (mission.marque?.nom || mission.targetBrand || item.brandName).trim() ||
        item.brandName,
    };
  }

  const brandName =
    (mission.marque?.nom || mission.targetBrand || item.brandName).trim() ||
    item.brandName;

  let projectPayload: Record<string, unknown>;
  let talents: TalentRow[];
  try {
    const resolved = await resolveProjectPayload({
      mission: {
        id: mission.id,
        talentId: mission.talentId,
        targetBrand: mission.targetBrand,
        strategyReason: mission.strategyReason,
        recommendedAngle: mission.recommendedAngle,
        objective: mission.objective,
        dos: mission.dos,
        donts: mission.donts,
        draftContext: mission.draftContext,
        selectedTalentIds: mission.selectedTalentIds || [],
        condensationGroupId: mission.condensationGroupId,
        condensationStatus: mission.condensationStatus,
        condensationRole: mission.condensationRole,
        creatorName: mission.creatorName,
      },
      brandName,
      campaign: mission.campaign,
      itemTalentIds: item.talentIds || [],
    });
    projectPayload = resolved.projectPayload;
    talents = resolved.talents;
  } catch (e) {
    return {
      ok: false,
      brandName,
      error: e instanceof Error ? e.message : "Payload projet impossible",
    };
  }

  if (talents.length === 0) {
    return { ok: false, brandName, error: "Aucun talent à pitcher" };
  }

  const talentIds = talents.map((t) => t.id);
  const primaryBrief =
    (projectPayload.projectBrief as Record<string, unknown> | undefined) ||
    (Array.isArray(projectPayload.projectBriefs)
      ? (projectPayload.projectBriefs[0] as Record<string, unknown>)
      : undefined);

  // 1) Brand research — MULTI doit passer projectBriefs (sinon seul le 1er brief est lu).
  const brandRes = await internalPost<BrandResearch>(
    "/api/casting/brand-research",
    {
      brandName,
      availabilityFocus: "FR",
      ...(primaryBrief ? { projectBrief: primaryBrief } : {}),
      ...(Array.isArray(projectPayload.projectBriefs)
        ? { projectBriefs: projectPayload.projectBriefs }
        : {}),
    }
  );
  if (!brandRes.ok || brandRes.data.error) {
    return {
      ok: false,
      brandName,
      error:
        brandRes.data.error ||
        `Analyse marque impossible (HTTP ${brandRes.status})`,
    };
  }
  const brandResearch = {
    recentCampaigns: String(brandRes.data.recentCampaigns || ""),
    newProducts: String(brandRes.data.newProducts || ""),
    availabilityFrEu: String(brandRes.data.availabilityFrEu || ""),
    brandPositioning: String(brandRes.data.brandPositioning || ""),
    influenceStrategy: String(brandRes.data.influenceStrategy || ""),
  };

  // 2) Talent research
  const talentRes = await internalPost<{
    talents?: TalentResearchItem[];
    error?: string;
  }>("/api/casting/talent-research", {
    brandName,
    talentIds,
    ...(primaryBrief ? { projectBrief: primaryBrief } : {}),
    ...(Array.isArray(projectPayload.projectBriefs)
      ? { projectBriefs: projectPayload.projectBriefs }
      : {}),
  });
  if (!talentRes.ok || talentRes.data.error) {
    return {
      ok: false,
      brandName,
      error:
        talentRes.data.error ||
        `Analyse talent impossible (HTTP ${talentRes.status})`,
    };
  }
  const talentResearch = Array.isArray(talentRes.data.talents)
    ? talentRes.data.talents
    : [];
  if (talentResearch.length === 0) {
    return { ok: false, brandName, error: "Analyse talent vide" };
  }

  // Contacts — même priorité que l’UI projet : fiche CRM marque > clientContacts.
  type DraftContact = {
    id: string;
    firstname: string;
    lastname: string;
    email: string;
    role: string;
    language: "fr" | "en";
  };
  const mapContact = (
    c: Record<string, unknown>,
    i: number,
    prefix: string
  ): DraftContact | null => {
    const email = String(c.email || "").trim();
    if (!email.includes("@")) return null;
    if (email.toLowerCase().endsWith("@glowupagence.fr")) return null;
    return {
      id: String(c.id || `${prefix}-${i}`),
      firstname: String(c.firstname || "").trim(),
      lastname: String(c.lastname || "").trim(),
      email,
      role: String(c.role || "").trim(),
      language:
        String(c.language || "").toLowerCase() === "en" ? "en" : "fr",
    };
  };

  let contacts: DraftContact[] = [];
  const marqueId = String(mission.marque?.id || "").trim();
  if (marqueId) {
    const crmRows = await prisma.marqueContact.findMany({
      where: { marqueId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        poste: true,
        language: true,
      },
    });
    contacts = crmRows
      .map((c, i) =>
        mapContact(
          {
            id: c.id,
            firstname: c.prenom,
            lastname: c.nom,
            email: c.email,
            role: c.poste,
            language: c.language,
          },
          i,
          "crm"
        )
      )
      .filter((c): c is DraftContact => Boolean(c));
  }
  if (contacts.length === 0) {
    const rawContacts = Array.isArray(mission.clientContacts)
      ? (mission.clientContacts as Array<Record<string, unknown>>)
      : [];
    contacts = rawContacts
      .map((c, i) => mapContact(c, i, `${mission.id}-c`))
      .filter((c): c is DraftContact => Boolean(c));
  }

  let recipientEmails = contacts.map((c) => c.email);
  const talentNames = talents.map((t) => t.name);
  const leyna = await getLeynaExchangeContext({
    recipientEmails,
    brandName,
    agencyName: null,
    talentNames,
  });
  if (recipientEmails.length === 0) {
    recipientEmails = Array.from(
      new Set(
        (leyna.contacts || [])
          .map((c) => String(c.email || "").trim())
          .filter((e) => e.includes("@"))
      )
    );
  }
  if (leyna.scanStatus === "failed") {
    const detail = String(leyna.scanError || "").trim();
    return {
      ok: false,
      brandName,
      error: detail
        ? `Scan Leyna échoué — pas de rédaction cold (${detail})`
        : "Scan Leyna échoué — pas de rédaction cold.",
    };
  }

  const genLanguage =
    mission.clientLanguage === "EN" ||
    (contacts.length > 0 &&
      contacts.filter((c) => c.language === "en").length >= contacts.length / 2)
      ? "en"
      : "fr";

  const prepBrief = buildDraftPrepBrief({
    recipients: contacts.map((c) => ({
      firstname: c.firstname,
      lastname: c.lastname,
      email: c.email,
      role: c.role,
    })),
    pitchBrand: brandName,
    agencyName: null,
    talentName: talentNames.join(", "),
    strategyAngle: mission.recommendedAngle,
    talentWhyRelevant: talentResearch[0]?.whyRelevant || null,
    leyna: {
      scanStatus: leyna.scanStatus || (leyna.hasExchange ? "ok" : "empty"),
      hasExchange: Boolean(leyna.hasExchange),
      tone: leyna.tone ?? null,
      hits: (leyna.contacts || []).map((c) => ({
        email: String(c.email || ""),
        subject: c.subject ?? null,
        lastExchangeAt: c.lastExchangeAt ?? null,
        status: c.status === "sent_no_reply" ? "sent_no_reply" : "exchange",
        notes: c.notes,
        alerts: c.alerts,
        messageCount: c.messageCount,
        matchedBrand: brandName,
      })),
      alerts: leyna.alerts,
      promptBlockFr: leyna.promptBlockFr,
      promptBlockEn: leyna.promptBlockEn,
      fetchedAt: leyna.fetchedAt,
      bannerLabel: leyna.bannerLabel,
    },
    brandResearchStatus: "ok",
    talentResearchStatus: "ok",
    missionStage: mission.stage,
  });

  if (prepBrief.needsNegotiationReview) {
    return {
      ok: false,
      brandName,
      error: `REVUE NÉGO — ${prepBrief.negotiationReviewReason}`,
    };
  }

  const genRes = await internalPost<{
    subject?: string;
    body?: string;
    error?: string;
    code?: string;
  }>("/api/casting/generate-email", {
    language: genLanguage,
    market: "FR",
    availabilityFocus: "FR",
    brandName,
    brandResearch,
    talents: talents.map((t) => ({
      talentId: t.id,
      name: t.name,
      niche: t.niches.join(", ") || "—",
      followers: Math.max(t.igFollowers, t.ttFollowers),
      igFollowers: t.igFollowers,
      ttFollowers: t.ttFollowers,
      instagram: t.instagram || null,
    })),
    recipientEmails,
    requireLeynaScan: true,
    talentResearch: talentResearch.filter((r) =>
      talentIds.includes(String(r.talentId || ""))
    ),
    draftPrepBrief: prepBrief,
    leynaExchangeCache: leyna,
    missionStage: mission.stage,
    negotiationReviewAcknowledged: false,
    ...projectPayload,
  });

  if (!genRes.ok) {
    return {
      ok: false,
      brandName,
      error:
        genRes.data.error ||
        `Rédaction impossible (HTTP ${genRes.status}${
          genRes.data.code ? ` · ${genRes.data.code}` : ""
        })`,
    };
  }

  const subject = String(genRes.data.subject || "").trim();
  const body = String(genRes.data.body || "").trim();
  if (!subject || !body) {
    return { ok: false, brandName, error: "Brouillon vide" };
  }

  const castingResearchSnapshot = {
    brandName,
    brandResearch,
    talentResearch,
    leynaExchange: leyna,
    savedAt: new Date().toISOString(),
    draftFailure: null,
  };

  await prisma.contactMission.update({
    where: { id: mission.id },
    data: {
      stage: "DRAFTED_FOR_VALIDATION",
      status: "EMAIL_DRAFTED",
      draftEmailSubject: subject,
      draftEmailBody: body,
      draftLanguage: genLanguage,
      castingResearchSnapshot,
      ...(contacts.length > 0
        ? {
            clientContacts: contacts.map((c) => ({
              firstname: c.firstname,
              lastname: c.lastname,
              email: c.email,
              role: c.role,
            })),
          }
        : {}),
    },
  });

  return { ok: true, brandName };
}

const STUCK_PROJECT_ITEM_MS = 8 * 60 * 1000;

/** Remet en pending les items coincés en `running` (serveur tué mid-tick). */
async function recoverStuckProjectItems(jobId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_PROJECT_ITEM_MS);
  const res = await prisma.castingProjectDraftItem.updateMany({
    where: {
      jobId,
      status: "running",
      OR: [{ startedAt: { lt: cutoff } }, { startedAt: null }],
    },
    data: {
      status: "pending",
      error: null,
      startedAt: null,
    },
  });
  return res.count;
}

/** Traite jusqu’à `limit` missions pending d’un job projet. */
export async function processProjectDraftJobTick(
  jobId: string,
  limit = 1
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const job = await prisma.castingProjectDraftJob.findUnique({
    where: { id: jobId },
  });
  if (!job) {
    return { processed: 0, done: true, status: "missing", currentBrandName: null };
  }

  if (job.cancelRequested || job.status === "cancelled") {
    await prisma.castingProjectDraftJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        finishedAt: job.finishedAt || new Date(),
        currentBrandName: null,
      },
    });
    return {
      processed: 0,
      done: true,
      status: "cancelled",
      currentBrandName: null,
    };
  }

  if (["completed", "failed"].includes(job.status)) {
    return {
      processed: 0,
      done: true,
      status: job.status,
      currentBrandName: null,
    };
  }

  const recovered = await recoverStuckProjectItems(jobId);
  if (recovered > 0) {
    console.warn(
      `[project-draft-job] recovered ${recovered} stuck running item(s) on ${jobId}`
    );
  }

  if (job.status === "pending" || recovered > 0) {
    await prisma.castingProjectDraftJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        startedAt: job.startedAt || new Date(),
        finishedAt: null,
        currentBrandName: null,
      },
    });
  }

  let processed = 0;
  let lastBrand: string | null = null;

  for (let i = 0; i < limit; i++) {
    const fresh = await prisma.castingProjectDraftJob.findUnique({
      where: { id: jobId },
    });
    if (!fresh || fresh.cancelRequested) {
      await prisma.castingProjectDraftJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          finishedAt: new Date(),
          currentBrandName: null,
        },
      });
      return {
        processed,
        done: true,
        status: "cancelled",
        currentBrandName: null,
      };
    }

    const next = await prisma.castingProjectDraftItem.findFirst({
      where: { jobId, status: "pending" },
      orderBy: { sortOrder: "asc" },
    });
    if (!next) break;

    lastBrand = next.brandName;
    const claimed = await prisma.castingProjectDraftItem.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "running", startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) continue;

    await prisma.castingProjectDraftJob.update({
      where: { id: jobId },
      data: { currentBrandName: next.brandName, status: "running" },
    });

    try {
      const result = await processOneProjectItem(next.id);
      lastBrand = result.brandName;
      if (result.ok) {
        await prisma.castingProjectDraftItem.update({
          where: { id: next.id },
          data: {
            status: "done",
            finishedAt: new Date(),
            brandName: result.brandName,
            error: null,
          },
        });
        await prisma.castingProjectDraftJob.update({
          where: { id: jobId },
          data: { completed: { increment: 1 } },
        });
      } else {
        const errMsg = result.error || "Échec";
        await noteMissionDraftFailure(next.missionId, errMsg);
        await prisma.castingProjectDraftItem.update({
          where: { id: next.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            brandName: result.brandName,
            error: errMsg,
          },
        });
        await prisma.castingProjectDraftJob.update({
          where: { id: jobId },
          data: { failed: { increment: 1 } },
        });
      }
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur process";
      console.error(`[project-draft-job] ${jobId} / ${next.brandName}:`, e);
      await noteMissionDraftFailure(next.missionId, msg);
      await prisma.castingProjectDraftItem.update({
        where: { id: next.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: msg,
        },
      });
      await prisma.castingProjectDraftJob.update({
        where: { id: jobId },
        data: { failed: { increment: 1 } },
      });
      processed += 1;
    }
  }

  // Recompte juste avant de finaliser — un append concurrent peut arriver
  // entre le dernier item et ce check.
  const remaining = await prisma.castingProjectDraftItem.count({
    where: { jobId, status: { in: ["pending", "running"] } },
  });

  if (remaining === 0) {
    const latest = await prisma.castingProjectDraftJob.findUnique({
      where: { id: jobId },
    });
    if (!latest || latest.cancelRequested) {
      await prisma.castingProjectDraftJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          finishedAt: new Date(),
          currentBrandName: null,
        },
      });
      return {
        processed,
        done: true,
        status: "cancelled",
        currentBrandName: null,
      };
    }
    // Double-check anti-race append : si des pending sont apparus, on continue.
    const stillPending = await prisma.castingProjectDraftItem.count({
      where: { jobId, status: { in: ["pending", "running"] } },
    });
    if (stillPending > 0) {
      return {
        processed,
        done: false,
        status: "running",
        currentBrandName: lastBrand,
      };
    }
    const failed = latest.failed || 0;
    const completed = latest.completed || 0;
    const status =
      completed === 0 && failed > 0 ? "failed" : "completed";
    await prisma.castingProjectDraftJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: new Date(),
        currentBrandName: null,
      },
    });
    return {
      processed,
      done: true,
      status,
      currentBrandName: null,
    };
  }

  return {
    processed,
    done: false,
    status: "running",
    currentBrandName: lastBrand,
  };
}

function kickProjectDraftJobHttp(jobId: string): void {
  const base = appBaseUrl();
  const url = `${base}/api/casting/project-draft-jobs/${jobId}/process`;
  void fetch(url, {
    method: "POST",
    headers: internalJobHeaders(),
    body: JSON.stringify({}),
  }).catch((e) => {
    console.warn(`[project-draft-job] kick HTTP failed ${jobId}:`, e);
  });
}

async function runInProcessChain(jobId: string): Promise<void> {
  try {
    const tick = await processProjectDraftJobTick(jobId, 1);
    if (!tick.done) {
      setTimeout(() => {
        void runInProcessChain(jobId);
      }, 200);
    }
  } catch (e) {
    console.warn(`[project-draft-job] in-process chain ${jobId}:`, e);
    kickProjectDraftJobHttp(jobId);
  }
}

export function kickProjectDraftJobProcess(jobId: string): void {
  if (process.env.CASTING_FIT_EXTERNAL_WORKER === "1") {
    return;
  }
  if (process.env.VERCEL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { after } = require("next/server") as typeof import("next/server");
      after(() => {
        kickProjectDraftJobHttp(jobId);
      });
    } catch {
      kickProjectDraftJobHttp(jobId);
    }
    return;
  }
  setTimeout(() => {
    void runInProcessChain(jobId);
  }, 50);
}
