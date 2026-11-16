/**
 * Worker VPS — garde ChatGPT ouvert et expose POST /ask
 *
 * Modes:
 *   1) CDP (recommandé) : Chrome déjà ouvert avec ChatGPT connecté
 *      google-chrome --remote-debugging-port=9222 --user-data-dir=/opt/chatgpt-profile
 *      CARTO_CHAT_CDP_URL=http://127.0.0.1:9222
 *
 *   2) Persistent Playwright : lance Chromium, login une fois via VNC
 *      CARTO_CHAT_PROFILE_DIR=/opt/chatgpt-profile
 *      CARTO_CHAT_HEADLESS=0
 *
 * Auth: Authorization: Bearer $CARTO_CHAT_VPS_SECRET
 *
 * Lancer:
 *   cd scripts/carto-chat-vps && npm i && npm run install:browser && npm start
 */

import http from "node:http";
import { ChatGptDriver } from "./chatgpt-driver.mjs";

const PORT = Number(process.env.CARTO_CHAT_VPS_PORT || 3847);
const SECRET = (process.env.CARTO_CHAT_VPS_SECRET || "").trim();
const BIND = process.env.CARTO_CHAT_VPS_BIND || "127.0.0.1";

const driver = new ChatGptDriver();

/** Job async : le navigateur ne tient pas 6–10 min de POST /ask. */
let askJob = {
  state: "idle", // idle | running | done | error
  startedAt: 0,
  finishedAt: 0,
  answerChars: 0,
  error: null,
  promptPreview: "",
  endMarker: "",
  /** Réponse (certifiée seulement si markerInjected=false). */
  answer: "",
  markerInjected: false,
  markerSource: "",
};

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

