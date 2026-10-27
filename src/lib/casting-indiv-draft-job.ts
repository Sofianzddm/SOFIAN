import prisma from "@/lib/prisma";
import { getLeynaExchangeContext } from "@/lib/leyna-exchange-context";
import { buildDraftPrepBrief } from "@/lib/draft-prep-brief";
import {
  appBaseUrl,
  internalJobHeaders,
} from "@/lib/internal-job-auth";
import { isTalentIndividualProspectingBrief } from "@/lib/project-research-brief";

export type CreateIndivDraftItemInput = {
  missionId: string;
  talentId?: string | null;
  brandName: string;
};

export async function createIndivDraftJob(args: {
  userId: string;
  talentId?: string | null;
  items: CreateIndivDraftItemInput[];
}): Promise<{ jobId: string }> {
  const items = args.items
    .map((it, i) => ({
      missionId: String(it.missionId || "").trim(),
      talentId: it.talentId ? String(it.talentId).trim() : null,
      brandName: String(it.brandName || "").trim() || "Marque",
      sortOrder: i,
    }))
    .filter((it) => it.missionId);

  if (items.length === 0) {
    throw new Error("Aucune mission à traiter.");
  }

  const job = await prisma.castingIndivDraftJob.create({
    data: {
      userId: args.userId,
      talentId: args.talentId ? String(args.talentId).trim() : null,
      status: "pending",
      totalMissions: items.length,
      items: {
        create: items.map((it) => ({
          missionId: it.missionId,
          talentId: it.talentId,
          brandName: it.brandName,
          sortOrder: it.sortOrder,
          status: "pending",
        })),
      },
    },
    select: { id: true },
  });

  return { jobId: job.id };
}

export async function requestCancelIndivDraftJob(jobId: string, userId: string) {
  const job = await prisma.castingIndivDraftJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return null;
  return prisma.castingIndivDraftJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: job.status === "pending" ? "cancelled" : job.status,
      finishedAt: job.status === "pending" ? new Date() : job.finishedAt,
    },
  });
}

