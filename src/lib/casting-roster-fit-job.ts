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
import { countFitChainedContaboInFlight } from "@/lib/casting-contabo-global-lock";

/** Blip Neon / Prisma / réseau → reprise auto, jamais failed définitif. */
export function isSoftFitTransientError(msg: string): boolean {
  const m = String(msg || "").toLowerCase();
  if (!m) return false;
  return (
    m.includes("can't reach database") ||
    m.includes("cant reach database") ||
    m.includes("p1001") ||
    m.includes("p1002") ||
    m.includes("p1017") ||
    m.includes("server has closed the connection") ||
    m.includes("connection reset") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("timed out fetching") ||
    m.includes("prismaclientinitializationerror") ||
    m.includes("prismaclientknownrequesterror") ||
    m.includes("fetch failed") ||
    m.includes("socket hang up") ||
    m.includes("protected deployment")
  );
}

export type CreateRosterFitJobBrandInput = {
  groupKey: string;
  brandName: string;
  company?: string | null;
  brandResearch: unknown;
  /** Outreach : ids cibles pour enchaîner la rédaction serveur. */
  targetIds?: string[];
  pipeline?: "FR" | "BENELUX" | null;
};

/** Un casting wizard (fit / outreach) est déjà actif — pas de 2e job. */
export class CastingWizardBusyError extends Error {
  readonly code = "CASTING_WIZARD_BUSY" as const;
  readonly busy: {
    kind: "fit" | "outreach";
    id: string;
    label: string;
  };

  constructor(busy: { kind: "fit" | "outreach"; id: string; label: string }) {
    super(
      `Un casting est déjà en cours (${busy.label}). Arrête-le avant d’en relancer un.`
    );
    this.name = "CastingWizardBusyError";
    this.busy = busy;
  }
}

/** File isolée : pas Contabo, pas de collision avec outreach FR/BE. */
function isIsolatedCastingMarket(market: string): boolean {
  const m = String(market || "").trim();
  return m.startsWith("INDIV:") || m.startsWith("PROJECT:");
}

/** Markers Contabo encore liés à un job outreach DB actif (pas INDIV/PROJECT). */
async function listActiveOutreachEndMarkers(): Promise<string[]> {
  const items = await prisma.castingOutreachDraftItem.findMany({
    where: {
      status: { in: ["pending", "running"] },
      job: {
        status: { in: ["pending", "running"] },
        cancelRequested: false,
        NOT: {
          OR: [
            { market: { startsWith: "INDIV:" } },
            { market: { startsWith: "PROJECT:" } },
          ],
        },
      },
    },
    select: { brandResearch: true },
    take: 80,
  });
  const out: string[] = [];
  for (const it of items) {
    const br = (it.brandResearch || {}) as { _vps?: { endMarker?: string } };
    const m = String(br._vps?.endMarker || "").trim();
    if (m) out.push(m);
  }
  return out;
}

function contaboJobIsActive(state: string | undefined | null): boolean {
  const st = String(state || "");
  return st === "running" || st === "queued" || st === "starting";
}

/**
 * Contabo encore en train d’écrire → bloque Analyser.
 * Trou historique : Annuler passe le job DB en cancelled alors que Chat
 * continue → le verrou DB se libère et un 2e user peut lancer.
 */
export async function assertContaboOutreachNotBusy(): Promise<void> {
  if (!(process.env.OUTREACH_CHAT_VPS_URL || "").trim()) return;
  try {
    const { cartoChatVpsHealth } = await import("@/lib/carto-chat-vps/vps-client");
    const health = await cartoChatVpsHealth({ kind: "outreach" });
    if (!health?.ok) return;
    const running = Number(health.outreachRunning || 0);
    const queued = Number(health.queueLength || 0);
    const job = health.job;
    const busy =
      running > 0 ||
      queued > 0 ||
      health.busy === true ||
      contaboJobIsActive(job?.state) ||
      (health.jobs || []).some((j) => contaboJobIsActive(j.state));
    if (!busy) return;
    const preview = String(
      job?.promptPreview || job?.endMarker || "Contabo en cours"
    ).slice(0, 60);
    throw new CastingWizardBusyError({
      kind: "outreach",
      id: String(job?.endMarker || "contabo-busy"),
      label: preview || "Contabo en cours",
    });
  } catch (e) {
    if (e instanceof CastingWizardBusyError) throw e;
    // Contabo injoignable : ne pas bloquer le fit (DB lock suffit).
  }
}

