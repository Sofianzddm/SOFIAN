import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_THREADS_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GMAIL_SEND_AS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs";

const SIGNATURE_CACHE = new Map<string, { value: string; expiresAt: number }>();
const SIGNATURE_TTL_MS = 60 * 60 * 1000;

const FROM_NAME_CACHE = new Map<string, { value: string; expiresAt: number }>();
const FROM_NAME_TTL_MS = 10 * 60 * 1000;

/** Nom historique conservé pour la boîte Leyna (comportement inchangé). */
const LEGACY_FROM_NAMES: Record<string, string> = {
  "leyna@glowupagence.fr": "Leyna Khaled",
};

function fallbackNameFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Nom affiché dans le From : displayName de la boîte, sinon prénom/nom du
 * user plateforme lié, sinon nom historique (Leyna), sinon dérivé de l'email.
 */
export async function getGmailFromName(email: string): Promise<string> {
  const key = email.toLowerCase();
  const cached = FROM_NAME_CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let name = "";
  try {
    const token = await prisma.gmailToken.findUnique({
      where: { email: key },
      select: {
        displayName: true,
        user: { select: { prenom: true, nom: true } },
      },
    });
    name =
      token?.displayName?.trim() ||
      (token?.user ? `${token.user.prenom} ${token.user.nom}`.trim() : "");
  } catch {
    name = "";
  }
  if (!name) name = LEGACY_FROM_NAMES[key] || fallbackNameFromEmail(key);

  FROM_NAME_CACHE.set(key, { value: name, expiresAt: Date.now() + FROM_NAME_TTL_MS });
  return name;
}

export function clearGmailFromNameCache(email?: string): void {
  if (email) FROM_NAME_CACHE.delete(email.toLowerCase());
  else FROM_NAME_CACHE.clear();
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Encode un en-tête MIME en RFC 2047 si nécessaire (caractères non-ASCII).
 * Sans ça, Gmail interprète parfois le sujet en latin-1 et affiche des
 * mojibakes type "DA©couvre" au lieu de "Découvre".
 */
function encodeMimeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const base64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

export async function getValidAccessToken(email: string): Promise<string> {
  const token = await prisma.gmailToken.findUnique({ where: { email } });
  if (!token) {
    throw new Error("Gmail non connecté");
  }

  const refreshThresholdMs = 5 * 60 * 1000;
  const shouldRefresh = token.expiresAt.getTime() <= Date.now() + refreshThresholdMs;
  if (!shouldRefresh) return token.accessToken;

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth non configuré");
  }

  const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const refreshJson = (await refreshResponse.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;
  if (!refreshResponse.ok || !refreshJson?.access_token || typeof refreshJson.expires_in !== "number") {
    throw new Error("Impossible de rafraîchir le token Gmail");
  }

  const expiresAt = new Date(Date.now() + refreshJson.expires_in * 1000);
  await prisma.gmailToken.update({
    where: { email },
    data: {
      accessToken: refreshJson.access_token,
      expiresAt,
    },
  });

  return refreshJson.access_token;
}

export async function getGmailSignature(email: string): Promise<string> {
  const cached = SIGNATURE_CACHE.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const accessToken = await getValidAccessToken(email);
    const url = `${GMAIL_SEND_AS_URL}/${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      SIGNATURE_CACHE.set(email, { value: "", expiresAt: Date.now() + SIGNATURE_TTL_MS });
      return "";
    }
    const json = (await res.json().catch(() => null)) as { signature?: string } | null;
    const signature = typeof json?.signature === "string" ? json.signature : "";
    SIGNATURE_CACHE.set(email, { value: signature, expiresAt: Date.now() + SIGNATURE_TTL_MS });
    return signature;
  } catch {
    return "";
  }
}

export function clearGmailSignatureCache(email?: string): void {
  if (email) SIGNATURE_CACHE.delete(email);
  else SIGNATURE_CACHE.clear();
}

function appendSignature(htmlBody: string, signature: string): string {
  if (!signature.trim()) return htmlBody;
  const trimmedBody = htmlBody.trimEnd();
  return `${trimmedBody}<br><br>${signature}`;
}

export async function sendGmail(options: {
  fromEmail: string;
  to: string;
  subject: string;
  htmlBody: string;
  threadId?: string;
  includeSignature?: boolean;
}): Promise<string> {
  const accessToken = await getValidAccessToken(options.fromEmail);

  const shouldAppend = options.includeSignature !== false;
  const signature = shouldAppend ? await getGmailSignature(options.fromEmail) : "";
  const finalBody = appendSignature(options.htmlBody, signature);

  const fromName = await getGmailFromName(options.fromEmail);

  const message = [
    `From: ${encodeMimeHeader(fromName)} <${options.fromEmail}>`,
    `To: ${options.to}`,
    `Subject: ${encodeMimeHeader(options.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    finalBody,
  ].join("\r\n");

  const sendResponse = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: toBase64Url(message),
      ...(options.threadId ? { threadId: options.threadId } : {}),
    }),
  });

  const rawText = await sendResponse.text();
  type GmailSendResponse = {
    id?: string;
    error?: { code?: number; message?: string; status?: string };
  };
  let sendJson: GmailSendResponse | null = null;
  try {
    sendJson = rawText ? (JSON.parse(rawText) as GmailSendResponse) : null;
  } catch {
    sendJson = null;
  }

  if (!sendResponse.ok || !sendJson?.id) {
    const gmailMessage =
      sendJson?.error?.message ||
      rawText.slice(0, 500) ||
      "Réponse Gmail vide";
    const gmailStatus = sendJson?.error?.status || sendJson?.error?.code || sendResponse.status;
    console.error("[gmail.sendGmail] échec", {
      httpStatus: sendResponse.status,
      gmailStatus,
      gmailMessage,
      from: options.fromEmail,
      to: options.to,
      threadId: options.threadId || null,
    });
    throw new Error(`Gmail a refusé l'envoi (${gmailStatus}) : ${gmailMessage}`);
  }

  return sendJson.id;
}

