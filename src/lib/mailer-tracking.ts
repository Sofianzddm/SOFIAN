/**
 * Tracking d'ouverture (pixel 1x1) pour le rédacteur de mails admin.
 *
 * Le pixel pointe vers /api/email/track/mailer/open :
 *  - ?m=<mailId>     pour le mail initial
 *  - ?f=<followupId> pour une relance
 *
 * Limites connues (comme tout tracking par pixel) : les images peuvent être
 * bloquées par le destinataire, mises en cache par le proxy Gmail, ou
 * préchargées (Apple Mail Privacy Protection). Le compteur est donc un
 * indicateur, pas une preuve absolue de lecture.
 */

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

function buildPixelTag(param: "m" | "f", id: string): string {
  const baseUrl = getBaseUrl();
  const src = `${baseUrl}/api/email/track/mailer/open?${param}=${encodeURIComponent(id)}`;
  return `<img src="${src}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0;visibility:hidden;overflow:hidden;mso-hide:all" />`;
}

function injectPixel(html: string, pixel: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

/** Ajoute le pixel d'ouverture du mail initial. */
export function injectMailerOpenTracking(html: string, mailId: string): string {
  if (!mailId) return html;
  return injectPixel(html, buildPixelTag("m", mailId));
}

/** Ajoute le pixel d'ouverture d'une relance. */
export function injectFollowupOpenTracking(
  html: string,
  followupId: string
): string {
  if (!followupId) return html;
  return injectPixel(html, buildPixelTag("f", followupId));
}
