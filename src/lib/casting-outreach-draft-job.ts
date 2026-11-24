import prisma from "@/lib/prisma";
import {
  appBaseUrl,
  internalJobHeaders,
} from "@/lib/internal-job-auth";
import { sanitizePresentationExcerpt } from "@/lib/campaign-presentation-text";
import { ensureContactFirstnameToken } from "@/lib/outreach-mail-vps/ensure-contact-firstname-token";
import {
  readOutreachMailVps,
  startOutreachMailVps,
} from "@/lib/outreach-mail-vps/run";
import {
  cartoChatVpsCancel,
  cartoChatVpsHealth,
  isOutreachChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import { createEndMarker } from "@/lib/carto-chat-vps/end-marker";
import { buildChatVpsProgress } from "@/lib/outreach-mail-vps/step-progress";
import {
  trimEmailHtmlEdges,
  upgradeTalentLinksInHtml,
} from "@/lib/talent-email-links";
import { collectRecentLeynaRefusedTalents } from "@/lib/leyna-exchange-context";
import {
  assertOutreachVpsMailQuality,
  ensureJoeyGoldIntroHtml,
  ensureOutreachCtaBoldHtml,
  ensureOutreachMailClosingHtml,
  ensureRequiredTalentsInHtml,
  ensureTalentbookInHtml,
  isFactoryOutreachSubject,
  isLegacyCastingOutreachTemplate,
  looksLikeMailPromptEcho,
  rewriteFactoryOutreachSubject,
  stripForbiddenTalentBioFromHtml,
  stripNotesLeakFromMailBody,
  stripPromptLeakFromMailBody,
  unescapeChatMailHtml,
} from "@/lib/outreach-mail-vps/parse";
import {
  CONTABO_OUTREACH_ADVISORY_LOCK,
  OUTREACH_DRAFT_CREATE_ADVISORY_LOCK,
  countGlobalContaboOutreachRunning,
} from "@/lib/casting-contabo-global-lock";

/** Prisma JSON : neutralise `\` / contrôles (sinon « unexpected end of hex escape »). */
function sanitizeJsonForDb<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === "string") {
        return sanitizePresentationExcerpt(v).slice(0, 24_000);
      }
      return v;
    })
  ) as T;
}

/**
 * Recalcule completed/failed depuis les items (anti double-comptage ticks concurrents).
 */
async function reconcileOutreachDraftJobCounters(jobId: string): Promise<{
  completed: number;
  failed: number;
}> {
  const [completed, failed] = await Promise.all([
    prisma.castingOutreachDraftItem.count({
      where: { jobId, status: "done" },
    }),
    prisma.castingOutreachDraftItem.count({
      where: { jobId, status: "failed" },
    }),
  ]);
  await prisma.castingOutreachDraftJob.update({
    where: { id: jobId },
    data: { completed, failed },
  });
  return { completed, failed };
}

type LeynaSlim = {
  hasExchange: boolean;
  hasSentNoReplyOnly: boolean;
  tone: "tu" | "vous" | null;
  scanStatus: string;
  bannerLabel: string | null;
  alerts: string[];
  contacts: Array<{
    email: string;
    subject: string | null;
    status?: string;
    tone: "tu" | "vous" | null;
    notes: string;
    alerts: string[];
    lastExchangeAt: string | null;
    messageCount?: number;
    talentsPitched?: string[];
    talentsRefused?: string[];
  }>;
  promptBlockFr: string;
  promptBlockEn: string;
  fetchedAt: string;
  ops?: {
    relationStatus: string;
    recommendedAction: string;
    excludeTalents: string[];
    alreadyPitchedTalents: string[];
    doNot: string[];
    angle: string;
    writeInstructions: string;
  } | null;
};

function slimLeynaExchange(leyna: {
  hasExchange: boolean;
  hasSentNoReplyOnly?: boolean;
  tone?: "tu" | "vous" | null;
  scanStatus?: string;
  bannerLabel?: string | null;
  alerts?: string[];
  contacts?: Array<{
    email: string;
    subject?: string | null;
    status?: string;
    tone?: "tu" | "vous" | null;
    notes?: string;
    alerts?: string[];
    lastExchangeAt?: string | null;
    messageCount?: number;
    talentsPitched?: string[];
    talentsRefused?: string[];
  }>;
  promptBlockFr?: string;
  promptBlockEn?: string;
  fetchedAt?: string;
  ops?: LeynaSlim["ops"];
}): LeynaSlim {
  return {
    hasExchange: Boolean(leyna.hasExchange),
    hasSentNoReplyOnly: Boolean(leyna.hasSentNoReplyOnly),
    tone: leyna.tone ?? null,
    scanStatus: String(leyna.scanStatus || (leyna.hasExchange ? "ok" : "empty")),
    bannerLabel: leyna.bannerLabel ?? null,
    alerts: Array.isArray(leyna.alerts) ? leyna.alerts : [],
    contacts: (leyna.contacts || []).slice(0, 15).map((c) => ({
      email: c.email,
      subject: c.subject ?? null,
      status: c.status,
      tone: c.tone ?? null,
      notes: String(c.notes || "").slice(0, 1500),
      alerts: Array.isArray(c.alerts) ? c.alerts : [],
      lastExchangeAt: c.lastExchangeAt ?? null,
      messageCount: c.messageCount,
      talentsPitched: Array.isArray(c.talentsPitched)
        ? c.talentsPitched.slice(0, 20)
        : undefined,
      talentsRefused: Array.isArray(c.talentsRefused)
        ? c.talentsRefused.slice(0, 20)
        : undefined,
    })),
    promptBlockFr: String(leyna.promptBlockFr || "").slice(0, 9000),
    promptBlockEn: String(leyna.promptBlockEn || "").slice(0, 9000),
    fetchedAt: leyna.fetchedAt || new Date().toISOString(),
    ops: leyna.ops
      ? {
          relationStatus: String(leyna.ops.relationStatus || "").slice(0, 400),
          recommendedAction: String(leyna.ops.recommendedAction || "").slice(
            0,
            500
          ),
          excludeTalents: (leyna.ops.excludeTalents || []).slice(0, 30),
          alreadyPitchedTalents: (
            leyna.ops.alreadyPitchedTalents || []
          ).slice(0, 40),
          doNot: (leyna.ops.doNot || []).slice(0, 12),
          angle: String(leyna.ops.angle || "").slice(0, 600),
          writeInstructions: String(leyna.ops.writeInstructions || "").slice(
            0,
            2500
          ),
        }
      : null,
  };
}

function talentNameMatchesExclude(
  name: string,
  excludeList: string[]
): boolean {
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!n) return false;
  const parts = n.split(/\s+/).filter(Boolean);
  return excludeList.some((ex) => {
    const e = ex
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!e) return false;
    if (n === e || n.includes(e) || e.includes(n)) return true;
    const ep = e.split(/\s+/).filter(Boolean);
    if (parts[0] && ep[0] && parts[0] === ep[0] && parts[0].length >= 3) {
      // Même prénom + début de nom
      if (parts[1] && ep[1] && parts[1].startsWith(ep[1].slice(0, 3))) {
        return true;
      }
    }
    return false;
  });
}

/** Efface l’ancien mail cible (sinon une relance ratée laisse le brouillon ChatGPT). */
async function clearDraftsOnTargets(pipeline: string, targetIds: string[]) {
  if (targetIds.length === 0) return;
  const data = {
    draftSubject: null as string | null,
    draftBodyHtml: null as string | null,
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

/** Persiste le scan Leyna tout de suite (UI) avant la rédaction. */
async function persistLeynaPreviewOnTargets(
  pipeline: string,
  targetIds: string[],
  brandName: string,
  leyna: LeynaSlim
) {
  const slim = sanitizeJsonForDb({
    brandName,
    leynaExchange: leyna,
    leynaReadyAt: new Date().toISOString(),
    engine: "chatgpt-vps",
  });
  // Snapshot Leyna + mail vidé → l’UI ne réaffiche plus l’ancien brouillon.
  const data = {
    castingResearchSnapshot: slim,
    draftSubject: null as string | null,
    draftBodyHtml: null as string | null,
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

/** Merge live Chat progress (tours 1–2) dans le snapshot cible. */
async function persistChatVpsProgressOnTargets(
  pipeline: string,
  targetIds: string[],
  brandName: string,
  chatVps: Record<string, unknown>,
  leyna?: LeynaSlim | null
) {
  if (targetIds.length === 0) return;

  const rows =
    pipeline === "BENELUX"
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, castingResearchSnapshot: true },
        })
      : await prisma.outreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, castingResearchSnapshot: true },
        });

  for (const row of rows) {
    const prev =
      row.castingResearchSnapshot &&
      typeof row.castingResearchSnapshot === "object"
        ? (row.castingResearchSnapshot as Record<string, unknown>)
        : {};
    const slim = sanitizeJsonForDb({
      ...prev,
      brandName,
      ...(leyna ? { leynaExchange: leyna } : {}),
      chatVps: {
        ...((prev.chatVps && typeof prev.chatVps === "object"
          ? prev.chatVps
          : {}) as object),
        ...chatVps,
        updatedAt: new Date().toISOString(),
      },
      engine: "chatgpt-vps-high-3turn",
    });
    if (pipeline === "BENELUX") {
      await prisma.beneluxOutreachTarget.update({
        where: { id: row.id },
        data: { castingResearchSnapshot: slim },
      });
    } else {
      await prisma.outreachTarget.update({
        where: { id: row.id },
        data: { castingResearchSnapshot: slim },
      });
    }
  }
}

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
  recommended?: boolean;
  fitScore?: number;
  suggestedAngle?: string;
  whyFit?: string;
  proofPoints?: string;
};

/** Toutes les 10 s : le CODE DE FIN est-il apparu ? → récupère le mail. */
const VPS_POLL_MS = 10_000;
/** 3 tours High — marge large (global). */
const VPS_TIMEOUT_MS = 22 * 60_000;
/** Par tick process : évite de tuer le serverless à 800s. */
const VPS_TICK_BUDGET_MS = 90_000;

/**
 * Erreurs poll Contabo / Neon qui ne doivent PAS marquer l’item failed :
 * réseau, abort, blip DB — on reprend au tick suivant (cas Veja).
 */
