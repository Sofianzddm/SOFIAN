import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadForReply } from "@/lib/gmail";
import { hasBusinessDaysElapsed, isBusinessDay } from "@/lib/business-days";
import {
  executeOutreachRelance,
  OUTREACH_RELANCE_BUSINESS_DAYS,
} from "@/lib/outreach-send";

/**
 * Cron quotidien du module Outreach (8h, jours ouvrés) :
 *  1. Détecte les réponses sur le dernier mail de chaque client en attente
 *     (info seulement : le client RESTE dans le cycle 45 jours).
 *  2. Envoie la relance auto J+3 ouvrés dans le thread si pas de réponse.
 *  3. Bascule en « À recontacter » les clients dont les 45 jours sont écoulés.
 *
 * Les clients entrent dans le module uniquement à la main ou via l'import
 * d'une carto Excel — le stock HubSpot historique reste géré dans HubSpot.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  if (!isBusinessDay(new Date())) {
    return NextResponse.json({ processed: 0, skipped: "weekend" });
  }

  const now = new Date();
  const targets = await prisma.outreachTarget.findMany({
    where: { status: "WAITING" },
    include: {
      touches: {
        where: { sentAt: { not: null } },
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  let replies = 0;
  let relances = 0;
  let recontacts = 0;
  const recontactByCreator = new Map<string, number>();

  for (const target of targets) {
    const touch = target.touches[0];
    if (!touch?.sentAt || !touch.threadId) continue;

    // 1. Détection de réponse (info seulement, le cycle continue)
    let hasReplied = Boolean(touch.repliedAt);
    if (!hasReplied) {
      try {
        hasReplied = await checkThreadForReply("leyna@glowupagence.fr", touch.threadId);
      } catch (error) {
        console.warn(`[cron/outreach] checkThreadForReply ${target.email}:`, error);
      }
      if (hasReplied) {
        replies += 1;
        await prisma.$transaction([
          prisma.outreachTouch.update({
            where: { id: touch.id },
            data: { repliedAt: now },
          }),
          prisma.outreachTarget.update({
            where: { id: target.id },
            data: { lastRepliedAt: now },
          }),
        ]);
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Réponse client (Outreach)",
              message: `${target.firstname} ${target.lastname || ""} (${target.company}) a répondu au mail du cycle ${touch.cycleNumber}.`,
              lien: "/outreach",
              marqueId: target.marqueId,
            },
          })
          .catch((e) => console.warn("[cron/outreach] notification réponse:", e));
      }
    }

    // 2. Relance auto J+3 ouvrés (sautée si réponse sur ce touch)
    if (
      !hasReplied &&
      !touch.relanceSentAt &&
      hasBusinessDaysElapsed(touch.sentAt, OUTREACH_RELANCE_BUSINESS_DAYS, now)
    ) {
      const result = await executeOutreachRelance(touch.id);
      if (result.ok) relances += 1;
      else console.warn(`[cron/outreach] relance ${target.email}: ${result.error}`);
    }

    // 3. Bascule J+45 → À recontacter (même si le client a répondu)
    if (target.nextRecontactAt && target.nextRecontactAt.getTime() <= now.getTime()) {
      await prisma.outreachTarget.update({
        where: { id: target.id },
        data: { status: "TO_RECONTACT" },
      });
      recontacts += 1;
      recontactByCreator.set(
        target.createdById,
        (recontactByCreator.get(target.createdById) || 0) + 1
      );
    }
  }

  // Notification groupée « X clients à recontacter » par créateur
  for (const [userId, count] of recontactByCreator) {
    await prisma.notification
      .create({
        data: {
          userId,
          type: "GENERAL",
          titre: "Clients à recontacter (Outreach)",
          message:
            count === 1
              ? "1 client a atteint les 45 jours et attend un nouveau mail."
              : `${count} clients ont atteint les 45 jours et attendent un nouveau mail.`,
          lien: "/outreach",
        },
      })
      .catch((e) => console.warn("[cron/outreach] notification recontact:", e));
  }

  return NextResponse.json({
    processed: targets.length,
    replies,
    relances,
    recontacts,
  });
}
