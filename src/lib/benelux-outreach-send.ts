/**
 * Moteur du module Prospection BENELUX : cycle de contact prospects clients
 * 45 jours.
 *
 * Variante du module Outreach (clients marques FR), mais 100 % isolé du CRM FR :
 *  - cible = contacts d'entreprises prospects BENELUX (BeneluxCompany / BeneluxContact)
 *  - aucune FK vers Marque / MarqueContact, aucun write-back HubSpot
 *  - composer libre (mêmes variables que l'outreach clients : {{contact.*}})
 *
 * Utilisé par :
 *  - POST /api/benelux-outreach/targets/[id]/send        (envoi d'un mail de cycle)
 *  - POST /api/benelux-outreach/targets/[id]/relance-now (relance manuelle J+3)
 *  - POST /api/benelux-outreach/send-bulk                (envoi groupé)
 *  - GET  /api/cron/benelux-outreach                     (relances auto + bascule J+45)
 *
 * Règle métier (identique à l'outreach marques) :
 *  - 1 prospect (email) = 1 BeneluxOutreachTarget, cycle perpétuel tous les 45 jours
 *  - Chaque mail de cycle = 1 BeneluxOutreachTouch (nouveau thread Gmail)
 *  - Relance auto J+3 ouvrés dans le thread du touch (1 max), annulée si réponse
 *  - La réponse n'arrête PAS le cycle (info seulement) ; seul un stop manuel
 *  - From : boîte Gmail du target (target.fromEmail), défaut leyna@glowupagence.fr
 */

import { prisma } from "@/lib/prisma";
import {
  sendGmail,
  findRecentSentToRecipient,
  getMessageRfcId,
  getGmailFromName,
} from "@/lib/gmail";
import { injectBeneluxOutreachTracking } from "@/lib/benelux-outreach-tracking";
import {
  normalizeEditorHtmlForEmail,
  buildQuotedOriginal,
} from "@/lib/email-body-html";
import {
  applyCastingTemplateVars,
  buildOutreachRelanceTemplate,
  LEYNA_FROM_EMAIL,
} from "@/lib/casting-auto-send";

export const BENELUX_OUTREACH_RELANCE_BUSINESS_DAYS = 3;
/** Relance 2 : jours ouvrés après R1 (aligné casting / Outreach FR). */
export const BENELUX_OUTREACH_RELANCE2_BUSINESS_DAYS = 10;
/** Jours calendaires avant le retour du prospect en file « À recontacter ». */
export const BENELUX_OUTREACH_RECONTACT_DAYS = 45;

