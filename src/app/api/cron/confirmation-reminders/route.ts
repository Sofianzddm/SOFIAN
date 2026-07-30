import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendTalentConfirmationEmail } from "@/lib/emails/talent-confirmation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Relancer au maximum N fois, puis laisser la main à la TM.
const MAX_REMINDERS = 3;
// Délai minimum entre deux sollicitations (envoi initial → 1re relance, etc.).
const HOURS_BETWEEN = 24;

/**
 * GET /api/cron/confirmation-reminders
 *
 * Relance automatique par email les talents qui n'ont pas encore répondu à
 * une demande de confirmation, et prévient la TM (notification) qu'elle doit
 * relancer par WhatsApp de son côté.
 *
 * Protégé par `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - HOURS_BETWEEN * 36e5);

  try {
    const pending = await prisma.talentConfirmation.findMany({
      where: {
        statut: "EN_ATTENTE",
        reminderCount: { lt: MAX_REMINDERS },
        OR: [
          { lastReminderAt: null, sentAt: { lt: cutoff } },
          { lastReminderAt: { lt: cutoff } },
        ],
      },
      select: {
        id: true,
        token: true,
        marque: true,
        talentId: true,
        createdById: true,
        reminderCount: true,
      },
    });

    let emailed = 0;
    for (const conf of pending) {
      const talent = await prisma.talent.findUnique({
        where: { id: conf.talentId },
        select: { prenom: true, email: true },
      });

      const sent = talent?.email
        ? await sendTalentConfirmationEmail({
            to: talent.email,
            prenom: talent.prenom,
            marque: conf.marque,
            token: conf.token,
            isReminder: true,
          })
        : false;
      if (sent) emailed++;

      await prisma.$transaction([
        prisma.talentConfirmation.update({
          where: { id: conf.id },
          data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } },
        }),
        prisma.notification.create({
          data: {
            userId: conf.createdById,
            type: "GENERAL",
            titre: `Relance à faire : ${conf.marque}`,
            message: `${talent?.prenom || "Le talent"} n'a pas encore répondu (relance email ${conf.reminderCount + 1}/${MAX_REMINDERS} envoyée). Relance-le par WhatsApp de ton côté.`,
            lien: `/confirmations/${conf.id}`,
            talentId: conf.talentId,
          },
        }),
      ]);
    }

    return NextResponse.json({ processed: pending.length, emailed });
  } catch (error) {
    console.error("Erreur cron confirmation-reminders:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
