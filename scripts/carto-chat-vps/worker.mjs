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
};

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
    const st = await driver.status().catch((e) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    return send(res, 200, {
      ...st,
      job: {
        state: askJob.state,
        startedAt: askJob.startedAt,
        finishedAt: askJob.finishedAt,
        answerChars: askJob.answerChars,
        error: askJob.error,
        promptPreview: askJob.promptPreview,
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/ask") {
    try {
      const body = await readJson(req);
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 8) {
        return send(res, 400, { error: "prompt requis" });
      }
      console.log(
        `[carto-chat-vps] /ask ${prompt.slice(0, 80).replace(/\n/g, " ")}…`
      );
      askJob = {
        state: "running",
        startedAt: Date.now(),
        finishedAt: 0,
        answerChars: 0,
        error: null,
        promptPreview: prompt.slice(0, 80).replace(/\n/g, " "),
      };
      const started = Date.now();
      const result = await driver.ask(prompt, {
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
      });
      askJob = {
        state: "done",
        startedAt: started,
        finishedAt: Date.now(),
        answerChars: result.answer.length,
        error: null,
        promptPreview: askJob.promptPreview,
      };
      console.log(
        `[carto-chat-vps] done ${((Date.now() - started) / 1000).toFixed(1)}s chars=${result.answer.length}`
      );
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
      if (prompt.length < 8) {
        return send(res, 400, { error: "prompt requis" });
      }
      if (driver.busy || askJob.state === "running") {
        return send(res, 409, { error: "Chat déjà occupé — réessaie dans un instant" });
      }
      const timeoutMs = body.timeoutMs ? Number(body.timeoutMs) : undefined;
      const startedAt = Date.now();
      askJob = {
        state: "running",
        startedAt,
        finishedAt: 0,
        answerChars: 0,
        error: null,
        promptPreview: prompt.slice(0, 80).replace(/\n/g, " "),
      };
      console.log(
        `[carto-chat-vps] /ask-async ${askJob.promptPreview}…`
      );
      // Fire-and-forget : ne bloque pas la réponse HTTP
      setImmediate(() => {
        driver
          .ask(prompt, {
            timeoutMs,
            onProgress: (chars) => {
              if (askJob.startedAt === startedAt && askJob.state === "running") {
                askJob.answerChars = Number(chars) || 0;
              }
            },
          })
          .then((result) => {
            askJob = {
              state: "done",
              startedAt,
              finishedAt: Date.now(),
              answerChars: result.answer.length,
              error: null,
              promptPreview: askJob.promptPreview,
            };
            console.log(
              `[carto-chat-vps] async done chars=${result.answer.length}`
            );
          })
          .catch((e) => {
            askJob = {
              state: "error",
              startedAt,
              finishedAt: Date.now(),
              answerChars: askJob.answerChars || 0,
              error: e instanceof Error ? e.message : "Erreur ask",
              promptPreview: askJob.promptPreview,
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
      const result = await driver.readLatest();
      console.log(
        `[carto-chat-vps] /read-last chars=${result.answer.length}`
      );
      return send(res, 200, {
        ok: true,
        answer: result.answer,
        url: result.url,
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
