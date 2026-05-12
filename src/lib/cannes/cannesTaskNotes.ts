/** Retire les patterns les plus dangereux avant stockage / rendu HTML côté client. */
export function sanitizeCannesTaskHtml(html: string): string {
  let s = html;
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<\/?iframe\b[^>]*>/gi, "");
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/javascript:/gi, "");
  return s;
}

const HTMLISH = /<\/?[a-z][\s\S]*?>/i;

export function looksLikeHtmlNotes(raw: string): boolean {
  return HTMLISH.test(raw.trim());
}

/** Contenu vide (paragraphe vide, br seul, espaces). */
export function isCannesTaskNotesEmpty(html: string): boolean {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  return plain.length === 0;
}

/** Texte plat pour cellule Excel / CSV (consignes HTML). */
export function htmlToPlainTextForExport(html: string): string {
  if (!html.trim()) return "";
  let t = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/  +/g, " ").trim();
  return t;
}