/** Certifié = done + jeton réel (pas injecté) + ancrages soft si texte long. */
function jobHasCorrectMarker() {
  if (askJob.state !== "done") return false;
  if (askJob.markerInjected) return false;
  if (!textHasMarker(askJob.answer, askJob.endMarker)) return false;
  const a = String(askJob.answer || "");
  // Soft guard : gros texte sans ancrage livrable → pas certified
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
      ? "jeton injecté localement (Chat ne l'a pas écrit)"
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
  };
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
  if (!SECRET) return true; // lab local uniquement — mets un secret en prod
  const h = req.headers.authorization || "";
  return h === `Bearer ${SECRET}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // En prod (HTTPS public) : Bearer obligatoire partout, y compris /health
  if (!authorized(req)) {
    return send(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    const st = await driver
      .status({ endMarker: askJob.endMarker || undefined })
      .catch((e) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    const certified = jobHasCorrectMarker();
    return send(res, 200, {
      ...st,
      // Écran OU réponse job certifiée avec LE bon jeton (jamais injecté)
      hasEndMarker: Boolean(st.hasEndMarker) || certified,
      endMarker: askJob.endMarker || st.endMarker || null,
      job: {
        state: askJob.state,
        startedAt: askJob.startedAt,
        finishedAt: askJob.finishedAt,
        answerChars: askJob.answerChars || (askJob.answer || "").length,
        error: askJob.error,
        promptPreview: askJob.promptPreview,
        endMarker: askJob.endMarker || "",
        hasCertifiedAnswer: certified,
        markerInjected: Boolean(askJob.markerInjected),
        markerSource: askJob.markerSource || "",
      },
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
      console.log(
        `[carto-chat-vps] /ask ${prompt.slice(0, 80).replace(/\n/g, " ")}…`
      );
      const promptPreview = prompt.slice(0, 80).replace(/\n/g, " ");
      askJob = {
        state: "running",
        startedAt: Date.now(),
        finishedAt: 0,
        answerChars: 0,
        error: null,
        promptPreview,
        endMarker,
        answer: "",
        markerInjected: false,
        markerSource: "",
      };
      const started = Date.now();
      const result = await driver.ask(prompt, {
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        endMarker: endMarker || undefined,
      });
      askJob = finalizeAskResult(result, endMarker, started, promptPreview);
      console.log(
        `[carto-chat-vps] done ${((Date.now() - started) / 1000).toFixed(1)}s chars=${result.answer.length} certified=${askJob.state === "done" ? 1 : 0}`
      );
      if (askJob.state !== "done") {
        return send(res, 502, {
          ok: false,
          error: askJob.error,
          answer: result.answer,
          url: result.url,
          elapsedMs: Date.now() - started,
          markerInjected: askJob.markerInjected,
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
      askJob = {
        ...askJob,
        state: "error",
        finishedAt: Date.now(),
        error: e instanceof Error ? e.message : "Erreur ask",
        markerInjected: false,
      };
      return send(res, 500, {
        error: e instanceof Error ? e.message : "Erreur ask",
      });
    }
  }

  /**
   * Démarre Chat sans bloquer HTTP (lab poll /health puis /read-last).
   * Répond 202 tout de suite — le navigateur n'abandonne plus à 5 min.
   */
  if (req.method === "POST" && url.pathname === "/ask-async") {
    try {
      const body = await readJson(req);
      const prompt = String(body.prompt || "").trim();
      const endMarker = String(body.endMarker || "").trim();
      if (prompt.length < 8) {
        return send(res, 400, { error: "prompt requis" });
      }
      if (driver.busy || askJob.state === "running") {
        return send(res, 409, { error: "Chat déjà occupé — réessaie dans un instant" });
      }
      const timeoutMs = body.timeoutMs ? Number(body.timeoutMs) : undefined;
      const startedAt = Date.now();
      const promptPreview = prompt.slice(0, 80).replace(/\n/g, " ");
      askJob = {
        state: "running",
        startedAt,
        finishedAt: 0,
        answerChars: 0,
        error: null,
        promptPreview,
        endMarker,
        answer: "",
        markerInjected: false,
        markerSource: "",
      };
      console.log(
        `[carto-chat-vps] /ask-async marker=${endMarker || "—"} ${askJob.promptPreview}…`
      );
      // Fire-and-forget : ne bloque pas la réponse HTTP
      setImmediate(() => {
        driver
          .ask(prompt, {
            timeoutMs,
            endMarker: endMarker || undefined,
            onProgress: (chars) => {
              if (askJob.startedAt === startedAt && askJob.state === "running") {
                askJob.answerChars = Number(chars) || 0;
              }
            },
          })
          .then((result) => {
            askJob = finalizeAskResult(
              result,
              endMarker,
              startedAt,
              promptPreview
            );
            console.log(
              `[carto-chat-vps] async ${askJob.state} chars=${result.answer.length} marker=${endMarker} certified=${askJob.state === "done" ? 1 : 0} source=${result.markerSource || "?"}`
            );
          })
          .catch((e) => {
            askJob = {
              state: "error",
              startedAt,
              finishedAt: Date.now(),
              answerChars: askJob.answerChars || 0,
              error: e instanceof Error ? e.message : "Erreur ask",
              promptPreview,
              endMarker,
              answer: "",
              markerInjected: false,
              markerSource: "",
            };
            console.error("[carto-chat-vps] /ask-async error:", e);
          });
      });
      return send(res, 202, { ok: true, started: true, job: askJob });
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

  /** Récupère la réponse déjà affichée (Chat a fini, lab n'a rien reçu). */
  if (req.method === "POST" && url.pathname === "/read-last") {
    try {
      // Préfère la réponse job certifiée (bon jeton garanti) si dispo
      if (askJob.state === "done" && jobHasCorrectMarker()) {
        console.log(
          `[carto-chat-vps] /read-last from job chars=${askJob.answer.length} marker=${askJob.endMarker}`
        );
        return send(res, 200, {
          ok: true,
          answer: askJob.answer,
          url: driver.page?.url?.() || "",
          fromJob: true,
          endMarker: askJob.endMarker,
        });
      }
      const result = await driver.readLatest();
      const marker = String(askJob.endMarker || "").trim();
      let answer = result.answer;
      // Ne jamais injecter pour « fake » une certif via /read-last
      if (marker && textHasMarker(answer, marker)) {
        const ensured = await driver.ensureCorrectEndMarker(answer, marker);
        answer = ensured.answer;
        if (!ensured.injected && askJob.state === "done") {
          askJob.answer = answer;
          askJob.answerChars = answer.length;
          askJob.markerInjected = false;
          askJob.markerSource = ensured.source;
        }
      }
      console.log(
        `[carto-chat-vps] /read-last chars=${answer.length}`
      );
      return send(res, 200, {
        ok: true,
        answer,
        url: result.url,
        endMarker: marker || null,
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
    console.log(`[carto-chat-vps] health → GET /health`);
    console.log(`[carto-chat-vps] ask    → POST /ask { prompt }`);
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
