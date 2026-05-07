import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail } from "@/lib/gmail";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

type RequestBody = {
  subject?: unknown;
  htmlBody?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    if (!subject || !htmlBody.trim()) {
      return NextResponse.json({ error: "subject et htmlBody requis." }, { status: 400 });
    }

    const { id } = await params;
    const opportunity = await prisma.inboundOpportunity.findUnique({
      where: { id },
      select: { id: true, senderEmail: true, threadId: true },
    });
    if (!opportunity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let messageId = "";
    try {
      messageId = await sendGmail({
        fromEmail: "leyna@glowupagence.fr",
        to: opportunity.senderEmail,
        subject,
        htmlBody,
        ...(opportunity.threadId ? { threadId: opportunity.threadId } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Gmail non connecté") {
        return NextResponse.json({ error: "gmail_not_connected" }, { status: 400 });
      }
      throw error;
    }

    await prisma.$executeRaw`
      UPDATE "inbound_opportunities"
      SET
        "status" = 'READY',
        "gmailSentMessageId" = ${messageId},
        "threadId" = ${opportunity.threadId || messageId},
        "sentAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/inbound/opportunities/[id]/send error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
