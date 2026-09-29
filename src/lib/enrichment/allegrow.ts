/**
 * Allegrow Email Validation — POST /v1/email/validate
 * https://docs.allegrow.co/reference/validate-email
 */

import type { EmailVerifyResult, EmailVerifyStatus } from "@/lib/enrichment/verify-email";

const ALLEGROW_VALIDATE_URL = "https://api.allegrow.co/v1/email/validate";
const MAX_POLLS = 8;

function allegrowKey(): string | null {
  return process.env.ALLEGROW_API_KEY?.trim() || null;
}

export function isAllegrowConfigured(): boolean {
  return Boolean(allegrowKey());
}

type AllegrowStatus =
  | "safe"
  | "do_not_mail_abuse"
  | "some_risk"
  | "block_bounce_risk"
  | "dead_email"
  | "more_time_required"
  | string;

type AllegrowResponse = {
  email?: string;
  requestId?: string;
  allegrowStatus?: AllegrowStatus;
  result?: {
    status?: AllegrowStatus;
    subStatus?: string | null;
  };
  domain?: {
    name?: string | null;
    isCatchAll?: boolean | null;
    mxProvider?: string | null;
    mxRecords?: string[];
  };
  mailbox?: {
    isRoleAccount?: boolean | null;
  };
  pollUrl?: string;
  retryAfter?: number;
  message?: string;
  error?: string;
  validatedAt?: string;
};

function mapStatus(
  status: AllegrowStatus | undefined,
  isCatchAll: boolean | null | undefined
): EmailVerifyStatus {
  switch (status) {
    case "safe":
      return "valid";
    case "dead_email":
    case "block_bounce_risk":
    case "do_not_mail_abuse":
      return "invalid";
    case "some_risk":
      return isCatchAll ? "catch_all" : "unknown";
    default:
      return isCatchAll ? "catch_all" : "unknown";
  }
}

function mapLabel(status: EmailVerifyStatus, allegrowStatus: string): string {
  switch (status) {
    case "valid":
      return "Safe (Allegrow)";
    case "invalid":
      return `Risqué / invalide (Allegrow · ${allegrowStatus})`;
    case "catch_all":
      return "Catch-all / risque (Allegrow)";
    default:
      return `Indéterminé (Allegrow · ${allegrowStatus})`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllegrow(
  url: string,
  apiKey: string,
  init?: RequestInit
): Promise<{ httpStatus: number; data: AllegrowResponse }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as AllegrowResponse;
  return { httpStatus: res.status, data };
}

function toResult(data: AllegrowResponse, email: string): EmailVerifyResult {
  const allegrowStatus =
    data.result?.status || data.allegrowStatus || "unknown";
  const isCatchAll = data.domain?.isCatchAll ?? null;
  const status = mapStatus(allegrowStatus, isCatchAll);
  const mxHosts = data.domain?.mxRecords || [];
  const parts = [
    `status=${allegrowStatus}`,
    data.result?.subStatus ? `sub=${data.result.subStatus}` : null,
    data.domain?.mxProvider ? `mx=${data.domain.mxProvider}` : null,
    isCatchAll === true ? "catch-all" : isCatchAll === false ? "pas catch-all" : null,
    data.mailbox?.isRoleAccount ? "role-account" : null,
  ].filter(Boolean);

  return {
    email: (data.email || email).toLowerCase(),
    status,
    label: mapLabel(status, allegrowStatus),
    hasMx: mxHosts.length > 0,
    mxHosts,
    smtpChecked: true,
    catchAll: isCatchAll,
    detail: `Allegrow · ${parts.join(" · ")}`,
    provider: "allegrow",
  };
}

/**
 * Valide un email via Allegrow (sync + polling si 202).
 * Retourne null si la clé n'est pas configurée.
 */
export async function verifyWithAllegrow(
  rawEmail: string
): Promise<EmailVerifyResult | null> {
  const apiKey = allegrowKey();
  if (!apiKey) return null;

  const email = rawEmail.trim().toLowerCase();

  const first = await fetchAllegrow(ALLEGROW_VALIDATE_URL, apiKey, {
    method: "POST",
    body: JSON.stringify({
      email,
      metadata: { source: "glowup-enrichissement" },
    }),
  });

  if (first.httpStatus === 401 || first.httpStatus === 403) {
    return {
      email,
      status: "unknown",
      label: "Erreur Allegrow (accès API)",
      hasMx: false,
      mxHosts: [],
      smtpChecked: false,
      catchAll: null,
      detail:
        first.data.message ||
        (first.httpStatus === 403
          ? "403 — plan/API non activé chez Allegrow"
          : "Unauthorized"),
      provider: "allegrow",
      // Signal pour fallback local côté route.
      allegrowAuthDenied: true,
    };
  }

  if (first.httpStatus === 400) {
    return {
      email,
      status: "unknown",
      label: "Erreur Allegrow",
      hasMx: false,
      mxHosts: [],
      smtpChecked: false,
      catchAll: null,
      detail: first.data.message || first.data.error || "Bad Request",
      provider: "allegrow",
    };
  }

  if (first.httpStatus === 200 && first.data.result?.status) {
    return toResult(first.data, email);
  }

  // 202 → poll
  let pollUrl = first.data.pollUrl;
  let retryAfter = Math.max(1, first.data.retryAfter || 2);

  if (!pollUrl && first.httpStatus !== 202) {
    return {
      email,
      status: "unknown",
      label: "Erreur Allegrow",
      hasMx: false,
      mxHosts: [],
      smtpChecked: false,
      catchAll: null,
      detail: first.data.message || `HTTP ${first.httpStatus}`,
      provider: "allegrow",
    };
  }

  for (let i = 0; i < MAX_POLLS && pollUrl; i++) {
    await sleep(retryAfter * 1000);
    const polled = await fetchAllegrow(pollUrl, apiKey, { method: "GET" });
    if (polled.httpStatus === 200 && polled.data.result?.status) {
      return toResult(polled.data, email);
    }
    if (polled.httpStatus === 202) {
      pollUrl = polled.data.pollUrl || pollUrl;
      retryAfter = Math.max(1, polled.data.retryAfter || retryAfter);
      continue;
    }
    return {
      email,
      status: "unknown",
      label: "Erreur Allegrow (poll)",
      hasMx: false,
      mxHosts: [],
      smtpChecked: false,
      catchAll: null,
      detail: polled.data.message || `HTTP ${polled.httpStatus}`,
      provider: "allegrow",
    };
  }

  return {
    email,
    status: "unknown",
    label: "Allegrow — timeout",
    hasMx: false,
    mxHosts: [],
    smtpChecked: false,
    catchAll: null,
    detail: "Validation trop longue (> ~30s)",
    provider: "allegrow",
  };
}
