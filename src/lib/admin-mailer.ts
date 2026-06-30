/**
 * Rédacteur de mails admin : logique d'envoi, de programmation et de relances.
 *
 * Un `AdminMail` est rédigé depuis le module admin et envoyé via une boîte
 * Gmail connectée (cf. `lib/gmail.ts`). Il peut être :
 *  - DRAFT      : brouillon non envoyé
 *  - SCHEDULED  : programmé pour `scheduledAt` (envoyé par le cron)
 *  - SENT       : envoyé (les relances éventuelles sont alors programmées)
 *  - FAILED     : échec d'envoi (erreur Gmail consignée)
 *  - CANCELLED  : annulé manuellement
 *
 * Les relances (`AdminMailFollowup`) partent EN RÉPONSE dans le même fil, à
 * N jours ouvrés cumulés après l'envoi initial. Si le destinataire répond et
 * que `stopOnReply` est actif, les relances en attente sont annulées.
 */

import { prisma } from "@/lib/prisma";
import {
  sendGmail,
  getMessageRfcId,
  getGmailFromName,
  checkThreadActivity,
} from "@/lib/gmail";
import {
  normalizeEditorHtmlForEmail,
  buildQuotedOriginal,
} from "@/lib/email-body-html";
import { businessDeadlineWithJitter } from "@/lib/business-days";

export type MailStatus = "DRAFT" | "SCHEDULED" | "SENT" | "FAILED" | "CANCELLED";
export type FollowupStatus =
  | "PENDING"
  | "SENT"
  | "SKIPPED"
  | "CANCELLED"
  | "FAILED";

export type SendResult = { ok: boolean; error?: string };

/** Sujet de relance : préfixe « Re: » si absent. */
function toReplySubject(subject: string): string {
  const s = (subject || "").trim();
  if (!s) return "Re:";
  return s.toLowerCase().startsWith("re:") ? s : `Re: ${s}`;
}

function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Programme (ou reprogramme) les échéances des relances PENDING d'un mail à
 * partir de son `anchor` (date d'envoi initiale), en cumulant les jours ouvrés.
 * Un décalage anti-robot stable est ajouté à chaque échéance.
 */
async function scheduleFollowups(
  mailId: string,
  anchor: Date,
  followups: { id: string; status: string; delayBusinessDays: number }[]
): Promise<void> {
  let cursor = anchor;
  for (const f of followups) {
    if (f.status !== "PENDING") continue;
    const delay = Math.max(1, f.delayBusinessDays || 1);
    const due = businessDeadlineWithJitter(cursor, delay, f.id);
    cursor = due;
    await prisma.adminMailFollowup.update({
      where: { id: f.id },
      data: { scheduledAt: due },
    });
  }
}

/**
 * Envoie le mail initial via Gmail, passe le mail en SENT et programme ses
 * relances. Idempotent : un mail déjà SENT n'est pas renvoyé.
 */
export async function executeMailSend(mailId: string): Promise<SendResult> {
  const mail = await prisma.adminMail.findUnique({
    where: { id: mailId },
    include: { followups: { orderBy: { order: "asc" } } },
  });
  if (!mail) return { ok: false, error: "Mail introuvable" };
  if (mail.status === "SENT") return { ok: true };
  if (mail.status === "CANCELLED") return { ok: false, error: "Mail annulé" };

  const subject = mail.subject.trim();
  const bodyHtml = normalizeEditorHtmlForEmail(mail.bodyHtml);
  if (!subject || !bodyHtml) {
    const msg = "Sujet et corps requis.";
    await prisma.adminMail.update({
      where: { id: mailId },
      data: { status: "FAILED", sendError: msg },
    });
    return { ok: false, error: msg };
  }

  try {
    const messageId = await sendGmail({
      fromEmail: mail.fromEmail,
      to: mail.toEmail,
      subject,
      htmlBody: bodyHtml,
    });
    const messageRfcId = await getMessageRfcId(mail.fromEmail, messageId);
    const sentAt = new Date();

    await prisma.adminMail.update({
      where: { id: mailId },
      data: {
        status: "SENT",
        sentAt,
        scheduledAt: null,
        threadId: messageId,
        gmailMessageId: messageId,
        messageRfcId: messageRfcId ?? undefined,
        sendError: null,
      },
    });

    await scheduleFollowups(mailId, sentAt, mail.followups);

    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.adminMail.update({
      where: { id: mailId },
      data: { status: "FAILED", sendError: msg },
    });
    console.error("[admin-mailer.executeMailSend]", mailId, msg);
    return { ok: false, error: msg };
  }
}

type MailWithFollowups = {
  id: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  sentAt: Date | null;
  threadId: string | null;
  messageRfcId: string | null;
};

type FollowupRow = {
  id: string;
  subject: string | null;
  bodyHtml: string;
};

/** Envoie une relance en réponse dans le fil du mail initial. */
async function executeFollowupSend(
  mail: MailWithFollowups,
  followup: FollowupRow
): Promise<SendResult> {
  const subject = toReplySubject(followup.subject || mail.subject);
  const body = normalizeEditorHtmlForEmail(followup.bodyHtml);
  if (!body) {
    const msg = "Corps de relance vide.";
    await prisma.adminMailFollowup.update({
      where: { id: followup.id },
      data: { status: "FAILED", sendError: msg },
    });
    return { ok: false, error: msg };
  }

  const fromName = await getGmailFromName(mail.fromEmail);
  const senderLabel = `${fromName} <${mail.fromEmail}>`;
  const dateLabel = mail.sentAt ? formatFrDate(mail.sentAt) : "";
  const quoted = buildQuotedOriginal(mail.bodyHtml, { dateLabel, senderLabel });
  const finalHtml = `${body}${quoted}`;

  try {
    const messageId = await sendGmail({
      fromEmail: mail.fromEmail,
      to: mail.toEmail,
      subject,
      htmlBody: finalHtml,
      threadId: mail.threadId || undefined,
      inReplyTo: mail.messageRfcId || undefined,
    });
    await prisma.adminMailFollowup.update({
      where: { id: followup.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        gmailMessageId: messageId,
        sendError: null,
      },
    });
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.adminMailFollowup.update({
      where: { id: followup.id },
      data: { status: "FAILED", sendError: msg },
    });
    console.error("[admin-mailer.executeFollowupSend]", followup.id, msg);
    return { ok: false, error: msg };
  }
}

/** Cron : envoie tous les mails programmés dont l'échéance est atteinte. */
export async function processScheduledMails(limit = 50) {
  const now = new Date();
  const due = await prisma.adminMail.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now, not: null } },
    select: { id: true },
    take: limit,
  });

  const results: Array<{ id: string } & SendResult> = [];
  for (const row of due) {
    const r = await executeMailSend(row.id);
    results.push({ id: row.id, ...r });
  }
  return { processed: due.length, results };
}

