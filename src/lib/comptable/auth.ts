import { NextRequest } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["COMPTABLE", "ADMIN"];

/**
 * Vérifie que l'appelant peut accéder à l'espace comptable (COMPTABLE ou ADMIN).
 * Retourne la session si autorisé, sinon un code d'erreur.
 */
export async function requireComptable(
  request: NextRequest
): Promise<
  | { ok: true; role: string }
  | { ok: false; status: number; error: string }
> {
  const session = await getAppSession(request);
  if (!session?.user) {
    return { ok: false, status: 401, error: "Non authentifié" };
  }
  const role = session.user.role || "";
  if (!ALLOWED_ROLES.includes(role)) {
    return {
      ok: false,
      status: 403,
      error: "Accès réservé à l'expert-comptable",
    };
  }
  return { ok: true, role };
}
