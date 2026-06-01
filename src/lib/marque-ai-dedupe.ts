import OpenAI from "openai";
import prisma from "@/lib/prisma";
import { mergeMarques } from "@/lib/marque-merge";
import {
  type DedupeGroup,
  type MarqueDedupeRow,
  detectAllCandidateGroups,
  groupMemberKey,
  loadMarquesForDedupe,
  marqueActivityScore,
  pairKey,
  sortMarquesByScore,
} from "@/lib/marque-fuzzy-detect";
import type { MarqueDedupeVerdict, MarqueDedupeSuggestionStatus } from "@prisma/client";

export type AiDedupeVerdict = "MERGE" | "KEEP_SEPARATE" | "NEEDS_REVIEW";

export type AiGroupAnalysis = {
  verdict: AiDedupeVerdict;
  confidence: number;
  reason: string;
  targetMarqueId: string | null;
  sourceMarqueIds: string[];
};

export type MarqueDedupeJobOptions = {
  dryRun?: boolean;
  autoMerge?: boolean;
  fuzzyThreshold?: number;
  maxGroups?: number;
  runId?: string;
};

export type MarqueDedupeJobResult = {
  runId: string;
  dryRun: boolean;
  autoMerge: boolean;
  analyzed: number;
  skipped: number;
  autoMerged: number;
  pendingReview: number;
  discarded: number;
  errors: string[];
};

const DEFAULT_AUTO_THRESHOLD = 0.95;
const DEFAULT_REVIEW_THRESHOLD = 0.7;
const MAX_COLLABS_FOR_AUTO_SOURCE = 3;
const MAX_CONTACTS_FOR_AUTO_SOURCE = 5;

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return v === "1" || v.toLowerCase() === "true";
}

function envFloat(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (!v) return defaultValue;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : defaultValue;
}

export function getMarqueDedupeJobConfig(overrides: MarqueDedupeJobOptions = {}) {
  const dryRun = overrides.dryRun ?? envBool("MARQUE_DEDUPE_AI_DRY_RUN", true);
  const autoMergeEnv = envBool("MARQUE_DEDUPE_AI_AUTO_MERGE", false);
  const autoMerge = overrides.autoMerge ?? (!dryRun && autoMergeEnv);

  return {
    dryRun,
    autoMerge,
    fuzzyThreshold: overrides.fuzzyThreshold ?? envFloat("MARQUE_DEDUPE_AI_FUZZY_THRESHOLD", 0.78),
    maxGroups: overrides.maxGroups ?? Math.min(50, envFloat("MARQUE_DEDUPE_AI_MAX_GROUPS", 40)),
    autoThreshold: envFloat("MARQUE_DEDUPE_AI_AUTO_THRESHOLD", DEFAULT_AUTO_THRESHOLD),
    reviewThreshold: envFloat("MARQUE_DEDUPE_AI_REVIEW_THRESHOLD", DEFAULT_REVIEW_THRESHOLD),
    runId: overrides.runId ?? `cron-${new Date().toISOString().slice(0, 10)}-${Date.now()}`,
  };
}

function buildPrompt(group: DedupeGroup): string {
  const lines = group.marques.map((m) => {
    const c = m.counts;
    return `- id=${m.id} | nom="${m.nom}" | slug=${m.slug} | secteur=${m.secteur ?? "—"} | collabs=${c.collaborations} | negos=${c.negociations} | inbounds=${c.inboundOpportunities} | missions=${c.contactMissions} | contacts=${c.contacts}`;
  });

  return `Tu es expert CRM pour une agence d'influence (Glow Up). Analyse si ces fiches "marque" doivent être UNE seule entité client ou des entités distinctes.

Règles :
- MERGE : même marque mère (typos, variantes produit "Avène - SPF50" → Avène, filiales sans distinction juridique, annotations entre parenthèses).
- KEEP_SEPARATE : divisions distinctes (ex: "Chanel" vs "Chanel Beauty", "Burberry" vs "Burberry Beauty"), marques différentes malgré nom proche.
- NEEDS_REVIEW : doute raisonnable.

Si MERGE : targetMarqueId = fiche à CONSERVER (nom le plus canonique / plus d'activité), sourceMarqueIds = les autres ids à fusionner dedans.
confidence : 0.0 à 1.0 (sois conservateur).
reason : une phrase en français.

Réponds UNIQUEMENT en JSON valide :
{"verdict":"MERGE"|"KEEP_SEPARATE"|"NEEDS_REVIEW","confidence":0.95,"reason":"...","targetMarqueId":"id ou null","sourceMarqueIds":["id1"]}

Fiches :
${lines.join("\n")}`;
}

