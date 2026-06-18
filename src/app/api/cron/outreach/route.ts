import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadForReply, checkThreadActivity } from "@/lib/gmail";
import { relanceDue, isBusinessDay } from "@/lib/business-days";
import {
  executeOutreachRelance,
  outreachFromEmail,
  OUTREACH_RELANCE_BUSINESS_DAYS,
} from "@/lib/outreach-send";
import {
  executeProjetRelance,
  parseProjetEmailThreads,
  PROJET_RELANCE_BUSINESS_DAYS,
  PROJET_TRACKING_WINDOW_DAYS,
} from "@/lib/projet-prospection";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";

/**
 * Cron quotidien du module Outreach (8h, jours ouvrés) :
 *  1. Détecte les réponses sur le dernier mail de chaque client en attente
 *     (info seulement : le client RESTE dans le cycle 45 jours). Les bounces
 *     (adresse invalide, mail revenu en erreur) suppriment automatiquement
 *     le contact du cycle avec une notification au créateur.
 *  2. Envoie la relance auto J+3 ouvrés dans le thread si pas de réponse.
 *  3. Bascule en « À recontacter » les clients dont les 45 jours sont écoulés.
 *  4. Même chose pour la prospection des projets strategy (Ski Trip…) :
 *     détection de réponse + relance auto J+3 ouvrés sur les OpportuniteMarque.
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
  let bounces = 0;
  const recontactByCreator = new Map<string, number>();

  for (const target of targets) {
    const touch = target.touches[0];
    if (!touch?.sentAt || !touch.threadId) continue;

    // 1. Détection de réponse (info seulement, le cycle continue) et de
    //    bounce (adresse invalide → contact retiré automatiquement du cycle)
    let hasReplied = Boolean(touch.repliedAt);
    let hasBounced = false;
    if (!hasReplied) {
      try {
        // Le thread vit dans la boîte qui a envoyé ce touch (pas forcément
        // la boîte actuelle du target).
        const activity = await checkThreadActivity(
          outreachFromEmail({ fromEmail: touch.fromEmail }),
          touch.threadId
        );
        hasReplied = activity.replied;
        hasBounced = activity.bounced && !activity.replied;
      } catch (error) {
        console.warn(`[cron/outreach] checkThreadActivity ${target.email}:`, error);
      }

      if (hasBounced) {
        bounces += 1;
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Email invalide (Outreach)",
              message: `${target.firstname} ${target.lastname || ""} (${target.company}) : l'adresse ${target.email} n'existe pas — le mail est revenu en erreur, contact retiré du cycle.`,
              lien: "/outreach",
              marqueId: target.marqueId,
            },
          })
          .catch((e) => console.warn("[cron/outreach] notification bounce:", e));
        await prisma.outreachTarget
          .delete({ where: { id: target.id } })
          .catch((e) => console.warn(`[cron/outreach] suppression bounce ${target.email}:`, e));
        continue;
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
      relanceDue(touch.sentAt, OUTREACH_RELANCE_BUSINESS_DAYS, touch.id, now)
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

  // 4. Prospection des projets strategy (Ski Trip…) : réponses + relance J+3
  let projetReplies = 0;
  let projetRelances = 0;

  const windowStart = new Date(
    now.getTime() - PROJET_TRACKING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const opportunites = await prisma.opportuniteMarque.findMany({
    where: {
      lastEmailSentAt: { not: null, gte: windowStart },
      lastEmailThreadId: { not: null },
    },
    include: { projet: { select: { nom: true, slug: true } } },
  });

  for (const opp of opportunites) {
    if (!opp.lastEmailSentAt || !opp.lastEmailThreadId) continue;
    const fromEmail =
      (opp.lastEmailFrom || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;

    // Détection de réponse, thread par thread (1 thread Gmail par contact ;
    // fallback : l'ancien thread groupé unique).
    let hasReplied = Boolean(opp.emailRepliedAt);
    const threads = parseProjetEmailThreads(opp.emailThreads);
    let threadsChanged = false;
    let newReply = false;
    if (threads.length > 0) {
      for (const thread of threads) {
        if (thread.repliedAt) continue;
        try {
          const replied = await checkThreadForReply(fromEmail, thread.threadId);
          if (replied) {
            thread.repliedAt = now.toISOString();
            threadsChanged = true;
            newReply = true;
          }
        } catch (error) {
          console.warn(
            `[cron/outreach] checkThreadForReply projet ${opp.nomMarque} (${thread.email}):`,
            error
          );
        }
      }
      if (threadsChanged) {
        await prisma.opportuniteMarque.update({
          where: { id: opp.id },
          data: {
            emailThreads: threads,
            ...(opp.emailRepliedAt ? {} : { emailRepliedAt: now }),
          },
        });
        hasReplied = true;
      }
    } else if (!hasReplied) {
      try {
        newReply = await checkThreadForReply(fromEmail, opp.lastEmailThreadId);
      } catch (error) {
        console.warn(`[cron/outreach] checkThreadForReply projet ${opp.nomMarque}:`, error);
      }
      if (newReply) {
        hasReplied = true;
        await prisma.opportuniteMarque.update({
          where: { id: opp.id },
          data: { emailRepliedAt: now },
        });
      }
    }

    if (newReply) {
      projetReplies += 1;

      // Notifie la personne qui pilote la prospection : l'utilisateur lié à
      // la boîte expéditrice (ex : Ines pour Ski Trip) + le créateur.
      const senderToken = await prisma.gmailToken
        .findUnique({ where: { email: fromEmail }, select: { userId: true } })
        .catch(() => null);
      const notifyIds = Array.from(
        new Set([senderToken?.userId, opp.createdById].filter(Boolean) as string[])
      );
      const projetPath = `/strategy/projets/${opp.projet?.slug || "villa-cannes"}`;
      for (const userId of notifyIds) {
        await prisma.notification
          .create({
            data: {
              userId,
              type: "GENERAL",
              titre: `Réponse marque (${opp.projet?.nom || "Projet"})`,
              message: `${opp.nomMarque} a répondu au mail de prospection.`,
              lien: projetPath,
              marqueId: opp.marqueId,
            },
          })
          .catch((e) => console.warn("[cron/outreach] notification projet réponse:", e));
      }
    }

    // Relance auto J+3 ouvrés (1 max, sautée si réponse)
    if (
      !hasReplied &&
      !opp.relanceSentAt &&
      relanceDue(opp.lastEmailSentAt, PROJET_RELANCE_BUSINESS_DAYS, opp.id, now)
    ) {
      const result = await executeProjetRelance(opp.id);
      if (result.ok) projetRelances += 1;
      else console.warn(`[cron/outreach] relance projet ${opp.nomMarque}: ${result.error}`);
    }
  }

  return NextResponse.json({
    processed: targets.length,
    replies,
    relances,
    recontacts,
    bounces,
    projetProcessed: opportunites.length,
    projetReplies,
    projetRelances,
  });
}