export function isSoftOutreachVpsPollError(msg: string): boolean {
  const m = String(msg || "").toLowerCase();
  if (!m) return true;
  // Deadline métier (après recovery) = hard fail, pas soft.
  if (m.includes("timeout serveur") || m.includes("pas de mail prêt")) {
    return false;
  }
  return (
    m.includes("abort") ||
    m.includes("aborted") ||
    m.includes("timeout") ||
    m.includes("etimedout") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("socket") ||
    m.includes("réponse chat vide") ||
    m.includes("reponse chat vide") ||
    m.includes("lecture serveur") ||
    m.includes("job chat en erreur") ||
    m.includes("vps chat http 5") ||
    m.includes("vps chat http 502") ||
    m.includes("vps chat http 503") ||
    m.includes("vps chat http 504") ||
    m.includes("undici") ||
    m.includes("other side closed") ||
    // Neon / Prisma transient (Veja : Can't reach database server)
    m.includes("can't reach database") ||
    m.includes("cant reach database") ||
    m.includes("reach database server") ||
    m.includes("database server is running") ||
    m.includes("server has closed the connection") ||
    m.includes("connection reset") ||
    m.includes("connection pool") ||
    m.includes("timed out fetching a new connection") ||
    m.includes("p1001") ||
    m.includes("p1002") ||
    m.includes("p1017") ||
    m.includes("neon.tech")
  );
}

type BrandResearchStore = BrandResearch & {
  /** Relancer : interdit tout court-circuit ancien mail. */
  _forceRewrite?: boolean;
  _forceRewriteAt?: string;
  _vps?: {
    endMarker?: string;
    /** Claim anti-doublon avant ask-async. */
    launchingAt?: string;
    startedAt?: string;
    leynaExchange?: LeynaSlim;
    talentResearch?: TalentResearchItem[];
    /** Compte Joey → cold A, pas de tour Gmail Leyna. */
    joeyCold?: boolean;
    /** Persiste le mode Relancer dans le claim Contabo. */
    forceRewrite?: boolean;
  };
};

