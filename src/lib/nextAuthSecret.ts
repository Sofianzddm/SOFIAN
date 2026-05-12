/**
 * Secret pour signer / vérifier les JWT NextAuth (authOptions, middleware, getToken).
 * Doit être identique partout → une seule fonction, compatible Edge (pas de node:crypto).
 *
 * Ordre : NEXTAUTH_SECRET → AUTH_SECRET → secours (évite [NO_SECRET] si la variable a été oubliée).
 * En prod, définir NEXTAUTH_SECRET sur l’hébergeur reste la bonne pratique (rotation, indépendance).
 */

function trim(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t || undefined;
}

const DEV_ONLY_SECRET =
  "glowup-nextauth-local-dev-only-not-for-production-use-32";

/** Si aucun env ni heuristique : évite le crash ; à remplacer par NEXTAUTH_SECRET dès que possible. */
const GLOBAL_FALLBACK_SECRET =
  "glowup-nextauth-fallback-v1-define-nextauth-secret-in-hosting-env";

export function getNextAuthSecret(): string {
  const explicit = trim(process.env.NEXTAUTH_SECRET) || trim(process.env.AUTH_SECRET);
  if (explicit) return explicit;

  if (process.env.NODE_ENV !== "production") {
    return DEV_ONLY_SECRET;
  }

  const vercelPid = trim(process.env.VERCEL_PROJECT_ID);
  if (vercelPid) {
    return `glowup-nextauth|vercel|${vercelPid}|v1|min-48-chars-pad`.padEnd(48, "x").slice(0, 64);
  }

  const db = trim(process.env.DATABASE_URL);
  if (db) {
    const fp = `${db.length}|${db.slice(0, 20)}|${db.slice(-12)}`;
    const base = `glowup-nextauth|db|${fp}|v1`;
    return base.length >= 32 ? base.slice(0, 80) : base.padEnd(48, "0");
  }

  return GLOBAL_FALLBACK_SECRET;
}
