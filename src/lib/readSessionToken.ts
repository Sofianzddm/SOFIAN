import type { NextRequest } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";
import { getNextAuthSecret } from "@/lib/nextAuthSecret";
import { useSecureAuthCookies } from "@/lib/nextAuthCookies";

/**
 * Lit le JWT de session en essayant les deux noms de cookie
 * (__Secure- et non-secure) pour survivre aux changements de NEXTAUTH_URL.
 */
export async function readSessionToken(
  req: NextRequest
): Promise<JWT | null> {
  const secret = getNextAuthSecret();
  const preferSecure = useSecureAuthCookies();

  const attempts: Array<() => Promise<JWT | null>> = [
    () =>
      getToken({
        req,
        secret,
        secureCookie: preferSecure,
      }),
    () =>
      getToken({
        req,
        secret,
        secureCookie: !preferSecure,
      }),
    // Dernier recours : heuristique NextAuth (VERCEL / NEXTAUTH_URL)
    () => getToken({ req, secret }),
  ];

  for (const run of attempts) {
    const token = await run();
    if (token) return token;
  }
  return null;
}
