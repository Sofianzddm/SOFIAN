/**
 * Aligné sur le comportement NextAuth : cookie Secure / préfixe __Secure-
 * uniquement si l’URL publique est en https (pas selon NODE_ENV).
 * Sinon, en local `next start` (NODE_ENV=production + http) le navigateur
 * refuse le cookie → reconnexion à chaque retour.
 */

function trim(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t || undefined;
}

export const SESSION_MAX_AGE_SEC = 90 * 24 * 60 * 60; // 90 jours
export const SESSION_UPDATE_AGE_SEC = 24 * 60 * 60; // 24 h

export function useSecureAuthCookies(): boolean {
  const url =
    trim(process.env.NEXTAUTH_URL) ||
    trim(process.env.NEXT_PUBLIC_BASE_URL) ||
    "";
  return url.startsWith("https://");
}

export function sessionTokenCookieName(): string {
  return useSecureAuthCookies()
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}
