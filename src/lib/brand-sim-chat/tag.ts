/**
 * Tag / détection jobs Simulateur marque (BRAND_SIM) — sans deps Prisma / CRM.
 * Importable côté client (lab carto-pipeline2 via job-kind).
 */

export const BRAND_SIM_PROMPT_TAG = "BRAND_SIM";

/** Détecte un job simulateur marque dans health VPS. */
export function brandSimPromptLooksLike(previewOrHint: string): boolean {
  const t = String(previewOrHint || "");
  return (
    new RegExp(`\\b${BRAND_SIM_PROMPT_TAG}\\b`, "i").test(t) ||
    /Quelles marques viser pour/i.test(t) ||
    /TALENT À ANALYSER\s*:/i.test(t) ||
    /Head of Brand Strategy Influence/i.test(t)
  );
}
