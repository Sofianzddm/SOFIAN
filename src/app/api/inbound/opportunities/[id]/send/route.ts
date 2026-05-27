import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail } from "@/lib/gmail";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;
const COOLDOWN_DAYS = 20;

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

    // Cooldown : on bloque si on a déjà envoyé un mail à exactement ce
    // senderEmail dans les 20 derniers jours (peu importe l'opportunité).
    const senderEmail = (opportunity.senderEmail || "").toLowerCase().trim();
    if (senderEmail) {
      const since = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      const previous = await prisma.inboundOpportunity.findFirst({
        where: {
          id: { not: id },
          sentAt: { gte: since, not: null },
          senderEmail: { equals: senderEmail, mode: "insensitive" },
        },
        select: { id: true, sentAt: true, subject: true },
        orderBy: { sentAt: "desc" },
      });
      if (previous && previous.sentAt) {
        const daysAgo = Math.max(
          1,
          Math.round((Date.now() - previous.sentAt.getTime()) / (24 * 60 * 60 * 1000))
        );
        return NextResponse.json(
          {
            error: "recent_send_blocked",
            message: `Un mail a déjà été envoyé à ${opportunity.senderEmail} il y a ${daysAgo} jour(s). Renvoi bloqué pendant ${COOLDOWN_DAYS} jours.`,
            previous: {
              id: previous.id,
              sentAt: previous.sentAt.toISOString(),
              subject: previous.subject,
              daysAgo,
            },
            cooldownDays: COOLDOWN_DAYS,
          },
          { status: 409 }
        );
      }
    }

    // IMPORTANT : on n'envoie PAS avec opportunity.threadId — c'est l'id du
    // thread dans la boîte du *talent* (ex: agathe@…), pas dans celle de
    // Leyna. Gmail rejette alors avec 404/400. Leyna crée un nouveau thread
    // dans sa propre boîte ; la marque reçoit le mail normalement.
    let messageId = "";
    try {
      messageId = await sendGmail({
        fromEmail: "leyna@glowupagence.fr",
        to: opportunity.senderEmail,
        subject,
        htmlBody,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Gmail non connecté") {
        return NextResponse.json({ error: "gmail_not_connected" }, { status: 400 });
      }
      const message = error instanceof Error ? error.message : "Échec envoi Gmail";
      console.error("POST /api/inbound/opportunities/[id]/send gmail error:", message);
      return NextResponse.json(
        { error: "gmail_send_failed", message },
        { status: 502 }
      );
    }

    await prisma.$executeRaw`
      UPDATE "inbound_opportunities"
      SET
        "status" = 'READY',
        "gmailSentMessageId" = ${messageId},
        "threadId" = ${messageId},
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