function parseAiResponse(raw: string, group: DedupeGroup): AiGroupAnalysis {
  const fallback: AiGroupAnalysis = {
    verdict: "NEEDS_REVIEW",
    confidence: 0.5,
    reason: "Réponse IA invalide — revue manuelle requise.",
    targetMarqueId: group.marques[0]?.id ?? null,
    sourceMarqueIds: group.marques.slice(1).map((m) => m.id),
  };

  try {
    const json = JSON.parse(raw) as {
      verdict?: string;
      confidence?: number;
      reason?: string;
      targetMarqueId?: string | null;
      sourceMarqueIds?: string[];
    };

    const verdict = json.verdict as AiDedupeVerdict;
    if (!["MERGE", "KEEP_SEPARATE", "NEEDS_REVIEW"].includes(verdict)) return fallback;

    const ids = new Set(group.marques.map((m) => m.id));
    let target = json.targetMarqueId && ids.has(json.targetMarqueId) ? json.targetMarqueId : null;
    let sources = (json.sourceMarqueIds || []).filter((id) => ids.has(id) && id !== target);

    if (verdict === "MERGE") {
      if (!target) {
        const sorted = sortMarquesByScore([...group.marques]);
        target = sorted[0]?.id ?? null;
        sources = sorted.slice(1).map((m) => m.id);
      } else {
        sources = group.marques.map((m) => m.id).filter((id) => id !== target);
      }
    } else {
      sources = [];
      target = null;
    }

    const confidence = Math.max(0, Math.min(1, Number(json.confidence) || 0.5));

    return {
      verdict,
      confidence,
      reason: String(json.reason || "").slice(0, 2000) || fallback.reason,
      targetMarqueId: target,
      sourceMarqueIds: sources,
    };
  } catch {
    return fallback;
  }
}

export async function analyzeGroupWithAi(
  group: DedupeGroup,
  apiKey: string
): Promise<AiGroupAnalysis> {
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildPrompt(group) }],
    max_tokens: 300,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || "";
  return parseAiResponse(raw, group);
}

function heuristicAnalysis(group: DedupeGroup): AiGroupAnalysis {
  const sorted = sortMarquesByScore([...group.marques]);
  if (group.reason === "EXACT") {
    return {
      verdict: "MERGE",
      confidence: 0.99,
      reason: "Doublon exact (même slug normalisé).",
      targetMarqueId: sorted[0]?.id ?? null,
      sourceMarqueIds: sorted.slice(1).map((m) => m.id),
    };
  }
  if (group.reason === "TYPO") {
    return {
      verdict: "MERGE",
      confidence: 0.88,
      reason: "Typo / faute d'orthographe probable entre les slugs.",
      targetMarqueId: sorted[0]?.id ?? null,
      sourceMarqueIds: sorted.slice(1).map((m) => m.id),
    };
  }
  return {
    verdict: "NEEDS_REVIEW",
    confidence: 0.65,
    reason: "Variante proche — validation humaine recommandée.",
    targetMarqueId: sorted[0]?.id ?? null,
    sourceMarqueIds: sorted.slice(1).map((m) => m.id),
  };
}

async function loadBlockedPairKeys(): Promise<Set<string>> {
  const decisions = await prisma.marqueDedupeDecision.findMany({
    where: { verdict: "KEEP_SEPARATE" },
    select: { pairKey: true },
  });
  return new Set(decisions.map((d) => d.pairKey));
}

