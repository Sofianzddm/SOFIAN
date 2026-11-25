/**
 * Orchestration Chat VPS — marques à contacter (Cannes Partenaires).
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
import { isCannesBrandsChatVpsJob } from "@/lib/carto-chat-vps/job-kind";
import { CANNES_PARTENAIRES_SLUG } from "@/lib/cannes-partenaires/constants";
import {
  buildCannesBrandsResearchPrompt,
  normalizeCannesBrandsFocus,
} from "@/lib/cannes-partenaires/brands-prompt";
import {
  structureCannesBrandsAnswer,
  type CannesBrandsStructured,
} from "@/lib/cannes-partenaires/brands-structure";

async function loadPipelineBrandNames(): Promise<string[]> {
  const projet = await prisma.projetEvenement.findUnique({
    where: { slug: CANNES_PARTENAIRES_SLUG },
    select: { id: true },
  });
  if (!projet) return [];
  const opps = await prisma.opportuniteMarque.findMany({
    where: { projetId: projet.id },
    select: { nomMarque: true },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
  return opps.map((o) => o.nomMarque).filter(Boolean);
}

export async function startCannesBrandsChat(opts: {
  focus?: string | null;
}): Promise<{
  ok: true;
  started: true;
  startedAt: number;
  promptPreview: string;
  endMarker: string;
  focus: string | null;
}> {
  if (!isCartoChatVpsConfigured()) {
    throw new Error("Service d’analyse non configuré");
  }
  const focus = normalizeCannesBrandsFocus(opts.focus) || null;
  const alreadyInPipeline = await loadPipelineBrandNames();
  const { prompt, endMarker } = buildCannesBrandsResearchPrompt({
    focus,
    alreadyInPipeline,
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
    startedAt: started.startedAt,
    promptPreview: started.promptPreview,
    endMarker,
    focus,
  };
}

export async function cannesBrandsChatHealth(): Promise<Record<string, unknown>> {
  if (!isCartoChatVpsConfigured()) {
    return {
      configured: false,
      ok: false,
      error: "Service d’analyse non configuré",
    };
  }
  const health = await cartoChatVpsHealth({ kind: "carto" });
  const jobs = Array.isArray((health as { jobs?: unknown[] }).jobs)
    ? ((health as { jobs: Array<Record<string, unknown>> }).jobs || []).filter(
        (j) =>
          isCannesBrandsChatVpsJob({
            promptPreview: String(j.promptPreview || ""),
            companyHint: String(j.companyHint || ""),
            kind: String(j.kind || "carto"),
          })
      )
    : [];
  return { configured: true, ...health, jobs };
}

export async function runCannesBrandsReadScreen(opts: {
  endMarker?: string;
  focus?: string | null;
  limit?: number;
}): Promise<{
  ok: true;
  chatAnswer: string;
  structured: CannesBrandsStructured;
  focus: string | null;
  endMarker: string | null;
}> {
  if (!isCartoChatVpsConfigured()) {
    throw new Error("Service d’analyse non configuré");
  }

  const expected = opts.endMarker?.trim() || null;
  const read = await cartoChatVpsReadLast(
    expected ? { endMarker: expected, kind: "carto" } : { kind: "carto" }
  );
  const raw = String(read.answer || "").trim();
  if (expected && !answerHasEndMarker(raw, expected)) {
    throw Object.assign(
      new Error(
        "Réponse encore ancienne (marker manquant) — attente du fil en cours"
      ),
      { status: 409 }
    );
  }
  const chatAnswer = stripEndMarker(raw, expected || undefined);
  if (!chatAnswer || chatAnswer.length < 200) {
    throw Object.assign(
      new Error("Réponse Chat trop courte — relance ou attends encore"),
      { status: 409 }
    );
  }

  const structured = await structureCannesBrandsAnswer({
    chatAnswer,
    limit: opts.limit,
  });
  if (!structured.brands.length) {
    throw new Error(
      "Réponse lue mais 0 marque extraite — relance le classement ou Chat"
    );
  }

  return {
    ok: true,
    chatAnswer,
    structured,
    focus: normalizeCannesBrandsFocus(opts.focus) || null,
    endMarker: expected,
  };
}
