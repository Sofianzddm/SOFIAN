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
/** File FIFO des endMarkers en attente d'un slot */
const queue = [];
/** Marqueurs en cours d'exécution sur un slot */
const running = new Set();

function textHasMarker(text, marker) {
  const m = String(marker || "").trim();
  const a = String(text || "");
  if (!m || !a) return false;
  return new RegExp(
    `\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  ).test(a);
}

function hasDeliverableAnchors(text) {
  const t = String(text || "");
  return (
    /Marque\s*[—–-]\s*interne/i.test(t) ||
    /Priorit[ée]s\s+Glow\s*Up/i.test(t) ||
    /##\s*5\b/i.test(t) ||
    /checklist/i.test(t)
  );
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

function pumpQueue() {
  while (true) {
    const free = driver.slotsInfo().free;
    if (free <= 0) break;
    const nextMarker = queue.shift();
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
    `[carto-chat-vps] start job marker=${endMarker} hint=${job.companyHint || "—"} queueLeft=${queue.length}`
  );

  setImmediate(() => {
    driver
      .ask(job.prompt, {
        timeoutMs: job.timeoutMs,
        endMarker,
        onProgress: (chars) => {
          const j = jobs.get(endMarker);
          if (j && j.state === "running") {
            j.answerChars = Number(chars) || 0;
          }
        },
      })
      .then((result) => {
        const finalized = finalizeAskResult(
          result,
          endMarker,
          job.startedAt,
          job.promptPreview
        );
        finalized.companyHint = job.companyHint;
        finalized.prompt = undefined;
        jobs.set(endMarker, { ...finalized, prompt: job.prompt });
        console.log(
          `[carto-chat-vps] async ${finalized.state} chars=${result.answer.length} marker=${endMarker} certified=${finalized.state === "done" ? 1 : 0} slot=${result.slotId}`
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
        });
        console.error("[carto-chat-vps] /ask-async error:", e);
      })
      .finally(() => {
        running.delete(endMarker);
        pumpQueue();
      });
  });
}

function enqueueAsk({ prompt, endMarker, timeoutMs, promptPreview, companyHint }) {
  const marker =
    endMarker ||
    `GLOWUP_CART_DONE_${Date.now().toString(36)}`;
  if (jobs.has(marker) && ["queued", "running"].includes(jobs.get(marker).state)) {
    return { error: "Ce marker a déjà un job actif", status: 409 };
  }

  const startedAt = Date.now();
  const job = {
    state: "queued",
    startedAt,
    finishedAt: 0,
    answerChars: 0,
    error: null,
    promptPreview,
    endMarker: marker,
    answer: "",
    markerInjected: false,
    markerSource: "",
    slotId: null,
    companyHint: companyHint || extractCompanyHint(prompt),
    prompt,
    timeoutMs,
  };
  jobs.set(marker, job);
  queue.push(marker);
  console.log(
    `[carto-chat-vps] enqueue marker=${marker} hint=${job.companyHint || "—"} free=${driver.slotsInfo().free}`
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
      const result = await driver.ask(prompt, {
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        endMarker: endMarker || undefined,
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
      if (prompt.length < 8) {
        return send(res, 400, { error: "prompt requis" });
      }
      const promptPreview = prompt.slice(0, 80).replace(/\n/g, " ");
      const out = enqueueAsk({
        prompt,
        endMarker,
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        promptPreview,
        companyHint: extractCompanyHint(prompt),
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

  if (req.method === "POST" && url.pathname === "/new-chat") {
    try {
      await driver.refreshPageHandle();
      return send(res, 200, { ok: true, url: driver.page?.url() });
    } catch (e) {
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur",
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

      if (job && job.state === "done" && jobIsCertified(job)) {
        console.log(
          `[carto-chat-vps] /read-last from job chars=${job.answer.length} marker=${job.endMarker}`
        );
        return send(res, 200, {
          ok: true,
          answer: job.answer,
          url: driver.page?.url?.() || "",
          fromJob: true,
          endMarker: job.endMarker,
        });
      }

      // Lecture écran : si un slot porte encore le marker, bind ALS via ask path n/a —
      // utilise la page du slot si trouvée
      const slot = marker ? driver.findSlotByMarker(marker) : null;
      const result = slot
        ? await driver.readLatestForPage(slot.page)
        : await driver.readLatest();

      let answer = result.answer;
      const expect = marker || String(job?.endMarker || "").trim();
      if (expect && textHasMarker(answer, expect)) {
        const ensured = await driver.ensureCorrectEndMarker(answer, expect);
        answer = ensured.answer;
        if (!ensured.injected && job && job.state === "done") {
          job.answer = answer;
          job.answerChars = answer.length;
          job.markerInjected = false;
          job.markerSource = ensured.source;
        }
      }
      console.log(`[carto-chat-vps] /read-last chars=${answer.length}`);
      return send(res, 200, {
        ok: true,
        answer,
        url: result.url,
        endMarker: expect || null,
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
      `[carto-chat-vps] parallel slots=${driver.slotsInfo().total}`
    );
    console.log(`[carto-chat-vps] health → GET /health`);
    console.log(`[carto-chat-vps] ask    → POST /ask-async { prompt, endMarker }`);
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
