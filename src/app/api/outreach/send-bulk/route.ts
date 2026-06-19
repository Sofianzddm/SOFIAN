import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { executeOutreachSend } from "@/lib/outreach-send";

/**
 * POST → envoie le MÊME mail à plusieurs clients d'une marque, chacun
 * individuellement : 1 mail par contact (thread Gmail, tracking et cycle
 * 45 jours indépendants), variables {{contact.*}} personnalisées par contact.
 *
 * Body : { targetIds: string[], subject, bodyHtml }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const MAX_BULK = 25;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      targetIds?: string[];
      subject?: string;
      bodyHtml?: string;
    };
    const targetIds = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id) => typeof id === "string" && id.trim())
      : [];
    const subject = String(body.subject || "").trim();
    const bodyHtml = String(body.bodyHtml || "").trim();

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Aucun destinataire." }, { status: 400 });
    }
    if (targetIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK} destinataires par envoi.` },
        { status: 400 }
      );
    }
    if (!subject || !bodyHtml) {
      return NextResponse.json(
        { error: "Sujet et corps du mail requis." },
        { status: 400 }
      );
    }

    const targets = await prisma.outreachTarget.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true },
    });
    if (targets.length === 0) {
      return NextResponse.json({ error: "Clients introuvables." }, { status: 404 });
    }

    let sent = 0;
    let hubspotSynced = 0;
    const failed: { email: string; error: string }[] = [];
    const rescheduled: { email: string; message: string }[] = [];

    for (const target of targets) {
      const result = await executeOutreachSend(target.id, {
        subject,
        bodyHtml,
        sentById: session.user.id,
      });
      if (result.ok) {
        sent += 1;
        if (result.hubspotSynced) hubspotSynced += 1;
      } else if (result.rescheduled) {
        rescheduled.push({ email: target.email, message: result.error });
      } else {
        failed.push({ email: target.email, error: result.error });
      }
    }

    return NextResponse.json({ sent, failed, rescheduled, hubspotSynced });
  } catch (error) {
    console.error("POST /api/outreach/send-bulk:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
