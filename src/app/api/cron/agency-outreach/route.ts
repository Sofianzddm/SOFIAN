import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadActivity } from "@/lib/gmail";
import { relanceDue, isBusinessDay } from "@/lib/business-days";
import {
  executeAgencyOutreachRelance,
  agencyOutreachFromEmail,
  processAgencyScheduledSends,
  AGENCY_OUTREACH_RELANCE_BUSINESS_DAYS,
} from "@/lib/agency-outreach-send";

/**
 * Cron du module Prospection Agences (jours ouvrés) :
 *  0. Envoie les mails « décalés » dont l'échéance est atteinte (option d'envoi
 *     étalé dans la journée jusqu'à 18h30).
 *  1. Détecte les réponses sur le dernier mail de chaque agence en attente
 *     (info seulement : l'agence RESTE dans le cycle 45 jours). Les bounces
 *     (adresse invalide) retirent automatiquement le contact du cycle.
 *  2. Envoie la relance auto J+3 ouvrés dans le thread si pas de réponse.
 *  3. Bascule en « À recontacter » les contacts dont les 45 jours sont écoulés.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const now = new Date();

  // Les envois décalés ne sont jamais programmés le week-end (cf. fenêtre
  // d'étalement), mais on les traite avant le garde-fou week-end par sûreté.
  const scheduled = await processAgencyScheduledSends(now);

  if (!isBusinessDay(now)) {
    return NextResponse.json({ processed: 0, scheduled, skipped: "weekend" });
  }

  const targets = await prisma.agencyOutreachTarget.findMany({
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

    // 1. Détection de réponse (info) et de bounce (retrait du cycle).
    let hasReplied = Boolean(touch.repliedAt);
    let hasBounced = false;
    if (!hasReplied) {
      try {
        const activity = await checkThreadActivity(
          agencyOutreachFromEmail({ fromEmail: touch.fromEmail }),
          touch.threadId
        );
        hasReplied = activity.replied;
        hasBounced = activity.bounced && !activity.replied;
      } catch (error) {
        console.warn(`[cron/agency-outreach] checkThreadActivity ${target.email}:`, error);
      }

      if (hasBounced) {
        bounces += 1;
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Email invalide (Prospection Agences)",
              message: `${target.firstname} ${target.lastname || ""} (${target.company}) : l'adresse ${target.email} n'existe pas — le mail est revenu en erreur, contact retiré du cycle.`,
              lien: "/agency-outreach",
            },
          })
          .catch((e) => console.warn("[cron/agency-outreach] notification bounce:", e));
        await prisma.agencyOutreachTarget
          .delete({ where: { id: target.id } })
          .catch((e) =>
            console.warn(`[cron/agency-outreach] suppression bounce ${target.email}:`, e)
          );
        continue;
      }

      if (hasReplied) {
        replies += 1;
        await prisma.$transaction([
          prisma.agencyOutreachTouch.update({
            where: { id: touch.id },
            data: { repliedAt: now },
          }),
          prisma.agencyOutreachTarget.update({
            where: { id: target.id },
            data: { lastRepliedAt: now },
          }),
        ]);
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Réponse agence (Prospection)",
              message: `${target.firstname} ${target.lastname || ""} (${target.company}) a répondu au mail du cycle ${touch.cycleNumber}.`,
              lien: "/agency-outreach",
            },
          })
          .catch((e) => console.warn("[cron/agency-outreach] notification réponse:", e));
      }
    }

    // 2. Relance auto J+3 ouvrés (sautée si réponse ou pause manuelle).
    if (
      !hasReplied &&
      !touch.relanceSentAt &&
      !touch.relanceCancelledAt &&
      relanceDue(touch.sentAt, AGENCY_OUTREACH_RELANCE_BUSINESS_DAYS, touch.id, now)
    ) {
      const result = await executeAgencyOutreachRelance(touch.id);
      if (result.ok) relances += 1;
      else console.warn(`[cron/agency-outreach] relance ${target.email}: ${result.error}`);
    }

    // 3. Bascule J+45 → À recontacter (même si l'agence a répondu).
    if (target.nextRecontactAt && target.nextRecontactAt.getTime() <= now.getTime()) {
      await prisma.agencyOutreachTarget.update({
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
          titre: "Agences à recontacter (Prospection)",
          message:
            count === 1
              ? "1 agence a atteint les 45 jours et attend un nouveau mail."
              : `${count} agences ont atteint les 45 jours et attendent un nouveau mail.`,
          lien: "/agency-outreach",
        },
      })
      .catch((e) => console.warn("[cron/agency-outreach] notification recontact:", e));
  }

  return NextResponse.json({
    processed: targets.length,
    scheduled,
    replies,
    relances,
    recontacts,
    bounces,
  });
}
