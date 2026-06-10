/**
 * Tracking ouvertures (pixel 1x1) + clics (liens reecrits) pour les mails
 * du module Outreach (cycle de contact clients 45 jours).
 *
 * Variante de lib/casting-tracking.ts mais les compteurs sont stockes sur
 * outreach_touches (id du touch en parametre).
 */

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

function encodeUrlParam(url: string): string {
  return Buffer.from(url, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeOutreachUrlParam(encoded: string): string | null {
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

function rewriteLinks(html: string, touchId: string): string {
  const baseUrl = getBaseUrl();
  return html.replace(
    /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, url: string, after: string) => {
      if (url.includes("/api/email/track/")) return match;
      const encoded = encodeUrlParam(url);
      const newUrl = `${baseUrl}/api/email/track/outreach/click?id=${encodeURIComponent(
        touchId
      )}&u=${encoded}`;
      return `<a ${before}href=${quote}${newUrl}${quote}${after}>`;
    }
  );
}

function buildPixelTag(touchId: string): string {
  const baseUrl = getBaseUrl();
  const src = `${baseUrl}/api/email/track/outreach/open?id=${encodeURIComponent(touchId)}`;
  return `<img src="${src}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0;visibility:hidden;overflow:hidden;mso-hide:all" />`;
}

export function injectOutreachTracking(html: string, touchId: string): string {
  if (!touchId) return html;
  const withLinks = rewriteLinks(html, touchId);
  const pixel = buildPixelTag(touchId);
  if (/<\/body>/i.test(withLinks)) {
    return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${withLinks}${pixel}`;
}
