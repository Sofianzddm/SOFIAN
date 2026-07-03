import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadActivity } from "@/lib/gmail";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "@/lib/business-days";
import {
  executeBeneluxOutreachRelance,
  beneluxOutreachFromEmail,
  BENELUX_OUTREACH_RELANCE_BUSINESS_DAYS,
} from "@/lib/benelux-outreach-send";

/**
 * Cron du module Prospection BENELUX (jours ouvrés) :
 *  1. Détecte les réponses sur le dernier mail de chaque prospect en attente
 *     (info seulement : il RESTE dans le cycle 45 jours). Les bounces (adresse
 *     invalide) retirent automatiquement le prospect du cycle.
 *  2. Envoie la relance auto J+3 ouvrés dans le thread si pas de réponse.
 *  3. Bascule en « À recontacter » les prospects dont les 45 jours sont écoulés.
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
  // Relances auto uniquement dans les heures de bureau (8h30–18h30 Paris) :
  // hors fenêtre, on ne relance pas (report au prochain passage dans la
  // fenêtre). La détection de réponse et la bascule J+45 continuent.
  const withinRelanceHours = isWithinRelanceHours(now);
  const targets = await prisma.beneluxOutreachTarget.findMany({
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
  let bounces = 0;
  const recontactByCreator = new Map<string, number>();

  for (const target of targets) {
    const touch = target.touches[0];
    if (!touch?.sentAt || !touch.threadId) continue;

    let hasReplied = Boolean(touch.repliedAt);
    let hasBounced = false;
    if (!hasReplied) {
      try {
        const activity = await checkThreadActivity(
          beneluxOutreachFromEmail({ fromEmail: touch.fromEmail }),
          touch.threadId
        );
        hasReplied = activity.replied;
        hasBounced = activity.bounced && !activity.replied;
      } catch (error) {
        console.warn(`[cron/benelux-outreach] checkThreadActivity ${target.email}:`, error);
      }

      if (hasBounced) {
        bounces += 1;
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Email invalide (Prospection BENELUX)",
              message: `${target.firstname} ${target.lastname || ""} (${target.companyName}) : l'adresse ${target.email} n'existe pas — le mail est revenu en erreur, contact retiré du cycle.`,
              lien: "/outreach",
            },
          })
          .catch((e) => console.warn("[cron/benelux-outreach] notification bounce:", e));
        await prisma.beneluxOutreachTarget
          .delete({ where: { id: target.id } })
          .catch((e) =>
            console.warn(`[cron/benelux-outreach] suppression bounce ${target.email}:`, e)
          );
        continue;
      }

      if (hasReplied) {
        replies += 1;
        await prisma.$transaction([
          prisma.beneluxOutreachTouch.update({
            where: { id: touch.id },
            data: { repliedAt: now },
          }),
          prisma.beneluxOutreachTarget.update({
            where: { id: target.id },
            data: { lastRepliedAt: now },
          }),
        ]);
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Réponse prospect (BENELUX)",
              message: `${target.firstname} ${target.lastname || ""} (${target.companyName}) a répondu au mail du cycle ${touch.cycleNumber}.`,
              lien: "/outreach",
            },
          })
          .catch((e) => console.warn("[cron/benelux-outreach] notification réponse:", e));
      }
    }

    if (
      withinRelanceHours &&
      !hasReplied &&
      !touch.relanceSentAt &&
      !touch.relanceCancelledAt &&
      relanceDue(touch.sentAt, BENELUX_OUTREACH_RELANCE_BUSINESS_DAYS, touch.id, now)
    ) {
      const result = await executeBeneluxOutreachRelance(touch.id);
      if (result.ok) relances += 1;
      else console.warn(`[cron/benelux-outreach] relance ${target.email}: ${result.error}`);
    }

    if (target.nextRecontactAt && target.nextRecontactAt.getTime() <= now.getTime()) {
      await prisma.beneluxOutreachTarget.update({
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

  for (const [userId, count] of recontactByCreator) {
    await prisma.notification
      .create({
        data: {
          userId,
          type: "GENERAL",
          titre: "Prospects BENELUX à recontacter",
          message:
            count === 1
              ? "1 prospect BENELUX a atteint les 45 jours et attend un nouveau mail."
              : `${count} prospects BENELUX ont atteint les 45 jours et attendent un nouveau mail.`,
          lien: "/outreach",
        },
      })
      .catch((e) => console.warn("[cron/benelux-outreach] notification recontact:", e));
  }

  return NextResponse.json({
    processed: targets.length,
    replies,
    relances,
    recontacts,
    bounces,
  });
}
