/**
 * Tracking ouvertures (pixel 1x1) + clics (liens réécrits) pour les mails
 * sortants depuis la plateforme. Utilisé pour les mails casting inbound
 * envoyés via /api/inbound/opportunities/[id]/send.
 *
 * Le destinataire ne voit RIEN :
 *  - le pixel est transparent, caché en bas du corps HTML
 *  - les liens sont réécrits côté DOM, l'ancre visible reste inchangée
 */

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

const ABSOLUTE_URL = /^https?:\/\//i;

function encodeUrlParam(url: string): string {
  // base64url pour éviter les soucis d'encodage dans les query strings.
  return Buffer.from(url, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeUrlParam(encoded: string): string | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const url = Buffer.from(b64 + pad, "base64").toString("utf-8");
    if (!ABSOLUTE_URL.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Réécrit les <a href="https://..."> du HTML pour passer par notre
 * redirecteur. On ne touche pas aux liens mailto:, tel:, ancres, ni au
 * pixel lui-même (qui sera ajouté après).
 */
function rewriteLinks(html: string, opportunityId: string): string {
  const baseUrl = getBaseUrl();
  return html.replace(
    /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, url: string, after: string) => {
      // Ne pas réécrire les liens qui pointent déjà sur le tracker
      // (cas d'un mail copié-collé qui réinjecterait du tracking).
      if (url.includes("/api/email/track/")) return match;
      const encoded = encodeUrlParam(url);
      const newUrl = `${baseUrl}/api/email/track/click?id=${encodeURIComponent(
        opportunityId
      )}&u=${encoded}`;
      return `<a ${before}href=${quote}${newUrl}${quote}${after}>`;
    }
  );
}

function buildPixelTag(opportunityId: string): string {
  const baseUrl = getBaseUrl();
  const src = `${baseUrl}/api/email/track/open?id=${encodeURIComponent(
    opportunityId
  )}`;
  // 1x1 transparent, caché. Le `display:none` n'empêche pas le chargement
  // dans la plupart des clients (sinon Apple Mail le pré-charge quand même).
  return `<img src="${src}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0;visibility:hidden;overflow:hidden;mso-hide:all" />`;
}

/**
 * Injecte le tracking dans un mail HTML.
 * - Réécrit tous les <a href> http(s).
 * - Ajoute le pixel à la fin du body (avant </body> si présent, sinon append).
 */
export function injectInboundTracking(html: string, opportunityId: string): string {
  if (!opportunityId) return html;
  const withLinks = rewriteLinks(html, opportunityId);
  const pixel = buildPixelTag(opportunityId);

  if (/<\/body>/i.test(withLinks)) {
    return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${withLinks}${pixel}`;
}

/**
 * Heuristique pour détecter les pre-fetch automatiques (Apple Mail Privacy
 * Protection, proxys Gmail, antivirus, etc.) qui chargent les images sans
 * que l'humain n'ait réellement ouvert le mail.
 *
 * On retourne true si on doit IGNORER l'événement.
 */
export function isLikelyBotPrefetch(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // Pas d'UA = quasi-toujours un bot
  const ua = userAgent.toLowerCase();
  if (ua.includes("googleimageproxy")) return false; // Gmail charge à l'ouverture réelle → on garde
  if (ua.includes("yahooexternalcachehit")) return true;
  if (ua.includes("microsoft office")) return true; // Outlook safe-link scanner
  if (ua.includes("outlook-iossafelink")) return true;
  if (ua.includes("bingpreview")) return true;
  if (ua.includes("slackbot")) return true;
  if (ua.includes("facebookexternalhit")) return true;
  if (ua.includes("linkedinbot")) return true;
  if (ua.includes("twitterbot")) return true;
  if (ua.includes("whatsapp")) return true;
  // Apple Mail Privacy Protection : Apple précharge depuis ses propres
  // relays iCloud avec un UA classique iOS. Heuristique : si on voit un
  // chargement <2s après l'envoi → quasi-certain que c'est Apple, mais
  // on ne peut pas le savoir au niveau du seul UA. On laisse passer et
  // c'est l'appelant qui filtre via le délai entre `sentAt` et maintenant.
  return false;
}
