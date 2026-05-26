import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_THREADS_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GMAIL_SEND_AS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs";

const SIGNATURE_CACHE = new Map<string, { value: string; expiresAt: number }>();
const SIGNATURE_TTL_MS = 60 * 60 * 1000;

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

  const message = [
    `From: Leyna Khaled <${options.fromEmail}>`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
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

  const sendJson = (await sendResponse.json().catch(() => null)) as { id?: string } | null;
  if (!sendResponse.ok || !sendJson?.id) {
    throw new Error("Échec envoi Gmail");
  }

  return sendJson.id;
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