async function pollOutreachVpsUntilReady(opts: {
  itemId: string;
  jobId: string;
  brandName: string;
  pipeline: string;
  targetIds: string[];
  brandResearch: BrandResearchStore;
  endMarker: string;
  vpsStartedAt?: string | null;
}): Promise<{
  ok: boolean;
  brandName: string;
  subject?: string;
  bodyHtml?: string;
  error?: string;
  pending?: boolean;
}> {
  const {
    itemId,
    jobId,
    brandName,
    pipeline,
    targetIds,
    brandResearch,
    endMarker,
  } = opts;
  const startedAtMs = opts.vpsStartedAt
    ? Date.parse(opts.vpsStartedAt)
    : Date.now();
  const globalDeadline = startedAtMs + VPS_TIMEOUT_MS;
  const tickDeadline = Date.now() + VPS_TICK_BUDGET_MS;

  let subject = "";
  let bodyHtml = "";
  let vpsNotes: string | null = null;
  let mailEngine: string | null = null;
  let lastPersistedStep = 0;

  const knownTalents = (brandResearch._vps?.talentResearch || [])
    .map((t) => ({
      talentId: String(t.talentId || "").trim() || undefined,
      name: String(t.name || "").trim(),
    }))
    .filter((t) => t.name);
  const knownTalentNames = knownTalents.map((t) => t.name);

  const tryReadCertifiedMail = async () => {
    const ready = await readOutreachMailVps({
      brandName,
      endMarker,
      structure: {
        joey: Boolean(brandResearch._vps?.joeyCold),
        talentNames: knownTalentNames,
      },
    });
    if (!ready.ready) return null;
    return {
      subject: String(ready.subject || "").trim(),
      bodyHtml: String(ready.bodyHtml || "").trim(),
      notes: String(ready.notes || "").trim() || null,
      engine:
        String((ready as { engine?: string }).engine || "").trim() || null,
      answerChars: Number(
        (ready as { answerChars?: number }).answerChars || 0
      ),
      promptPreview: String(
        (ready as { promptPreview?: string }).promptPreview || ""
      ),
    };
  };

  while (Date.now() < tickDeadline && Date.now() < globalDeadline) {
    if (await isDraftJobCancelled(jobId)) {
      return { ok: false, brandName, error: "Annulé" };
    }
    try {
      // Sync live des tours terminés → snapshot UI
      try {
        const health = await cartoChatVpsHealth({ kind: "outreach" });
        const job = (health.jobs || []).find(
          (j) => String(j.endMarker || "") === endMarker
        );
        const stepAnswers = Array.isArray(job?.stepAnswers)
          ? job!.stepAnswers!
          : [];
        const doneSteps = stepAnswers.filter((a) => String(a || "").trim())
          .length;
        if (doneSteps > lastPersistedStep) {
          const progress = buildChatVpsProgress({
            brandName,
            stepAnswers,
            knownTalentNames,
            knownTalents,
            endMarker,
          });
          let leynaForUi = brandResearch._vps?.leynaExchange || null;
          // Joey cold A : pas de brief Leyna Chat (1 seul tour mail).
          const joeyCold = Boolean(brandResearch._vps?.joeyCold);
          // Tour 1 ChatGPT = Gmail Leyna → alertes rouges + tu/vous dans l’app.
          if (!joeyCold && doneSteps >= 1 && stepAnswers[0]) {
            const { parseLeynaBriefFromChat } = await import(
              "@/lib/outreach-mail-vps/parse-leyna-brief"
            );
            const brief = parseLeynaBriefFromChat(stepAnswers[0]);
            if (brief) {
              const base = leynaForUi || {
                hasExchange: Boolean(brief.hasExchange),
                hasSentNoReplyOnly: brief.hasExchange === false,
                tone: null as "tu" | "vous" | null,
                scanStatus: "ok",
                bannerLabel: null,
                alerts: [] as string[],
                contacts: [] as LeynaSlim["contacts"],
                promptBlockFr: "",
                promptBlockEn: "",
                fetchedAt: new Date().toISOString(),
                ops: null,
              };
              leynaForUi = {
                ...base,
                hasExchange:
                  brief.hasExchange ?? Boolean(base.hasExchange),
                hasSentNoReplyOnly:
                  brief.hasExchange === false
                    ? true
                    : Boolean(base.hasSentNoReplyOnly),
                // Alertes rouges = UNIQUEMENT ChatGPT Gmail (écrase heuristiques).
                alerts: brief.alerts.slice(0, 8),
                tone: brief.tone ?? base.tone,
                bannerLabel: brief.bannerLabel,
                promptBlockFr: brief.promptBlockFr,
                ops: {
                  relationStatus: brief.relationStatus,
                  recommendedAction: brief.recommendedAction,
                  excludeTalents: brief.excludeTalents,
                  alreadyPitchedTalents: brief.alreadyPitchedTalents,
                  doNot: brief.doNot,
                  angle: brief.angle,
                  writeInstructions: brief.writeInstructions,
                },
              };
              if (brandResearch._vps) {
                brandResearch._vps.leynaExchange = leynaForUi;
              }
              try {
                await persistLeynaPreviewOnTargets(
                  pipeline,
                  targetIds,
                  brandName,
                  leynaForUi
                );
              } catch {
                /* soft */
              }
              await prisma.castingOutreachDraftJob.update({
                where: { id: jobId },
                data: {
                  currentBrandName:
                    `Serveur · Leyna noté · ${brandName} → mail…`.slice(0, 80),
                },
              });
            }
          }
          await persistChatVpsProgressOnTargets(
            pipeline,
            targetIds,
            brandName,
            progress,
            leynaForUi
          );
          lastPersistedStep = doneSteps;
        }
      } catch {
        /* health soft-fail */
      }

      // Contabo → API structure (comme carto) ; parse local = filet.
      const ready = await tryReadCertifiedMail();
      if (ready && ready.subject && ready.bodyHtml) {
        subject = ready.subject;
        bodyHtml = ready.bodyHtml;
        vpsNotes = ready.notes;
        mailEngine = ready.engine;
        // Alertes / tone = déjà posés au tour 1 (stepAnswers[0]) — ne pas écraser.
        break;
      }
      const chars = Number(ready?.answerChars || 0);
      const preview = String(ready?.promptPreview || "");
      // Progress Neon = best-effort : un blip DB ne doit JAMAIS faire fail Contabo.
      try {
        await prisma.castingOutreachDraftJob.update({
          where: { id: jobId },
          data: {
            currentBrandName: (
              preview
                ? `Serveur · ${preview}`
                : chars
                  ? `Serveur · High · ${brandName} · ${Math.round(chars / 1000)}k · poll 10s`
                  : `Serveur · High · ${brandName} · attente CODE FIN`
            ).slice(0, 80),
          },
        });
      } catch (progErr) {
        const pm =
          progErr instanceof Error ? progErr.message : String(progErr);
        if (!isSoftOutreachVpsPollError(pm)) throw progErr;
        console.warn(
          `[outreach-draft-job] progress write soft ${brandName}: ${pm.slice(0, 120)}`
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Lecture serveur impossible";
      if (isSoftOutreachVpsPollError(msg)) {
        console.warn(
          `[outreach-draft-job] poll soft ${brandName}: ${msg}`
        );
        // Continuer le poll — Neon/réseau soft, Contabo intact.
      } else {
        // Erreur « dure » : dernière chance certified avant failed.
        try {
          const salvaged = await tryReadCertifiedMail();
          if (salvaged?.subject && salvaged.bodyHtml) {
            subject = salvaged.subject;
            bodyHtml = salvaged.bodyHtml;
            vpsNotes = salvaged.notes;
            mailEngine = salvaged.engine;
            console.info(
              `[outreach-draft-job] recovery certified après erreur ${brandName}`
            );
            break;
          }
        } catch (recoverErr) {
          console.warn(
            `[outreach-draft-job] recovery fail ${brandName}:`,
            recoverErr instanceof Error ? recoverErr.message : recoverErr
          );
        }
        if (isSoftOutreachVpsPollError(msg)) {
          return {
            ok: false,
            brandName,
            error: "VPS_PENDING",
            pending: true,
          };
        }
        return {
          ok: false,
          brandName,
          error: msg,
        };
      }
    }
    await sleep(VPS_POLL_MS);
  }

  if (!subject || !bodyHtml) {
    // Timeout ou fin de tick : toujours tenter recovery certified (cas ERAM/Peugeot).
    try {
      const salvaged = await tryReadCertifiedMail();
      if (salvaged?.subject && salvaged.bodyHtml) {
        subject = salvaged.subject;
        bodyHtml = salvaged.bodyHtml;
        vpsNotes = salvaged.notes;
        mailEngine = salvaged.engine;
        console.info(
          `[outreach-draft-job] recovery certified fin-poll ${brandName}`
        );
      }
    } catch (recoverErr) {
      console.warn(
        `[outreach-draft-job] recovery fin-poll fail ${brandName}:`,
        recoverErr instanceof Error ? recoverErr.message : recoverErr
      );
    }
  }

  if (!subject || !bodyHtml) {
    if (Date.now() >= globalDeadline) {
      // Libère Contabo : sinon un Tour 2 mort bloque toute la file (EasyJet, etc.).
      try {
        await cartoChatVpsCancel({ endMarker, kind: "outreach" });
      } catch (cancelErr) {
        console.warn(
          `[outreach-draft-job] cancel Contabo after timeout ${brandName}:`,
          cancelErr instanceof Error ? cancelErr.message : cancelErr
        );
      }
      return {
        ok: false,
        brandName,
        error: "Timeout serveur — pas de mail prêt",
      };
    }
    // Encore en cours — prochain tick process reprendra.
    return {
      ok: false,
      brandName,
      error: "VPS_PENDING",
      pending: true,
    };
  }

  const targets =
    pipeline === "BENELUX"
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: { firstname: true, language: true },
        })
      : await prisma.outreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: { firstname: true, language: true },
        });
  const knownFirstnames = targets
    .map((t) => String(t.firstname || "").trim())
    .filter(Boolean);
  // Brouillon Contabo = TOUJOURS FR. Traduction EN à l’envoi (casting-auto-send).
  const bodyLang: "fr" | "en" = "fr";
  bodyHtml = ensureContactFirstnameToken(bodyHtml, knownFirstnames);

  // Liens Instagram sur les noms talents (comme CastingComposer / avant).
  const research = brandResearch._vps?.talentResearch || [];
  let talentRows: Array<{
    id: string;
    prenom: string | null;
    nom: string | null;
    instagram: string | null;
  }> = [];
  try {
    bodyHtml = trimEmailHtmlEdges(unescapeChatMailHtml(bodyHtml));
    // Évite les <a> imbriqués si Chat a déjà mis un href cassé.
    bodyHtml = bodyHtml.replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "");
    const talentIds = research
      .map((t) => String(t.talentId || "").trim())
      .filter(Boolean);
    if (talentIds.length > 0) {
      talentRows = await prisma.talent.findMany({
        where: { id: { in: talentIds } },
        select: { id: true, prenom: true, nom: true, instagram: true },
      });
      if (talentRows.length > 0) {
        bodyHtml = upgradeTalentLinksInHtml(bodyHtml, talentRows);
      }
    }
  } catch (e) {
    console.warn(
      "[outreach-draft-job] talent links soft-fail:",
      e instanceof Error ? e.message : e
    );
  }

  // Refuse définitivement le vieux template — ne pas « réparer » ni sauver.
  if (isLegacyCastingOutreachTemplate(bodyHtml)) {
    return {
      ok: false,
      brandName,
      error:
        "LEGACY_CASTING_TEMPLATE — Chat a ressorti media kits/moodboard. Relancer.",
    };
  }

  // Ancrage perso inventé alors qu’il n’y a pas de fil DIRECT avec les destinataires CRM.
  const leynaSnap = brandResearch._vps?.leynaExchange as
    | {
        contacts?: Array<{ email?: string; status?: string }>;
        hasExchange?: boolean;
      }
    | null
    | undefined;
  const targetEmailRows =
    pipeline === "BENELUX"
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: { email: true },
        })
      : await prisma.outreachTarget.findMany({
          where: { id: { in: targetIds } },
          select: { email: true },
        });
  const emailSet = new Set(
    targetEmailRows
      .map((t) => String(t.email || "").trim().toLowerCase())
      .filter((e) => e.includes("@"))
  );
  const hasDirectRecipientExchange = Boolean(
    leynaSnap?.contacts?.some((c) => {
      const em = String(c.email || "")
        .trim()
        .toLowerCase();
      return c.status !== "sent_no_reply" && em && emailSet.has(em);
    })
  );
  if (
    !brandResearch._vps?.joeyCold &&
    !hasDirectRecipientExchange &&
    /on avait [ée]chang|suite [àa] nos [ée]changes|suite [àa] notre [ée]change|je reviens vers (toi|vous)|certains profils t['’]avaient plu|comme on en avait parl/i.test(
      bodyHtml
    )
  ) {
    return {
      ok: false,
      brandName,
      error:
        "FALSE_PERSONAL_HISTORY — ancrage « on avait échangé » sans fil direct CRM. Relancer.",
    };
  }

  bodyHtml = stripPromptLeakFromMailBody(
    stripForbiddenTalentBioFromHtml(bodyHtml)
  );
  if (looksLikeMailPromptEcho(bodyHtml)) {
    return {
      ok: false,
      brandName,
      error:
        "PROMPT_ECHO — consignes serveur collées dans le BODY. Relancer.",
    };
  }
  // Joey : filet intro BD AVANT assert (évite faux JOEY_INTRO_MISSING sur HTML échappé).
  if (brandResearch._vps?.joeyCold) {
    bodyHtml = ensureJoeyGoldIntroHtml(bodyHtml);
  }
  bodyHtml = ensureOutreachMailClosingHtml(bodyHtml, { language: bodyLang });
  bodyHtml = ensureOutreachCtaBoldHtml(bodyHtml);
  bodyHtml = ensureTalentbookInHtml(bodyHtml, {
    market: pipeline === "BENELUX" ? "BENELUX" : "FR",
    language: bodyLang,
  });
  // Talentbook peut s'insérer avant CTA : re-garantit la fin complète.
  bodyHtml = ensureOutreachMailClosingHtml(bodyHtml, { language: bodyLang });
  bodyHtml = ensureOutreachCtaBoldHtml(bodyHtml);
  if (brandResearch._vps?.joeyCold) {
    bodyHtml = ensureJoeyGoldIntroHtml(bodyHtml);
  }

  // Filet TALENTS : Relancer = strict (pas d’injection qui « répare » un vieux
  // mail Contabo). Sinon injecte les puces absentes puis assert.
  const igByTalentId = new Map(
    talentRows.map((r) => [r.id, r.instagram] as const)
  );
  const forceRewriteSave = Boolean(
    (brandResearch as { _forceRewrite?: boolean })._forceRewrite ||
      brandResearch._vps?.forceRewrite
  );
  const requiredNames =
    knownTalentNames.length > 0
      ? knownTalentNames
      : talentRows
          .map((r) => `${r.prenom || ""} ${r.nom || ""}`.trim())
          .filter(Boolean);

  if (!forceRewriteSave) {
    bodyHtml = ensureRequiredTalentsInHtml(
      bodyHtml,
      research.map((t) => ({
        name: String(t.name || "").trim(),
        instagram: igByTalentId.get(String(t.talentId || "").trim()) || null,
        pitch:
          String(t.castingWhyFit || "").trim() ||
          String(t.suggestedAngle || "").trim() ||
          String(t.whyRelevant || "").trim() ||
          String(t.whoTheyAre || "").trim() ||
          "",
      })),
      { language: bodyLang }
    );
  }

  try {
    assertOutreachVpsMailQuality(bodyHtml, {
      joey: Boolean(brandResearch._vps?.joeyCold),
      requiredTalentNames: requiredNames,
    });
  } catch (e) {
    return {
      ok: false,
      brandName,
      error: e instanceof Error ? e.message : "Mail VPS invalide",
    };
  }

  const { _vps, ...cleanBrand } = brandResearch;
  const finalProgress = buildChatVpsProgress({
    brandName,
    stepAnswers: [
      // Tour 1–2 already in snapshot; tour 3 notes via vpsNotes
    ],
    knownTalentNames,
    endMarker,
  });
  // Recharge stepAnswers depuis health une dernière fois
  let stepAnswersFinal: string[] = [];
  try {
    const health = await cartoChatVpsHealth({ kind: "outreach" });
    const job = (health.jobs || []).find(
      (j) => String(j.endMarker || "") === endMarker
    );
    stepAnswersFinal = Array.isArray(job?.stepAnswers) ? job!.stepAnswers! : [];
  } catch {
    /* ignore */
  }
  const chatVpsFinal = {
    ...buildChatVpsProgress({
      brandName,
      stepAnswers: stepAnswersFinal,
      knownTalentNames,
      knownTalents,
      endMarker,
    }),
    notes: vpsNotes || finalProgress.notes,
    historySummary: vpsNotes || "",
  };

  const castingResearchSnapshot = {
    brandName,
    brandResearch: cleanBrand,
    talentResearch: _vps?.talentResearch || [],
    leynaExchange: _vps?.leynaExchange || null,
    chatVps: chatVpsFinal,
    engine:
      mailEngine === "openai-structure"
        ? "chatgpt-vps-high-leyna-mail+openai-structure"
        : "chatgpt-vps-high-leyna-mail",
    vpsNotes,
    savedAt: new Date().toISOString(),
  };

  const cleanSubject = sanitizeOutreachMailSubject(subject, brandName);

  try {
    await withDbRetry(`saveDraft ${brandName}`, () =>
      saveDraftOnTargets(
        pipeline,
        targetIds,
        subject,
        bodyHtml,
        castingResearchSnapshot,
        brandName
      )
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isSoftOutreachVpsPollError(msg)) {
      console.warn(
        `[outreach-draft-job] saveDraft soft ${brandName}: ${msg.slice(0, 120)}`
      );
      // Contabo a le mail — ne pas cancel ; prochain tick retentera le save.
      return {
        ok: false,
        brandName,
        error: "VPS_PENDING",
        pending: true,
      };
    }
    throw e;
  }

  // Nettoie le marker pour ne pas re-poll (best-effort après save targets).
  try {
    await withDbRetry(`clearMarker ${brandName}`, () =>
      prisma.castingOutreachDraftItem.update({
        where: { id: itemId },
        data: {
          brandResearch: cleanBrand as object,
        },
      })
    );
  } catch (e) {
    console.warn(
      `[outreach-draft-job] clearMarker soft ${brandName}:`,
      e instanceof Error ? e.message : e
    );
  }

  // Libère le slot Contabo tout de suite : sinon le driver peut rester
  // « running » sur le jeton alors que le mail est déjà en base → marque suivante bloquée.
  try {
    await cartoChatVpsCancel({ endMarker, kind: "outreach" });
  } catch (e) {
    console.warn(
      "[outreach-draft-job] cancel Contabo after success soft-fail:",
      e instanceof Error ? e.message : e
    );
  }

  return { ok: true, brandName, subject: cleanSubject, bodyHtml };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry court sur blips Neon avant de déclarer VPS_PENDING. */
async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!isSoftOutreachVpsPollError(msg) || i === attempts - 1) {
        throw e;
      }
      console.warn(
        `[outreach-draft-job] db retry ${i + 1}/${attempts} ${label}: ${msg.slice(0, 100)}`
      );
      await sleep(1000 * (i + 1));
    }
  }
  throw last;
}

