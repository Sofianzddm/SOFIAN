import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { runRelances } from "@/lib/relances";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["HEAD_OF_SALES", "ADMIN", "CASTING_MANAGER"] as const;

export async function POST(req: NextRequest) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    // Déclenchement manuel : on force l'envoi immédiat, même un week-end,
    // sans attendre le cron quotidien de 8h.
    const result = await runRelances({ ignoreWeekend: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/casting-mails-sent/run-relances error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
