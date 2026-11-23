/**
 * Worker VPS — ChatGPT multi-onglets (jusqu'à CARTO_CHAT_MAX_PARALLEL).
 *
 * Modes:
 *   1) CDP : CARTO_CHAT_CDP_URL=http://127.0.0.1:9222
 *   2) Persistent Playwright : CARTO_CHAT_PROFILE_DIR=...
 *
 * Auth: Authorization: Bearer $CARTO_CHAT_VPS_SECRET
 */

import http from "node:http";
import { ChatGptDriver } from "./chatgpt-driver.mjs";

const PORT = Number(process.env.CARTO_CHAT_VPS_PORT || 3847);
const SECRET = (process.env.CARTO_CHAT_VPS_SECRET || "").trim();
const BIND = process.env.CARTO_CHAT_VPS_BIND || "127.0.0.1";

const driver = new ChatGptDriver();

/** @type {Map<string, object>} jobs par endMarker */
const jobs = new Map();
/** File des endMarkers en attente d'un slot (priorité carto à la pompe) */
const queue = [];
/** Marqueurs en cours d'exécution sur un slot */
const running = new Set();

/**
 * Carto : max N jobs simultanés (défaut 5).
 * Wizard outreach : max 1 à la fois (qualité + anti-contamination session Chat).
 * À la pompe, la carto passe avant le wizard.
 */
const CARTO_MAX_SLOTS = Math.max(
  1,
  Math.min(8, Number(process.env.CARTO_CHAT_CARTO_MAX_SLOTS || 5) || 5)
);
const OUTREACH_MAX_SLOTS = Math.max(
  1,
  Math.min(2, Number(process.env.CARTO_CHAT_OUTREACH_MAX_SLOTS || 1) || 1)
);

function detectJobKind(prompt, explicit) {
  const e = String(explicit || "").trim().toLowerCase();
  if (e === "carto" || e === "outreach") return e;
  const t = String(prompt || "");
  if (
    /business developer/i.test(t) ||
    /head of casting/i.test(t) ||
    /rédiges UN mail/i.test(t) ||
    /analyses le roster/i.test(t)
  ) {
    return "outreach";
  }
  if (/Head of Research Influence|MARQUE À ANALYSER/i.test(t)) {
    return "carto";
  }
  return "carto";
}

function countRunningByKind(kind) {
  let n = 0;
  for (const m of running) {
    const j = jobs.get(m);
    if (j && j.kind === kind) n += 1;
  }
  return n;
}