/**
 * Cherche dans les messages ENVOYÉS de la boîte les mails adressés à `to`
 * durant les `days` derniers jours. Renvoie les threads concernés — permet
 * de vérifier qu'on n'a pas déjà contacté un client récemment (séquence
 * HubSpot, mail manuel, autre module…).
 */
export async function findRecentSentToRecipient(
  fromEmail: string,
  to: string,
  days: number
): Promise<{ id: string; threadId: string; internalDate: number | null }[]> {
  const accessToken = await getValidAccessToken(fromEmail);
  const query = `in:sent to:${to} newer_than:${days}d`;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json().catch(() => null)) as {
    messages?: { id: string; threadId: string }[];
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(json?.error?.message || `Gmail search a échoué (${response.status})`);
  }

  const messages = json?.messages || [];
  // Enrichit chaque message avec sa date d'envoi (internalDate, epoch ms).
  // format=minimal renvoie id/threadId/labelIds/internalDate sans le corps.
  return Promise.all(
    messages.map(async (m) => {
      try {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=minimal`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const j = (await r.json().catch(() => null)) as { internalDate?: string } | null;
        const parsed = j?.internalDate ? Number(j.internalDate) : NaN;
        return {
          id: m.id,
          threadId: m.threadId,
          internalDate: Number.isFinite(parsed) ? parsed : null,
        };
      } catch {
        return { id: m.id, threadId: m.threadId, internalDate: null };
      }
    })
  );
}

export async function checkThreadForReply(email: string, threadId: string): Promise<boolean> {
  const accessToken = await getValidAccessToken(email);
  const response = await fetch(`${GMAIL_THREADS_BASE_URL}/${encodeURIComponent(threadId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = (await response.json().catch(() => null)) as { messages?: unknown[] } | null;
  if (!response.ok) return false;

  return Array.isArray(json?.messages) && json.messages.length > 1;
}

export type ThreadActivity = {
  /** Au moins une vraie réponse humaine (ni nos mails, ni un bounce). */
  replied: boolean;
  /** Au moins une notification d'échec de remise (postmaster, mailer-daemon…). */
  bounced: boolean;
};

const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;
const BOUNCE_SUBJECT_RE =
  /undeliver|delivery (has )?failed|delivery status notification|delivery failure|mail delivery failed|address not found|échec de la remise|impossible de remettre|non remis|message non distribué/i;

/**
 * Inspecte un thread Gmail et distingue les vraies réponses des bounces
 * (échec de remise) et de nos propres mails (envoi initial + relance dans le
 * même thread). Contrairement à checkThreadForReply, une relance ou un
 * postmaster ne compte pas comme une réponse.
 */
export async function checkThreadActivity(
  email: string,
  threadId: string
): Promise<ThreadActivity> {
  const accessToken = await getValidAccessToken(email);
  const url = `${GMAIL_THREADS_BASE_URL}/${encodeURIComponent(
    threadId
  )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = (await response.json().catch(() => null)) as {
    messages?: {
      payload?: { headers?: { name?: string; value?: string }[] };
    }[];
  } | null;
  if (!response.ok || !Array.isArray(json?.messages)) {
    return { replied: false, bounced: false };
  }

  const ownEmail = email.trim().toLowerCase();
  let replied = false;
  let bounced = false;

  for (const message of json.messages) {
    const headers = message?.payload?.headers || [];
    const header = (name: string) =>
      headers.find((h) => (h.name || "").toLowerCase() === name)?.value || "";
    const from = header("from").toLowerCase();
    const subject = header("subject");

    if (!from || from.includes(ownEmail)) continue;
    if (BOUNCE_FROM_RE.test(from) || BOUNCE_SUBJECT_RE.test(subject)) {
      bounced = true;
      continue;
    }
    replied = true;
  }

  return { replied, bounced };
}
