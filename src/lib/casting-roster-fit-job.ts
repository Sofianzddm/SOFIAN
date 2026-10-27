/**
 * Worker job serveur : analyse casting roster marque par marque.
 * Survit à la fermeture de page (état Prisma + tick process / cron).
 */
import prisma from "@/lib/prisma";
import {
  appBaseUrl,
  internalJobHeaders,
} from "@/lib/internal-job-auth";
import {
  hasBrandResearchBrief,
  normalizeBrandResearch,
  runRosterFitForBrand,
  type BrandResearchInput,
  type RosterFitItem,
} from "@/lib/casting-roster-fit-core";

export type CreateRosterFitJobBrandInput = {
  groupKey: string;
  brandName: string;
  company?: string | null;
  brandResearch: unknown;
  /** Outreach : ids cibles pour enchaîner la rédaction serveur. */
  targetIds?: string[];
  pipeline?: "FR" | "BENELUX" | null;
};

export async function createRosterFitJob(args: {
  userId: string;
  market: string;
  talentIds: string[];
  brands: CreateRosterFitJobBrandInput[];
}): Promise<{ jobId: string }> {
  const talentIds = Array.from(
    new Set(args.talentIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
  const brands = args.brands
    .map((b, i) => ({
      groupKey: String(b.groupKey || "").trim(),
      brandName: String(b.brandName || "").trim(),
      company: b.company ? String(b.company).trim() : null,
      brandResearch: normalizeBrandResearch(b.brandResearch),
      targetIds: Array.from(
        new Set(
          (b.targetIds || []).map((id) => String(id || "").trim()).filter(Boolean)
        )
      ),
      pipeline: b.pipeline === "BENELUX" ? "BENELUX" : b.pipeline === "FR" ? "FR" : null,
      sortOrder: i,
    }))
    .filter((b) => b.groupKey && b.brandName);

  if (talentIds.length === 0 || brands.length === 0) {
    throw new Error("talentIds et brands requis.");
  }

  const job = await prisma.castingRosterFitJob.create({
    data: {
      userId: args.userId,
      market: args.market || "FR",
      status: "pending",
      talentIds,
      totalBrands: brands.length,
      brands: {
        create: brands.map((b) => ({
          groupKey: b.groupKey,
          brandName: b.brandName,
          company: b.company,
          brandResearch: b.brandResearch as object,
          targetIds: b.targetIds,
          pipeline: b.pipeline,
          sortOrder: b.sortOrder,
          status: "pending",
        })),
      },
    },
    select: { id: true },
  });

  return { jobId: job.id };
}

export async function requestCancelRosterFitJob(jobId: string, userId: string) {
  const job = await prisma.castingRosterFitJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return null;
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    return job;
  }
  return prisma.castingRosterFitJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: job.status === "pending" ? "cancelled" : job.status,
      finishedAt: job.status === "pending" ? new Date() : job.finishedAt,
    },
  });
}

export async function getRosterFitJobForUser(jobId: string, userId: string) {
  return prisma.castingRosterFitJob.findFirst({
    where: { id: jobId, userId },
    include: {
      brands: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          groupKey: true,
          brandName: true,
          company: true,
          status: true,
          error: true,
          result: true,
          brandResearch: true,
          sortOrder: true,
          finishedAt: true,
        },
      },
    },
  });
}

