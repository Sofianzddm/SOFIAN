/**
 * Carto AI pipeline — lab caché (URL /lab/carto-pipeline uniquement).
 * Ne pas importer Prisma ici (middleware / client safe).
 */

export const CARTO_AI_FEATURE_FLAG = "carto_ai_pipeline_v1";

/** Lab activé pour l'allowlist uniquement. */
export function isCartoAiPipelineEnabled(): boolean {
  return true;
}

export const CARTO_AI_ALLOWED_EMAILS = [
  "s.zeddam@glowupagence.fr",
  "sofian@glowupagence.fr",
  "maud@glowupagence.fr",
  "leyna@glowupagence.fr",
] as const;

export const CARTO_AI_ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

/** Assez large pour marque + maison-mère + agence influence (style NYX). */
export const CARTO_AI_MAX_CONTACTS = 20;

export function isCartoAiAllowedEmail(email: string | null | undefined): boolean {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return (CARTO_AI_ALLOWED_EMAILS as readonly string[]).includes(normalized);
}

export function canAccessCartoAiPipeline(opts: {
  email?: string | null;
  role?: string | null;
}): boolean {
  if (!isCartoAiPipelineEnabled()) return false;
  if (!isCartoAiAllowedEmail(opts.email)) return false;
  const role = String(opts.role || "");
  return (CARTO_AI_ALLOWED_ROLES as readonly string[]).includes(role);
}
