/**
 * Orchestration ChatGPT VPS — analyse roster priorité (start async + read).
 */

import {
  cartoChatVpsAskAsync,
  cartoChatVpsHealth,
  cartoChatVpsReadLast,
  isCartoChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import {
  answerHasEndMarker,
  appendEndMarkerInstruction,
  stripEndMarker,
} from "@/lib/carto-chat-vps/end-marker";
import {
  buildOutreachRosterVpsPrompt,
  type OutreachRosterVpsPromptInput,
} from "@/lib/outreach-roster-vps/prompt";
import {
  parseOutreachRosterVpsAnswer,
  pickAutoSelectTalentIds,
} from "@/lib/outreach-roster-vps/parse";
import {
  answerMatchesBrand,
  jobMatchesBrand,
} from "@/lib/outreach-vps-brand-match";

export async function startOutreachRosterVps(
  input: OutreachRosterVpsPromptInput
) {
  if (!isCartoChatVpsConfigured()) {
    throw new Error(
      "CARTO_CHAT_VPS_URL manquant — lance le tunnel scripts/carto-chat-vps/tunnel.sh"
    );
  }
  if (!input.talents?.length) {
    throw new Error("Roster vide — charge des talents d’abord");
  }
  const basePrompt = buildOutreachRosterVpsPrompt(input);
  const { prompt, endMarker } = appendEndMarkerInstruction(basePrompt);
  const started = await cartoChatVpsAskAsync({
    prompt,
    timeoutMs: 540_000,
    endMarker,
    // Medium — carto reste High (pas d’effortLevel)
    effortLevel: 2,
    kind: "outreach",
  });
  return {
    ok: true as const,
    started: true as const,
    brandName: input.brandName,
    startedAt: started.startedAt,
    promptPreview: started.promptPreview,
    endMarker: started.endMarker || endMarker,
  };
}

/** Récupère la dernière analyse roster déjà capturée (done / erreur salvageable). */
export async function recoverLatestOutreachRosterVps(opts: {
  brandName: string;
}) {
  const brand = opts.brandName.trim();
  if (!brand) return { ready: false as const, recovered: false as const };

  const health = await cartoChatVpsHealth();
  const candidates = (health.jobs || [])
    .filter((j) => {
      const prev = String(j.promptPreview || "");
      if (!/head of casting|analyses le roster|PRIORITY|MARQUE À ANALYSER/i.test(prev)) {
        return false;
      }
      // STRICT : sinon on réinjecte Mercedes sur Volkswagen
      if (!jobMatchesBrand(j, brand)) return false;
      const chars = Number(j.answerChars) || 0;
      if (chars < 800) return false;
      if (j.state === "done" || j.hasCertifiedAnswer) return true;
      if (
        j.state === "error" &&
        /Capture non certifiée|ancrages|echo|recopié/i.test(
          String(j.error || "")
        )
      ) {
        return true;
      }
      // Réponse longue déjà là même si encore « running »
      return chars >= 4000 && Boolean(j.endMarker);
    })
    .sort(
      (a, b) =>
        Number(b.finishedAt || b.startedAt || 0) -
        Number(a.startedAt || 0)
    );

  for (const job of candidates) {
    const endMarker = String(job.endMarker || "").trim();
    if (!endMarker) continue;
    try {
      const ready = await readOutreachRosterVps({
        brandName: brand,
        endMarker,
      });
      if (ready.ready) {
        const blob = `${ready.notes || ""}\n${ready.recap?.brandAnalysis || ""}\n${ready.chatAnswer || ""}`;
        if (!answerMatchesBrand(blob, brand)) continue;
        return { ...ready, recovered: true as const };
      }
    } catch {
      /* next candidate */
    }
  }
  return { ready: false as const, recovered: false as const };
}

export async function readOutreachRosterVps(opts: {
  brandName: string;
  endMarker: string;
}) {
  const expected = opts.endMarker.trim();
  if (!expected) throw new Error("endMarker requis");

  const health = await cartoChatVpsHealth();
  const job = (health.jobs || []).find(
    (j) => String(j.endMarker || "") === expected
  );

  const tryParseReady = async () => {
    const read = await cartoChatVpsReadLast({ endMarker: expected });
    const raw = read.answer || "";
    if (!answerHasEndMarker(raw, expected)) return null;
    try {
      const parsed = parseOutreachRosterVpsAnswer(raw, expected);
      const autoSelectIds = pickAutoSelectTalentIds(parsed.items);
      return {
        ready: true as const,
        brandName: opts.brandName,
        items: parsed.items,
        autoSelectIds,
        notes: parsed.notes,
        recap: parsed.recap,
        chatAnswer: stripEndMarker(raw, expected),
      };
    } catch {
      return null;
    }
  };

  if (job?.state === "error") {
    const salvaged = await tryParseReady();
    if (salvaged) return salvaged;
    throw new Error(job.error || "Job Chat en erreur");
  }
  if (job && job.state !== "done" && !job.hasCertifiedAnswer) {
    if ((job.answerChars || 0) >= 500) {
      const salvaged = await tryParseReady();
      if (salvaged) return salvaged;
    }
    return {
      ready: false as const,
      state: job.state || "running",
      answerChars: job.answerChars || 0,
    };
  }

  const ready = await tryParseReady();
  if (ready) return ready;
  return {
    ready: false as const,
    state: "waiting_marker",
    answerChars: job?.answerChars || 0,
  };
}