/**
 * Cron : pour chaque mail envoyé ayant des relances en attente, détecte une
 * éventuelle réponse (et annule les relances le cas échéant), puis envoie la
 * relance échue la plus ancienne (une par passage pour garder l'ordre du fil).
 */
export async function processMailFollowups(limit = 50) {
  const now = new Date();
  const mails = await prisma.adminMail.findMany({
    where: {
      status: "SENT",
      threadId: { not: null },
      followups: { some: { status: "PENDING" } },
    },
    include: {
      followups: { where: { status: "PENDING" }, orderBy: { order: "asc" } },
    },
    take: limit,
  });

  const results: Array<Record<string, unknown>> = [];

  for (const mail of mails) {
    // 1) Détection de réponse → annule les relances en attente.
    if (mail.stopOnReply && !mail.repliedAt && mail.threadId) {
      try {
        const activity = await checkThreadActivity(mail.fromEmail, mail.threadId);
        if (activity.replied) {
          await prisma.adminMail.update({
            where: { id: mail.id },
            data: { repliedAt: new Date(), lastReplyCheckAt: new Date() },
          });
          await prisma.adminMailFollowup.updateMany({
            where: { mailId: mail.id, status: "PENDING" },
            data: { status: "SKIPPED" },
          });
          results.push({
            id: mail.id,
            skipped: mail.followups.length,
            reason: "replied",
          });
          continue;
        }
        await prisma.adminMail.update({
          where: { id: mail.id },
          data: { lastReplyCheckAt: new Date() },
        });
      } catch (error) {
        console.warn(
          "[admin-mailer.processMailFollowups] reply-check",
          mail.id,
          error
        );
      }
    }

    // 2) Relance échue la plus ancienne.
    const dueFollowup = mail.followups.find(
      (f) => f.scheduledAt && f.scheduledAt.getTime() <= now.getTime()
    );
    if (!dueFollowup) continue;

    const r = await executeFollowupSend(mail, dueFollowup);
    results.push({ id: mail.id, followupId: dueFollowup.id, ...r });
  }

  return { processed: mails.length, results };
}