function groupHasBlockedPair(group: DedupeGroup, blocked: Set<string>): boolean {
  const ids = group.marques.map((m) => m.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (blocked.has(pairKey(ids[i], ids[j]))) return true;
    }
  }
  return false;
}

async function upsertPairDecisions(
  ids: string[],
  verdict: MarqueDedupeVerdict,
  source: string,
  reasoning?: string
) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pk = pairKey(ids[i], ids[j]);
      await prisma.marqueDedupeDecision.upsert({
        where: { pairKey: pk },
        create: {
          pairKey: pk,
          marqueIdA: ids[i],
          marqueIdB: ids[j],
          verdict,
          source,
          reasoning,
        },
        update: { verdict, source, reasoning },
      });
    }
  }
}

function canAutoMergeSource(source: MarqueDedupeRow): boolean {
  return (
    source.counts.collaborations <= MAX_COLLABS_FOR_AUTO_SOURCE &&
    source.counts.contacts <= MAX_CONTACTS_FOR_AUTO_SOURCE
  );
}

function resolveFinalStatus(
  analysis: AiGroupAnalysis,
  config: ReturnType<typeof getMarqueDedupeJobConfig>
): { verdict: MarqueDedupeVerdict; status: MarqueDedupeSuggestionStatus } {
  if (analysis.confidence < config.reviewThreshold) {
    return { verdict: "NEEDS_REVIEW", status: "DISCARDED" };
  }
  if (analysis.verdict === "KEEP_SEPARATE") {
    return { verdict: "KEEP_SEPARATE", status: "DISCARDED" };
  }
  if (analysis.verdict === "NEEDS_REVIEW") {
    return { verdict: "NEEDS_REVIEW", status: "PENDING" };
  }
  if (analysis.confidence >= config.autoThreshold) {
    return { verdict: "MERGE", status: "PENDING" };
  }
  return { verdict: "MERGE", status: "PENDING" };
}

