import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail } from "@/lib/gmail";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

type RequestBody = {
  subject?: unknown;
  htmlBody?: unknown;
  to?: unknown;
};

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const htmlBody = typeof body?.htmlBody === "string" ? body.htmlBody : "";
    const overrideTo = typeof body?.to === "string" ? body.to.trim() : "";
    if (!subject || !htmlBody.trim()) {
      return NextResponse.json({ error: "subject et htmlBody requis." }, { status: 400 });
    }

    const to = overrideTo || session.user.email || "";
    if (!to) {
      return NextResponse.json(
        { error: "Aucune adresse destinataire trouvée." },
        { status: 400 }
      );
    }

    const testSubject = subject.startsWith("[TEST]") ? subject : `[TEST] ${subject}`;
    const testNotice =
      '<div style="margin:0 0 16px 0;padding:8px 12px;border-left:3px solid #C08B8B;background:#F5EBE0;color:#1A1110;font-family:Arial,sans-serif;font-size:12px;">' +
      "Mail de test envoyé depuis la plateforme Glow Up. Le destinataire d'origine n'a rien reçu." +
      "</div>";

    try {
      await sendGmail({
        fromEmail: "leyna@glowupagence.fr",
        to,
        subject: testSubject,
        htmlBody: `${testNotice}${htmlBody}`,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Gmail non connecté") {
        return NextResponse.json({ error: "gmail_not_connected" }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, to });
  } catch (error) {
    console.error("POST /api/inbound/opportunities/[id]/test-send error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
