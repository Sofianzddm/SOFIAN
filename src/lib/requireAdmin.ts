import { NextRequest } from "next/server";
import { getAppSession, type AppSession } from "@/lib/getAppSession";

/**
 * Garde "ADMIN uniquement" pour les Route Handlers.
 * Retourne la session si l'utilisateur effectif est ADMIN, sinon null.
 * (Tient compte de l'impersonation via getAppSession.)
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AppSession | null> {
  const session = await getAppSession(request);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}