/** Traite jusqu’à `limit` marques pending d’un job. */
export async function processRosterFitJobTick(
  jobId: string,
  limit = 1
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const job = await prisma.castingRosterFitJob.findUnique({
    where: { id: jobId },
  });
  if (!job) {
    return { processed: 0, done: true, status: "missing", currentBrandName: null };
  }

  if (job.cancelRequested || job.status === "cancelled") {
    await prisma.castingRosterFitJob.update({
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
    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt || new Date() },
    });
  }

  let processed = 0;
  let lastBrand: string | null = null;

  for (let i = 0; i < limit; i++) {
    const fresh = await prisma.castingRosterFitJob.findUnique({
      where: { id: jobId },
    });
    if (!fresh || fresh.cancelRequested) {
      await prisma.castingRosterFitJob.update({
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

    const next = await prisma.castingRosterFitBrand.findFirst({
      where: { jobId, status: "pending" },
      orderBy: { sortOrder: "asc" },
    });
    if (!next) break;

    lastBrand = next.brandName;
    // Claim atomique (évite double process si 2 workers).
    const claimed = await prisma.castingRosterFitBrand.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "running", startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) continue;

    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: { currentBrandName: next.brandName, status: "running" },
    });

    try {
      let research = normalizeBrandResearch(next.brandResearch);
      // Brief manquant → analyse marque serveur (survit à la fermeture / VPS).
      if (!hasBrandResearchBrief(research)) {
        const url = `${appBaseUrl()}/api/casting/brand-research`;
        const brRes = await fetch(url, {
          method: "POST",
          headers: internalJobHeaders(),
          body: JSON.stringify({
            brandName: next.brandName,
            availabilityFocus:
              String(job.market || "").includes("BENELUX") &&
              job.market !== "BOTH"
                ? "BE"
                : "FR",
          }),
        });
        const brData = (await brRes.json().catch(() => ({}))) as BrandResearchInput & {
          error?: string;
        };
        if (!brRes.ok || brData.error) {
          throw new Error(
            brData.error ||
              `Analyse marque impossible (HTTP ${brRes.status})`
          );
        }
        research = normalizeBrandResearch(brData);
        await prisma.castingRosterFitBrand.update({
          where: { id: next.id },
          data: { brandResearch: research as object },
        });
      }

      const talents = await runRosterFitForBrand({
        brandName: next.brandName,
        brandResearch: research,
        talentIds: job.talentIds,
      });
      await prisma.castingRosterFitBrand.update({
        where: { id: next.id },
        data: {
          status: "done",
          result: talents as object[],
          finishedAt: new Date(),
          error: null,
          brandResearch: research as object,
        },
      });
      await prisma.castingRosterFitJob.update({
        where: { id: jobId },
        data: { completed: { increment: 1 } },
      });
      processed += 1;
      // Rédaction dès que la marque est fittée (pas attendre la fin du lot).
      void maybeChainDraftAfterBrandDone(job, {
        groupKey: next.groupKey,
        brandName: next.brandName,
        company: next.company,
        pipeline: next.pipeline,
        targetIds: next.targetIds || [],
        brandResearch: research,
        result: talents,
      }).catch((e) => {
        console.warn(
          `[roster-fit-job] chain draft after brand ${next.brandName}:`,
          e
        );
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message.slice(0, 500) : "Erreur analyse casting";
      console.error(`[roster-fit-job] ${jobId} / ${next.brandName}:`, e);
      await prisma.castingRosterFitBrand.update({
        where: { id: next.id },
        data: {
          status: "failed",
          error: msg,
          finishedAt: new Date(),
        },
      });
      await prisma.castingRosterFitJob.update({
        where: { id: jobId },
        data: { failed: { increment: 1 } },
      });
      processed += 1;
    }
  }

  const remaining = await prisma.castingRosterFitBrand.count({
    where: { jobId, status: { in: ["pending", "running"] } },
  });

  if (remaining === 0) {
    const finalJob = await prisma.castingRosterFitJob.findUnique({
      where: { id: jobId },
    });
    const status =
      finalJob && finalJob.failed > 0 && finalJob.completed === 0
        ? "failed"
        : "completed";
    await prisma.castingRosterFitJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: new Date(),
        currentBrandName: null,
        error:
          status === "failed"
            ? "Toutes les marques ont échoué."
            : null,
      },
    });
    // Enchaîne rédaction serveur (marque + Leyna + mail) sans navigateur.
    if (status === "completed" && finalJob) {
      void maybeChainIndivDraftAfterFit(finalJob).catch((e) => {
        console.warn(
          `[roster-fit-job] chain indiv draft after ${jobId}:`,
          e
        );
      });
      void maybeChainOutreachDraftAfterFit(finalJob).catch((e) => {
        console.warn(
          `[roster-fit-job] chain outreach draft after ${jobId}:`,
          e
        );
      });
    }
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

