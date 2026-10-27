import prisma from "@/lib/prisma";
import { getLeynaExchangeContext } from "@/lib/leyna-exchange-context";
import {
  appBaseUrl,
  internalJobHeaders,
} from "@/lib/internal-job-auth";

export type CreateOutreachDraftItemInput = {
  groupKey: string;
  brandName: string;
  company?: string | null;
  pipeline?: "FR" | "BENELUX";
  targetIds: string[];
  talentIds: string[];
  brandResearch: Record<string, unknown>;
  rosterFits?: unknown;
};

type BrandResearch = {
  recentCampaigns?: string;
  newProducts?: string;
  availabilityFrEu?: string;
  brandPositioning?: string;
  influenceStrategy?: string;
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
  suggestedAngle?: string;
  castingWhyFit?: string;
};

type RosterFitItem = {
  talentId?: string;
  suggestedAngle?: string;
  whyFit?: string;
};

function mergeAngles(
  research: TalentResearchItem[],
  fits: RosterFitItem[] | null | undefined
): TalentResearchItem[] {
  if (!fits?.length) return research;
  const byId = new Map(fits.map((f) => [f.talentId, f]));
  return research.map((r) => {
    const fit = byId.get(r.talentId);
    if (!fit) return r;
    const suggestedAngle = (fit.suggestedAngle || "").trim();
    const castingWhyFit = (fit.whyFit || "").trim();
    if (!suggestedAngle && !castingWhyFit) return r;
    return {
      ...r,
      ...(suggestedAngle ? { suggestedAngle } : {}),
      ...(castingWhyFit ? { castingWhyFit } : {}),
    };
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

export async function createOutreachDraftJob(args: {
  userId: string;
  market: string;
  items: CreateOutreachDraftItemInput[];
}): Promise<{ jobId: string }> {
  const items = args.items
    .map((it, i) => ({
      groupKey: String(it.groupKey || "").trim(),
      brandName: String(it.brandName || "").trim() || "Marque",
      company: it.company ? String(it.company).trim() : null,
      pipeline: it.pipeline === "BENELUX" ? "BENELUX" : "FR",
      targetIds: (it.targetIds || []).map((id) => String(id).trim()).filter(Boolean),
      talentIds: (it.talentIds || []).map((id) => String(id).trim()).filter(Boolean).slice(0, 8),
      brandResearch: it.brandResearch || {},
      rosterFits: it.rosterFits ?? undefined,
      sortOrder: i,
    }))
    .filter((it) => it.groupKey && it.targetIds.length > 0 && it.talentIds.length > 0);

  if (items.length === 0) {
    throw new Error("Aucune marque à rédiger (targets / talents manquants).");
  }

  const job = await prisma.castingOutreachDraftJob.create({
    data: {
      userId: args.userId,
      market: args.market || "FR",
      status: "pending",
      totalBrands: items.length,
      items: {
        create: items.map((it) => ({
          groupKey: it.groupKey,
          brandName: it.brandName,
          company: it.company,
          pipeline: it.pipeline,
          sortOrder: it.sortOrder,
          targetIds: it.targetIds,
          talentIds: it.talentIds,
          brandResearch: it.brandResearch as object,
          rosterFits: it.rosterFits as object | undefined,
          status: "pending",
        })),
      },
    },
    select: { id: true },
  });

  return { jobId: job.id };
}

export async function requestCancelOutreachDraftJob(jobId: string, userId: string) {
  const job = await prisma.castingOutreachDraftJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return null;
  return prisma.castingOutreachDraftJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: job.status === "pending" ? "cancelled" : job.status,
      finishedAt: job.status === "pending" ? new Date() : job.finishedAt,
    },
  });
}

