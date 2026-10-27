import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { processOutreachScheduledSends } from "@/lib/outreach-send";

/**
 * POST → flush des mails outreach FR dont l'échéance est atteinte.
 * Auth session (casting / admin) — filet si le cron Vercel est en retard
 * ou indisponible. Appelé depuis /outreach à l'ouverture de la page.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const result = await processOutreachScheduledSends(new Date(), 25);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/outreach/flush-scheduled:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
