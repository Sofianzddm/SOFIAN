/**
 * HTML compatible clients mail (Gmail, Outlook…) pour les corps rédigés dans TipTap.
 *
 * TipTap / ProseMirror produit un <p> par paragraphe (touche Entrée) et un <br>
 * par retour simple (Maj+Entrée). Dans l'éditeur (styles `prose`), chaque
 * paragraphe est séparé par un espacement équivalent à une ligne vide.
 *
 * Pour que le mail envoyé soit IDENTIQUE à ce que montre l'éditeur, on aplatit :
 *  - frontière de paragraphe </p><p>  → <br /><br />  (ligne vide, comme à l'écran)
 *  - paragraphe vide <p></p>          → <br /><br />  (ligne vide)
 *  - retour simple <br> (Maj+Entrée)  → <br />        (lignes collées)
 * puis on borne à une seule ligne vide consécutive (3+ <br> → 2).
 */

const EMPTY_P_MARKER = "__EMPTY_P__";
const P_BOUNDARY_MARKER = "__P_BOUNDARY__";

function markdownBoldToStrong(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/**
 * Texte brut ou Markdown léger (**gras**) → HTML sans balises <p>.
 */
export function plainTextToEmailHtml(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (t.startsWith("<")) return normalizeEditorHtmlForEmail(t);

  const withBold = markdownBoldToStrong(t);
  const normalized = withBold.replace(/\r\n/g, "\n");
  const hasBlankLine = /\n\s*\n/.test(normalized);
  const rawParagraphs = hasBlankLine ? normalized.split(/\n\s*\n+/) : [normalized];

  return rawParagraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/\n/g, "<br />"))
    .join("<br /><br />");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Bloc « citation » à la Gmail à ajouter SOUS le corps d'une relance : le mail
 * d'origine est repris en dessous (entre un trait vertical), précédé d'une
 * ligne « Le <date>, <expéditeur> a écrit : ». Ainsi le destinataire voit le
 * contenu initial même si l'original est parti dans ses spams.
 */
export function buildQuotedOriginal(
  originalHtml: string,
  opts: { dateLabel: string; senderLabel: string }
): string {
  const inner = normalizeEditorHtmlForEmail(originalHtml);
  if (!inner) return "";
  const intro =
    opts.dateLabel && opts.senderLabel
      ? `Le ${escapeHtml(opts.dateLabel)}, ${escapeHtml(opts.senderLabel)} a écrit :`
      : opts.senderLabel
        ? `${escapeHtml(opts.senderLabel)} a écrit :`
        : "";
  return (
    `<br /><br />` +
    `<div class="gmail_quote">` +
    (intro ? `${intro}<br />` : "") +
    `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">` +
    inner +
    `</blockquote></div>`
  );
}

/**
 * Convertit le HTML éditeur (TipTap, HubSpot…) en HTML d’envoi mail.
 */
export function normalizeEditorHtmlForEmail(html: string): string {
  let s = html.trim();
  if (!s) return "";

  s = s
    .replace(/<p[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, EMPTY_P_MARKER)
    .replace(/<\/p>\s*<p[^>]*>/gi, P_BOUNDARY_MARKER)
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "")
    .replace(new RegExp(EMPTY_P_MARKER, "g"), "<br /><br />")
    .replace(new RegExp(P_BOUNDARY_MARKER, "g"), "<br /><br />")
    .replace(/<\/div>\s*<div[^>]*>/gi, P_BOUNDARY_MARKER)
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/div>/gi, "")
    .replace(new RegExp(P_BOUNDARY_MARKER, "g"), "<br />")
    .replace(/<br\s*\/?>/gi, "<br />")
    .replace(/\n/g, "<br />");

  s = s.replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br /><br />");

  return s.trim();
}