/** Coupe le job Contabo lié à un item (fail / timeout / reset) — évite zombies file. */
async function cancelContaboForOutreachItem(item: {
  brandName?: string | null;
  brandResearch?: unknown;
}): Promise<void> {
  const br = (item.brandResearch || {}) as {
    _vps?: { endMarker?: string | null };
  };
  const endMarker = String(br._vps?.endMarker || "").trim();
  if (!endMarker) return;
  try {
    await cartoChatVpsCancel({ endMarker, kind: "outreach" });
  } catch (e) {
    console.warn(
      `[outreach-draft-job] cancel Contabo ${item.brandName || "?"}:`,
      e instanceof Error ? e.message : e
    );
  }
}

/** Évite le wizard figé sur « Marque · attente CODE FIN » après fail/done. */
async function refreshOutreachJobCurrentBrand(jobId: string): Promise<void> {
  try {
    const next = await prisma.castingOutreachDraftItem.findFirst({
      where: { jobId, status: { in: ["running", "pending"] } },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      select: { brandName: true, status: true },
    });
    await prisma.castingOutreachDraftJob.update({
      where: { id: jobId },
      data: {
        currentBrandName: next
          ? (next.status === "running"
              ? `Serveur · ${next.brandName}`
              : `File · ${next.brandName}`
            ).slice(0, 80)
          : null,
      },
    });
  } catch (e) {
    console.warn(
      "[outreach-draft-job] refresh currentBrand soft:",
      e instanceof Error ? e.message : e
    );
  }
}

async function isDraftJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.castingOutreachDraftJob.findUnique({
    where: { id: jobId },
    select: { cancelRequested: true, status: true },
  });
  return (
    !job ||
    job.cancelRequested ||
    job.status === "cancelled"
  );
}

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

/** Contact encore à rédiger pour le wizard Contabo. */
function targetNeedsOutreachDraft(t: {
  status?: string | null;
  lastSentAt?: Date | string | null;
  draftSubject?: string | null;
  draftBodyHtml?: string | null;
}): boolean {
  const st = String(t.status || "TO_CONTACT").toUpperCase();
  if (st === "WAITING" || st === "STOPPED") return false;
  // Cycle J+45 : nouveau mail autorisé (même si vieux brouillon encore en base).
  if (st === "TO_RECONTACT") return true;
  if (t.lastSentAt) return false;
  const hasDraft =
    Boolean(String(t.draftSubject || "").trim()) &&
    Boolean(String(t.draftBodyHtml || "").trim());
  // Mail prêt → hors wizard, on ne réécrit pas.
  return !hasDraft;
}

async function filterTargetIdsNeedingDraft(
  pipeline: string,
  targetIds: string[]
): Promise<string[]> {
  const ids = targetIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (ids.length === 0) return [];
  const rows =
    pipeline === "BENELUX"
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            status: true,
            lastSentAt: true,
            draftSubject: true,
            draftBodyHtml: true,
          },
        })
      : await prisma.outreachTarget.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            status: true,
            lastSentAt: true,
            draftSubject: true,
            draftBodyHtml: true,
          },
        });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => {
    const row = byId.get(id);
    if (!row) return false;
    return targetNeedsOutreachDraft(row);
  });
}

/**
 * Obligation Relancer : efface TOUS les brouillons des cibles passées
 * (même WAITING / déjà envoyés). On ne touche pas status / lastSentAt —
 * uniquement draftSubject / draftBodyHtml / schedule, pour ne jamais
 * réutiliser un vieux mail Contabo.
 */
async function clearRewritableDraftsOnTargets(
  pipeline: string,
  targetIds: string[]
): Promise<string[]> {
  const ids = targetIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (ids.length === 0) return [];
  const rows =
    pipeline === "BENELUX"
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { id: { in: ids } },
          select: { id: true, status: true },
        })
      : await prisma.outreachTarget.findMany({
          where: { id: { in: ids } },
          select: { id: true, status: true },
        });
  // STOPPED = hors wizard, on n’y touche pas. Le reste : wipe brouillon.
  const clearable = rows
    .filter((t) => String(t.status || "").toUpperCase() !== "STOPPED")
    .map((t) => t.id);
  if (clearable.length > 0) {
    await clearDraftsOnTargets(pipeline, clearable);
    // Coupe aussi un éventuel envoi programmé encore en file.
    const sched = {
      scheduledSendAt: null as Date | null,
      scheduledSubject: null as string | null,
      scheduledBodyHtml: null as string | null,
      scheduledById: null as string | null,
    };
    if (pipeline === "BENELUX") {
      await prisma.beneluxOutreachTarget.updateMany({
        where: { id: { in: clearable } },
        data: sched,
      });
    } else {
      await prisma.outreachTarget.updateMany({
        where: { id: { in: clearable } },
        data: sched,
      });
    }
  }
  return clearable;
}

export async function createOutreachDraftJob(args: {
  userId: string;
  market: string;
  items: CreateOutreachDraftItemInput[];
  /** Clic « Relancer rédaction » : vide les brouillons puis Contabo. */
  forceRewrite?: boolean;
}): Promise<{ jobId: string }> {
  const forceRewrite = Boolean(args.forceRewrite);
  const rawItems = args.items
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

  // Obligation : toute nouvelle rédaction d’un groupKey déjà « done »
  // = Relancer → on efface l’ancien mail et on force Contabo.
  const items: typeof rawItems = [];
  for (const it of rawItems) {
    const priorDoneCount = await prisma.castingOutreachDraftItem.count({
      where: {
        groupKey: it.groupKey,
        status: "done",
        OR: [
          { draftSubject: { not: null } },
          { draftBodyHtml: { not: null } },
        ],
      },
    });
    const mustRewrite = forceRewrite || priorDoneCount > 0;

    if (mustRewrite) {
      const cleared = await clearRewritableDraftsOnTargets(
        it.pipeline,
        it.targetIds
      );
      if (cleared.length > 0) {
        console.info(
          `[outreach-draft-job] rewrite ${it.brandName}: ${cleared.length} brouillon(s) vidés`
        );
      }
      // Invalide TOUS les items done du groupKey (même après envoi partiel).
      const wiped = await prisma.castingOutreachDraftItem.updateMany({
        where: {
          groupKey: it.groupKey,
          status: "done",
        },
        data: {
          draftSubject: null,
          draftBodyHtml: null,
        },
      });
      if (wiped.count > 0) {
        console.info(
          `[outreach-draft-job] rewrite ${it.brandName}: ${wiped.count} prior done invalidé(s)`
        );
      }
    }
    const eligible = await filterTargetIdsNeedingDraft(it.pipeline, it.targetIds);
    if (eligible.length === 0) {
      console.info(
        `[outreach-draft-job] skip create ${it.brandName}: déjà prêt/envoyé`
      );
      continue;
    }

    items.push({
      ...it,
      targetIds: eligible,
      brandResearch: mustRewrite
        ? {
            ...(it.brandResearch as object),
            _forceRewrite: true,
            _forceRewriteAt: new Date().toISOString(),
          }
        : it.brandResearch,
    });
  }

  if (items.length === 0) {
    throw new Error(
      "Aucune marque à rédiger (déjà prêt, envoyé, ou targets / talents manquants)."
    );
  }

  const market = args.market || "FR";

  // Lock TRANSACTIONNEL (pas session) : avec Prisma/pool, pg_advisory_lock
  // peut rester accroché sur une connexion → Fit bloqué après 1re marque,
  // Contabo jamais lancé. xact_lock se libère à la fin du $transaction.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OUTREACH_DRAFT_CREATE_ADVISORY_LOCK})`;
    return createOutreachDraftJobLocked(args.userId, market, items, tx);
  });
}

async function createOutreachDraftJobLocked(
  userId: string,
  market: string,
  items: Array<{
    groupKey: string;
    brandName: string;
    company: string | null;
    pipeline: string;
    targetIds: string[];
    talentIds: string[];
    brandResearch: Record<string, unknown> | object;
    rosterFits: unknown;
    sortOrder: number;
  }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any = prisma
): Promise<{ jobId: string }> {
  // Réutilise le job actif du même user/marché : évite N jobs 1-item en
  // parallèle qui saturent Gmail (Leyna) et font tout échouer.
  const active = await tx.castingOutreachDraftJob.findFirst({
    where: {
      userId,
      market,
      status: { in: ["pending", "running"] },
      cancelRequested: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      totalBrands: true,
      items: { select: { groupKey: true, status: true, sortOrder: true } },
    },
  });

  if (active) {
    const existingByKey = new Map(
      active.items.map((it: { groupKey: string; status: string; sortOrder: number }) => [it.groupKey, it] as const)
    );
    const existingKeys = new Set(
      active.items
        .filter((it: { status: string }) =>
          ["pending", "running", "done"].includes(it.status)
        )
        .map((it: { groupKey: string }) => it.groupKey)
    );
    // Si l’item est encore pending : aligne talentIds sur la sélection courante.
    const toRefresh = items.filter((it) => {
      const ex = existingByKey.get(it.groupKey) as
        | { groupKey: string; status: string; sortOrder: number }
        | undefined;
      return ex && ex.status === "pending";
    });
    for (const it of toRefresh) {
      await tx.castingOutreachDraftItem.updateMany({
        where: {
          jobId: active.id,
          groupKey: it.groupKey,
          status: "pending",
        },
        data: {
          talentIds: it.talentIds,
          targetIds: it.targetIds,
          brandResearch: it.brandResearch as object,
          rosterFits: (it.rosterFits as object | undefined) ?? undefined,
          brandName: it.brandName,
          company: it.company,
        },
      });
    }
    const maxSort = active.items.reduce(
      (m: number, it: { sortOrder: number }) =>
        Math.max(m, Number(it.sortOrder || 0)),
      -1
    );
    const toAdd = items.filter((it) => !existingKeys.has(it.groupKey));
    if (toAdd.length === 0) {
      return { jobId: active.id };
    }
    await tx.castingOutreachDraftItem.createMany({
      data: toAdd.map((it, i) => ({
        jobId: active.id,
        groupKey: it.groupKey,
        brandName: it.brandName,
        company: it.company,
        pipeline: it.pipeline,
        sortOrder: maxSort + 1 + i,
        targetIds: it.targetIds,
        talentIds: it.talentIds,
        brandResearch: it.brandResearch as object,
        rosterFits: it.rosterFits as object | undefined,
        status: "pending",
      })),
    });
    await tx.castingOutreachDraftJob.update({
      where: { id: active.id },
      data: {
        totalBrands: { increment: toAdd.length },
        status: "running",
        finishedAt: null,
        error: null,
      },
    });
    return { jobId: active.id };
  }

  const job = await tx.castingOutreachDraftJob.create({
    data: {
      userId,
      market,
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
  // Coupe Contabo marqueur par marqueur — Annuler DB ne doit plus laisser
  // Chat tourner en silence (sinon le prochain Analyser passe le verrou).
  try {
    const { cartoChatVpsCancel, cancelOrphanOutreachContaboJobs } = await import(
      "@/lib/carto-chat-vps/vps-client"
    );
    const items = await prisma.castingOutreachDraftItem.findMany({
      where: { jobId },
      select: { brandResearch: true, status: true },
    });
    for (const it of items) {
      const br = (it.brandResearch || {}) as { _vps?: { endMarker?: string } };
      const marker = String(br._vps?.endMarker || "").trim();
      if (!marker) continue;
      await cartoChatVpsCancel({ endMarker: marker, kind: "outreach" });
    }
    await cancelOrphanOutreachContaboJobs();
  } catch {
    /* soft */
  }
  return prisma.castingOutreachDraftJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      status: "cancelled",
      finishedAt: new Date(),
      currentBrandName: null,
    },
  });
}

