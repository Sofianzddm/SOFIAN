/**
 * Client HTTP vers le worker VPS qui pilote ChatGPT web ouvert.
 */

import http from "node:http";
import https from "node:https";

export type CartoChatVpsJob = {
  state?: "idle" | "running" | "done" | "error" | string;
  startedAt?: number;
  finishedAt?: number;
  answerChars?: number;
  error?: string | null;
  promptPreview?: string;
};

export type CartoChatVpsHealth = {
  ok: boolean;
  mode?: string | null;
  url?: string;
  loggedIn?: boolean;
  hasPrompt?: boolean;
  busy?: boolean;
  lastAnswerChars?: number;
  job?: CartoChatVpsJob;
  error?: string;
};

export type CartoChatVpsAskResult = {
  ok: boolean;
  answer: string;
  url?: string;
  elapsedMs?: number;
};

/** High + web search : souvent > 5 min — undici coupe à ~300s (HeadersTimeout). */
const ASK_DEFAULT_MS = 540_000;

function baseUrl(): string {
  return (process.env.CARTO_CHAT_VPS_URL || "").trim().replace(/\/$/, "");
}

function secret(): string {
  return (process.env.CARTO_CHAT_VPS_SECRET || "").trim();
}

/** POST long-poll sans timeout headers undici (évite fetch failed à 5 min). */
function longPostJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; json: Record<string, unknown> }> {
  const u = new URL(url);
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const lib = u.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": payload.length,
          Connection: "keep-alive",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch {
            json = { error: text.slice(0, 200) || "Réponse non JSON" };
          }
          resolve({ status: res.statusCode || 0, json });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout VPS Chat après ${Math.round(timeoutMs / 1000)}s`));
    });
    req.on("error", (err) => {
      reject(
        new Error(
          err.message === "socket hang up"
            ? "connexion VPS coupée (tunnel / worker)"
            : err.message || "fetch failed"
        )
      );
    });
    req.write(payload);
    req.end();
  });
}

export function isCartoChatVpsConfigured(): boolean {
  return Boolean(baseUrl());
}

export async function cartoChatVpsHealth(): Promise<CartoChatVpsHealth> {
  const base = baseUrl();
  if (!base) {
    return { ok: false, error: "CARTO_CHAT_VPS_URL manquant" };
  }
  const headers: Record<string, string> = {};
  const s = secret();
  if (s) headers.Authorization = `Bearer ${s}`;
  const res = await fetch(`${base}/health`, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json().catch(() => ({}))) as CartoChatVpsHealth;
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { error?: string }).error || `HTTP ${res.status}`,
    };
  }
  return data;
}

/** Lit la réponse déjà visible dans l’onglet Chat (sans renvoyer de prompt). */
export async function cartoChatVpsReadLast(): Promise<CartoChatVpsAskResult> {
  const base = baseUrl();
  if (!base) {
    throw new Error("CARTO_CHAT_VPS_URL manquant");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const s = secret();
  if (s) headers.Authorization = `Bearer ${s}`;

  const res = await fetch(`${base}/read-last`, {
    method: "POST",
    headers,
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    answer?: string;
    url?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `VPS Chat HTTP ${res.status}`);
  }
  const answer = String(data.answer || "").trim();
  if (!answer) throw new Error("Réponse Chat vide à l'écran");
  return { ok: true, answer, url: data.url };
}

export async function cartoChatVpsAsk(opts: {
  prompt: string;
  timeoutMs?: number;
}): Promise<CartoChatVpsAskResult> {
  const base = baseUrl();
  if (!base) {
    throw new Error(
      "CARTO_CHAT_VPS_URL manquant — tunnel SSH vers le worker VPS (port 3847)"
    );
  }
  const headers: Record<string, string> = {};
  const s = secret();
  if (s) headers.Authorization = `Bearer ${s}`;

  const timeoutMs = opts.timeoutMs ?? ASK_DEFAULT_MS;
  const { status, json } = await longPostJson(
    `${base}/ask`,
    { prompt: opts.prompt, timeoutMs },
    headers,
    timeoutMs + 30_000
  );
  const data = json as {
    ok?: boolean;
    answer?: string;
    url?: string;
    elapsedMs?: number;
    error?: string;
  };
  if (status < 200 || status >= 300) {
    throw new Error(data.error || `VPS Chat HTTP ${status}`);
  }
  const answer = String(data.answer || "").trim();
  if (!answer) throw new Error("Réponse Chat VPS vide");
  return {
    ok: true,
    answer,
    url: data.url,
    elapsedMs: data.elapsedMs,
  };
}

/** Démarre Chat en async (202) — le lab poll /health puis read-last. */
export async function cartoChatVpsAskAsync(opts: {
  prompt: string;
  timeoutMs?: number;
}): Promise<{ ok: true; started: true; startedAt: number; promptPreview: string }> {
  const base = baseUrl();
  if (!base) {
    throw new Error(
      "CARTO_CHAT_VPS_URL manquant — tunnel SSH vers le worker VPS (port 3847)"
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const s = secret();
  if (s) headers.Authorization = `Bearer ${s}`;

  const res = await fetch(`${base}/ask-async`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: opts.prompt,
      timeoutMs: opts.timeoutMs ?? ASK_DEFAULT_MS,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    job?: { startedAt?: number; promptPreview?: string };
  };
  if (!res.ok) {
    throw new Error(data.error || `VPS Chat HTTP ${res.status}`);
  }
  return {
    ok: true,
    started: true,
    startedAt: Number(data.job?.startedAt || Date.now()),
    promptPreview: String(data.job?.promptPreview || ""),
  };
}