export async function getIndivDraftJobForUser(jobId: string, userId: string) {
  return prisma.castingIndivDraftJob.findFirst({
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

async function processOneMissionItem(itemId: string): Promise<{
  ok: boolean;
  brandName: string;
  error?: string;
}> {
  const item = await prisma.castingIndivDraftItem.findUnique({
    where: { id: itemId },
  });
  if (!item) return { ok: false, brandName: "?", error: "Item manquant" };

  const mission = await prisma.contactMission.findUnique({
    where: { id: item.missionId },
    include: {
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
      marque: { select: { id: true, nom: true } },
    },
  });

  if (!mission) {
    return { ok: false, brandName: item.brandName, error: "Mission introuvable" };
  }
  if (mission.sentAt || mission.stage === "SENT") {
    return { ok: true, brandName: item.brandName };
  }

  const brandName =
    (mission.marque?.nom || mission.targetBrand || item.brandName).trim() ||
    item.brandName;
  const talent = mission.talent;
  if (!talent?.id) {
    return { ok: false, brandName, error: "Talent manquant sur la mission" };
  }
  const talentName = `${talent.prenom || ""} ${talent.nom || ""}`.trim() || "Talent";

  const projectBrief = {
    talentId: talent.id,
    projectTitle: null,
    projectDescription: null,
    creatorName: talentName,
    targetBrand: brandName,
    strategyReason: mission.strategyReason,
    recommendedAngle: mission.recommendedAngle,
    objective: mission.objective,
    deliverables: null,
    angles: null,
    timeline: null,
    budgetRange: null,
    dos: mission.dos,
    donts: mission.donts,
  };

  // 1) Brand research
  const brandRes = await internalPost<BrandResearch>("/api/casting/brand-research", {
    brandName,
    availabilityFocus: "FR",
    projectBrief,
  });
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
    talentIds: [talent.id],
    projectBrief,
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

  // Contacts mission
  const rawContacts = Array.isArray(mission.clientContacts)
    ? (mission.clientContacts as Array<Record<string, unknown>>)
    : [];
  const contacts = rawContacts
    .map((c, i) => {
      const email = String(c.email || "").trim();
      if (!email.includes("@")) return null;
      return {
        id: String(c.id || `${mission.id}-c-${i}`),
        firstname: String(c.firstname || "").trim(),
        lastname: String(c.lastname || "").trim(),
        email,
        role: String(c.role || "").trim(),
        language:
          String(c.language || "").toLowerCase() === "en" ? "en" : "fr",
      };
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  let recipientEmails = contacts.map((c) => c.email);
  const leyna = await getLeynaExchangeContext({
    recipientEmails,
    brandName,
    agencyName: null,
    talentNames: [talentName],
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
    return {
      ok: false,
      brandName,
      error: "Scan Leyna échoué — pas de rédaction cold.",
    };
  }

  const niches = Array.isArray(talent.niches)
    ? talent.niches.map((n) => String(n || "").trim()).filter(Boolean)
    : [];
  const ig = Number(talent.stats?.igFollowers ?? 0) || 0;
  const tt = Number(talent.stats?.ttFollowers ?? 0) || 0;

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
    talentName,
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

  if (!isTalentIndividualProspectingBrief(projectBrief)) {
    // Toujours vrai pour ce payload ; garde-fou typage.
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
    talents: [
      {
        talentId: talent.id,
        name: talentName,
        niche: niches.join(", ") || "—",
        followers: Math.max(ig, tt),
        igFollowers: ig,
        ttFollowers: tt,
        instagram: talent.instagram || null,
      },
    ],
    recipientEmails,
    talentResearch,
    draftPrepBrief: prepBrief,
    leynaExchangeCache: leyna,
    missionStage: mission.stage,
    projectBrief,
    negotiationReviewAcknowledged: false,
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

/** Traite jusqu’à `limit` missions pending d’un job. */
export async function processIndivDraftJobTick(
  jobId: string,
  limit = 1
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const job = await prisma.castingIndivDraftJob.findUnique({
    where: { id: jobId },
  });
  if (!job) {
    return { processed: 0, done: true, status: "missing", currentBrandName: null };
  }

  if (job.cancelRequested || job.status === "cancelled") {
    await prisma.castingIndivDraftJob.update({
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

  if (job.status === "pending") {
    await prisma.castingIndivDraftJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt || new Date() },
    });
  }

  let processed = 0;
  let lastBrand: string | null = null;

  for (let i = 0; i < limit; i++) {
    const fresh = await prisma.castingIndivDraftJob.findUnique({
      where: { id: jobId },
    });
    if (!fresh || fresh.cancelRequested) {
      await prisma.castingIndivDraftJob.update({
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

    const next = await prisma.castingIndivDraftItem.findFirst({
      where: { jobId, status: "pending" },
      orderBy: { sortOrder: "asc" },
    });
    if (!next) break;

    lastBrand = next.brandName;
    const claimed = await prisma.castingIndivDraftItem.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "running", startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) continue;

    await prisma.castingIndivDraftJob.update({
      where: { id: jobId },
      data: { currentBrandName: next.brandName, status: "running" },
    });

    try {
      const result = await processOneMissionItem(next.id);
      lastBrand = result.brandName;
      if (result.ok) {
        await prisma.castingIndivDraftItem.update({
          where: { id: next.id },
          data: {
            status: "done",
            finishedAt: new Date(),
            brandName: result.brandName,
            error: null,
          },
        });
        await prisma.castingIndivDraftJob.update({
          where: { id: jobId },
          data: { completed: { increment: 1 } },
        });
      } else {
        await prisma.castingIndivDraftItem.update({
          where: { id: next.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            brandName: result.brandName,
            error: result.error || "Échec",
          },
        });
        await prisma.castingIndivDraftJob.update({
          where: { id: jobId },
          data: { failed: { increment: 1 } },
        });
      }
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur process";
      console.error(`[indiv-draft-job] ${jobId} / ${next.brandName}:`, e);
      await prisma.castingIndivDraftItem.update({
        where: { id: next.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: msg,
        },
      });
      await prisma.castingIndivDraftJob.update({
        where: { id: jobId },
        data: { failed: { increment: 1 } },
      });
      processed += 1;
    }
  }

  const remaining = await prisma.castingIndivDraftItem.count({
    where: { jobId, status: { in: ["pending", "running"] } },
  });

  if (remaining === 0) {
    const latest = await prisma.castingIndivDraftJob.findUnique({
      where: { id: jobId },
    });
    const failed = latest?.failed || 0;
    const completed = latest?.completed || 0;
    const status =
      completed === 0 && failed > 0
        ? "failed"
        : failed > 0 && completed === 0
          ? "failed"
          : "completed";
    await prisma.castingIndivDraftJob.update({
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

function kickIndivDraftJobHttp(jobId: string): void {
  const base = appBaseUrl();
  const url = `${base}/api/casting/indiv-draft-jobs/${jobId}/process`;
  void fetch(url, {
    method: "POST",
    headers: internalJobHeaders(),
    body: JSON.stringify({}),
  }).catch((e) => {
    console.warn(`[indiv-draft-job] kick HTTP failed ${jobId}:`, e);
  });
}

async function runInProcessChain(jobId: string): Promise<void> {
  try {
    const tick = await processIndivDraftJobTick(jobId, 1);
    if (!tick.done) {
      setTimeout(() => {
        void runInProcessChain(jobId);
      }, 200);
    }
  } catch (e) {
    console.warn(`[indiv-draft-job] in-process chain ${jobId}:`, e);
    kickIndivDraftJobHttp(jobId);
  }
}

export function kickIndivDraftJobProcess(jobId: string): void {
  if (process.env.CASTING_FIT_EXTERNAL_WORKER === "1") {
    return;
  }
  if (process.env.VERCEL) {
    // `after()` survit à la réponse HTTP ; un `void fetch` est souvent tué
    // avant d’atteindre /process → jobs coincés en pending 0/N.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { after } = require("next/server") as typeof import("next/server");
      after(() => {
        kickIndivDraftJobHttp(jobId);
      });
    } catch {
      kickIndivDraftJobHttp(jobId);
    }
    return;
  }
  setTimeout(() => {
    void runInProcessChain(jobId);
  }, 50);
}
