/**
 * Aligné sur le comportement NextAuth : cookie Secure / préfixe __Secure-
 * uniquement si l’URL publique est en https (ou sur Vercel, toujours https).
 * Sinon, en local `next start` (NODE_ENV=production + http) le navigateur
 * refuse le cookie → reconnexion à chaque retour.
 */

function trim(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t || undefined;
}

/** « Rester connectée » cochée. */
export const SESSION_MAX_AGE_SEC = 90 * 24 * 60 * 60; // 90 jours

/** Case décochée : session courte (glissante tant que l’app est utilisée). */
export const SESSION_SHORT_MAX_AGE_SEC = 24 * 60 * 60; // 1 jour

export const SESSION_UPDATE_AGE_SEC = 24 * 60 * 60; // 24 h

export const SESSION_REMEMBER_LABEL = "90 J";
export const SESSION_SHORT_LABEL = "1 J";

/** true sauf si explicitement false / "false" / "0". */
export function parseRememberMe(value: unknown): boolean {
  if (value === false || value === "false" || value === "0") return false;
  return true;
}

/** Anciennes sessions sans flag → durée longue (rétrocompat). */
export function sessionMaxAgeForRememberMe(
  rememberMe: boolean | undefined
): number {
  if (rememberMe === false) return SESSION_SHORT_MAX_AGE_SEC;
  return SESSION_MAX_AGE_SEC;
}

export function useSecureAuthCookies(): boolean {
  const url =
    trim(process.env.NEXTAUTH_URL) ||
    trim(process.env.NEXT_PUBLIC_BASE_URL) ||
    "";
  if (url.startsWith("https://")) return true;
  // Vercel sert toujours en https. Sans NEXTAUTH_URL, getToken de NextAuth
  // defaulte déjà secureCookie=true (via process.env.VERCEL) — l’écriture
  // du cookie doit suivre, sinon le middleware ne lit pas la bonne clé.
  if (process.env.VERCEL === "1") return true;
  return false;
}

export function sessionTokenCookieName(): string {
  return useSecureAuthCookies()
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}