/** Boîte expéditrice du cycle d'un prospect BENELUX (défaut : Leyna). */
export function beneluxOutreachFromEmail(target: {
  fromEmail?: string | null;
}): string {
  return (target.fromEmail || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
}

export type BeneluxOutreachSendResult =
  | { ok: true; touchId: string; messageId: string }
  | {
      ok: false;
      error: string;
      needsConfirmation?: boolean;
      alreadyContactedAt?: string;
      suggestedNextRecontactAt?: string;
    };

function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatFrDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isValidEmail(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

type RecentExternalContact = { contacted: boolean; lastDate: Date | null };

/**
 * Garde-fou : vérifie dans la boîte expéditrice si ce prospect a déjà reçu un
 * mail < 45j hors du cycle de prospection BENELUX (les threads des touches de ce
 * target sont ignorés). Fail-open : si Gmail échoue, on n'empêche pas l'envoi.
 */
async function detectRecentExternalContact(
  fromEmail: string,
  targetId: string,
  email: string
): Promise<RecentExternalContact> {
  try {
    const sent = await findRecentSentToRecipient(
      fromEmail,
      email.toLowerCase(),
      BENELUX_OUTREACH_RECONTACT_DAYS
    );
    if (sent.length === 0) return { contacted: false, lastDate: null };

    const ownTouches = await prisma.beneluxOutreachTouch.findMany({
      where: { targetId, threadId: { not: null } },
      select: { threadId: true },
    });
    const ownThreadIds = new Set(ownTouches.map((t) => t.threadId as string));

    const external = sent.filter((m) => !ownThreadIds.has(m.threadId));
    if (external.length === 0) return { contacted: false, lastDate: null };

    const timestamps = external
      .map((m) => m.internalDate)
      .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
    const lastDate =
      timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

    return { contacted: true, lastDate };
  } catch (error) {
    console.warn(
      `[benelux-outreach] vérif boîte ${fromEmail} impossible pour ${email}:`,
      error
    );
    return { contacted: false, lastDate: null };
  }
}

/**
 * Envoie un mail de cycle à un prospect BENELUX : crée le touch (cycle N),
 * personnalise les variables, injecte le tracking, envoie via Gmail (nouveau
 * thread), puis remet le compteur 45 jours à zéro.
 */
export async function executeBeneluxOutreachSend(
  targetId: string,
  input: {
    subject: string;
    bodyHtml: string;
    sentById?: string | null;
    force?: boolean;
  }
): Promise<BeneluxOutreachSendResult> {
  const target = await prisma.beneluxOutreachTarget.findUnique({
    where: { id: targetId },
  });
  if (!target) return { ok: false, error: "Prospect introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce prospect est sorti du cycle (stoppé)." };
  }

  const subjectTpl = input.subject.trim();
  const bodyRaw = input.bodyHtml.trim();
  if (!subjectTpl || !bodyRaw) {
    return { ok: false, error: "Sujet et corps du mail requis." };
  }
  if (!isValidEmail(target.email)) {
    return { ok: false, error: `Email invalide : ${target.email}` };
  }

  const fromEmail = beneluxOutreachFromEmail(target);

  if (!input.force) {
    const externalContact = await detectRecentExternalContact(
      fromEmail,
      target.id,
      target.email
    );
    if (externalContact.contacted) {
      if (externalContact.lastDate) {
        const suggestedNextRecontactAt = new Date(
          externalContact.lastDate.getTime() +
            BENELUX_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
        );
        return {
          ok: false,
          needsConfirmation: true,
          alreadyContactedAt: externalContact.lastDate.toISOString(),
          suggestedNextRecontactAt: suggestedNextRecontactAt.toISOString(),
          error:
            `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
            `${fromEmail} (hors prospection BENELUX : envoi manuel ou autre canal).`,
        };
      }
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${BENELUX_OUTREACH_RECONTACT_DAYS} jours.`,
      };
    }
  }

  const vars = {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: target.companyName || "",
  };
  const personalizedSubject = applyCastingTemplateVars(subjectTpl, vars);
  const { ensureTalentExtralinksInHtml } = await import(
    "@/lib/talent-email-links"
  );
  const bodyTpl = normalizeEditorHtmlForEmail(
    ensureTalentExtralinksInHtml(bodyRaw)
  );
  const personalizedBody = applyCastingTemplateVars(bodyTpl, vars);

  const cycleNumber = target.cycleCount + 1;
  const touch = await prisma.beneluxOutreachTouch.create({
    data: {
      targetId: target.id,
      cycleNumber,
      subject: personalizedSubject,
      bodyHtml: bodyTpl,
      fromEmail,
      sentById: input.sentById || null,
    },
  });

  const trackedBody = injectBeneluxOutreachTracking(personalizedBody, touch.id);

  let messageId: string;
  try {
    messageId = await sendGmail({
      fromEmail,
      to: target.email.toLowerCase(),
      subject: personalizedSubject,
      htmlBody: trackedBody,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.beneluxOutreachTouch.update({
      where: { id: touch.id },
      data: { sendError: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }

  const now = new Date();
  const nextRecontactAt = new Date(
    now.getTime() + BENELUX_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.$transaction([
    prisma.beneluxOutreachTouch.update({
      where: { id: touch.id },
      data: { sentAt: now, messageId, threadId: messageId, sendError: null },
    }),
    prisma.beneluxOutreachTarget.update({
      where: { id: target.id },
      data: {
        status: "WAITING",
        cycleCount: cycleNumber,
        lastSentAt: now,
        nextRecontactAt,
        draftSubject: null,
        draftBodyHtml: null,
        scheduledSendAt: null,
        scheduledSubject: null,
        scheduledBodyHtml: null,
        scheduledById: null,
        autoRescheduleReason: null,
        autoRescheduledAt: null,
      },
    }),
  ]);

  console.info(
    `[benelux-outreach] envoi cycle ${cycleNumber} → ${target.email} (touch=${touch.id})`
  );

  return { ok: true, touchId: touch.id, messageId };
}

export type BeneluxOutreachScheduleResult =
  | { ok: true; scheduledSendAt: string }
  | {
      ok: false;
      error: string;
      needsConfirmation?: boolean;
      alreadyContactedAt?: string;
      suggestedNextRecontactAt?: string;
    };

/**
 * Programme (sans envoyer) un mail de cycle BENELUX à une échéance précise.
 * Même garde-fou anti double-contact que l'envoi immédiat. Le cron envoie
 * quand `scheduledSendAt` est atteint.
 */
export async function executeBeneluxOutreachSchedule(
  targetId: string,
  input: {
    subject: string;
    bodyHtml: string;
    scheduledSendAt: Date;
    sentById?: string | null;
    force?: boolean;
  }
): Promise<BeneluxOutreachScheduleResult> {
  const target = await prisma.beneluxOutreachTarget.findUnique({
    where: { id: targetId },
  });
  if (!target) return { ok: false, error: "Prospect introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce prospect est sorti du cycle (stoppé)." };
  }

  const subjectTpl = input.subject.trim();
  const bodyTpl = input.bodyHtml.trim();
  if (!subjectTpl || !bodyTpl) {
    return { ok: false, error: "Sujet et corps du mail requis." };
  }
  if (!isValidEmail(target.email)) {
    return { ok: false, error: `Email invalide : ${target.email}` };
  }

  const fromEmail = beneluxOutreachFromEmail(target);

  if (!input.force) {
    const externalContact = await detectRecentExternalContact(
      fromEmail,
      target.id,
      target.email
    );
    if (externalContact.contacted) {
      if (externalContact.lastDate) {
        const suggestedNextRecontactAt = new Date(
          externalContact.lastDate.getTime() +
            BENELUX_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
        );
        return {
          ok: false,
          needsConfirmation: true,
          alreadyContactedAt: externalContact.lastDate.toISOString(),
          suggestedNextRecontactAt: suggestedNextRecontactAt.toISOString(),
          error:
            `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
            `${fromEmail} (hors prospection BENELUX : envoi manuel ou autre canal).`,
        };
      }
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${BENELUX_OUTREACH_RECONTACT_DAYS} jours.`,
      };
    }
  }

  await prisma.beneluxOutreachTarget.update({
    where: { id: target.id },
    data: {
      scheduledSendAt: input.scheduledSendAt,
      scheduledSubject: subjectTpl,
      scheduledBodyHtml: bodyTpl,
      scheduledById: input.sentById || null,
      draftSubject: null,
      draftBodyHtml: null,
      autoRescheduleReason: null,
      autoRescheduledAt: null,
    },
  });

  return { ok: true, scheduledSendAt: input.scheduledSendAt.toISOString() };
}

/**
 * Cron : envoie les mails BENELUX programmés / étalés dont l'échéance est
 * atteinte. Cap bas pour éviter une rafale.
 */
export async function processBeneluxScheduledSends(
  now: Date = new Date(),
  limit = 10
): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await prisma.beneluxOutreachTarget.findMany({
    where: {
      status: { not: "STOPPED" },
      scheduledSendAt: { not: null, lte: now },
    },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      companyName: true,
      createdById: true,
      scheduledSubject: true,
      scheduledBodyHtml: true,
      scheduledById: true,
    },
    orderBy: { scheduledSendAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const t of due) {
    const subject = (t.scheduledSubject || "").trim();
    const bodyHtml = (t.scheduledBodyHtml || "").trim();

    if (!subject || !bodyHtml) {
      await prisma.beneluxOutreachTarget
        .update({
          where: { id: t.id },
          data: {
            scheduledSendAt: null,
            scheduledSubject: null,
            scheduledBodyHtml: null,
            scheduledById: null,
          },
        })
        .catch(() => null);
      continue;
    }

    await prisma.beneluxOutreachTarget
      .update({
        where: { id: t.id },
        data: {
          scheduledSendAt: null,
          scheduledSubject: null,
          scheduledBodyHtml: null,
          scheduledById: null,
        },
      })
      .catch(() => null);

    const result = await executeBeneluxOutreachSend(t.id, {
      subject,
      bodyHtml,
      sentById: t.scheduledById,
      force: true,
    });

    if (result.ok) {
      sent += 1;
      continue;
    }

    failed += 1;
    await prisma.notification
      .create({
        data: {
          userId: t.createdById,
          type: "GENERAL",
          titre: "Envoi programmé échoué (Outreach BENELUX)",
          message: `Le mail programmé pour ${t.firstname} ${t.lastname || ""} (${t.companyName}, ${t.email}) n'a pas pu partir : ${result.error}`,
          lien: "/outreach?market=BENELUX",
        },
      })
      .catch((e) =>
        console.warn("[benelux-outreach] notif envoi programmé échoué:", e)
      );
  }

  return { processed: due.length, sent, failed };
}

export type BeneluxOutreachRescheduleResult =
  | { ok: true; nextRecontactAt: string; reason: string }
  | { ok: false; error: string };

/**
 * Met un prospect « en attente » sans envoyer de mail (quand l'utilisateur,
 * prévenu d'un contact récent, choisit de ne pas renvoyer maintenant).
 */
export async function executeBeneluxOutreachReschedule(
  targetId: string
): Promise<BeneluxOutreachRescheduleResult> {
  const target = await prisma.beneluxOutreachTarget.findUnique({
    where: { id: targetId },
  });
  if (!target) return { ok: false, error: "Prospect introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce prospect est sorti du cycle (stoppé)." };
  }

  const fromEmail = beneluxOutreachFromEmail(target);
  const externalContact = await detectRecentExternalContact(
    fromEmail,
    target.id,
    target.email
  );

  const baseDate = externalContact.lastDate ?? new Date();
  const nextRecontactAt = new Date(
    baseDate.getTime() + BENELUX_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
  );

  const reason = externalContact.lastDate
    ? `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
      `${fromEmail}. Recontact replanifié au ${formatFrDate(nextRecontactAt)} (J+${BENELUX_OUTREACH_RECONTACT_DAYS}).`
    : `Mis en attente : recontact replanifié au ${formatFrDate(nextRecontactAt)} (J+${BENELUX_OUTREACH_RECONTACT_DAYS}).`;

  await prisma.beneluxOutreachTarget.update({
    where: { id: target.id },
    data: {
      status: "WAITING",
      lastSentAt: baseDate,
      nextRecontactAt,
      autoRescheduleReason: reason,
      autoRescheduledAt: new Date(),
    },
  });

  return { ok: true, nextRecontactAt: nextRecontactAt.toISOString(), reason };
}

export type BeneluxOutreachRelanceResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Relance thread Gmail — round 1 (J+3) ou round 2 (J+10 après R1).
 * Corps = IA avec fallback template.
 */
export async function executeBeneluxOutreachRelance(
  touchId: string,
  options: {
    subjectOverride?: string;
    bodyOverride?: string;
    round?: 1 | 2;
  } = {}
): Promise<BeneluxOutreachRelanceResult> {
  const round: 1 | 2 = options.round === 2 ? 2 : 1;
  const touch = await prisma.beneluxOutreachTouch.findUnique({
    where: { id: touchId },
    include: { target: true },
  });
  if (!touch) return { ok: false, error: "Touch introuvable." };
  if (!touch.sentAt || !touch.threadId) {
    return { ok: false, error: "Le mail initial n'a pas été envoyé." };
  }
  if (touch.relanceCancelledAt) {
    return { ok: false, error: "Les relances sont en pause sur ce mail." };
  }
  if (round === 1) {
    if (touch.relanceSentAt) {
      return { ok: false, error: "La relance 1 a déjà été envoyée pour ce mail." };
    }
  } else {
    if (!touch.relanceSentAt) {
      return { ok: false, error: "La relance 1 doit partir avant la relance 2." };
    }
    if (touch.relance2SentAt) {
      return { ok: false, error: "La relance 2 a déjà été envoyée pour ce mail." };
    }
    const { outreachRelance2Eligible } = await import("@/lib/outreach-constants");
    if (!outreachRelance2Eligible(touch.relanceSentAt)) {
      return {
        ok: false,
        error:
          "Pas de R2 sur ce cycle : la R1 est antérieure au 25/09/2026 (rattrapage limité).",
      };
    }
  }

  const target = touch.target;
  const subjectSrc = touch.subject.trim();
  const relanceSubject =
    options.subjectOverride?.trim() ||
    (subjectSrc.toLowerCase().startsWith("re:") ? subjectSrc : `Re: ${subjectSrc}`);

  const lang: "fr" | "en" = target.language === "en" ? "en" : "fr";
  let bodyTemplate = options.bodyOverride?.trim() || "";
  if (!bodyTemplate) {
    try {
      const { generateOutreachRelanceBody } = await import(
        "@/lib/outreach-relance-ai"
      );
      const ai = await generateOutreachRelanceBody({
        touchId: touch.id,
        round,
        language: lang,
        company: target.companyName,
        previousSubject: touch.subject,
        previousBodyHtml: touch.bodyHtml || "",
        firstSentAt: touch.sentAt,
      });
      if (ai?.bodyHtml?.trim()) bodyTemplate = ai.bodyHtml.trim();
    } catch (e) {
      console.warn(
        `[benelux-outreach] relance R${round} IA soft-fail:`,
        e instanceof Error ? e.message : e
      );
    }
  }
  if (!bodyTemplate) {
    bodyTemplate = buildOutreachRelanceTemplate(
      target.companyName,
      lang,
      touch.sentAt
    );
  }

  const { ensureTalentExtralinksInHtml } = await import(
    "@/lib/talent-email-links"
  );
  bodyTemplate = ensureTalentExtralinksInHtml(
    bodyTemplate,
    null,
    touch.bodyHtml || ""
  );

  const vars = {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: target.companyName || "",
  };
  const bodyWithVars = applyCastingTemplateVars(bodyTemplate, vars);
  const body = normalizeEditorHtmlForEmail(bodyWithVars);
  const trackedBody = injectBeneluxOutreachTracking(body, touch.id);

  const fromEmail = beneluxOutreachFromEmail({ fromEmail: touch.fromEmail });

  const fromName = await getGmailFromName(fromEmail);
  const originalPersonalized = applyCastingTemplateVars(touch.bodyHtml || "", vars);
  const quotedOriginal = buildQuotedOriginal(originalPersonalized, {
    dateLabel: touch.sentAt ? formatFrDateTime(touch.sentAt) : "",
    senderLabel: `${fromName} <${fromEmail}>`,
  });
  const finalHtml = `${trackedBody}${quotedOriginal}`;

  const replyToGmailId =
    round === 2 && touch.relanceMessageId
      ? touch.relanceMessageId
      : touch.messageId;
  let inReplyTo: string | undefined;
  if (replyToGmailId) {
    inReplyTo = (await getMessageRfcId(fromEmail, replyToGmailId)) || undefined;
  }

  try {
    const messageId = await sendGmail({
      fromEmail,
      to: target.email.toLowerCase(),
      subject: relanceSubject,
      htmlBody: finalHtml,
      threadId: touch.threadId,
      inReplyTo,
    });

    if (round === 1) {
      await prisma.beneluxOutreachTouch.update({
        where: { id: touch.id },
        data: {
          relanceSentAt: new Date(),
          relanceMessageId: messageId,
          relanceError: null,
        },
      });
      console.info(
        `[benelux-outreach] relance R1 J+3 → ${target.email} (touch=${touch.id})`
      );
    } else {
      await prisma.beneluxOutreachTouch.update({
        where: { id: touch.id },
        data: {
          relance2SentAt: new Date(),
          relance2MessageId: messageId,
          relance2Error: null,
        },
      });
      console.info(
        `[benelux-outreach] relance R2 J+10 → ${target.email} (touch=${touch.id})`
      );
    }
    return { ok: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.beneluxOutreachTouch.update({
      where: { id: touch.id },
      data:
        round === 1
          ? { relanceError: msg }
          : { relance2Error: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }
}