/**
 * Verrou casting :
 * - Outreach (FR / BE / BOTH) : un seul à la fois + Contabo
 * - INDIV / PROJECT : file isolée (pas Contabo, pas de collision outreach)
 */
export async function assertCastingWizardNotBusy(market?: string): Promise<void> {
  const m = String(market || "FR").trim() || "FR";

  if (isIsolatedCastingMarket(m)) {
    const activeIndiv = await prisma.castingRosterFitJob.findFirst({
      where: {
        market: m,
        status: { in: ["pending", "running"] },
        cancelRequested: false,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        currentBrandName: true,
        completed: true,
        totalBrands: true,
        market: true,
      },
    });
    if (activeIndiv) {
      throw new CastingWizardBusyError({
        kind: "fit",
        id: activeIndiv.id,
        label:
          activeIndiv.currentBrandName ||
          `${activeIndiv.market} ${activeIndiv.completed}/${activeIndiv.totalBrands}`,
      });
    }
    return;
  }

  // Contabo d’abord (zombie après Annuler) — outreach only.
  await assertContaboOutreachNotBusy();

  const activeFit = await prisma.castingRosterFitJob.findFirst({
    where: {
      status: { in: ["pending", "running"] },
      cancelRequested: false,
      NOT: {
        OR: [
          { market: { startsWith: "INDIV:" } },
          { market: { startsWith: "PROJECT:" } },
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      currentBrandName: true,
      completed: true,
      totalBrands: true,
      market: true,
    },
  });
  if (activeFit) {
    throw new CastingWizardBusyError({
      kind: "fit",
      id: activeFit.id,
      label:
        activeFit.currentBrandName ||
        `${activeFit.market} ${activeFit.completed}/${activeFit.totalBrands}`,
    });
  }

  const activeOutreach = await prisma.castingOutreachDraftJob.findFirst({
    where: {
      status: { in: ["pending", "running"] },
      cancelRequested: false,
      NOT: {
        OR: [
          { market: { startsWith: "INDIV:" } },
          { market: { startsWith: "PROJECT:" } },
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      currentBrandName: true,
      completed: true,
      totalBrands: true,
      market: true,
    },
  });
  if (activeOutreach) {
    throw new CastingWizardBusyError({
      kind: "outreach",
      id: activeOutreach.id,
      label:
        activeOutreach.currentBrandName ||
        `rédaction ${activeOutreach.market} ${activeOutreach.completed}/${activeOutreach.totalBrands}`,
    });
  }
}

/** Pour l’UI : null = libre, sinon label à afficher / griser Analyser. */
export async function getCastingWizardBusyState(
  market: string
): Promise<{ kind: "fit" | "outreach"; id: string; label: string } | null> {
  try {
    await assertCastingWizardNotBusy(market);
    return null;
  } catch (e) {
    if (e instanceof CastingWizardBusyError) return e.busy;
    return null;
  }
}

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

  const market = args.market || "FR";
  const isolated = isIsolatedCastingMarket(market);

  // Contabo : outreach only (INDIV / PROJECT n’utilisent pas Contabo).
  if (!isolated) {
    try {
      const {
        cartoChatVpsHealth,
        cancelOrphanOutreachContaboJobs,
      } = await import("@/lib/carto-chat-vps/vps-client");
      const keep = new Set(await listActiveOutreachEndMarkers());
      const health = await cartoChatVpsHealth({ kind: "outreach" });
      const activeContabo = (health.jobs || []).filter(
        (j) =>
          contaboJobIsActive(j.state) &&
          (!j.kind || String(j.kind) === "outreach")
      );
      const linked = activeContabo.filter((j) =>
        keep.has(String(j.endMarker || "").trim())
      );
      if (linked.length > 0) {
        const j0 = linked[0]!;
        throw new CastingWizardBusyError({
          kind: "outreach",
          id: String(j0.endMarker || "contabo"),
          label: String(j0.promptPreview || j0.endMarker || "Contabo").slice(
            0,
            60
          ),
        });
      }
      if (activeContabo.length > 0 || health.busy) {
        const swept = await cancelOrphanOutreachContaboJobs({
          keepEndMarkers: [...keep],
        });
        if (swept.cancelled > 0) {
          console.info(
            `[roster-fit] Contabo orphelins annulés: ${swept.cancelled}`
          );
        }
        await new Promise((r) => setTimeout(r, 1_500));
        await assertContaboOutreachNotBusy();
      }
    } catch (e) {
      if (e instanceof CastingWizardBusyError) throw e;
      console.warn(
        "[roster-fit] Contabo gate soft-fail:",
        e instanceof Error ? e.message : e
      );
    }
  }

  // Advisory lock + re-check : 2 POST simultanés ne créent pas 2 jobs.
  const job = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(88442205)`;

    if (isolated) {
      const activeIndiv = await tx.castingRosterFitJob.findFirst({
        where: {
          market,
          status: { in: ["pending", "running"] },
          cancelRequested: false,
        },
        select: {
          id: true,
          currentBrandName: true,
          completed: true,
          totalBrands: true,
          market: true,
        },
      });
      if (activeIndiv) {
        throw new CastingWizardBusyError({
          kind: "fit",
          id: activeIndiv.id,
          label:
            activeIndiv.currentBrandName ||
            `${activeIndiv.market} ${activeIndiv.completed}/${activeIndiv.totalBrands}`,
        });
      }
    } else {
      const activeFit = await tx.castingRosterFitJob.findFirst({
        where: {
          status: { in: ["pending", "running"] },
          cancelRequested: false,
          NOT: {
            OR: [
              { market: { startsWith: "INDIV:" } },
              { market: { startsWith: "PROJECT:" } },
            ],
          },
        },
        select: {
          id: true,
          currentBrandName: true,
          completed: true,
          totalBrands: true,
          market: true,
        },
      });
      if (activeFit) {
        throw new CastingWizardBusyError({
          kind: "fit",
          id: activeFit.id,
          label:
            activeFit.currentBrandName ||
            `${activeFit.market} ${activeFit.completed}/${activeFit.totalBrands}`,
        });
      }
      const activeOutreach = await tx.castingOutreachDraftJob.findFirst({
        where: {
          status: { in: ["pending", "running"] },
          cancelRequested: false,
          NOT: {
            OR: [
              { market: { startsWith: "INDIV:" } },
              { market: { startsWith: "PROJECT:" } },
            ],
          },
        },
        select: {
          id: true,
          currentBrandName: true,
          completed: true,
          totalBrands: true,
          market: true,
        },
      });
      if (activeOutreach) {
        throw new CastingWizardBusyError({
          kind: "outreach",
          id: activeOutreach.id,
          label:
            activeOutreach.currentBrandName ||
            `rédaction ${activeOutreach.market} ${activeOutreach.completed}/${activeOutreach.totalBrands}`,
        });
      }
    }

    return tx.castingRosterFitJob.create({
      data: {
        userId: args.userId,
        market,
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
  // Stop Contabo (markers liés + orphelins). Le verrou Analyser reste
  // actif tant que Contabo écrit (assertContaboOutreachNotBusy).
  try {
    const { cartoChatVpsCancel, cancelOrphanOutreachContaboJobs } = await import(
      "@/lib/carto-chat-vps/vps-client"
    );
    const linked = await prisma.castingOutreachDraftItem.findMany({
      where: {
        status: { in: ["pending", "running"] },
        job: { userId, status: { in: ["pending", "running"] } },
      },
      select: { brandResearch: true },
      take: 40,
    });
    for (const it of linked) {
      const br = (it.brandResearch || {}) as { _vps?: { endMarker?: string } };
      const marker = String(br._vps?.endMarker || "").trim();
      if (!marker) continue;
      await cartoChatVpsCancel({ endMarker: marker, kind: "outreach" });
    }
    await cancelOrphanOutreachContaboJobs();
  } catch {
    /* soft */
  }
  // Toujours passer en cancelled (sinon le poll UI reste sur status=running).
  return prisma.castingRosterFitJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: "cancelled",
      finishedAt: new Date(),
      currentBrandName: null,
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

  // updateMany + garde cancel : un DELETE concurrent ne doit pas être
  // écrasé (sinon cancelRequested=true + status=running → Stop « relance »).
  if (job.status === "pending") {
    const promoted = await prisma.castingRosterFitJob.updateMany({
      where: {
        id: jobId,
        status: "pending",
        cancelRequested: false,
      },
      data: { status: "running", startedAt: job.startedAt || new Date() },
    });
    if (promoted.count === 0) {
      const again = await prisma.castingRosterFitJob.findUnique({
        where: { id: jobId },
        select: { cancelRequested: true, status: true, finishedAt: true },
      });
      if (
        again?.cancelRequested ||
        again?.status === "cancelled"
      ) {
        await prisma.castingRosterFitJob.update({
          where: { id: jobId },
          data: {
            status: "cancelled",
            finishedAt: again.finishedAt || new Date(),
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
    }
  }

  let processed = 0;
  let lastBrand: string | null = null;

  // Worker mort mid-fit → marque restée « running » → job bloqué à jamais.
  const STUCK_RUNNING_MS = 2 * 60_000;
  await prisma.castingRosterFitBrand.updateMany({
    where: {
      jobId,
      status: "running",
      OR: [
        { startedAt: { lt: new Date(Date.now() - STUCK_RUNNING_MS) } },
        { startedAt: null },
      ],
    },
    data: {
      status: "pending",
      startedAt: null,
      error: "Recovered stuck running brand (worker)",
    },
  });

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

    // Gate Contabo : pas de nouvelle analyse tant que rédaction d’une marque
    // déjà fittée de ce job est encore pending/running.
    const contaboInFlight = await countFitChainedContaboInFlight({
      fitJobId: jobId,
      userId: fresh.userId,
      market: String(fresh.market || ""),
    });
    if (contaboInFlight > 0) {
      const waitLabel = "Attente rédaction Contabo (1 marque à la fois)".slice(
        0,
        80
      );
      await prisma.castingRosterFitJob.updateMany({
        where: {
          id: jobId,
          cancelRequested: false,
          status: { not: "cancelled" },
        },
        data: { currentBrandName: waitLabel, status: "running" },
      });
      return {
        processed,
        done: false,
        status: "running",
        currentBrandName: waitLabel,
      };
    }

    // Claim atomique 1-à-1 : transaction = si une marque est déjà running,
    // on ne claim rien (évite Aparanjan + bott en parallèle).
    const next = await prisma.$transaction(async (tx) => {
      const runningNow = await tx.castingRosterFitBrand.findFirst({
        where: { jobId, status: "running" },
        select: { brandName: true },
      });
      if (runningNow) {
        return { blockedBy: runningNow.brandName as string, brand: null };
      }
      const candidate = await tx.castingRosterFitBrand.findFirst({
        where: { jobId, status: "pending" },
        orderBy: { sortOrder: "asc" },
      });
      if (!candidate) return { blockedBy: null, brand: null };
      const claimed = await tx.castingRosterFitBrand.updateMany({
        where: { id: candidate.id, status: "pending" },
        data: { status: "running", startedAt: new Date(), error: null },
      });
      if (claimed.count === 0) return { blockedBy: null, brand: null };
      return { blockedBy: null, brand: candidate };
    });

    if (next.blockedBy) {
      const waitLabel = `En cours · ${next.blockedBy} (1 à la fois)`.slice(0, 80);
      await prisma.castingRosterFitJob.updateMany({
        where: {
          id: jobId,
          cancelRequested: false,
          status: { not: "cancelled" },
        },
        data: { currentBrandName: waitLabel, status: "running" },
      });
      return {
        processed,
        done: false,
        status: "running",
        currentBrandName: waitLabel,
      };
    }
    if (!next.brand) break;

    const brand = next.brand;
    lastBrand = brand.brandName;

    // Ne jamais écraser un cancel (sinon Arrêter casting « revient »).
    const keepAlive = await prisma.castingRosterFitJob.updateMany({
      where: {
        id: jobId,
        cancelRequested: false,
        status: { not: "cancelled" },
      },
      data: { currentBrandName: brand.brandName, status: "running" },
    });
    if (keepAlive.count === 0) {
      await prisma.castingRosterFitBrand.updateMany({
        where: { id: brand.id, status: "running" },
        data: {
          status: "pending",
          startedAt: null,
          error: null,
        },
      });
      return {
        processed,
        done: true,
        status: "cancelled",
        currentBrandName: null,
      };
    }

    try {
      let research = normalizeBrandResearch(brand.brandResearch);
      // Brief manquant → analyse marque serveur (survit à la fermeture / VPS).
      if (!hasBrandResearchBrief(research)) {
        await prisma.castingRosterFitJob.updateMany({
          where: {
            id: jobId,
            cancelRequested: false,
            status: { not: "cancelled" },
          },
          data: {
            currentBrandName: `AI · Analyse marque · ${brand.brandName}`.slice(
              0,
              80
            ),
          },
        });
        const focus: "FR" | "BE" =
          String(job.market || "").includes("BENELUX") &&
          job.market !== "BOTH"
            ? "BE"
            : "FR";

        // In-process si XAI dispo (worker VPS / local) — évite 401 self-HTTP
        // et les `error: {…}` → "[object Object]".
        let brData: BrandResearchInput | null = null;
        if (process.env.XAI_API_KEY?.trim()) {
          try {
            const { researchOneBrand } = await import(
              "@/app/api/casting/brand-research/route"
            );
            brData = normalizeBrandResearch(
              await researchOneBrand(brand.brandName, focus)
            );
          } catch (e) {
            const msg =
              e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : JSON.stringify(e).slice(0, 400);
            throw new Error(
              msg || `Analyse marque impossible (${brand.brandName})`
            );
          }
        } else {
          const url = `${appBaseUrl()}/api/casting/brand-research`;
          const brRes = await fetch(url, {
            method: "POST",
            headers: internalJobHeaders(),
            body: JSON.stringify({
              brandName: brand.brandName,
              availabilityFocus: focus,
            }),
          });
          const raw = (await brRes.json().catch(() => ({}))) as BrandResearchInput & {
            error?: unknown;
          };
          if (!brRes.ok || raw.error) {
            const errMsg =
              typeof raw.error === "string"
                ? raw.error
                : raw.error
                  ? JSON.stringify(raw.error).slice(0, 400)
                  : `Analyse marque impossible (HTTP ${brRes.status})`;
            throw new Error(errMsg);
          }
          brData = normalizeBrandResearch(raw);
        }

        const afterBr = await prisma.castingRosterFitJob.findUnique({
          where: { id: jobId },
          select: { cancelRequested: true, status: true },
        });
        if (
          !afterBr ||
          afterBr.cancelRequested ||
          afterBr.status === "cancelled"
        ) {
          await prisma.castingRosterFitBrand.updateMany({
            where: { id: brand.id, status: "running" },
            data: {
              status: "pending",
              startedAt: null,
              error: null,
            },
          });
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
        research = brData;
        await prisma.castingRosterFitBrand.update({
          where: { id: brand.id },
          data: { brandResearch: research as object },
        });
      }

      const keepFitLabel = await prisma.castingRosterFitJob.updateMany({
        where: {
          id: jobId,
          cancelRequested: false,
          status: { not: "cancelled" },
        },
        data: {
          currentBrandName: `AI · Fit casting · ${brand.brandName}`.slice(0, 80),
        },
      });
      if (keepFitLabel.count === 0) {
        await prisma.castingRosterFitBrand.updateMany({
          where: { id: brand.id, status: "running" },
          data: {
            status: "pending",
            startedAt: null,
            error: null,
          },
        });
        return {
          processed,
          done: true,
          status: "cancelled",
          currentBrandName: null,
        };
      }

      const talents = await runRosterFitForBrand({
        brandName: brand.brandName,
        brandResearch: research,
        talentIds: job.talentIds,
      });
      await prisma.castingRosterFitBrand.update({
        where: { id: brand.id },
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
      // Await obligatoire : un `void` est tué dès la fin du tick serverless Vercel,
      // donc aucun Casting*DraftJob n’était créé après le fit.
      const stillLive = await prisma.castingRosterFitJob.findUnique({
        where: { id: jobId },
        select: { cancelRequested: true, status: true },
      });
      if (
        stillLive &&
        !stillLive.cancelRequested &&
        stillLive.status !== "cancelled"
      ) {
        try {
          await maybeChainDraftAfterBrandDone(job, {
            groupKey: brand.groupKey,
            brandName: brand.brandName,
            company: brand.company,
            pipeline: brand.pipeline,
            targetIds: brand.targetIds || [],
            brandResearch: research,
            result: talents,
          });
        } catch (e) {
          console.warn(
            `[roster-fit-job] chain draft after brand ${brand.brandName}:`,
            e
          );
        }
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message.slice(0, 500) : "Erreur analyse casting";
      console.error(`[roster-fit-job] ${jobId} / ${brand.brandName}:`, e);
      // Blip Neon / réseau → pending auto (pas failed) ; prochain tick reprend.
      if (isSoftFitTransientError(msg)) {
        console.warn(
          `[roster-fit-job] soft retry ${brand.brandName}: ${msg.slice(0, 120)}`
        );
        await prisma.castingRosterFitBrand.update({
          where: { id: brand.id },
          data: {
            status: "pending",
            error: `Reprise auto (blip DB/réseau) — ${msg.slice(0, 180)}`,
            startedAt: null,
            finishedAt: null,
          },
        });
        await prisma.castingRosterFitJob.updateMany({
          where: {
            id: jobId,
            cancelRequested: false,
            status: { not: "cancelled" },
          },
          data: {
            currentBrandName: `Reprise auto · ${brand.brandName}`.slice(0, 80),
            status: "running",
          },
        });
        processed += 1;
        break;
      }
      await prisma.castingRosterFitBrand.update({
        where: { id: brand.id },
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
    if (
      finalJob?.cancelRequested ||
      finalJob?.status === "cancelled"
    ) {
      await prisma.castingRosterFitJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          finishedAt: finalJob.finishedAt || new Date(),
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
    // Await : sinon le cron/serverless coupe avant createOutreachDraftJob.
    if (status === "completed" && finalJob) {
      try {
        await maybeChainIndivDraftAfterFit(finalJob);
      } catch (e) {
        console.warn(
          `[roster-fit-job] chain indiv draft after ${jobId}:`,
          e
        );
      }
      try {
        await maybeChainOutreachDraftAfterFit(finalJob);
      } catch (e) {
        console.warn(
          `[roster-fit-job] chain outreach draft after ${jobId}:`,
          e
        );
      }
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

  // Ne bloque que si une rédac est vraiment en cours — un vieux « done »
  // (même job completed) ne doit pas empêcher une relance après nouveau fit.
  const already = await prisma.castingOutreachDraftItem.findFirst({
    where: {
      groupKey: brand.groupKey,
      status: { in: ["pending", "running"] },
      job: {
        userId: fitJob.userId,
        market,
        status: { in: ["pending", "running"] },
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
  // Vercel : `after()` pour que le re-kick survive à la fin de la réponse.
  if (process.env.VERCEL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { after } = require("next/server") as typeof import("next/server");
      after(() => {
        kickRosterFitJobHttp(jobId);
      });
    } catch {
      kickRosterFitJobHttp(jobId);
    }
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