export async function runMarqueDedupeAiJob(
  options: MarqueDedupeJobOptions = {}
): Promise<MarqueDedupeJobResult> {
  const config = getMarqueDedupeJobConfig(options);
  const apiKey = process.env.OPENAI_API_KEY;

  const result: MarqueDedupeJobResult = {
    runId: config.runId,
    dryRun: config.dryRun,
    autoMerge: config.autoMerge,
    analyzed: 0,
    skipped: 0,
    autoMerged: 0,
    pendingReview: 0,
    discarded: 0,
    errors: [],
  };

  const rows = await loadMarquesForDedupe(prisma);
  const groups = detectAllCandidateGroups(rows, config.fuzzyThreshold).slice(0, config.maxGroups);
  const blockedPairs = await loadBlockedPairKeys();

  const recentPending = await prisma.marqueDedupeSuggestion.findMany({
    where: {
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { marqueIds: true },
  });
  const pendingMemberKeys = new Set(
    recentPending.map((s) => groupMemberKey(s.marqueIds))
  );

  for (const group of groups) {
    if (groupHasBlockedPair(group, blockedPairs)) {
      result.skipped++;
      continue;
    }

    const memberKey = groupMemberKey(group.marques.map((m) => m.id));
    if (pendingMemberKeys.has(memberKey)) {
      result.skipped++;
      continue;
    }

    let analysis: AiGroupAnalysis;
    try {
      if (apiKey && group.reason !== "EXACT") {
        analysis = await analyzeGroupWithAi(group, apiKey);
      } else {
        analysis = heuristicAnalysis(group);
      }
      result.analyzed++;
    } catch (e) {
      result.errors.push(
        `${group.key}: ${e instanceof Error ? e.message : "erreur IA"}`
      );
      analysis = heuristicAnalysis(group);
      result.analyzed++;
    }

    const { verdict } = resolveFinalStatus(analysis, config);
    let status: MarqueDedupeSuggestionStatus = "PENDING";
    let mergedAt: Date | null = null;

    const snapshot = group.marques.map((m) => ({
      id: m.id,
      nom: m.nom,
      slug: m.slug,
      secteur: m.secteur,
      counts: m.counts,
      score: marqueActivityScore(m),
    }));

    const targetId = analysis.targetMarqueId;
    const sourceIds = analysis.sourceMarqueIds;

    if (verdict === "KEEP_SEPARATE") {
      await upsertPairDecisions(
        group.marques.map((m) => m.id),
        "KEEP_SEPARATE",
        "AI_CRON",
        analysis.reason
      );
      status = "DISCARDED";
      result.discarded++;
    } else if (
      analysis.confidence < config.reviewThreshold &&
      verdict !== "MERGE"
    ) {
      status = "DISCARDED";
      result.discarded++;
    } else if (verdict === "NEEDS_REVIEW") {
      status = "PENDING";
      result.pendingReview++;
    } else if (verdict === "MERGE") {
      const shouldAutoMerge =
        config.autoMerge &&
        !config.dryRun &&
        analysis.confidence >= config.autoThreshold &&
        targetId &&
        sourceIds.length > 0 &&
        sourceIds.every((sid) => {
          const src = group.marques.find((m) => m.id === sid);
          return src ? canAutoMergeSource(src) : false;
        });

      if (shouldAutoMerge && targetId) {
        try {
          for (const sid of sourceIds) {
            await mergeMarques(targetId, sid);
          }
          status = "AUTO_MERGED";
          mergedAt = new Date();
          result.autoMerged += sourceIds.length;
          await upsertPairDecisions(
            [targetId, ...sourceIds],
            "MERGE",
            "AI_CRON",
            analysis.reason
          );
        } catch (e) {
          result.errors.push(
            `merge ${group.key}: ${e instanceof Error ? e.message : "erreur"}`
          );
          status = "PENDING";
          result.pendingReview++;
        }
      } else {
        status = "PENDING";
        result.pendingReview++;
      }
    }

    await prisma.marqueDedupeSuggestion.create({
      data: {
        runId: config.runId,
        groupKey: group.key,
        marquesSnapshot: snapshot,
        marqueIds: group.marques.map((m) => m.id),
        verdict,
        confidence: analysis.confidence,
        reasoning: analysis.reason,
        recommendedTargetId: targetId,
        recommendedSourceIds: sourceIds,
        status,
        dryRun: config.dryRun,
        mergedAt,
      },
    });
  }

  return result;
}

export async function approveDedupeSuggestion(
  suggestionId: string,
  reviewedBy?: string
): Promise<void> {
  const suggestion = await prisma.marqueDedupeSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion) throw new Error("Suggestion introuvable");
  if (suggestion.status !== "PENDING") {
    throw new Error("Cette suggestion n'est plus en attente.");
  }

  const targetId = suggestion.recommendedTargetId;
  const sourceIds = suggestion.recommendedSourceIds;
  if (!targetId || sourceIds.length === 0) {
    throw new Error("Cible ou sources manquantes pour la fusion.");
  }

  for (const sid of sourceIds) {
    await mergeMarques(targetId, sid);
  }

  await upsertPairDecisions(
    [targetId, ...sourceIds],
    "MERGE",
    "HUMAN_UI",
    suggestion.reasoning
  );

  await prisma.marqueDedupeSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: "APPROVED",
      mergedAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: reviewedBy ?? null,
    },
  });
}

export async function rejectDedupeSuggestion(
  suggestionId: string,
  reviewedBy?: string
): Promise<void> {
  const suggestion = await prisma.marqueDedupeSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion) throw new Error("Suggestion introuvable");

  await upsertPairDecisions(
    suggestion.marqueIds,
    "KEEP_SEPARATE",
    "HUMAN_UI",
    "Rejeté par un administrateur"
  );

  await prisma.marqueDedupeSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: reviewedBy ?? null,
    },
  });
}
