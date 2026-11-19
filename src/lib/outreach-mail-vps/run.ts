/**
 * Orchestration ChatGPT VPS outreach — post fit :
 * Tour 1 High = Gmail Leyna (alertes + tu/vous).
 * Tour 2 High = web marque + mail 10/10.
 * Poll jusqu’au CODE DE FIN du tour 2 → parse mail.
 */

import {
  cartoChatVpsAskAsync,
  cartoChatVpsHealth,
  cartoChatVpsReadLast,
  isOutreachChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import {
  answerHasEndMarker,
  appendEndMarkerInstruction,
  stripEndMarker,
} from "@/lib/carto-chat-vps/end-marker";
import {
  buildOutreachLeynaStepPrompt,
  buildOutreachMailStepPrompt,
  isJoeySender,
  type OutreachMailVpsPromptInput,
} from "@/lib/outreach-mail-vps/prompt";
import { parseOutreachMailVpsAnswer } from "@/lib/outreach-mail-vps/parse";
import { structureOutreachMailAnswer } from "@/lib/outreach-mail-vps/structure";
import {
  answerMatchesBrand,
  jobMatchesBrand,
} from "@/lib/outreach-vps-brand-match";

export type OutreachMailStructureOpts = {
  joey?: boolean;
  language?: "fr" | "en";
  talentNames?: string[];
};

/** High · Leyna + mail — marge large. */
const OUTREACH_PIPELINE_TIMEOUT_MS = 1_200_000;

/** Récupère le dernier mail BD déjà capturé (done / salvageable). */
export async function recoverLatestOutreachMailVps(opts: {
  brandName: string;
}) {
  const brand = opts.brandName.trim();
  if (!brand) return { ready: false as const, recovered: false as const };

  const health = await cartoChatVpsHealth({ kind: "outreach" });
  const candidates = (health.jobs || [])
    .filter((j) => {
      const prev = String(j.promptPreview || "");
      if (
        !/business developer|TOUR 2|SUBJECT|MARQUE À ANALYSER|MAIL 10\/10|Pipeline|Gmail Leyna|HISTORIQUE LEYNA|web\+Leyna|méga|High/i.test(
          prev
        )
      ) {
        return false;
      }
      if (!jobMatchesBrand(j, brand)) return false;
      const chars = Number(j.answerChars) || 0;
      if (chars < 800) return false;
      if (j.state === "done" || j.hasCertifiedAnswer) return true;
      if (
        j.state === "error" &&
        /Capture non certifiée|ancrages|echo|recopié|prompt/i.test(
          String(j.error || "")
        )
      ) {
        return true;
      }
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
      const ready = await readOutreachMailVps({
        brandName: brand,
        endMarker,
      });
      if (ready.ready) {
        const blob = `${ready.subject || ""}\n${ready.notes || ""}\n${ready.recap?.brandAnalysis || ""}\n${ready.chatAnswer || ""}`;
        if (!answerMatchesBrand(blob, brand)) continue;
        return { ...ready, recovered: true as const };
      }
    } catch {
      /* next candidate */
    }
  }
  return { ready: false as const, recovered: false as const };
}

export async function startOutreachMailVps(input: OutreachMailVpsPromptInput) {
  if (!isOutreachChatVpsConfigured()) {
    throw new Error(
      "OUTREACH_CHAT_VPS_URL manquant — tunnel vers le VPS outreach (ex. port 3848)"
    );
  }

  const presetMarker = String(input.endMarker || "").trim() || null;
  const mail = appendEndMarkerInstruction(
    buildOutreachMailStepPrompt(input),
    presetMarker
  );

  /** 1 Instant … 2 Medium … 3 High. Test A/B Instant (défaut 1). */
  const outreachEffort = (() => {
    const n = Number(process.env.OUTREACH_CHAT_EFFORT_LEVEL || 1);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
  })();

  // Joey = nouvelle BD, jamais d’échange → 1 seul tour mail cold (pas de Gmail Leyna).
  if (isJoeySender(input.fromEmail)) {
    const started = await cartoChatVpsAskAsync({
      prompt: mail.prompt,
      steps: [{ prompt: mail.prompt, endMarker: mail.endMarker }],
      timeoutMs: OUTREACH_PIPELINE_TIMEOUT_MS,
      endMarker: mail.endMarker,
      effortLevel: outreachEffort,
      kind: "outreach",
    });
    return {
      ok: true as const,
      started: true as const,
      brandName: input.brandName,
      startedAt: started.startedAt,
      promptPreview: started.promptPreview,
      endMarker: started.endMarker || mail.endMarker,
      leynaEndMarker: null as string | null,
      pipeline: true as const,
      steps: 1 as const,
      joeyCold: true as const,
    };
  }

  const leyna = appendEndMarkerInstruction(buildOutreachLeynaStepPrompt(input));

  const started = await cartoChatVpsAskAsync({
    prompt: leyna.prompt,
    // Tour 1 Leyna → Tour 2 mail. Poll / read-last sur le marker FINAL (mail).
    steps: [
      { prompt: leyna.prompt, endMarker: leyna.endMarker },
      { prompt: mail.prompt, endMarker: mail.endMarker },
    ],
    timeoutMs: OUTREACH_PIPELINE_TIMEOUT_MS,
    endMarker: mail.endMarker,
    effortLevel: outreachEffort,
    kind: "outreach",
  });

  return {
    ok: true as const,
    started: true as const,
    brandName: input.brandName,
    startedAt: started.startedAt,
    promptPreview: started.promptPreview,
    endMarker: started.endMarker || mail.endMarker,
    leynaEndMarker: leyna.endMarker,
    pipeline: true as const,
    steps: 2 as const,
    joeyCold: false as const,
  };
}

export async function readOutreachMailVps(opts: {
  brandName: string;
  endMarker: string;
  /** Comme carto : Contabo brut → API JSON (filet local si API KO). */
  structure?: OutreachMailStructureOpts | false;
}) {
  const expected = opts.endMarker.trim();
  if (!expected) throw new Error("endMarker requis");

  const health = await cartoChatVpsHealth({ kind: "outreach" });
  const job = (health.jobs || []).find(
    (j) => String(j.endMarker || "") === expected
  );

  let lastFailure = "";
  const structureOpts: OutreachMailStructureOpts | null =
    typeof opts.structure === "object" && opts.structure
      ? opts.structure
      : null;
  const structureEnabled = opts.structure !== false;

  const tryParseReady = async (allowStructure: boolean) => {
    const read = await cartoChatVpsReadLast({
      endMarker: expected,
      kind: "outreach",
    });
    const raw = read.answer || "";
    if (!answerHasEndMarker(raw, expected)) {
      return null;
    }
    const chatAnswer = stripEndMarker(raw, expected);

    // 1) Primary — Chat API structure (comme carto) — seulement réponse certifiée
    if (allowStructure && structureEnabled) {
      try {
        const structured = await structureOutreachMailAnswer({
          brandName: opts.brandName,
          chatAnswer,
          joey: structureOpts?.joey,
          language: structureOpts?.language,
          talentNames: structureOpts?.talentNames,
        });
        const blob = `${structured.subject}\n${structured.notes}\n${structured.bodyHtml}`;
        if (!answerMatchesBrand(blob, opts.brandName)) {
          console.warn(
            `[outreach-mail-vps] structure refusée — marque « ${opts.brandName} », sujet: ${structured.subject}`
          );
          lastFailure = `MAIL_WRONG_BRAND — attendu « ${opts.brandName} », reçu « ${structured.subject} »`;
        } else {
          lastFailure = "";
          console.info(
            `[outreach-mail-vps] structure API ok brand=${opts.brandName} chars=${chatAnswer.length}`
          );
          return {
            ready: true as const,
            brandName: opts.brandName,
            subject: structured.subject,
            bodyHtml: structured.bodyHtml,
            notes: structured.notes,
            recap: null,
            chatAnswer,
            engine: structured.engine,
            pipelineStep: Number(
              (job as { pipelineStep?: number } | undefined)?.pipelineStep || 2
            ),
          };
        }
      } catch (e) {
        console.warn(
          "[outreach-mail-vps] structure API fail → parse local:",
          e instanceof Error ? e.message : e
        );
        lastFailure =
          e instanceof Error ? e.message : "Structure mail API impossible";
      }
    }

    // 2) Fallback — parse SUBJECT/BODY Contabo (ancien chemin)
    try {
      const parsed = parseOutreachMailVpsAnswer(raw, expected);
      const blob = `${parsed.subject}\n${parsed.notes}\n${parsed.bodyHtml}`;
      if (!answerMatchesBrand(blob, opts.brandName)) {
        console.warn(
          `[outreach-mail-vps] parse refusée — marque attendue « ${opts.brandName} », sujet: ${parsed.subject}`
        );
        lastFailure = `MAIL_WRONG_BRAND — attendu « ${opts.brandName} », reçu « ${parsed.subject} »`;
        return null;
      }
      lastFailure = "";
      return {
        ready: true as const,
        brandName: opts.brandName,
        subject: parsed.subject,
        bodyHtml: parsed.bodyHtml,
        notes: parsed.notes,
        recap: parsed.recap,
        chatAnswer,
        engine: "local-parse" as const,
        pipelineStep: Number(
          (job as { pipelineStep?: number } | undefined)?.pipelineStep || 2
        ),
      };
    } catch (e) {
      lastFailure =
        e instanceof Error ? e.message : "Parse mail VPS impossible";
      return null;
    }
  };

  if (job?.state === "error") {
    // Erreur Contabo : tente quand même structure (souvent mail déjà à l'écran)
    const salvaged = await tryParseReady(true);
    if (salvaged) return salvaged;
    throw new Error(
      lastFailure || String(job.error || "") || "Job Chat en erreur"
    );
  }
  if (job && job.state !== "done" && !job.hasCertifiedAnswer) {
    // Poll partiel : parse local seulement (pas d'appel OpenAI toutes les 10s)
    if ((job.answerChars || 0) >= 2500) {
      const salvaged = await tryParseReady(false);
      if (salvaged) return salvaged;
    }
    return {
      ready: false as const,
      state: job.state || "running",
      answerChars: job.answerChars || 0,
      pipelineStep: Number(
        (job as { pipelineStep?: number }).pipelineStep || 0
      ),
      pipelineTotal: Number(
        (job as { pipelineTotal?: number }).pipelineTotal || 2
      ),
      promptPreview: String(job.promptPreview || ""),
    };
  }

  const ready = await tryParseReady(true);
  if (ready) return ready;

  // Job terminé mais mail invalide (legacy template, tronqué, mauvaise marque…)
  // → échec explicite, JAMAIS sauver / coller une fin gold sur un vieux template.
  if (
    lastFailure &&
    (job?.state === "done" || job?.hasCertifiedAnswer)
  ) {
    throw new Error(lastFailure);
  }

  return {
    ready: false as const,
    state: "waiting_marker",
    answerChars: job?.answerChars || 0,
    pipelineStep: Number(
      (job as { pipelineStep?: number } | undefined)?.pipelineStep || 0
    ),
    pipelineTotal: 2,
  };
}
