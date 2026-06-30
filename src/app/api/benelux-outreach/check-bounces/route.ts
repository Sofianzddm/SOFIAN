import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { checkBeneluxOutreachBounces } from "@/lib/benelux-outreach-bounce-check";

/**
 * POST → vérification rétroactive des bounces sur tous les mails BENELUX
 * déjà envoyés. Body { apply?: boolean } : false = rapport seulement,
 * true = supprime les contacts en bounce et corrige les fausses réponses.
 */

export const maxDuration = 300;

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { apply?: boolean };
    const result = await checkBeneluxOutreachBounces(body.apply === true);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/benelux-outreach/check-bounces:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
