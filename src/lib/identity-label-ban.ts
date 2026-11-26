/**
 * Ban global — labels d’orientation / identité dans mails & recherches casting.
 * Couple / famille / parentalité OK en neutre, SANS étiquette.
 */

export const IDENTITY_LABEL_BAN_FR = `INTERDIT ABSOLU — étiquettes vie privée / identité : ne JAMAIS écrire « couple lesbien », « lesbienne », « gay », « LGBTQ », « queer », « homo », « bisexualité », ni aucun label d’orientation sexuelle ou d’identité de genre. Couple / famille / parentalité OK en neutre (« avec sa femme / son compagnon », « humour de couple », « jeune maman ») SANS labelliser. Pas de sensationalisme intime (PMA, parcours médical) sauf si le contexte ops le demande explicitement — et même là, sans label d’orientation.`;

export const IDENTITY_LABEL_BAN_EN = `ABSOLUTE BAN — privacy / identity labels: NEVER write "lesbian couple", "lesbian", "gay", "LGBTQ", "queer", "homo", "bisexual", or any sexual-orientation / gender-identity label. Neutral couple/family wording is OK ("with her wife/partner", "couple humour", "young mum") WITHOUT labeling. No intimate medical sensationalism unless ops explicitly asks — and even then, no orientation labels.`;

const LABEL_RES: Array<{ re: RegExp; repl: string }> = [
  { re: /\bcouple\s+lesbienne?s?\b/gi, repl: "couple" },
  { re: /\bduo\s+lesbienne?s?\b/gi, repl: "duo" },
  { re: /\bparentalit[ée]\s+lesbienne?\b/gi, repl: "parentalité" },
  { re: /\bvie\s+de\s+couple\s+lesbienne?\b/gi, repl: "vie de couple" },
  { re: /\blesbian\s+couples?\b/gi, repl: "couple" },
  { re: /\blesbian\s+parent(?:hood|ing)?\b/gi, repl: "parenthood" },
  { re: /\blesbiennes?\b/gi, repl: "" },
  { re: /\blesbians?\b/gi, repl: "" },
  { re: /\bgays?\b/gi, repl: "" },
  { re: /\bhomosexuel(?:le)?s?\b/gi, repl: "" },
  { re: /\bhomosexualit[ée]\b/gi, repl: "" },
  { re: /\bbisexuel(?:le)?s?\b/gi, repl: "" },
  { re: /\bbisexualit[ée]\b/gi, repl: "" },
  { re: /\bbisexual(?:ity|s)?\b/gi, repl: "" },
  { re: /\bLGBTQ(?:IA)?\+?\b/gi, repl: "" },
  { re: /\bLGBT\+?\b/gi, repl: "" },
  { re: /\bqueers?\b/gi, repl: "" },
  { re: /\borientation\s+sexuelle\b/gi, repl: "" },
  { re: /\bsexual\s+orientation\b/gi, repl: "" },
  { re: /\bhomos?\b/gi, repl: "" },
];

/** True si le texte contient encore un label interdit. */
export function hasIdentityLabel(text: string | null | undefined): boolean {
  const s = String(text || "");
  if (!s.trim()) return false;
  return LABEL_RES.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(s);
  });
}

/**
 * Filet post-génération / pré-envoi : retire les labels d’orientation.
 * Safe sur HTML (ne touche pas les balises).
 */
export function scrubIdentityLabels(text: string | null | undefined): string {
  let s = String(text || "");
  if (!s) return s;
  for (const { re, repl } of LABEL_RES) {
    s = s.replace(re, repl);
  }
  // Nettoyage espaces / ponctuation après suppressions
  s = s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:])\s*([,.;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return s;
}

/** Scrub récursif sur strings d’un objet (research / snapshot). */
export function scrubIdentityLabelsDeep<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") {
    return scrubIdentityLabels(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubIdentityLabelsDeep(v)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubIdentityLabelsDeep(v);
    }
    return out as T;
  }
  return value;
}