export async function getOutreachDraftJobForUser(jobId: string, userId: string) {
  return prisma.castingOutreachDraftJob.findFirst({
    where: { id: jobId, userId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

async function saveDraftOnTargets(
  pipeline: string,
  targetIds: string[],
  subject: string,
  bodyHtml: string,
  castingResearchSnapshot?: object | null
) {
  const data = {
    draftSubject: subject,
    draftBodyHtml: bodyHtml,
    ...(castingResearchSnapshot
      ? { castingResearchSnapshot }
      : {}),
  };
  if (pipeline === "BENELUX") {
    await prisma.beneluxOutreachTarget.updateMany({
      where: { id: { in: targetIds } },
      data,
    });
  } else {
    await prisma.outreachTarget.updateMany({
      where: { id: { in: targetIds } },
      data,
    });
  }
}

async function processOneOutreachItem(itemId: string): Promise<{
  ok: boolean;
  brandName: string;
  subject?: string;
  bodyHtml?: string;
  error?: string;
}> {
  const item = await prisma.castingOutreachDraftItem.findUnique({
    where: { id: itemId },
  });
  if (!item) return { ok: false, brandName: "?", error: "Item manquant" };

  const brandName = item.brandName || item.company || "Marque";
  let brandResearch = (item.brandResearch || {}) as BrandResearch;
  const talentIds = item.talentIds || [];
  const targetIds = item.targetIds || [];
  if (talentIds.length === 0) {
    return { ok: false, brandName, error: "Aucun talent" };
  }
  if (targetIds.length === 0) {
    return { ok: false, brandName, error: "Aucun contact cible" };
  }

  const hasBrief = Boolean(
    String(brandResearch.newProducts || "").trim() ||
      String(brandResearch.brandPositioning || "").trim() ||
      String(brandResearch.influenceStrategy || "").trim() ||
      String(brandResearch.recentCampaigns || "").trim() ||
      String(brandResearch.availabilityFrEu || "").trim()
  );
  if (!hasBrief) {
    const brandRes = await internalPost<BrandResearch & { error?: string }>(
      "/api/casting/brand-research",
      {
        brandName,
        availabilityFocus: item.pipeline === "BENELUX" ? "BE" : "FR",
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
    brandResearch = {
      recentCampaigns: String(brandRes.data.recentCampaigns || ""),
      newProducts: String(brandRes.data.newProducts || ""),
      availabilityFrEu: String(brandRes.data.availabilityFrEu || ""),
      brandPositioning: String(brandRes.data.brandPositioning || ""),
      influenceStrategy: String(brandRes.data.influenceStrategy || ""),
    };
    await prisma.castingOutreachDraftItem.update({
      where: { id: item.id },
      data: { brandResearch: brandResearch as object },
    });
  }

  const talents = await prisma.talent.findMany({
    where: { id: { in: talentIds } },
    select: {
      id: true,
      prenom: true,
      nom: true,
      instagram: true,
      niches: true,
      stats: { select: { igFollowers: true, ttFollowers: true, igEngagement: true, ttEngagement: true } },
    },
  });
  if (talents.length === 0) {
    return { ok: false, brandName, error: "Talents introuvables" };
  }

  const talentRes = await internalPost<{
    talents?: TalentResearchItem[];
    error?: string;
  }>("/api/casting/talent-research", {
    brandName,
    talentIds,
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
  let talentResearch = Array.isArray(talentRes.data.talents)
    ? talentRes.data.talents
    : [];
  if (talentResearch.length === 0) {
    return { ok: false, brandName, error: "Analyse talent vide" };
  }

  const rosterFits = Array.isArray(item.rosterFits)
    ? (item.rosterFits as RosterFitItem[])
    : null;
  talentResearch = mergeAngles(talentResearch, rosterFits);

  const targets =
    item.pipeline === "BENELUX"
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: {
            id: true,
            email: true,
            firstname: true,
            lastname: true,
            language: true,
            company: true,
          },
        })
      : await prisma.outreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: {
            id: true,
            email: true,
            firstname: true,
            lastname: true,
            language: true,
            company: true,
          },
        });

  const recipientEmails = Array.from(
    new Set(
      targets
        .map((t) => String(t.email || "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  );

  const leyna = await getLeynaExchangeContext({
    recipientEmails,
    brandName,
    agencyName: item.company && item.company !== brandName ? item.company : null,
    talentNames: talents.map(
      (t) => `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent"
    ),
  });
  if (leyna.scanStatus === "failed") {
    return {
      ok: false,
      brandName,
      error: "Scan Leyna échoué — pas de rédaction cold.",
    };
  }

  const lang =
    targets.length > 0 &&
    targets.filter((t) => String(t.language || "").toLowerCase() === "en")
      .length >=
      targets.length / 2
      ? "en"
      : "fr";

  const composerMarket =
    item.pipeline === "BENELUX" ? "BENELUX" : "FR";
  const availabilityFocus = item.pipeline === "BENELUX" ? "BE" : "FR";

  const talentsPayload = talents.map((t) => {
    const ig = Number(t.stats?.igFollowers || 0) || 0;
    const tt = Number(t.stats?.ttFollowers || 0) || 0;
    const niches = Array.isArray(t.niches)
      ? t.niches.map((n) => String(n || "").trim()).filter(Boolean)
      : [];
    return {
      talentId: t.id,
      name: `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent",
      niche: niches.join(", ") || "—",
      followers: Math.max(ig, tt),
      igFollowers: ig,
      ttFollowers: tt,
      instagram: t.instagram || null,
    };
  });

  const genOnce = async (ackNego: boolean) =>
    internalPost<{
      subject?: string;
      body?: string;
      error?: string;
      code?: string;
    }>("/api/casting/generate-email", {
      language: lang,
      market: composerMarket,
      availabilityFocus,
      brandName,
      agencyName:
        item.company && item.company.toLowerCase() !== brandName.toLowerCase()
          ? item.company
          : undefined,
      brandResearch: {
        recentCampaigns: String(brandResearch.recentCampaigns || ""),
        newProducts: String(brandResearch.newProducts || ""),
        availabilityFrEu: String(brandResearch.availabilityFrEu || ""),
        brandPositioning: String(brandResearch.brandPositioning || ""),
        influenceStrategy: String(brandResearch.influenceStrategy || ""),
      },
      talents: talentsPayload,
      recipientEmails,
      talentResearch,
      negotiationReviewAcknowledged: ackNego || undefined,
      leynaExchangeCache: leyna,
    });

  let gen = await genOnce(false);
  if (!gen.ok && gen.data.code === "NEEDS_NEGOTIATION_REVIEW") {
    gen = await genOnce(true);
  }
  if (!gen.ok) {
    return {
      ok: false,
      brandName,
      error:
        gen.data.error ||
        `Rédaction impossible (HTTP ${gen.status}${
          gen.data.code ? ` · ${gen.data.code}` : ""
        })`,
    };
  }

  const subject = String(gen.data.subject || "").trim();
  const bodyHtml = String(gen.data.body || "").trim();
  if (!subject || !bodyHtml) {
    return { ok: false, brandName, error: "Brouillon vide" };
  }

  const castingResearchSnapshot = {
    brandName,
    brandResearch,
    talentResearch,
    leynaExchange: leyna,
    savedAt: new Date().toISOString(),
  };

  await saveDraftOnTargets(
    item.pipeline,
    targetIds,
    subject,
    bodyHtml,
    castingResearchSnapshot
  );

  return { ok: true, brandName, subject, bodyHtml };
}

export async function processOutreachDraftJobTick(
  jobId: string,
  limit = 1
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const job = await prisma.castingOutreachDraftJob.findUnique({
    where: { id: jobId },
  });
  if (!job) {
    return { processed: 0, done: true, status: "missing", currentBrandName: null };
  }

  if (job.cancelRequested || job.status === "cancelled") {
    await prisma.castingOutreachDraftJob.update({
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
    await prisma.castingOutreachDraftJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt || new Date() },
    });
  }

  let processed = 0;
  let lastBrand: string | null = null;

  for (let i = 0; i < limit; i++) {
    const fresh = await prisma.castingOutreachDraftJob.findUnique({
      where: { id: jobId },
    });
    if (!fresh || fresh.cancelRequested) {
      await prisma.castingOutreachDraftJob.update({
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

    const next = await prisma.castingOutreachDraftItem.findFirst({
      where: { jobId, status: "pending" },
      orderBy: { sortOrder: "asc" },
    });
    if (!next) break;

    lastBrand = next.brandName;
    const claimed = await prisma.castingOutreachDraftItem.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "running", startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) continue;

    await prisma.castingOutreachDraftJob.update({
      where: { id: jobId },
      data: { currentBrandName: next.brandName, status: "running" },
    });

    try {
      const result = await processOneOutreachItem(next.id);
      lastBrand = result.brandName;
      if (result.ok) {
        await prisma.castingOutreachDraftItem.update({
          where: { id: next.id },
          data: {
            status: "done",
            finishedAt: new Date(),
            brandName: result.brandName,
            draftSubject: result.subject || null,
            draftBodyHtml: result.bodyHtml || null,
            error: null,
          },
        });
        await prisma.castingOutreachDraftJob.update({
          where: { id: jobId },
          data: { completed: { increment: 1 } },
        });
      } else {
        await prisma.castingOutreachDraftItem.update({
          where: { id: next.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            brandName: result.brandName,
            error: result.error || "Échec",
          },
        });
        await prisma.castingOutreachDraftJob.update({
          where: { id: jobId },
          data: { failed: { increment: 1 } },
        });
      }
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur process";
      console.error(`[outreach-draft-job] ${jobId} / ${next.brandName}:`, e);
      await prisma.castingOutreachDraftItem.update({
        where: { id: next.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: msg,
        },
      });
      await prisma.castingOutreachDraftJob.update({
        where: { id: jobId },
        data: { failed: { increment: 1 } },
      });
      processed += 1;
    }
  }

  const remaining = await prisma.castingOutreachDraftItem.count({
    where: { jobId, status: { in: ["pending", "running"] } },
  });

  if (remaining === 0) {
    const latest = await prisma.castingOutreachDraftJob.findUnique({
      where: { id: jobId },
    });
    const failed = latest?.failed || 0;
    const completed = latest?.completed || 0;
    const status = completed === 0 && failed > 0 ? "failed" : "completed";
    await prisma.castingOutreachDraftJob.update({
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

function kickOutreachDraftJobHttp(jobId: string): void {
  const url = `${appBaseUrl()}/api/casting/outreach-draft-jobs/${jobId}/process`;
  void fetch(url, {
    method: "POST",
    headers: internalJobHeaders(),
    body: JSON.stringify({}),
  }).catch((e) => {
    console.warn(`[outreach-draft-job] kick HTTP failed ${jobId}:`, e);
  });
}

async function runInProcessChain(jobId: string): Promise<void> {
  try {
    const tick = await processOutreachDraftJobTick(jobId, 1);
    if (!tick.done) {
      setTimeout(() => {
        void runInProcessChain(jobId);
      }, 200);
    }
  } catch (e) {
    console.warn(`[outreach-draft-job] in-process chain ${jobId}:`, e);
    kickOutreachDraftJobHttp(jobId);
  }
}

export function kickOutreachDraftJobProcess(jobId: string): void {
  if (process.env.CASTING_FIT_EXTERNAL_WORKER === "1") {
    return;
  }
  if (process.env.VERCEL) {
    kickOutreachDraftJobHttp(jobId);
    return;
  }
  setTimeout(() => {
    void runInProcessChain(jobId);
  }, 50);
}
