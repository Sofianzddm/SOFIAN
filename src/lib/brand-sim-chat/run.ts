/**
 * Orchestration Simulateur marque ↔ Chat VPS (kind carto).
 */

import prisma from "@/lib/prisma";
import {
  answerHasEndMarker,
  stripEndMarker,
} from "@/lib/carto-chat-vps/end-marker";
import {
  cartoChatVpsAskAsync,
  cartoChatVpsHealth,
  cartoChatVpsReadLast,
  isCartoChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import { isBrandSimChatVpsJob } from "@/lib/carto-chat-vps/job-kind";
import {
  loadCrmTalent,
  uniqueCollabLabels,
  type CrmTalent,
} from "@/lib/talent-research-core";
import {
  buildBrandSimChatPrompt,
  normalizeMomentContext,
} from "@/lib/brand-sim-chat/prompt";
import {
  structureBrandSimAnswer,
  type BrandSimStructured,
  type BrandSimStructuredBrand,
} from "@/lib/brand-sim-chat/structure";

async function enrichTalentPastBrands(talent: CrmTalent): Promise<string[]> {
  const fromCrm = uniqueCollabLabels(talent, 40);
  const moreCollabs = await prisma.collaboration.findMany({
    where: { talentId: talent.id },
    select: { marque: { select: { nom: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const names = [
    ...fromCrm,
    ...moreCollabs.map((c) => String(c.marque?.nom || "").trim()),
  ].filter(Boolean);
  return Array.from(new Set(names));
}

function answerMentionsTalent(answer: string, talentName: string): boolean {
  const a = answer.toLowerCase().replace(/\s+/g, " ");
  const parts = talentName
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  if (parts.length === 0) return true;
  // Au moins le prénom OU le nom complet compact
  if (parts.some((p) => a.includes(p))) return true;
  const compact = parts.join("");
  return a.replace(/\s+/g, "").includes(compact);
}

export async function startBrandSimChat(opts: {
  talentId: string;
  momentContext?: string | null;
}): Promise<{
  ok: true;
  started: true;
  talentId: string;
  talentName: string;
  startedAt: number;
  promptPreview: string;
  endMarker: string;
  momentContext: string | null;
}> {
  if (!isCartoChatVpsConfigured()) {
    throw new Error(
      "CARTO_CHAT_VPS_URL manquant — tunnel SSH vers le worker VPS (port 3847)"
    );
  }
  const talent = await loadCrmTalent(opts.talentId);
  if (!talent) {
    throw Object.assign(new Error("Talent introuvable."), { status: 404 });
  }
  const pastBrands = await enrichTalentPastBrands(talent);
  const momentContext = normalizeMomentContext(opts.momentContext) || null;
  const { prompt, endMarker, talentName } = buildBrandSimChatPrompt({
    talent,
    pastBrands,
    momentContext,
  });

  const started = await cartoChatVpsAskAsync({
    prompt,
    timeoutMs: 540_000,
    endMarker,
    kind: "carto",
  });

  return {
    ok: true,
    started: true,
    talentId: talent.id,
    talentName,
    startedAt: started.startedAt,
    promptPreview: started.promptPreview,
    endMarker,
    momentContext,
  };
}

export async function brandSimChatHealth(): Promise<Record<string, unknown>> {
  if (!isCartoChatVpsConfigured()) {
    return {
      configured: false,
      ok: false,
      error:
        "CARTO_CHAT_VPS_URL manquant — ex: http://127.0.0.1:3847 via tunnel SSH",
    };
  }
  const health = await cartoChatVpsHealth({ kind: "carto" });
  const jobs = Array.isArray((health as { jobs?: unknown[] }).jobs)
    ? ((health as { jobs: Array<Record<string, unknown>> }).jobs || []).filter(
        (j) =>
          isBrandSimChatVpsJob({
            promptPreview: String(j.promptPreview || ""),
            companyHint: String(j.companyHint || ""),
            kind: String(j.kind || ""),
          })
      )
    : [];
  return { configured: true, ...health, jobs };
}

export type BrandSimPreviewResult = {
  talent: {
    id: string;
    name: string;
    niches: string[];
    sports: string[];
    photo: string | null;
    instagram: string | null;
  };
  momentContext: string | null;
  chatAnswer: string;
  profile: {
    whoTheyAre: string;
    whatTheyDo: string;
    profileAnalysis: string;
    contentThemes: string;
    proofPoints: string;
    sourcesUsed: string;
    brandUniverseHints: string;
    detectedMoments: string;
  };
  pastBrands: string[];
  brands: BrandSimStructuredBrand[];
  meta: Record<string, unknown>;
};

export async function runBrandSimReadScreen(opts: {
  talentId: string;
  endMarker?: string | null;
  momentContext?: string | null;
  limit?: number;
}): Promise<BrandSimPreviewResult> {
  const started = Date.now();
  const talent = await loadCrmTalent(opts.talentId);
  if (!talent) {
    throw Object.assign(new Error("Talent introuvable."), { status: 404 });
  }
  const talentName = `${talent.prenom} ${talent.nom}`.trim();
  const pastBrands = await enrichTalentPastBrands(talent);
  const momentContext = normalizeMomentContext(opts.momentContext) || null;
  const expected = opts.endMarker?.trim() || null;

  const read = await cartoChatVpsReadLast(
    expected
      ? { endMarker: expected, kind: "carto" }
      : { kind: "carto" }
  );
  const raw = read.answer || "";
  if (expected && !answerHasEndMarker(raw, expected)) {
    throw new Error(
      "Réponse encore ancienne (marker manquant) — attente du fil en cours"
    );
  }
  const answer = stripEndMarker(raw, expected);
  if (!answer || answer.length < 200) {
    throw new Error("Réponse Chat trop courte — relance ou attends encore");
  }
  if (!answerMentionsTalent(answer, talentName)) {
    throw new Error(
      `La réponse à l'écran ne mentionne pas ${talentName} — autre fil / relance`
    );
  }

  const structured: BrandSimStructured = await structureBrandSimAnswer({
    talent,
    talentName,
    chatAnswer: answer,
    pastBrands,
    limit: opts.limit,
  });

  if (!structured.brands.length) {
    throw new Error(
      "Réponse lue mais 0 marque extraite — relance le classement ou Chat"
    );
  }

  const photoRow = await prisma.talent.findUnique({
    where: { id: talent.id },
    select: { photo: true },
  });

  return {
    talent: {
      id: talent.id,
      name: talentName,
      niches: talent.niches,
      sports: talent.sports,
      photo: photoRow?.photo || null,
      instagram: talent.instagram,
    },
    momentContext,
    chatAnswer: answer,
    profile: {
      whoTheyAre: structured.whoTheyAre,
      whatTheyDo: structured.whatTheyDo,
      profileAnalysis: structured.profileAnalysis || structured.profileSummary,
      contentThemes: structured.contentThemes,
      proofPoints: "",
      sourcesUsed: "Analyse web",
      brandUniverseHints: structured.brandUniverseHints,
      detectedMoments: structured.detectedMoments,
    },
    pastBrands,
    brands: structured.brands,
    meta: {
      model: "brand-sim-vps",
      usedWebSearch: true,
      elapsedMs: Date.now() - started,
      brandCount: structured.brands.length,
      hasMomentContext: Boolean(momentContext),
      endMarker: expected,
    },
  };
}
