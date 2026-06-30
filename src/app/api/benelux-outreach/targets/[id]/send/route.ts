import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { executeBeneluxOutreachSend } from "@/lib/benelux-outreach-send";

/**
 * POST → envoie un mail de cycle à un prospect BENELUX.
 * Body : { subject, bodyHtml, force? }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      bodyHtml?: string;
      force?: boolean;
    };

    const result = await executeBeneluxOutreachSend(id, {
      subject: String(body.subject || ""),
      bodyHtml: String(body.bodyHtml || ""),
      sentById: session.user.id,
      force: body.force === true,
    });

    if (!result.ok) {
      if (result.needsConfirmation) {
        return NextResponse.json({
          ok: false,
          needsConfirmation: true,
          message: result.error,
          alreadyContactedAt: result.alreadyContactedAt,
          suggestedNextRecontactAt: result.suggestedNextRecontactAt,
        });
      }
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      touchId: result.touchId,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("POST /api/benelux-outreach/targets/[id]/send:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
