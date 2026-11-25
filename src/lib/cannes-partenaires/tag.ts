/**
 * Tag / détection jobs Carto Cannes Partenaires — sans deps Prisma / CRM.
 * Importable côté client (lab carto-pipeline2 via job-kind).
 *
 * IMPORTANT : détection STRICTE uniquement (tag + phrases uniques au prompt
 * Cannes). Ne jamais matcher le prompt générique carto-pipeline2
 * (« Head of Research Influence », « MARQUE À ANALYSER : » sans CANNES).
 */

export const CANNES_CARTO_PROMPT_TAG = "CANNES_CARTO";
/** Analyse « quelles marques contacter » pour le Festival (pas carto contacts). */
export const CANNES_BRANDS_PROMPT_TAG = "CANNES_BRANDS";

/** Détecte un job carto Festival de Cannes dans health VPS. */
export function cannesCartoPromptLooksLike(previewOrHint: string): boolean {
  const t = String(previewOrHint || "");
  return (
    new RegExp(`\\b${CANNES_CARTO_PROMPT_TAG}\\b`, "i").test(t) ||
    /Head of Research Festival & Brand Partnerships/i.test(t) ||
    /MARQUE À ANALYSER \(CANNES\)\s*:/i.test(t)
  );
}

/** Détecte un job « marques à contacter » Festival de Cannes. */
export function cannesBrandsPromptLooksLike(previewOrHint: string): boolean {
  const t = String(previewOrHint || "");
  return (
    new RegExp(`\\b${CANNES_BRANDS_PROMPT_TAG}\\b`, "i").test(t) ||
    /Head of Festival Partnerships Strategy/i.test(t) ||
    /MARQUES À CONTACTER \(CANNES\)/i.test(t)
  );
}
