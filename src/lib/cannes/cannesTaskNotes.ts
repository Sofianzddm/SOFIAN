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
