/**
 * Force le salut à utiliser le jeton HubSpot {{ contact.firstname }}
 * (jamais un prénom en dur — multi-destinataires).
 */

const FIRSTNAME_TOKEN = "{{ contact.firstname }}";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remplace « Bonjour Aline, » / « Hello Marie, » / etc. par le jeton.
 * Si `knownFirstnames` est fourni, remplace aussi ces prénoms dans le salut.
 */
export function ensureContactFirstnameToken(
  htmlOrText: string,
  knownFirstnames: string[] = []
): string {
  let out = String(htmlOrText || "");
  if (!out.trim()) return out;

  // Déjà le bon jeton (variantes d'espaces)
  out = out.replace(
    /\{\{\s*contact\.firstname\s*\}\}/gi,
    FIRSTNAME_TOKEN
  );

  // Salut HTML ou texte : Bonjour/Hello/Hi + prénom (pas déjà un jeton)
  out = out.replace(
    /(<(?:p|div|span)[^>]*>\s*)?(Bonjour|Hello|Hi)(\s+)(?!\{\{\s*contact\.firstname)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-]*)(\s*,)/gi,
    (_m, open: string | undefined, greet: string, sp: string, _name: string, comma: string) =>
      `${open || ""}${greet}${sp}${FIRSTNAME_TOKEN}${comma}`
  );

  // Prénoms connus des destinataires (filet si le salut a été reformulé)
  const names = [...new Set(knownFirstnames.map((n) => n.trim()).filter(Boolean))];
  for (const name of names) {
    if (name.length < 2) continue;
    const re = new RegExp(
      `(Bonjour|Hello|Hi)(\\s+)${escapeRegExp(name)}(\\s*,)`,
      "gi"
    );
    out = out.replace(re, `$1$2${FIRSTNAME_TOKEN}$3`);
  }

  return out;
}
