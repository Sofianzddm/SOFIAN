/**
 * Vérifie que la réponse Chat parle bien de la marque demandée
 * (évite de structurer MAC alors qu'on a lancé Avène).
 *
 * Matching souple : espaces / ponctuation ignorés
 * → « Redbull » matche « Red Bull », « L'Oréal » matche « Loreal », etc.
 */

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // M·A·C / M.A.C → mac (sinon « m a c » trop fragile)
    .replace(/\bm\s*[·.\-_]?\s*a\s*[·.\-_]?\s*c\b/g, "mac")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sans espaces : Red Bull / Redbull / red-bull → redbull */
function compact(s: string): string {
  return norm(s).replace(/\s+/g, "");
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
  const slice = answer.slice(0, 8000);
  const a = norm(slice);
  const aCompact = compact(slice);
  const cCompact = compact(company);

  // 1) Forme compacte : « Redbull » ↔ « Red Bull », « nyxcosmetics » ↔ « NYX Cosmetics »
  if (cCompact.length >= 3 && aCompact.includes(cCompact)) {
    return { ok: true };
  }

  // 2) Préfixe compact (marque courte / Chat tronque) — min 5 pour limiter les faux positifs
  if (cCompact.length >= 5) {
    const prefix = cCompact.slice(0, Math.min(8, cCompact.length));
    if (prefix.length >= 5 && aCompact.includes(prefix)) {
      return { ok: true };
    }
  }

  // 3) Tokens individuels dans le texte normalisé
  const tokens = companyTokens(company);
  if (tokens.length) {
    const hit = tokens.filter(
      (t) => a.includes(t) || aCompact.includes(t.replace(/\s+/g, ""))
    );
    if (hit.length >= 1) return { ok: true };
  } else if (cCompact.length >= 3 && aCompact.includes(cCompact)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Réponse Chat ne mentionne pas « ${company} » — relance Analyse`,
  };
}
