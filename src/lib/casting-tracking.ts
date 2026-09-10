/**
 * Tracking ouvertures (pixel 1x1) + clics (liens reecrits) pour les mails
 * de prospection talent envoyes depuis la boite de Leyna.
 *
 * Variante du tracking inbound (cf. lib/email-tracking.ts) mais pointe vers
 * un autre endpoint car les compteurs sont stockes sur contact_missions
 * et non sur inbound_opportunities.
 *
 * Si `recipientEmail` est fourni, il est encode dans le pixel / les liens
 * (`&e=`) pour ventiler ouvertures et clics par destinataire.
 */

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  const cleaned = raw.replace(/\/$/, "");
  // Jamais de localhost dans les liens de tracking des mails (sinon les
  // destinataires / l’aperçu « mails envoyés » tombent sur localhost…).
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleaned)) {
    return "https://app.glowupagence.fr";
  }
  return cleaned || "https://app.glowupagence.fr";
}

function encodeUrlParam(url: string): string {
  return Buffer.from(url, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeCastingUrlParam(encoded: string): string | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const url = Buffer.from(b64 + pad, "base64").toString("utf-8");
    if (!/^https?:\/\//i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

function emailQueryParam(recipientEmail?: string | null): string {
  const email = String(recipientEmail || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) return "";
  return `&e=${encodeURIComponent(email)}`;
}

function rewriteLinks(html: string, missionId: string, recipientEmail?: string | null): string {
  const baseUrl = getBaseUrl();
  const eParam = emailQueryParam(recipientEmail);
  return html.replace(
    /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, url: string, after: string) => {
      if (url.includes("/api/email/track/")) return match;
      const encoded = encodeUrlParam(url);
      const newUrl = `${baseUrl}/api/email/track/casting/click?id=${encodeURIComponent(
        missionId
      )}&u=${encoded}${eParam}`;
      return `<a ${before}href=${quote}${newUrl}${quote}${after}>`;
    }
  );
}

function buildPixelTag(missionId: string, recipientEmail?: string | null): string {
  const baseUrl = getBaseUrl();
  const eParam = emailQueryParam(recipientEmail);
  const src = `${baseUrl}/api/email/track/casting/open?id=${encodeURIComponent(missionId)}${eParam}`;
  return `<img src="${src}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0;visibility:hidden;overflow:hidden;mso-hide:all" />`;
}

export function injectCastingTracking(
  html: string,
  missionId: string,
  recipientEmail?: string | null
): string {
  if (!missionId) return html;
  const withLinks = rewriteLinks(html, missionId, recipientEmail);
  const pixel = buildPixelTag(missionId, recipientEmail);
  if (/<\/body>/i.test(withLinks)) {
    return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${withLinks}${pixel}`;
}
