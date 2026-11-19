/**
 * Matching marque pour recover Fil (évite Mercedes → Volkswagen).
 */

export function normalizeBrandKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tokens utiles (ignore agence, sa, etc.). */
export function brandTokens(brand: string): string[] {
  const stop = new Set([
    "sa",
    "sas",
    "sarl",
    "ltd",
    "inc",
    "the",
    "le",
    "la",
    "les",
    "de",
    "du",
    "des",
    "et",
    "group",
    "groupe",
    "france",
    "belgique",
    "benelux",
  ]);
  return normalizeBrandKey(brand)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
}

export function textMentionsBrand(text: string, brand: string): boolean {
  const blob = normalizeBrandKey(text);
  const key = normalizeBrandKey(brand);
  if (!key || !blob) return false;
  if (blob.includes(key)) return true;
  const tokens = brandTokens(brand);
  if (tokens.length === 0) return false;
  // Au moins le token principal (le plus long)
  const main = [...tokens].sort((a, b) => b.length - a.length)[0];
  return Boolean(main && blob.includes(main));
}

/** Job health / preview / hint correspond à la marque demandée. */
export function jobMatchesBrand(
  job: {
    promptPreview?: string | null;
    companyHint?: string | null;
  },
  brand: string
): boolean {
  const hint = String(job.companyHint || "");
  const prev = String(job.promptPreview || "");
  return textMentionsBrand(`${hint}\n${prev}`, brand);
}

/** La réponse Chat parle bien de cette marque (pas d’une autre). */
export function answerMatchesBrand(answer: string, brand: string): boolean {
  const head = String(answer || "").slice(0, 4000);
  return textMentionsBrand(head, brand);
}
