/**
 * Vérifie que la réponse Chat parle bien de la marque demandée
 * (évite de structurer MAC alors qu'on a lancé Avène).
 */

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // M·A·C / M.A.C → mac
    .replace(/\bm\s*[·.\-_]?\s*a\s*[·.\-_]?\s*c\b/g, "mac")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tokens marque utiles (ignore cosmétiques / france / etc.). */
function companyTokens(company: string): string[] {
  const stop = new Set([
    "cosmetics",
    "cosmetic",
    "paris",
    "france",
    "fr",
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
    "company",
    "companies",
    "makeup",
    "beauty",
    "skincare",
    "professional",
  ]);
  return norm(company)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

export function answerMatchesCompany(
  answer: string,
  company: string
): { ok: true } | { ok: false; reason: string } {
  const a = norm(answer.slice(0, 6000));
  const tokens = companyTokens(company);
  if (!tokens.length) {
    const whole = norm(company);
    if (whole.length >= 3 && a.includes(whole)) return { ok: true };
    return { ok: false, reason: `Marque « ${company} » absente de la réponse Chat` };
  }

  const hit = tokens.filter((t) => a.includes(t));
  // Au moins 1 token fort, ou tous si un seul
  if (hit.length >= 1) return { ok: true };

  // Heuristique : grosse autre marque connue en tête de réponse
  const head = a.slice(0, 280);
  const foreignBrands = [
    "mac",
    "nyx",
    "hoka",
    "red bull",
    "loreal",
    "estee lauder",
    "avene",
  ] as const;
  const foreignHit = foreignBrands.find((b) => head.includes(b));
  if (foreignHit && !tokens.includes(foreignHit) && !norm(company).includes(foreignHit)) {
    return {
      ok: false,
      reason: `La réponse à l'écran parle d'une autre marque (pas « ${company} ») — relance Générer`,
    };
  }

  return {
    ok: false,
    reason: `Réponse Chat ne mentionne pas « ${company} » — relance Générer`,
  };
}