function textHasMarker(text, marker) {
  const m = String(marker || "").trim();
  const a = String(text || "");
  if (!m || !a) return false;
  return new RegExp(
    `\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  ).test(a);
}

/** Mail outreach Fil (SUBJECT/BODY/NOTES) — pas les ancrages carto. */
function hasOutreachMailAnchors(text) {
  const t = String(text || "");
  return (
    /\bSUBJECT\s*:/i.test(t) &&
    /\bBODY\s*:/i.test(t) &&
    /\bNOTES\s*:/i.test(t)
  );
}

/** Analyse roster Fil (PRIORITY + talentId=). */
function hasOutreachRosterAnchors(text) {
  const t = String(text || "");
  return /\bPRIORITY\s*:/i.test(t) && /talentId\s*=/i.test(t);
}

function hasDeliverableAnchors(text) {
  const t = String(text || "");
  // Outreach clients (wizard / composer) — accepter même si > 8k
  if (hasOutreachMailAnchors(t)) return true;
  if (hasOutreachRosterAnchors(t)) return true;
  if (
    /Marque\s*[—–\-]\s*interne/i.test(t) ||
    /Priorit[ée]s\s+Glow\s*Up/i.test(t) ||
    /##\s*5\b/i.test(t) ||
    /checklist/i.test(t) ||
    /[ÉE]quipes\s+INTERNES/i.test(t) ||
    /[ÉE]TAPE\s*1\b/i.test(t) ||
    /LinkedIn\s+URLs/i.test(t) ||
    /3\s*CIRCUITS/i.test(t)
  ) {
    return true;
  }
  const li = (t.match(/linkedin\.com\/in\//gi) || []).length;
  return t.length >= 12_000 && li >= 4;
}

function jobIsCertified(job) {
  if (!job || job.state !== "done") return false;
  if (job.markerInjected) return false;
  if (!textHasMarker(job.answer, job.endMarker)) return false;
  const a = String(job.answer || "");
  if (a.length >= 8000 && !hasDeliverableAnchors(a)) return false;
  return true;
}

function finalizeAskResult(result, endMarker, startedAt, promptPreview) {
  const answer = String(result?.answer || "");
  const injected = Boolean(result?.markerInjected);
  const hasMarker = textHasMarker(answer, endMarker);
  const anchorsOk =
    answer.length < 8000 || hasDeliverableAnchors(answer);
  const certified = !injected && hasMarker && anchorsOk;

  if (!certified) {
    const why = injected
      ? "jeton injecté localement (Chat n'a pas écrit le code)"
      : !hasMarker
        ? "jeton absent de la réponse"
        : "ancrages livrable manquants";
    console.warn(
      `[carto-chat-vps] NON CERTIFIÉ chars=${answer.length} — ${why}`
    );
    return {
      state: "error",
      startedAt,
      finishedAt: Date.now(),
      answerChars: answer.length,
      error: `Capture non certifiée: ${why}`,
      promptPreview,
      endMarker,
      answer,
      markerInjected: injected,
      markerSource: result?.markerSource || "",
      slotId: result?.slotId ?? null,
      companyHint: "",
    };
  }

  return {
    state: "done",
    startedAt,
    finishedAt: Date.now(),
    answerChars: answer.length,
    error: null,
    promptPreview,
    endMarker,
    answer,
    markerInjected: false,
    markerSource: result?.markerSource || "present",
    slotId: result?.slotId ?? null,
    companyHint: "",
  };
}

function publicJob(job) {
  if (!job) return null;
  return {
    state: job.state,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || 0,
    answerChars: job.answerChars || (job.answer || "").length,
    error: job.error,
    promptPreview: job.promptPreview,
    endMarker: job.endMarker || "",
    hasCertifiedAnswer: jobIsCertified(job),
    markerInjected: Boolean(job.markerInjected),
    markerSource: job.markerSource || "",
    slotId: job.slotId ?? null,
    companyHint: job.companyHint || "",
    kind: job.kind === "outreach" ? "outreach" : "carto",
    pipelineStep: job.pipelineStep || 0,
    pipelineTotal: job.pipelineTotal || (Array.isArray(job.steps) ? job.steps.length : 1),
    /** Réponses intermédiaires (tour 1, 2, …) pour sync UI live. */
    stepAnswers: Array.isArray(job.stepAnswers)
      ? job.stepAnswers.map((a) =>
          String(a || "").length > 12000
            ? `${String(a).slice(0, 12000)}…`
            : String(a || "")
        )
      : [],
  };
}

/** Job « primary » pour compat lab : running le plus récent, sinon dernier done/error. */
function primaryJob() {
  const list = [...jobs.values()];
  const runningJobs = list
    .filter((j) => j.state === "running")
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (runningJobs[0]) return runningJobs[0];
  const queuedJobs = list
    .filter((j) => j.state === "queued")
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  if (queuedJobs[0]) return queuedJobs[0];
  return list.sort(
    (a, b) => (b.finishedAt || b.startedAt || 0) - (a.finishedAt || a.startedAt || 0)
  )[0] || null;
}

function extractCompanyHint(prompt) {
  const m = String(prompt || "").match(
    /MARQUE À ANALYSER\s*:\s*(.+?)(?:\n|$)/i
  );
  return m ? m[1].trim().slice(0, 80) : "";
}

/**
 * Pompe : 1) carto tant que < CARTO_MAX_SLOTS, 2) outreach tant que < OUTREACH_MAX_SLOTS (défaut 1).
 * Un job carto en file passe devant les wizard dès qu’un slot se libère.
 */
function pickNextQueuedMarker() {
  const cartoRunning = countRunningByKind("carto");
  if (cartoRunning < CARTO_MAX_SLOTS) {
    const cartoIdx = queue.findIndex((m) => {
      const j = jobs.get(m);
      return j && j.state === "queued" && j.kind === "carto";
    });
    if (cartoIdx >= 0) return queue.splice(cartoIdx, 1)[0];
  }
  const outreachRunning = countRunningByKind("outreach");
  if (outreachRunning < OUTREACH_MAX_SLOTS) {
    const outreachIdx = queue.findIndex((m) => {
      const j = jobs.get(m);
      return j && j.state === "queued" && j.kind === "outreach";
    });
    if (outreachIdx >= 0) return queue.splice(outreachIdx, 1)[0];
  }
  // Carto/outreach en file mais plafond atteint → attendre qu’un slot se libère
  return null;
}

function pumpQueue() {
  while (true) {
    const free = driver.slotsInfo().free;
    if (free <= 0) break;
    const nextMarker = pickNextQueuedMarker();
    if (!nextMarker) break;
    const job = jobs.get(nextMarker);
    if (!job || job.state !== "queued") continue;
    startJobOnSlot(job);
  }
}

function startJobOnSlot(job) {
  const endMarker = job.endMarker;
  running.add(endMarker);
  job.state = "running";
  job.startedAt = job.startedAt || Date.now();
  console.log(
    `[carto-chat-vps] start kind=${job.kind || "carto"} marker=${endMarker} hint=${job.companyHint || "—"} queueLeft=${queue.length} cartoRunning=${countRunningByKind("carto")}/${CARTO_MAX_SLOTS}`
  );

  setImmediate(() => {
    const onProgress = (chars, meta) => {
      const j = jobs.get(endMarker);
      if (j && j.state === "running") {
        j.answerChars = Number(chars) || 0;
        if (meta?.step && meta?.total) {
          j.promptPreview = `Tour ${meta.step}/${meta.total} · ${j.companyHint || ""}`.slice(
            0,
            80
          );
          j.pipelineStep = meta.step;
          j.pipelineTotal = meta.total;
        }
      }
    };

    const run =
      Array.isArray(job.steps) && job.steps.length > 0
        ? driver.askPipeline(job.steps, {
            timeoutMs: job.timeoutMs,
            effortLevel: job.effortLevel,
            onProgress,
            onStep: ({ step, total }) => {
              const j = jobs.get(endMarker);
              if (j && j.state === "running") {
                j.pipelineStep = step;
                j.pipelineTotal = total;
                j.promptPreview = `Tour ${step}/${total} · ${j.companyHint || ""}`.slice(
                  0,
                  80
                );
              }
            },
            onStepDone: ({ step, total, answer }) => {
              const j = jobs.get(endMarker);
              if (!j || j.state !== "running") return;
              const arr = Array.isArray(j.stepAnswers) ? [...j.stepAnswers] : [];
              arr[step - 1] = String(answer || "");
              j.stepAnswers = arr;
              j.pipelineStep = step;
              j.pipelineTotal = total;
              j.answerChars = String(answer || "").length;
              j.promptPreview = `Tour ${step}/${total} OK · ${j.companyHint || ""}`.slice(
                0,
                80
              );
              console.log(
                `[carto-chat-vps] stepDone ${step}/${total} chars=${String(answer || "").length} marker=${endMarker}`
              );
            },
          })
        : driver.ask(job.prompt, {
            timeoutMs: job.timeoutMs,
            endMarker,
            // Si absent → CARTO_CHAT_EFFORT_LEVEL (High carto).
            effortLevel: job.effortLevel,
            onProgress,
          });

    run
      .then((result) => {
        const finalized = finalizeAskResult(
          result,
          endMarker,
          job.startedAt,
          job.promptPreview
        );
        finalized.companyHint = job.companyHint;
        finalized.kind = job.kind;
        finalized.prompt = undefined;
        jobs.set(endMarker, {
          ...finalized,
          prompt: job.prompt,
          kind: job.kind,
          answers: result.answers || undefined,
          pipelineStep: Array.isArray(job.steps) ? job.steps.length : undefined,
          pipelineTotal: Array.isArray(job.steps) ? job.steps.length : undefined,
        });
        console.log(
          `[carto-chat-vps] async ${finalized.state} kind=${job.kind} chars=${result.answer.length} marker=${endMarker} certified=${finalized.state === "done" ? 1 : 0} slot=${result.slotId} steps=${result.steps || 1}`
        );
      })
      .catch((e) => {
        jobs.set(endMarker, {
          ...job,
          state: "error",
          finishedAt: Date.now(),
          error: e instanceof Error ? e.message : "Erreur ask",
          answer: "",
          markerInjected: false,
          markerSource: "",
          kind: job.kind,
        });
        console.error("[carto-chat-vps] /ask-async error:", e);
      })
      .finally(() => {
        running.delete(endMarker);
        pumpQueue();
      });
  });
}

function enqueueAsk({
  prompt,
  endMarker,
  timeoutMs,
  promptPreview,
  companyHint,
  effortLevel,
  kind: kindExplicit,
  steps,
}) {
  const stepList = Array.isArray(steps)
    ? steps
        .map((s) => ({
          prompt: String(s?.prompt || "").trim(),
          endMarker: String(s?.endMarker || "").trim(),
        }))
        .filter((s) => s.prompt.length >= 8)
    : [];

  // Marker public = dernier tour (mail) pour read-last / poll UI.
  const marker =
    (stepList.length
      ? stepList[stepList.length - 1].endMarker
      : endMarker) ||
    endMarker ||
    `GLOWUP_CART_DONE_${Date.now().toString(36)}`;

  if (stepList.length) {
    for (const s of stepList) {
      if (!s.endMarker) s.endMarker = `GLOWUP_CART_DONE_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }
    stepList[stepList.length - 1].endMarker = marker;
  }

  if (jobs.has(marker) && ["queued", "running"].includes(jobs.get(marker).state)) {
    return { error: "Ce marker a déjà un job actif", status: 409 };
  }

  const mainPrompt =
    stepList.length > 0
      ? stepList.map((s) => s.prompt).join("\n\n---\n\n")
      : prompt;
  const kind = detectJobKind(mainPrompt, kindExplicit);

  // Outreach = toujours Instant (OUTREACH_CHAT_EFFORT_LEVEL, défaut 1).
  // Ne plus accepter Medium (2) passé par d’anciens clients / roster.
  let effortOk;
  if (kind === "outreach") {
    const fromEnv = Number(process.env.OUTREACH_CHAT_EFFORT_LEVEL || 1);
    effortOk =
      Number.isFinite(fromEnv) && fromEnv >= 1 && fromEnv <= 5 ? fromEnv : 1;
  } else {
    const effortN = Number(effortLevel);
    effortOk =
      Number.isFinite(effortN) && effortN >= 1 && effortN <= 5
        ? effortN
        : undefined;
  }

  const startedAt = Date.now();
  const job = {
    state: "queued",
    startedAt,
    finishedAt: 0,
    answerChars: 0,
    error: null,
    promptPreview:
      promptPreview ||
      (stepList.length
        ? `Pipeline ${stepList.length} tours · ${(companyHint || extractCompanyHint(mainPrompt) || "").slice(0, 40)}`
        : undefined),
    endMarker: marker,
    answer: "",
    markerInjected: false,
    markerSource: "",
    slotId: null,
    companyHint: companyHint || extractCompanyHint(mainPrompt),
    prompt: mainPrompt,
    steps: stepList.length ? stepList : undefined,
    timeoutMs,
    effortLevel: effortOk,
    kind,
    pipelineStep: 0,
    pipelineTotal: stepList.length || 1,
    stepAnswers: [],
  };
  jobs.set(marker, job);
  queue.push(marker);
  console.log(
    `[carto-chat-vps] enqueue kind=${kind} effort=${effortOk ?? "env"} marker=${marker} steps=${stepList.length || 1} hint=${job.companyHint || "—"} free=${driver.slotsInfo().free} cartoRunning=${countRunningByKind("carto")}/${CARTO_MAX_SLOTS} queue=${queue.length}`
  );
  pumpQueue();
  return { job: publicJob(jobs.get(marker)), status: 202 };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function authorized(req) {
  if (!SECRET) return true;
  const h = req.headers.authorization || "";
  return h === `Bearer ${SECRET}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (!authorized(req)) {
    return send(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    const primary = primaryJob();
    const st = await driver
      .status({ endMarker: primary?.endMarker || undefined })
      .catch((e) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }));

    const jobsList = [...jobs.values()]
      .map(publicJob)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, 20);

    const anyCertified = jobsList.some((j) => j.hasCertifiedAnswer);
    const primaryCertified = jobIsCertified(primary);

    // hasEndMarker : écran pour le primary OU un job certifié avec ce marker
    let hasEnd = Boolean(st.hasEndMarker) || primaryCertified;
    const want = url.searchParams.get("endMarker") || primary?.endMarker;
    if (want) {
      const j = jobs.get(want);
      if (jobIsCertified(j)) hasEnd = true;
      else if (j?.state === "done" && textHasMarker(j.answer, want)) hasEnd = true;
    }

    return send(res, 200, {
      ...st,
      hasEndMarker: hasEnd,
      endMarker: primary?.endMarker || st.endMarker || null,
      job: publicJob(primary) || {
        state: "idle",
        startedAt: 0,
        finishedAt: 0,
        answerChars: 0,
        error: null,
        promptPreview: "",
        endMarker: "",
        hasCertifiedAnswer: false,
        markerInjected: false,
        markerSource: "",
      },
      jobs: jobsList,
      queueLength: queue.length,
      anyCertified,
      cartoMaxSlots: CARTO_MAX_SLOTS,
      cartoRunning: countRunningByKind("carto"),
      outreachRunning: countRunningByKind("outreach"),
      outreachQueued: queue.filter((m) => jobs.get(m)?.kind === "outreach")
        .length,
      cartoQueued: queue.filter((m) => jobs.get(m)?.kind === "carto").length,
    });
  }

  if (req.method === "POST" && url.pathname === "/ask") {
    try {
      const body = await readJson(req);
      const prompt = String(body.prompt || "").trim();
      const endMarker = String(body.endMarker || "").trim();
      if (prompt.length < 8) {
        return send(res, 400, { error: "prompt requis" });
      }
      const promptPreview = prompt.slice(0, 80).replace(/\n/g, " ");
      const started = Date.now();
      const effortN = Number(body.effortLevel);
      const result = await driver.ask(prompt, {
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        endMarker: endMarker || undefined,
        effortLevel:
          Number.isFinite(effortN) && effortN >= 1 && effortN <= 5
            ? effortN
            : undefined,
      });
      const finalized = finalizeAskResult(
        result,
        endMarker,
        started,
        promptPreview
      );
      finalized.companyHint = extractCompanyHint(prompt);
      if (endMarker) jobs.set(endMarker, { ...finalized, prompt });
      if (finalized.state !== "done") {
        return send(res, 502, {
          ok: false,
          error: finalized.error,
          answer: result.answer,
          url: result.url,
          elapsedMs: Date.now() - started,
          markerInjected: finalized.markerInjected,
        });
      }
      return send(res, 200, {
        ok: true,
        answer: result.answer,
        url: result.url,
        elapsedMs: Date.now() - started,
      });
    } catch (e) {
      console.error("[carto-chat-vps] /ask error:", e);
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur ask",
      });
    }
  }

  if (req.method === "POST" && url.pathname === "/ask-async") {
    try {
      const body = await readJson(req);
      const prompt = String(body.prompt || "").trim();
      const endMarker = String(body.endMarker || "").trim();
      const steps = Array.isArray(body.steps) ? body.steps : null;
      if ((!steps || steps.length === 0) && prompt.length < 8) {
        return send(res, 400, { error: "prompt ou steps requis" });
      }
      const promptPreview = (
        steps?.length
          ? `Pipeline ${steps.length} tours`
          : prompt.slice(0, 80)
      ).replace(/\n/g, " ");
      const effortN = Number(body.effortLevel);
      const out = enqueueAsk({
        prompt,
        endMarker,
        steps,
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        promptPreview,
        companyHint: extractCompanyHint(
          steps?.length
            ? steps.map((s) => String(s?.prompt || "")).join("\n")
            : prompt
        ),
        effortLevel:
          Number.isFinite(effortN) && effortN >= 1 && effortN <= 5
            ? effortN
            : undefined,
        kind: body.kind,
      });
      if (out.error) {
        return send(res, out.status || 409, { error: out.error });
      }
      return send(res, 202, {
        ok: true,
        started: true,
        queued: out.job.state === "queued",
        job: out.job,
      });
    } catch (e) {
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur ask-async",
      });
    }
  }

  if (req.method === "POST" && url.pathname === "/cancel") {
    try {
      const body = await readJson(req).catch(() => ({}));
      const marker = String(body.endMarker || "").trim();
      if (!marker) {
        return send(res, 400, { error: "endMarker requis" });
      }
      const job = jobs.get(marker);
      if (!job) {
        await driver.cancelMarker(marker);
        return send(res, 404, { error: "job introuvable", endMarker: marker });
      }
      if (job.state === "queued") {
        const qi = queue.indexOf(marker);
        if (qi >= 0) queue.splice(qi, 1);
        jobs.set(marker, {
          ...job,
          state: "error",
          finishedAt: Date.now(),
          error: "Annulé",
        });
        return send(res, 200, { ok: true, cancelled: true, state: "queued" });
      }
      if (job.state === "running") {
        await driver.cancelMarker(marker);
        // Le .catch/.finally de startJobOnSlot finalisera + libérera le slot.
        return send(res, 200, {
          ok: true,
          cancelled: true,
          state: "running",
          endMarker: marker,
        });
      }
      return send(res, 200, {
        ok: true,
        cancelled: false,
        state: job.state,
        message: "déjà terminé",
      });
    } catch (e) {
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur cancel",
      });
    }
  }

  if (req.method === "POST" && url.pathname === "/new-chat") {
    try {
      await driver.refreshPageHandle();
      await driver.startFreshChat();
      const box = await driver.waitForPrompt(12_000);
      const blocked = await driver.detectBlockedUi().catch(() => null);
      return send(res, 200, {
        ok: Boolean(box),
        url: driver.page?.url(),
        hasPrompt: Boolean(box),
        blocked,
      });
    } catch (e) {
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur",
      });
    }
  }

  /** Force goto chatgpt.com sur tous les slots + diagnostic composer. */
  if (req.method === "POST" && url.pathname === "/recover") {
    try {
      const body = await readJson(req).catch(() => ({}));
      const result = await driver.recoverComposer({
        timeoutMs: Number(body.timeoutMs) || 20_000,
      });
      return send(res, result.ok ? 200 : 503, result);
    } catch (e) {
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur recover",
      });
    }
  }

  if (req.method === "POST" && url.pathname === "/read-last") {
    try {
      const body = await readJson(req).catch(() => ({}));
      const marker = String(body.endMarker || "").trim();
      const job = marker
        ? jobs.get(marker)
        : primaryJob();

      // Job certifié OU texte long déjà capturé (ex. rejet ancrages trop strict)
      // → ne pas relire un autre onglet / l’écran « primary ».
      if (
        job &&
        String(job.answer || "").length > 500 &&
        (!marker || textHasMarker(job.answer, job.endMarker || marker))
      ) {
        const useStored =
          (job.state === "done" && jobIsCertified(job)) ||
          (marker &&
            String(job.answer || "").length >= 8000 &&
            textHasMarker(job.answer, marker));
        if (useStored) {
          console.log(
            `[carto-chat-vps] /read-last from job chars=${job.answer.length} marker=${job.endMarker} state=${job.state}`
          );
          return send(res, 200, {
            ok: true,
            answer: job.answer,
            url: driver.page?.url?.() || "",
            fromJob: true,
            endMarker: job.endMarker,
          });
        }
      }

      // Lecture écran : slot lié OU scan de tous les onglets (job perdu après reload)
      const expect = marker || String(job?.endMarker || "").trim();
      let result = null;
      if (expect) {
        result = await driver.findAnswerWithMarker(expect);
      }
      if (!result) {
        const slot = expect ? driver.findSlotByMarker(expect) : null;
        result = slot
          ? await driver.readLatestForPage(slot.page)
          : await driver.readLatest();
      }

      let answer = result.answer;
      if (expect && textHasMarker(answer, expect)) {
        const ensured = await driver.ensureCorrectEndMarker(answer, expect);
        answer = ensured.answer;
        if (!ensured.injected && job && job.state === "done") {
          job.answer = answer;
          job.answerChars = answer.length;
          job.markerInjected = false;
          job.markerSource = ensured.source;
        }
      } else if (expect) {
        console.warn(
          `[carto-chat-vps] /read-last marker ${expect} absent des onglets (chars=${answer.length})`
        );
      }
      console.log(
        `[carto-chat-vps] /read-last chars=${answer.length} marker=${expect || "—"} found=${expect ? textHasMarker(answer, expect) : "n/a"}`
      );
      return send(res, 200, {
        ok: true,
        answer,
        url: result.url,
        endMarker: expect || null,
        markerFound: expect ? textHasMarker(answer, expect) : null,
      });
    } catch (e) {
      console.error("[carto-chat-vps] /read-last error:", e);
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur read",
      });
    }
  }

  send(res, 404, { error: "not found" });
});

async function main() {
  if (!SECRET) {
    console.warn(
      "[carto-chat-vps] WARNING: CARTO_CHAT_VPS_SECRET vide — ok en local tunnel only"
    );
  }
  await driver.start();
  server.listen(PORT, BIND, () => {
    console.log(`[carto-chat-vps] listening http://${BIND}:${PORT}`);
    console.log(
      `[carto-chat-vps] parallel slots=${driver.slotsInfo().total} · cartoMax=${CARTO_MAX_SLOTS} · outreachMax=${OUTREACH_MAX_SLOTS} (priorité carto)`
    );
    console.log(`[carto-chat-vps] health → GET /health`);
    console.log(`[carto-chat-vps] ask    → POST /ask-async { prompt, endMarker, kind? }`);
  });
}

process.on("SIGINT", async () => {
  await driver.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await driver.close();
  process.exit(0);
});

main().catch((e) => {
  console.error("[carto-chat-vps] fatal:", e);
  process.exit(1);
});