export async function getOutreachDraftJobForUser(jobId: string, userId: string) {
  return prisma.castingOutreachDraftJob.findFirst({
    where: { id: jobId, userId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Sanitize léger pour mail HTML — ne PAS passer par sanitizePresentationExcerpt
 *  (celui-ci remplace `\` → `/` et casse `</p>`, `\<br>`, etc.). */
function sanitizeOutreachMailHtml(raw: string): string {
  // stripNotesLeak puis re-filet clôture : l’ancien pattern « Influence … »
  // coupait le pont « campagnes d'influence » et re-tronquait le mail à la sauvegarde.
  const cleaned = trimEmailHtmlEdges(
    stripForbiddenTalentBioFromHtml(
      stripNotesLeakFromMailBody(
        unescapeChatMailHtml(
          String(raw || "")
            .replace(/\u00a0/g, " ")
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
            .trim()
        )
      )
    )
  );
  return ensureOutreachCtaBoldHtml(
    ensureOutreachMailClosingHtml(cleaned, { language: "fr" })
  );
}

/** Objet = texte seul — JAMAIS le filet clôture/CTA (sinon pont+CTA collés dans l’objet). */
function sanitizeOutreachMailSubject(
  raw: string,
  brandName?: string | null
): string {
  let s = String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // Si une fuite HTML a déjà pollué l’objet, coupe avant le 1er bloc body.
    .replace(
      /\s*(?:<p>|Au-delà de cette première sélection|Est-ce que vous auriez 15|Au plaisir d['’]échanger).*$/i,
      ""
    )
    .trim();
  // Toujours normaliser au format « Marque x Glow Up — … »
  if (isFactoryOutreachSubject(s) || brandName) {
    s = rewriteFactoryOutreachSubject(s, brandName);
  }
  return s.slice(0, 90);
}

async function saveDraftOnTargets(
  pipeline: string,
  targetIds: string[],
  subject: string,
  bodyHtml: string,
  castingResearchSnapshot?: object | null,
  brandName?: string | null
) {
  // Filet final : JAMAIS persister un vieux template (même si un caller a oublié assert).
  if (isLegacyCastingOutreachTemplate(bodyHtml)) {
    throw new Error(
      "LEGACY_CASTING_TEMPLATE — refus save (media kits / moodboard / vieux CTA)."
    );
  }
  const safeSubject = sanitizeOutreachMailSubject(subject, brandName);
  const safeBody = sanitizeOutreachMailHtml(bodyHtml).slice(0, 200_000);
  if (isLegacyCastingOutreachTemplate(safeBody)) {
    throw new Error(
      "LEGACY_CASTING_TEMPLATE — refus save après sanitize."
    );
  }
  let safeSnap: object | null = null;
  if (castingResearchSnapshot) {
    try {
      safeSnap = sanitizeJsonForDb(castingResearchSnapshot) as object;
    } catch {
      safeSnap = {
        engine: "chatgpt-vps",
        savedAt: new Date().toISOString(),
        snapshotSanitized: true,
      };
    }
  }
  const data = {
    draftSubject: safeSubject,
    draftBodyHtml: safeBody,
    ...(safeSnap ? { castingResearchSnapshot: safeSnap } : {}),
  };
  try {
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
  } catch (e) {
    // Dernier filet : sauve le mail sans snapshot (souvent Leyna trop sale).
    console.warn(
      "[outreach-draft-job] save with snapshot failed, retry sans snapshot:",
      e instanceof Error ? e.message : e
    );
    const bare = { draftSubject: safeSubject, draftBodyHtml: safeBody };
    if (pipeline === "BENELUX") {
      await prisma.beneluxOutreachTarget.updateMany({
        where: { id: { in: targetIds } },
        data: bare,
      });
    } else {
      await prisma.outreachTarget.updateMany({
        where: { id: { in: targetIds } },
        data: bare,
      });
    }
  }
}

async function processOneOutreachItem(itemId: string): Promise<{
  ok: boolean;
  brandName: string;
  subject?: string;
  bodyHtml?: string;
  error?: string;
  pending?: boolean;
  skipped?: boolean;
}> {
  const item = await prisma.castingOutreachDraftItem.findUnique({
    where: { id: itemId },
  });
  if (!item) return { ok: false, brandName: "?", error: "Item manquant" };

  const brandName = item.brandName || item.company || "Marque";
  let brandResearch = (item.brandResearch || {}) as BrandResearchStore;

  // Déjà sauvé (ex. blip Neon après saveDraftOnTargets) → ne pas relancer Contabo.
  // Sauf Relancer (_forceRewrite) : on ignore tout corps déjà collé.
  const forceRewriteItem = Boolean(
    (brandResearch as { _forceRewrite?: boolean })._forceRewrite ||
      brandResearch._vps?.forceRewrite
  );
  const existingSubject = String(item.draftSubject || "").trim();
  const existingBody = String(item.draftBodyHtml || "").trim();
  if (existingSubject && existingBody && !forceRewriteItem) {
    return {
      ok: true,
      brandName,
      subject: existingSubject,
      bodyHtml: existingBody,
    };
  }

  const talentIds = item.talentIds || [];
  let targetIds = item.targetIds || [];
  if (talentIds.length === 0) {
    return { ok: false, brandName, error: "Aucun talent" };
  }
  if (targetIds.length === 0) {
    return { ok: false, brandName, error: "Aucun contact cible" };
  }

  if (await isDraftJobCancelled(item.jobId)) {
    return { ok: false, brandName, error: "Annulé" };
  }

  // Cibles d’abord : si des contacts ont encore besoin d’un mail (draft vidé /
  // reprise), on NE court-circuite PAS Contabo avec un vieux priorDone
  // (cas fascent : done en 0,4s avec l’ancien sujet pendant que Chat tournait).
  try {
    const existingOnTargets =
      item.pipeline === "BENELUX"
        ? await prisma.beneluxOutreachTarget.findMany({
            where: { id: { in: targetIds } },
            select: {
              id: true,
              status: true,
              lastSentAt: true,
              draftSubject: true,
              draftBodyHtml: true,
            },
          })
        : await prisma.outreachTarget.findMany({
            where: { id: { in: targetIds } },
            select: {
              id: true,
              status: true,
              lastSentAt: true,
              draftSubject: true,
              draftBodyHtml: true,
            },
          });

    const eligibleIds = existingOnTargets
      .filter((t) => targetNeedsOutreachDraft(t))
      .map((t) => t.id);

    if (eligibleIds.length === 0) {
      // Relancer (_forceRewrite) : JAMAIS finaliser avec un brouillon fiche
      // (même si un contact a encore l’ancien mail). Contabo obligatoire.
      if (forceRewriteItem) {
        return {
          ok: false,
          brandName,
          error:
            "FORCE_REWRITE — brouillons à réécrire mais plus de cible éligible (déjà envoyé ?).",
        };
      }
      const readyTarget = existingOnTargets.find(
        (t) =>
          String(t.draftSubject || "").trim() &&
          String(t.draftBodyHtml || "").trim()
      );
      // Mail prêt encore sur fiche (1er passage) → finalise done SANS Contabo.
      if (readyTarget) {
        return {
          ok: true,
          brandName,
          subject: String(readyTarget.draftSubject || "").trim(),
          bodyHtml: String(readyTarget.draftBodyHtml || "").trim(),
        };
      }
      // Tout envoyé / WAITING → sort du wizard, ne revient pas.
      return {
        ok: false,
        brandName,
        skipped: true,
        error: "Déjà envoyé — hors wizard",
      };
    }

    // Ne rédige que les contacts encore éligibles.
    if (eligibleIds.length !== targetIds.length) {
      targetIds = eligibleIds;
      try {
        await prisma.castingOutreachDraftItem.update({
          where: { id: item.id },
          data: { targetIds: eligibleIds },
        });
      } catch {
        /* soft */
      }
    }

    // Reprise Contabo seulement si encore besoin d’écrire.
    const existingMarker = String(brandResearch._vps?.endMarker || "").trim();
    if (existingMarker) {
      return pollOutreachVpsUntilReady({
        itemId: item.id,
        jobId: item.jobId,
        brandName,
        pipeline: item.pipeline,
        targetIds,
        brandResearch,
        endMarker: existingMarker,
        vpsStartedAt: brandResearch._vps?.startedAt || null,
      });
    }

    // Clear UNIQUEMENT les TO_RECONTACT (nouveau cycle) — jamais un mail prêt/WAITING.
    const recontactIds = existingOnTargets
      .filter(
        (t) =>
          eligibleIds.includes(t.id) &&
          String(t.status || "").toUpperCase() === "TO_RECONTACT"
      )
      .map((t) => t.id);
    if (recontactIds.length > 0) {
      try {
        await clearDraftsOnTargets(item.pipeline, recontactIds);
      } catch (e) {
        console.warn(
          "[outreach-draft-job] clear drafts recontact failed:",
          e instanceof Error ? e.message : e
        );
      }
    }
  } catch (e) {
    console.warn(
      "[outreach-draft-job] read existing drafts soft:",
      e instanceof Error ? e.message : e
    );
    // Reprise marker si le check DB a soft-fail
    const existingMarker = String(brandResearch._vps?.endMarker || "").trim();
    if (existingMarker) {
      return pollOutreachVpsUntilReady({
        itemId: item.id,
        jobId: item.jobId,
        brandName,
        pipeline: item.pipeline,
        targetIds,
        brandResearch,
        endMarker: existingMarker,
        vpsStartedAt: brandResearch._vps?.startedAt || null,
      });
    }
  }

  // 1) Contacts + talents d’abord → scan Leyna → UI immédiatement, puis rédaction.
  const talents = await prisma.talent.findMany({
    where: { id: { in: talentIds } },
    select: {
      id: true,
      prenom: true,
      nom: true,
      instagram: true,
      niches: true,
      pays: true,
      presentation: true,
      stats: {
        select: {
          igFollowers: true,
          ttFollowers: true,
          igEngagement: true,
          ttEngagement: true,
        },
      },
    },
  });
  if (talents.length === 0) {
    return { ok: false, brandName, error: "Talents introuvables" };
  }

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
            fromEmail: true,
            status: true,
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
            fromEmail: true,
            status: true,
            marqueId: true,
          },
        });

  if (targets.length === 0) {
    return { ok: false, brandName, error: "Contacts cibles introuvables" };
  }

  if (await isDraftJobCancelled(item.jobId)) {
    return { ok: false, brandName, error: "Annulé" };
  }

  // Expéditeur = propriétaire marque (assignedTo). Joey gagne TOUJOURS sur
  // fromEmail target (souvent encore leyna@ sur d’anciens contacts).
  const targetFromEmail =
    targets
      .map((t) => String(t.fromEmail || "").trim().toLowerCase())
      .find((e) => e.includes("@")) || null;

  let assigneeEmails: string[] = [];
  if (item.pipeline !== "BENELUX") {
    const marqueIds = Array.from(
      new Set(
        (
          targets as Array<{ marqueId?: string | null }>
        )
          .map((t) => String(t.marqueId || "").trim())
          .filter(Boolean)
      )
    );
    if (marqueIds.length > 0) {
      const assignees = await prisma.marque.findMany({
        where: { id: { in: marqueIds } },
        select: {
          assignedTo: { select: { email: true } },
        },
      });
      assigneeEmails = assignees
        .map((m) => String(m.assignedTo?.email || "").trim().toLowerCase())
        .filter((e) => e.includes("@"));
    }
  }

  const assigneeIsJoey = assigneeEmails.some(
    (e) => e.startsWith("joey@") || e.includes("joey@")
  );
  let fromEmail: string | null = null;
  if (assigneeIsJoey) {
    fromEmail = "joey@glowupagence.fr";
  } else if (targetFromEmail) {
    fromEmail = targetFromEmail;
  } else if (assigneeEmails[0]) {
    fromEmail = assigneeEmails[0];
  }

  const outreachStatus =
    targets.map((t) => String(t.status || "").trim()).find(Boolean) || null;
  const isJoeySender =
    Boolean(fromEmail?.startsWith("joey@")) ||
    Boolean(fromEmail && fromEmail.includes("joey"));

  // Historique Leyna = ChatGPT tour 1 (Gmail dans le browser). Plus de scan
  // API Gmail serveur ici : il bloquait toute rédaction sur un simple fetch failed.
  let leyna: Parameters<typeof slimLeynaExchange>[0];
  if (isJoeySender) {
    await prisma.castingOutreachDraftJob.update({
      where: { id: item.jobId },
      data: {
        currentBrandName: `Serveur · Joey cold A · ${brandName}`.slice(0, 80),
      },
    });
    leyna = {
      hasExchange: false,
      hasSentNoReplyOnly: false,
      tone: "vous",
      contacts: [],
      alerts: [],
      bannerLabel: "Joey · branche A cold · pas de scan Leyna",
      promptBlockFr:
        "═══ JOEY COLD A ═══\nExpéditeur Joey (nouvelle BD) — aucun échange avec ces contacts.\nBranche mail : A (cold)\nTon : vouvoiement\nAction : premier contact + intro Joey + CTA appel 15 min.",
      promptBlockEn: "",
      scanStatus: "empty",
      fetchedAt: new Date().toISOString(),
      ops: {
        relationStatus: "Joey — premier contact cold (aucune histo perso)",
        recommendedAction: "Branche A cold + intro Joey + appel 15 min",
        angle: "Cold Joey — comprendre priorités influence / castings",
        excludeTalents: [],
        alreadyPitchedTalents: [],
        doNot: [
          "Ne pas ouvrir / recycler Gmail Leyna comme échange Joey",
          "Pas de « suite à notre échange »",
          "Pas de tutoiement inventé",
        ],
        writeInstructions:
          "Branche A uniquement. Intro Joey « je viens de rejoindre le pôle BD ». CTA 15 min en gras.",
      },
    };
  } else {
    await prisma.castingOutreachDraftJob.update({
      where: { id: item.jobId },
      data: {
        currentBrandName: `Serveur · Tour 1/2 Leyna · ${brandName}`.slice(
          0,
          80
        ),
      },
    });
    leyna = {
      hasExchange: false,
      hasSentNoReplyOnly: false,
      tone: "vous",
      contacts: [],
      alerts: [],
      bannerLabel: "ChatGPT · historique Leyna (tour 1)…",
      promptBlockFr: "",
      promptBlockEn: "",
      scanStatus: "empty",
      fetchedAt: new Date().toISOString(),
      ops: null,
    };
  }

  // Joey : brief cold A. Sinon placeholder — le vrai brief vient du tour 1 Chat.
  const leynaSlim = isJoeySender
    ? slimLeynaExchange(leyna)
    : slimLeynaExchange({
        ...leyna,
        alerts: [],
        bannerLabel: "ChatGPT · historique Leyna (tour 1)…",
        ops: null,
      });
  try {
    await persistLeynaPreviewOnTargets(
      item.pipeline,
      targetIds,
      brandName,
      leynaSlim
    );
  } catch (e) {
    console.warn(
      "[outreach-draft-job] persist Leyna preview failed:",
      e instanceof Error ? e.message : e
    );
  }

  // Exclusions talents : uniquement si on a déjà un dossier contacts (post-tour 1
  // ou Joey). Plus de refus basés sur un scan Gmail API pré-Chat.
  const excludeFromLeyna = collectRecentLeynaRefusedTalents(
    leynaSlim.contacts || []
  );
  let talentsForDraft = talents;
  if (excludeFromLeyna.length > 0) {
    const kept = talents.filter(
      (t) =>
        !talentNameMatchesExclude(
          `${t.prenom || ""} ${t.nom || ""}`.trim(),
          excludeFromLeyna
        )
    );
    if (kept.length === 0) {
      return {
        ok: false,
        brandName,
        error: `Tous les talents sélectionnés sont exclus par l’historique Leyna (${excludeFromLeyna.join(", ")}). Change la sélection.`,
      };
    }
    if (kept.length < talents.length) {
      const dropped = talents
        .filter((t) => !kept.some((k) => k.id === t.id))
        .map((t) => `${t.prenom || ""} ${t.nom || ""}`.trim())
        .filter(Boolean);
      console.info(
        `[outreach-draft-job] ${brandName}: exclus via Leyna → ${dropped.join(", ")}`
      );
    }
    talentsForDraft = kept;
  }

  if (await isDraftJobCancelled(item.jobId)) {
    return { ok: false, brandName, error: "Annulé" };
  }

  const talentIdsForDraft = talentsForDraft.map((t) => t.id);

  // Marque + fit = AI en amont ; angles fit → méga-prompt Chat (pas d’appel
  // talent-research HTTP ici : deadlock / lenteur sur le tick process).
  const hasBrief = Boolean(
    String(brandResearch.newProducts || "").trim() ||
      String(brandResearch.brandPositioning || "").trim() ||
      String(brandResearch.influenceStrategy || "").trim() ||
      String(brandResearch.recentCampaigns || "").trim() ||
      String(brandResearch.availabilityFrEu || "").trim()
  );
  if (!hasBrief) {
    brandResearch = {
      recentCampaigns: "",
      newProducts: "",
      availabilityFrEu: "",
      brandPositioning: "",
      influenceStrategy: "",
    };
  }

  if (await isDraftJobCancelled(item.jobId)) {
    return { ok: false, brandName, error: "Annulé" };
  }

  const rosterFits = Array.isArray(item.rosterFits)
    ? (item.rosterFits as RosterFitItem[])
    : null;

  let talentResearch: TalentResearchItem[] = mergeAngles(
    talentsForDraft.map((t) => ({
      talentId: t.id,
      name: `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent",
      whoTheyAre: "",
      whatTheyDo: "",
      profileAnalysis: "",
      contentThemes: "",
      whyRelevant: "",
      proofPoints: "",
      suggestedAngle: "",
      castingWhyFit: "",
    })),
    rosterFits
  ).filter(
    (tr) =>
      !talentNameMatchesExclude(String(tr.name || "").trim(), excludeFromLeyna)
  );
  if (talentResearch.length === 0) {
    return { ok: false, brandName, error: "Aucun talent après exclusions Leyna" };
  }

  if (await isDraftJobCancelled(item.jobId)) {
    return { ok: false, brandName, error: "Annulé" };
  }

  // Contabo rédige toujours en FR ; EN = traduction à l’envoi (langue contact).
  const lang: "fr" | "en" = "fr";

  const composerMarket = item.pipeline === "BENELUX" ? "BENELUX" : "FR";

  if (!isOutreachChatVpsConfigured()) {
    return {
      ok: false,
      brandName,
      error:
        "OUTREACH_CHAT_VPS_URL manquant — tunnel VPS outreach (ex. port 3848)",
    };
  }

  const talentsVps = talentsForDraft.map((t) => {
    const tr = talentResearch.find(
      (r) =>
        r.talentId === t.id ||
        String(r.name || "")
          .toLowerCase()
          .trim() ===
          `${t.prenom || ""} ${t.nom || ""}`.trim().toLowerCase()
    );
    const niches = Array.isArray(t.niches)
      ? t.niches.map((n) => String(n || "").trim()).filter(Boolean)
      : [];
    const presentation = sanitizePresentationExcerpt(
      String(t.presentation || "")
    ).slice(0, 700);
    const whoFromResearch = String(tr?.whoTheyAre || "").trim();
    return {
      name: `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent",
      instagram: t.instagram || null,
      niches,
      pays: t.pays || null,
      presentation,
      igFollowers: Number(t.stats?.igFollowers || 0) || 0,
      ttFollowers: Number(t.stats?.ttFollowers || 0) || 0,
      igEngagement: Number(t.stats?.igEngagement || 0) || 0,
      ttEngagement: Number(t.stats?.ttEngagement || 0) || 0,
      // Présentation CRM prioritaire si le research casting est vide.
      whoTheyAre: whoFromResearch || presentation || "",
      whatTheyDo: tr?.whatTheyDo || "",
      profileAnalysis: tr?.profileAnalysis || "",
      contentThemes: tr?.contentThemes || "",
      whyRelevant: tr?.whyRelevant || "",
      proofPoints: tr?.proofPoints || "",
      suggestedAngle: tr?.suggestedAngle || "",
      castingWhyFit: tr?.castingWhyFit || "",
    };
  });

  const rosterAnalysis = {
    brandAnalysis: [
      String(brandResearch.brandPositioning || ""),
      String(brandResearch.influenceStrategy || ""),
    ]
      .filter(Boolean)
      .join(" · "),
    selectionLogic: "",
    talentFits: talentsVps.map((t) => ({
      name: t.name,
      priority: "",
      why:
        String(t.castingWhyFit || "").trim() ||
        String(t.whyRelevant || "").trim() ||
        String(t.suggestedAngle || "").trim() ||
        "",
    })),
  };

  const recipientEmailsForCtx = targets
    .map((t) => String(t.email || "").trim().toLowerCase())
    .filter((e) => e.includes("@"));
  const recipientSetCtx = new Set(recipientEmailsForCtx);
  const hasDirectForCtx =
    !isJoeySender &&
    Boolean(
      (leynaSlim.contacts || []).some((c) => {
        const em = String(c.email || "")
          .trim()
          .toLowerCase();
        return c.status !== "sent_no_reply" && em && recipientSetCtx.has(em);
      })
    );

  const draftContextParts = [
    isJoeySender
      ? null
      : hasDirectForCtx
        ? `ÉCHANGE DIRECT avec destinataires CRM: OUI → branche B autorisée (ancrage perso OK, faits du dossier seulement).`
        : `ÉCHANGE DIRECT avec destinataires CRM: NON → branche A ou C uniquement. INTERDIT ABSOLU: « On avait échangé », « suite à notre/nos échanges », « Je reviens vers toi/vous », tutoiement inventé. Contexte marque/agence OK sans prétendre un fil perso.`,
    leynaSlim.ops?.relationStatus
      ? `Statut relation: ${leynaSlim.ops.relationStatus}`
      : null,
    leynaSlim.ops?.recommendedAction
      ? `Action: ${leynaSlim.ops.recommendedAction}`
      : null,
    leynaSlim.ops?.angle ? `Angle: ${leynaSlim.ops.angle}` : null,
    leynaSlim.ops?.writeInstructions
      ? `Consignes: ${leynaSlim.ops.writeInstructions}`
      : null,
    (leynaSlim.ops?.excludeTalents || []).length
      ? `Exclusions: ${(leynaSlim.ops?.excludeTalents || []).join(", ")}`
      : null,
    (leynaSlim.ops?.doNot || []).length
      ? `Ne pas: ${(leynaSlim.ops?.doNot || []).join(" · ")}`
      : null,
    leynaSlim.promptBlockFr
      ? `Historique Leyna (app):\n${leynaSlim.promptBlockFr.slice(0, 14000)}`
      : null,
  ].filter(Boolean);

  await prisma.castingOutreachDraftJob.update({
    where: { id: item.jobId },
    data: {
      currentBrandName: (
        isJoeySender
          ? `Serveur · Joey cold A · ${brandName}`
          : `Serveur · Tour 1/2 Leyna · ${brandName}`
      ).slice(0, 80),
    },
  });

  // Anti-doublon FORT : réserver endMarker en base AVANT ask-async.
  // (2 ticks en parallèle — local + HTTP — ne doivent envoyer qu’1 prompt Chat.)
  const existingMarkerEarly = String(brandResearch._vps?.endMarker || "").trim();
  if (existingMarkerEarly) {
    return pollOutreachVpsUntilReady({
      itemId: item.id,
      jobId: item.jobId,
      brandName,
      pipeline: item.pipeline,
      targetIds,
      brandResearch,
      endMarker: existingMarkerEarly,
      vpsStartedAt: brandResearch._vps?.startedAt || null,
    });
  }

  const launchingAt = new Date().toISOString();
  const endMarker = createEndMarker();
  const forceRewriteRun = Boolean(
    (brandResearch as { _forceRewrite?: boolean })._forceRewrite ||
      brandResearch._vps?.forceRewrite
  );
  const claimBr: BrandResearchStore = sanitizeJsonForDb({
    ...brandResearch,
    ...(forceRewriteRun
      ? { _forceRewrite: true, _forceRewriteAt: launchingAt }
      : {}),
    _vps: {
      ...(brandResearch._vps || {}),
      endMarker,
      launchingAt,
      startedAt: launchingAt,
      leynaExchange: leynaSlim,
      talentResearch,
      joeyCold: isJoeySender,
      ...(forceRewriteRun ? { forceRewrite: true } : {}),
    },
  });

  // CAS SQL : gagne seulement si aucun endMarker n’est déjà posé.
  const claimJson = JSON.stringify(claimBr);
  const cas = await prisma.$executeRaw`
    UPDATE casting_outreach_draft_items
    SET "brandResearch" = ${claimJson}::jsonb,
        "updatedAt" = NOW()
    WHERE id = ${item.id}
      AND (
        "brandResearch"->'_vps'->>'endMarker' IS NULL
        OR TRIM(COALESCE("brandResearch"->'_vps'->>'endMarker', '')) = ''
      )
  `;
  if (Number(cas) === 0) {
    await sleep(2_000);
    const again = await prisma.castingOutreachDraftItem.findUnique({
      where: { id: item.id },
      select: { brandResearch: true },
    });
    const againBr = (again?.brandResearch || {}) as BrandResearchStore;
    const em = String(againBr._vps?.endMarker || "").trim();
    if (em) {
      return pollOutreachVpsUntilReady({
        itemId: item.id,
        jobId: item.jobId,
        brandName,
        pipeline: item.pipeline,
        targetIds,
        brandResearch: againBr,
        endMarker: em,
        vpsStartedAt: againBr._vps?.startedAt || null,
      });
    }
    return {
      ok: false,
      brandName,
      error: "VPS_PENDING",
      pending: true,
    };
  }

  let started;
  try {
    started = await startOutreachMailVps({
      brandName,
      company: item.company || null,
      market: composerMarket,
      contacts: targets.map((t) => ({
        firstname: String(t.firstname || "").trim(),
        lastname: String(t.lastname || "").trim() || null,
        email: String(t.email || "").trim(),
        language: String(t.language || "").trim() || null,
      })),
      talents: talentsVps,
      fromEmail,
      outreachStatus,
      brandResearch: {
        recentCampaigns: String(brandResearch.recentCampaigns || ""),
        newProducts: String(brandResearch.newProducts || ""),
        availabilityFrEu: String(brandResearch.availabilityFrEu || ""),
        brandPositioning: String(brandResearch.brandPositioning || ""),
        influenceStrategy: String(brandResearch.influenceStrategy || ""),
      },
      rosterAnalysis,
      draftContext: draftContextParts.join("\n") || null,
      language: lang,
      endMarker,
    });
  } catch (e) {
    return {
      ok: false,
      brandName,
      error:
        e instanceof Error
          ? e.message
          : "Impossible de lancer le serveur",
    };
  }

  const finalMarker = String(started.endMarker || endMarker).trim() || endMarker;
  const vpsStartedAt = new Date().toISOString();
  const brandResearchWithVps: BrandResearchStore = sanitizeJsonForDb({
    ...brandResearch,
    _vps: {
      endMarker: finalMarker,
      launchingAt,
      startedAt: vpsStartedAt,
      leynaExchange: leynaSlim,
      talentResearch,
      joeyCold:
        Boolean((started as { joeyCold?: boolean }).joeyCold) || isJoeySender,
    },
  });
  await prisma.castingOutreachDraftItem.update({
    where: { id: item.id },
    data: { brandResearch: brandResearchWithVps as object },
  });

  return pollOutreachVpsUntilReady({
    itemId: item.id,
    jobId: item.jobId,
    brandName,
    pipeline: item.pipeline,
    targetIds,
    brandResearch: brandResearchWithVps,
    endMarker: finalMarker,
    vpsStartedAt,
  });
}

/** Contabo = 1 marque à la fois (qualité + anti-contamination session Chat). */
export const OUTREACH_VPS_PARALLEL_DEFAULT = 1;

function outreachVpsParallelLimit(_requested?: number): number {
  // Forcé à 1 : la suivante ne démarre que quand la précédente est done/failed.
  return 1;
}

/** Un seul tick à la fois par job (évite script + HTTP + chain qui se croisent). */
const outreachTickInflight = new Map<string, Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}>>();

export async function processOutreachDraftJobTick(
  jobId: string,
  limit = OUTREACH_VPS_PARALLEL_DEFAULT
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const existing = outreachTickInflight.get(jobId);
  if (existing) {
    // Autre tick déjà en cours sur CE process → on attend sa fin, pas de 2e claim.
    return existing;
  }
  const run = processOutreachDraftJobTickUnlocked(jobId, limit).finally(() => {
    if (outreachTickInflight.get(jobId) === run) {
      outreachTickInflight.delete(jobId);
    }
  });
  outreachTickInflight.set(jobId, run);
  return run;
}

async function processOutreachDraftJobTickUnlocked(
  jobId: string,
  limit = OUTREACH_VPS_PARALLEL_DEFAULT
): Promise<{
  processed: number;
  done: boolean;
  status: string;
  currentBrandName: string | null;
}> {
  const parallel = outreachVpsParallelLimit(limit);
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
      processed: 0,
      done: true,
      status: "cancelled",
      currentBrandName: null,
    };
  }

  // 1-à-1 Contabo GLOBAL : tant qu’une marque tourne (n’importe quel job),
  // on ne claim RIEN d’autre — sinon le worker ticke N jobs → Contabo ×2/×3.
  const alreadyRunning = await prisma.castingOutreachDraftItem.findMany({
    where: { jobId, status: "running", finishedAt: null },
    orderBy: { sortOrder: "asc" },
    take: Math.max(parallel, 1),
  });
  const globalRunningElsewhere =
    alreadyRunning.length > 0
      ? 0
      : await countGlobalContaboOutreachRunning(jobId);
  const slots =
    alreadyRunning.length > 0 || globalRunningElsewhere > 0
      ? 0
      : Math.max(0, Math.min(1, parallel) - alreadyRunning.length);
  const pendings =
    slots > 0
      ? await prisma.castingOutreachDraftItem.findMany({
          where: { jobId, status: "pending" },
          orderBy: { sortOrder: "asc" },
          take: slots,
        })
      : [];

  // Claim sous lock TRANSACTIONNEL global Contabo (évite session lock + pool Prisma).
  const claimed: typeof alreadyRunning = [];
  if (pendings.length > 0) {
    const next = pendings[0]!;
    const startedAt = new Date();
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CONTABO_OUTREACH_ADVISORY_LOCK})`;
      const runningNow = await tx.castingOutreachDraftItem.count({
        where: { status: "running", finishedAt: null },
      });
      if (runningNow > 0) return [] as Array<{ id: string }>;
      return tx.$queryRaw<Array<{ id: string }>>`
        UPDATE casting_outreach_draft_items AS i
        SET
          status = 'running',
          "startedAt" = ${startedAt},
          error = NULL,
          "updatedAt" = ${startedAt}
        WHERE i.id = ${next.id}
          AND i.status = 'pending'
        RETURNING i.id
      `;
    });
    if (rows.length) {
      claimed.push({ ...next, status: "running", startedAt });
    }
  }

  const batch = [...alreadyRunning, ...claimed].slice(0, parallel);
  if (batch.length === 0) {
    const remainingEmpty = await prisma.castingOutreachDraftItem.count({
      where: { jobId, status: { in: ["pending", "running"] } },
    });
    if (remainingEmpty === 0) {
      const { completed, failed } =
        await reconcileOutreachDraftJobCounters(jobId);
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
        processed: 0,
        done: true,
        status,
        currentBrandName: null,
      };
    }
    return {
      processed: 0,
      done: false,
      status: "running",
      currentBrandName: null,
    };
  }

  const label = batch.map((b) => b.brandName).join(" · ");
  const keepAlive = await prisma.castingOutreachDraftJob.updateMany({
    where: {
      id: jobId,
      cancelRequested: false,
      status: { not: "cancelled" },
    },
    data: {
      currentBrandName: `×${batch.length} ${label}`.slice(0, 80),
      status: "running",
    },
  });
  if (keepAlive.count === 0) {
    for (const it of claimed) {
      await prisma.castingOutreachDraftItem.updateMany({
        where: { id: it.id, status: "running" },
        data: { status: "pending", startedAt: null, error: null },
      });
    }
    return {
      processed: 0,
      done: true,
      status: "cancelled",
      currentBrandName: null,
    };
  }

  let processed = 0;
  let lastBrand: string | null = batch[0]?.brandName || null;
  let cancelled = false;

  const settled = await Promise.all(
    batch.map(async (next) => {
      try {
        const result = await processOneOutreachItem(next.id);
        return { next, result, error: null as string | null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur process";
        console.error(`[outreach-draft-job] ${jobId} / ${next.brandName}:`, e);
        return { next, result: null, error: msg };
      }
    })
  );

  for (const { next, result, error } of settled) {
    if (error) {
      // Réseau Contabo / blip Neon : garder running pour le prochain tick.
      if (isSoftOutreachVpsPollError(error)) {
        console.warn(
          `[outreach-draft-job] item soft ${next.brandName}: ${error}`
        );
        try {
          await prisma.castingOutreachDraftItem.updateMany({
            where: { id: next.id, status: "running" },
            data: {
              error: "VPS_PENDING",
              // garder startedAt — budget global Contabo inchangé
            },
          });
        } catch (softWriteErr) {
          console.warn(
            `[outreach-draft-job] soft mark VPS_PENDING fail ${next.brandName}:`,
            softWriteErr instanceof Error ? softWriteErr.message : softWriteErr
          );
        }
        continue;
      }
      await cancelContaboForOutreachItem(next);
      try {
        const marked = await prisma.castingOutreachDraftItem.updateMany({
          where: {
            id: next.id,
            status: { in: ["running", "pending"] },
          },
          data: {
            status: "failed",
            finishedAt: new Date(),
            error,
          },
        });
        // Incrément seulement si on a vraiment basculé running→failed (anti ×2 ticks).
        if (marked.count > 0) {
          await prisma.castingOutreachDraftJob.update({
            where: { id: jobId },
            data: { failed: { increment: 1 } },
          });
        }
        await refreshOutreachJobCurrentBrand(jobId);
      } catch (writeErr) {
        const w = writeErr instanceof Error ? writeErr.message : String(writeErr);
        if (isSoftOutreachVpsPollError(w)) {
          console.warn(
            `[outreach-draft-job] fail-write soft ${next.brandName}: ${w}`
          );
          continue;
        }
        throw writeErr;
      }
      processed += 1;
      continue;
    }
    if (!result) continue;
    lastBrand = result.brandName;
    if (result.pending || result.error === "VPS_PENDING") {
      processed += 1;
      continue;
    }
    // Blip Neon renvoyé en result.error (pas throw) → NE PAS failed ni cancel Contabo.
    if (
      !result.ok &&
      isSoftOutreachVpsPollError(String(result.error || ""))
    ) {
      console.warn(
        `[outreach-draft-job] result soft ${next.brandName}: ${result.error}`
      );
      try {
        await prisma.castingOutreachDraftItem.updateMany({
          where: { id: next.id, status: { in: ["running", "pending"] } },
          data: { error: "VPS_PENDING", status: "running" },
        });
      } catch (softWriteErr) {
        console.warn(
          `[outreach-draft-job] result soft mark fail ${next.brandName}:`,
          softWriteErr instanceof Error ? softWriteErr.message : softWriteErr
        );
      }
      processed += 1;
      continue;
    }
    if (
      result.skipped ||
      (!result.ok &&
        /annul|déjà envoyé|hors wizard/i.test(String(result.error || "")))
    ) {
      await cancelContaboForOutreachItem(next);
      const skipMsg = result.skipped
        ? String(result.error || "Déjà envoyé — hors wizard")
        : /annul/i.test(String(result.error || ""))
          ? "Annulé"
          : String(result.error || "Hors wizard");
      await prisma.castingOutreachDraftItem.updateMany({
        where: {
          id: next.id,
          status: { in: ["running", "pending"] },
        },
        data: {
          status: "skipped",
          finishedAt: new Date(),
          brandName: result.brandName,
          error: skipMsg,
        },
      });
      await refreshOutreachJobCurrentBrand(jobId);
      if (/annul/i.test(skipMsg)) cancelled = true;
      processed += 1;
      continue;
    }
    if (result.ok) {
      const cleanSubject = sanitizeOutreachMailSubject(
        result.subject || "",
        result.brandName
      );
      try {
        await withDbRetry(`done ${next.brandName}`, async () => {
          const marked = await prisma.castingOutreachDraftItem.updateMany({
            where: {
              id: next.id,
              status: { in: ["running", "pending"] },
            },
            data: {
              status: "done",
              finishedAt: new Date(),
              brandName: result.brandName,
              draftSubject: cleanSubject || null,
              draftBodyHtml: result.bodyHtml || null,
              error: null,
            },
          });
          // Incrément seulement sur transition réelle (anti ×2 ticks concurrents).
          if (marked.count > 0) {
            await prisma.castingOutreachDraftJob.update({
              where: { id: jobId },
              data: { completed: { increment: 1 } },
            });
          }
        });
        await refreshOutreachJobCurrentBrand(jobId);
      } catch (writeErr) {
        const w = writeErr instanceof Error ? writeErr.message : String(writeErr);
        if (isSoftOutreachVpsPollError(w)) {
          // Mail déjà sur les targets — stash + retry done au prochain tick, Contabo OK.
          console.warn(
            `[outreach-draft-job] done-write soft ${next.brandName}: ${w}`
          );
          try {
            await prisma.castingOutreachDraftItem.updateMany({
              where: { id: next.id, status: "running" },
              data: {
                draftSubject: cleanSubject || null,
                draftBodyHtml: result.bodyHtml || null,
                error: "VPS_PENDING",
              },
            });
          } catch {
            /* Neon still down — targets + next tick */
          }
          continue;
        }
        throw writeErr;
      }
    } else {
      await cancelContaboForOutreachItem(next);
      try {
        const marked = await prisma.castingOutreachDraftItem.updateMany({
          where: {
            id: next.id,
            status: { in: ["running", "pending"] },
          },
          data: {
            status: "failed",
            finishedAt: new Date(),
            brandName: result.brandName,
            error: result.error || "Échec",
          },
        });
        if (marked.count > 0) {
          await prisma.castingOutreachDraftJob.update({
            where: { id: jobId },
            data: { failed: { increment: 1 } },
          });
        }
        await refreshOutreachJobCurrentBrand(jobId);
      } catch (writeErr) {
        const w = writeErr instanceof Error ? writeErr.message : String(writeErr);
        if (isSoftOutreachVpsPollError(w)) {
          console.warn(
            `[outreach-draft-job] fail-write soft ${next.brandName}: ${w}`
          );
          continue;
        }
        throw writeErr;
      }
    }
    processed += 1;
  }

  if (cancelled) {
    await reconcileOutreachDraftJobCounters(jobId);
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

  const remaining = await prisma.castingOutreachDraftItem.count({
    where: { jobId, status: { in: ["pending", "running"] } },
  });

  if (remaining === 0) {
    const { completed, failed } = await reconcileOutreachDraftJobCounters(jobId);
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

/** Chains in-process déjà actives — un kick ne doit pas en empiler une 2e. */
const outreachChainStarted = new Set<string>();

async function runInProcessChain(jobId: string): Promise<void> {
  try {
    const tick = await processOutreachDraftJobTick(
      jobId,
      OUTREACH_VPS_PARALLEL_DEFAULT
    );
    if (!tick.done) {
      setTimeout(() => {
        void runInProcessChain(jobId);
      }, 200);
    } else {
      outreachChainStarted.delete(jobId);
    }
  } catch (e) {
    outreachChainStarted.delete(jobId);
    console.warn(`[outreach-draft-job] in-process chain ${jobId}:`, e);
    kickOutreachDraftJobHttp(jobId);
  }
}

export function kickOutreachDraftJobProcess(jobId: string): void {
  if (process.env.CASTING_FIT_EXTERNAL_WORKER === "1") {
    return;
  }
  // Déjà une chaîne locale → ne pas re-kick (sinon 2e claim / Contabo parallèle).
  if (outreachTickInflight.has(jobId) || outreachChainStarted.has(jobId)) {
    return;
  }
  if (process.env.VERCEL) {
    // `after()` survit à la réponse HTTP ; un `void fetch` est souvent tué
    // avant d’atteindre /process → jobs coincés en pending 0/N.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { after } = require("next/server") as typeof import("next/server");
      after(() => {
        kickOutreachDraftJobHttp(jobId);
      });
    } catch {
      kickOutreachDraftJobHttp(jobId);
    }
    return;
  }
  outreachChainStarted.add(jobId);
  setTimeout(() => {
    void runInProcessChain(jobId);
  }, 50);
}
