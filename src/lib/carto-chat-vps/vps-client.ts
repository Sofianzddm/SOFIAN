/**
 * Client HTTP vers le worker VPS qui pilote ChatGPT web ouvert.
 */

import http from "node:http";
import https from "node:https";

export type CartoChatVpsJob = {
  state?: "idle" | "queued" | "running" | "done" | "error" | string;
  startedAt?: number;
  finishedAt?: number;
  answerChars?: number;
  error?: string | null;
  promptPreview?: string;
  endMarker?: string;
  hasCertifiedAnswer?: boolean;
  markerInjected?: boolean;
  markerSource?: string;
  slotId?: number | null;
  companyHint?: string;
  pipelineStep?: number;
  pipelineTotal?: number;
  stepAnswers?: string[];
};

export type CartoChatVpsHealth = {
  ok: boolean;
  mode?: string | null;
  url?: string;
  loggedIn?: boolean;
  hasPrompt?: boolean;
  busy?: boolean;
  slotsFull?: boolean;
  runningCount?: number;
  slots?: { total?: number; free?: number; busy?: number };
  lastAnswerChars?: number;
  /** true si le marker du job courant est dans la réponse à l’écran */
  hasEndMarker?: boolean;
  /** Marker attendu pour le job courant (unique par fil) */
  endMarker?: string | null;
  job?: CartoChatVpsJob;
  /** Tous les jobs récents (parallèle) */
  jobs?: CartoChatVpsJob[];
  queueLength?: number;
  /** Outreach : nb de slots Contabo actifs (running). */
  outreachRunning?: number;
  running?: number;
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

export type CartoChatVpsKind = "carto" | "outreach";

/**
 * Carto → CARTO_CHAT_VPS_* (Contabo historique).
 * Outreach / roster → OUTREACH_CHAT_VPS_* si défini, sinon fallback CARTO.
 */
function baseUrl(kind?: CartoChatVpsKind): string {
  if (kind === "outreach") {
    const outreach = (process.env.OUTREACH_CHAT_VPS_URL || "")
      .trim()
      .replace(/\/$/, "");
    if (outreach) return outreach;
  }
  return (process.env.CARTO_CHAT_VPS_URL || "").trim().replace(/\/$/, "");
}

function secret(kind?: CartoChatVpsKind): string {
  if (kind === "outreach") {
    const outreach = (process.env.OUTREACH_CHAT_VPS_SECRET || "").trim();
    if (outreach) return outreach;
  }
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

export function isCartoChatVpsConfigured(kind?: CartoChatVpsKind): boolean {
  return Boolean(baseUrl(kind));
}

/** Outreach dédié (nouveau VPS) ou fallback carto. */
export function isOutreachChatVpsConfigured(): boolean {
  return isCartoChatVpsConfigured("outreach");
}

export async function cartoChatVpsHealth(opts?: {
  kind?: CartoChatVpsKind;
}): Promise<CartoChatVpsHealth> {
  const kind = opts?.kind;
  const base = baseUrl(kind);
  if (!base) {
    return {
      ok: false,
      error:
        kind === "outreach"
          ? "OUTREACH_CHAT_VPS_URL (ou CARTO_CHAT_VPS_URL) manquant"
          : "CARTO_CHAT_VPS_URL manquant",
    };
  }
  const headers: Record<string, string> = {};
  const s = secret(kind);
  if (s) headers.Authorization = `Bearer ${s}`;
  const res = await fetch(`${base}/health`, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
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

/** Lit la réponse déjà visible / job certifié (sans renvoyer de prompt). */
export async function cartoChatVpsReadLast(opts?: {
  endMarker?: string;
  kind?: CartoChatVpsKind;
}): Promise<CartoChatVpsAskResult> {
  const kind = opts?.kind;
  const base = baseUrl(kind);
  if (!base) {
    throw new Error(
      kind === "outreach"
        ? "OUTREACH_CHAT_VPS_URL (ou CARTO_CHAT_VPS_URL) manquant"
        : "CARTO_CHAT_VPS_URL manquant"
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const s = secret(kind);
  if (s) headers.Authorization = `Bearer ${s}`;

  // Scan multi-onglets = plus long sous charge parallèle
  const res = await fetch(`${base}/read-last`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      endMarker: opts?.endMarker || undefined,
    }),
    signal: AbortSignal.timeout(120_000),
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
  endMarker?: string;
  kind?: CartoChatVpsKind;
}): Promise<CartoChatVpsAskResult> {
  const kind = opts.kind;
  const base = baseUrl(kind);
  if (!base) {
    throw new Error(
      kind === "outreach"
        ? "OUTREACH_CHAT_VPS_URL manquant — tunnel vers le VPS outreach (ex. :3848)"
        : "CARTO_CHAT_VPS_URL manquant — tunnel SSH vers le worker VPS (port 3847)"
    );
  }
  const headers: Record<string, string> = {};
  const s = secret(kind);
  if (s) headers.Authorization = `Bearer ${s}`;

  const timeoutMs = opts.timeoutMs ?? ASK_DEFAULT_MS;
  const { status, json } = await longPostJson(
    `${base}/ask`,
    {
      prompt: opts.prompt,
      timeoutMs,
      endMarker: opts.endMarker || undefined,
    },
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

/** Annule un job Contabo / carto par endMarker (queued ou running). */
export async function cartoChatVpsCancel(opts: {
  endMarker: string;
  kind?: CartoChatVpsKind;
}): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const kind = opts.kind;
  const base = baseUrl(kind);
  const marker = String(opts.endMarker || "").trim();
  if (!base || !marker) {
    return { ok: false, error: "base URL / endMarker manquant" };
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const s = secret(kind);
  if (s) headers.Authorization = `Bearer ${s}`;
  try {
    const res = await fetch(`${base}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ endMarker: marker }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      cancelled?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, cancelled: Boolean(data.cancelled ?? true) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "cancel impossible",
    };
  }
}

/**
 * Coupe les jobs Contabo outreach actifs (queued/running) — orphelins d’un
 * reset / run précédent. `keepEndMarkers` = jobs à préserver (ex. le courant).
 */
export async function cancelOrphanOutreachContaboJobs(opts?: {
  keepEndMarkers?: string[] | null;
}): Promise<{ cancelled: number; kept: number; errors: string[] }> {
  const keep = new Set(
    (opts?.keepEndMarkers || [])
      .map((m) => String(m || "").trim())
      .filter(Boolean)
  );
  const out = { cancelled: 0, kept: 0, errors: [] as string[] };
  if (!isOutreachChatVpsConfigured()) return out;

  let health: CartoChatVpsHealth;
  try {
    health = await cartoChatVpsHealth({ kind: "outreach" });
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : "health impossible");
    return out;
  }
  if (!health.ok) {
    out.errors.push(health.error || "health ko");
    return out;
  }

  const active = (health.jobs || []).filter((j) => {
    const st = String(j.state || "");
    return st === "running" || st === "queued" || st === "starting";
  });

  for (const job of active) {
    const marker = String(job.endMarker || "").trim();
    if (!marker) continue;
    if (keep.has(marker)) {
      out.kept += 1;
      continue;
    }
    const res = await cartoChatVpsCancel({
      endMarker: marker,
      kind: "outreach",
    });
    if (res.ok && res.cancelled !== false) {
      out.cancelled += 1;
    } else if (res.error) {
      out.errors.push(`${marker.slice(-8)}: ${res.error}`);
    }
  }
  return out;
}

/** Démarre Chat en async (202) — le lab poll /health puis read-last. */
export async function cartoChatVpsAskAsync(opts: {
  prompt: string;
  timeoutMs?: number;
  endMarker?: string;
  /**
   * 1–5. Si omis → effort VPS (CARTO_CHAT_EFFORT_LEVEL, High carto).
   * Outreach pipeline = 3 (High).
   */
  effortLevel?: number;
  /**
   * carto = max 5 slots (prioritaire).
   * outreach = file wizard illimitée (slots libres restants).
   */
  kind?: CartoChatVpsKind;
  /** Pipeline multi-tours (même fil Chat). */
  steps?: Array<{ prompt: string; endMarker: string }>;
}): Promise<{
  ok: true;
  started: true;
  startedAt: number;
  promptPreview: string;
  endMarker: string;
}> {
  const kind = opts.kind;
  const base = baseUrl(kind);
  if (!base) {
    throw new Error(
      kind === "outreach"
        ? "OUTREACH_CHAT_VPS_URL manquant — tunnel vers le VPS outreach (ex. :3848)"
        : "CARTO_CHAT_VPS_URL manquant — tunnel SSH vers le worker VPS (port 3847)"
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const s = secret(kind);
  if (s) headers.Authorization = `Bearer ${s}`;

  const effortN = Number(opts.effortLevel);
  const effortLevel =
    Number.isFinite(effortN) && effortN >= 1 && effortN <= 5
      ? effortN
      : undefined;

  // Preflight court : si le tunnel/worker ne répond pas, fail fast (évite 20–60s d’attente).
  try {
    const healthRes = await fetch(`${base}/health`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!healthRes.ok && healthRes.status !== 401) {
      throw new Error(`VPS Chat health HTTP ${healthRes.status}`);
    }
    // 401 = secret manquant côté client ; le POST échouera aussi — on continue.
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort|timeout|fetch failed|ECONNRESET|socket|UND_ERR|network/i.test(msg) ||
        (e instanceof Error && e.name === "TimeoutError")) {
      throw new Error(
        "VPS Chat injoignable (tunnel / worker) — relance scripts/carto-chat-vps/tunnel.sh puis réessaie"
      );
    }
    // health 401 sans bearer ok plus bas ; autres erreurs → on tente ask-async
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${base}/ask-async`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: opts.prompt,
          timeoutMs: opts.timeoutMs ?? ASK_DEFAULT_MS,
          endMarker: opts.endMarker || undefined,
          ...(effortLevel != null ? { effortLevel } : {}),
          ...(opts.kind === "carto" || opts.kind === "outreach"
            ? { kind: opts.kind }
            : {}),
          ...(Array.isArray(opts.steps) && opts.steps.length > 0
            ? { steps: opts.steps }
            : {}),
        }),
        // Enqueue doit être immédiat ; si le worker est bloqué CDP, on laisse 90s.
        signal: AbortSignal.timeout(90_000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        job?: { startedAt?: number; promptPreview?: string; endMarker?: string };
      };
      if (!res.ok) {
        throw new Error(data.error || `VPS Chat HTTP ${res.status}`);
      }
      return {
        ok: true,
        started: true,
        startedAt: Number(data.job?.startedAt || Date.now()),
        promptPreview: String(data.job?.promptPreview || ""),
        endMarker: String(data.job?.endMarker || opts.endMarker || ""),
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable =
        /abort|timeout|fetch failed|ECONNRESET|socket|UND_ERR|network/i.test(
          msg
        ) || (e instanceof Error && e.name === "TimeoutError");
      if (!retryable || attempt === 3) break;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  const msg =
    lastErr instanceof Error ? lastErr.message : "ask-async impossible";
  if (/abort|timeout|fetch failed/i.test(msg) ||
      (lastErr instanceof Error && lastErr.name === "TimeoutError")) {
    throw new Error(
      "Timeout VPS Chat au lancement — worker saturé ou tunnel HS. Réessaie dans 30s (ou relance le tunnel)."
    );
  }
  throw lastErr instanceof Error ? lastErr : new Error(msg);
}