function autoPickTalentIdsFromFitResult(
  result: unknown,
  limit = 8
): string[] {
  const list = parseRosterFitResult(result);
  const recommended = list
    .filter((t) => t.recommended)
    .sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
  const pool = recommended.length > 0 ? recommended : list;
  return pool
    .map((t) => String(t.talentId || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Dès qu’une marque est fittée : lance sa rédaction serveur (1 item),
 * sans attendre la fin du lot fit.
 */
async function maybeChainDraftAfterBrandDone(
  fitJob: { id: string; userId: string; market: string },
  brand: {
    groupKey: string;
    brandName: string;
    company?: string | null;
    pipeline?: string | null;
    targetIds: string[];
    brandResearch: unknown;
    result: unknown;
  }
): Promise<void> {
  const market = String(fitJob.market || "");
  if (market.startsWith("INDIV:")) {
    const talentId = market.slice("INDIV:".length).trim();
    if (!talentId || !brand.groupKey) return;
    const already = await prisma.castingIndivDraftItem.findFirst({
      where: {
        missionId: brand.groupKey,
        status: { in: ["pending", "running", "done"] },
        job: {
          userId: fitJob.userId,
          talentId,
          status: { in: ["pending", "running", "completed"] },
        },
      },
      select: { id: true },
    });
    if (already) return;
    const mission = await prisma.contactMission.findUnique({
      where: { id: brand.groupKey },
      select: {
        id: true,
        stage: true,
        draftEmailSubject: true,
        draftEmailBody: true,
        sentAt: true,
      },
    });
    if (!mission || mission.sentAt || mission.stage === "SENT") return;
    if (
      mission.stage === "DRAFTED_FOR_VALIDATION" &&
      mission.draftEmailSubject &&
      mission.draftEmailBody
    ) {
      return;
    }
    const { createIndivDraftJob, kickIndivDraftJobProcess } = await import(
      "@/lib/casting-indiv-draft-job"
    );
    const { jobId } = await createIndivDraftJob({
      userId: fitJob.userId,
      talentId,
      items: [
        {
          missionId: brand.groupKey,
          talentId,
          brandName: brand.brandName || "Marque",
        },
      ],
    });
    kickIndivDraftJobProcess(jobId);
    return;
  }

  const targetIds = (brand.targetIds || [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  const talentIds = autoPickTalentIdsFromFitResult(brand.result, 8);
  if (targetIds.length === 0 || talentIds.length === 0) return;

  const already = await prisma.castingOutreachDraftItem.findFirst({
    where: {
      groupKey: brand.groupKey,
      status: { in: ["pending", "running", "done"] },
      job: {
        userId: fitJob.userId,
        market,
        status: { in: ["pending", "running", "completed"] },
      },
    },
    select: { id: true },
  });
  if (already) return;

  const { createOutreachDraftJob, kickOutreachDraftJobProcess } = await import(
    "@/lib/casting-outreach-draft-job"
  );
  const { jobId } = await createOutreachDraftJob({
    userId: fitJob.userId,
    market,
    items: [
      {
        groupKey: brand.groupKey,
        brandName: brand.brandName,
        company: brand.company,
        pipeline: brand.pipeline === "BENELUX" ? "BENELUX" : "FR",
        targetIds,
        talentIds,
        brandResearch: (brand.brandResearch || {}) as Record<string, unknown>,
        rosterFits: parseRosterFitResult(brand.result),
      },
    ],
  });
  kickOutreachDraftJobProcess(jobId);
}

/**
 * Après fit outreach (marché non-INDIV) : lance la rédaction serveur
 * si les marques ont des targetIds (stockés à la création du job).
 */
async function maybeChainOutreachDraftAfterFit(fitJob: {
  id: string;
  userId: string;
  market: string;
}): Promise<void> {
  const market = String(fitJob.market || "");
  if (market.startsWith("INDIV:")) return;

  const doneBrands = await prisma.castingRosterFitBrand.findMany({
    where: { jobId: fitJob.id, status: "done" },
    orderBy: { sortOrder: "asc" },
    select: {
      groupKey: true,
      brandName: true,
      company: true,
      pipeline: true,
      targetIds: true,
      brandResearch: true,
      result: true,
    },
  });

  const candidates = doneBrands
    .map((b) => {
      const targetIds = (b.targetIds || []).map((id) => String(id).trim()).filter(Boolean);
      const talentIds = autoPickTalentIdsFromFitResult(b.result, 8);
      if (targetIds.length === 0 || talentIds.length === 0) return null;
      return {
        groupKey: b.groupKey,
        brandName: b.brandName,
        company: b.company,
        pipeline: (b.pipeline === "BENELUX" ? "BENELUX" : "FR") as "FR" | "BENELUX",
        targetIds,
        talentIds,
        brandResearch: (b.brandResearch || {}) as Record<string, unknown>,
        rosterFits: parseRosterFitResult(b.result),
      };
    })
    .filter((it): it is NonNullable<typeof it> => Boolean(it));

  if (candidates.length === 0) return;

  // Skip marques déjà en file / rédigées (rédaction incrémentale en parallèle).
  const alreadyKeys = new Set(
    (
      await prisma.castingOutreachDraftItem.findMany({
        where: {
          groupKey: { in: candidates.map((c) => c.groupKey) },
          status: { in: ["pending", "running", "done"] },
          job: {
            userId: fitJob.userId,
            market,
            status: { in: ["pending", "running", "completed"] },
          },
        },
        select: { groupKey: true },
      })
    ).map((r) => r.groupKey)
  );
  const items = candidates.filter((c) => !alreadyKeys.has(c.groupKey));
  if (items.length === 0) return;

  const { createOutreachDraftJob, kickOutreachDraftJobProcess } = await import(
    "@/lib/casting-outreach-draft-job"
  );
  const { jobId } = await createOutreachDraftJob({
    userId: fitJob.userId,
    market,
    items,
  });
  kickOutreachDraftJobProcess(jobId);
  console.log(
    `[roster-fit-job] chained outreach draft ${jobId} (${items.length} brands) after fit ${fitJob.id}`
  );
}

/**
 * Après fit indiv (`market = INDIV:talentId`) : lance la rédaction serveur
 * (analyse marque + Leyna + mail) même si le navigateur est fermé.
 */
async function maybeChainIndivDraftAfterFit(fitJob: {
  id: string;
  userId: string;
  market: string;
}): Promise<void> {
  const market = String(fitJob.market || "");
  if (!market.startsWith("INDIV:")) return;
  const talentId = market.slice("INDIV:".length).trim();
  if (!talentId) return;

  const doneBrands = await prisma.castingRosterFitBrand.findMany({
    where: { jobId: fitJob.id, status: "done" },
    orderBy: { sortOrder: "asc" },
    select: { groupKey: true, brandName: true, result: true },
  });
  if (doneBrands.length === 0) return;

  const missionIds = doneBrands
    .map((b) => String(b.groupKey || "").trim())
    .filter(Boolean);
  if (missionIds.length === 0) return;

  // Skip missions déjà rédigées / envoyées / déjà en file rédaction.
  const alreadyMissionIds = new Set(
    (
      await prisma.castingIndivDraftItem.findMany({
        where: {
          missionId: { in: missionIds },
          status: { in: ["pending", "running", "done"] },
          job: {
            userId: fitJob.userId,
            talentId,
            status: { in: ["pending", "running", "completed"] },
          },
        },
        select: { missionId: true },
      })
    ).map((r) => r.missionId)
  );

  const missions = await prisma.contactMission.findMany({
    where: { id: { in: missionIds } },
    select: {
      id: true,
      stage: true,
      draftEmailSubject: true,
      draftEmailBody: true,
      sentAt: true,
      marque: { select: { nom: true } },
      targetBrand: true,
    },
  });
  const byId = new Map(missions.map((m) => [m.id, m]));
  const items = missionIds
    .map((missionId) => {
      if (alreadyMissionIds.has(missionId)) return null;
      const m = byId.get(missionId);
      if (!m) return null;
      if (m.sentAt || m.stage === "SENT") return null;
      if (
        m.stage === "DRAFTED_FOR_VALIDATION" &&
        m.draftEmailSubject &&
        m.draftEmailBody
      ) {
        return null;
      }
      const brandRow = doneBrands.find((b) => b.groupKey === missionId);
      const brandName =
        (m.marque?.nom || m.targetBrand || brandRow?.brandName || "Marque").trim() ||
        "Marque";
      return { missionId, talentId, brandName };
    })
    .filter((it): it is NonNullable<typeof it> => Boolean(it));

  if (items.length === 0) return;

  const { createIndivDraftJob, kickIndivDraftJobProcess } = await import(
    "@/lib/casting-indiv-draft-job"
  );
  const { jobId } = await createIndivDraftJob({
    userId: fitJob.userId,
    talentId,
    items,
  });
  kickIndivDraftJobProcess(jobId);
  console.log(
    `[roster-fit-job] chained indiv draft ${jobId} (${items.length} missions) after fit ${fitJob.id}`
  );
}

/**
 * Enchaîne les marques en process Node (idéal VPS / `next start` / local).
 * Sur Vercel serverless, le process meurt avec la requête → filet HTTP + cron.
 */
async function runInProcessChain(jobId: string): Promise<void> {
  try {
    const tick = await processRosterFitJobTick(jobId, 1);
    if (!tick.done) {
      setTimeout(() => {
        void runInProcessChain(jobId);
      }, 150);
    }
  } catch (e) {
    console.warn(`[roster-fit-job] in-process chain ${jobId}:`, e);
    kickRosterFitJobHttp(jobId);
  }
}

function kickRosterFitJobHttp(jobId: string): void {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000";
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    "";
  const url = `${base}/api/casting/roster-fit-jobs/${jobId}/process`;
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      "x-glowup-job-kick": "1",
    },
    body: JSON.stringify({}),
  }).catch((e) => {
    console.warn(`[roster-fit-job] kick HTTP failed ${jobId}:`, e);
  });
}

/** Kick non-bloquant du prochain tick (VPS in-process, sinon HTTP). */
export function kickRosterFitJobProcess(jobId: string): void {
  // Worker VPS externe (pm2) consomme les jobs pending — pas besoin de kick app.
  if (process.env.CASTING_FIT_EXTERNAL_WORKER === "1") {
    return;
  }
  // Vercel : une seule requête = un tick HTTP ; le process route se re-kick.
  if (process.env.VERCEL) {
    kickRosterFitJobHttp(jobId);
    return;
  }
  // VPS / local : chaîne in-process (survit à la fermeture de page).
  setTimeout(() => {
    void runInProcessChain(jobId);
  }, 50);
}

export function parseRosterFitResult(raw: unknown): RosterFitItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      talentId: String(x.talentId || "").trim(),
      recommended: Boolean(x.recommended),
      fitScore: Number(x.fitScore) || 0,
      whyFit: String(x.whyFit || ""),
      risks: String(x.risks || ""),
      suggestedAngle: String(x.suggestedAngle || ""),
      proofPoints: String(x.proofPoints || ""),
    }))
    .filter((x) => x.talentId);
}
