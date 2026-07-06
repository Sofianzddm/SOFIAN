/**
 * Moteur du module Outreach : cycle de contact clients 45 jours.
 *
 * Utilisé par :
 *  - POST /api/outreach/targets/[id]/send        (envoi d'un mail de cycle)
 *  - POST /api/outreach/targets/[id]/relance-now (relance manuelle J+3)
 *  - GET  /api/cron/outreach                     (relances auto + bascule J+45)
 *
 * Règle métier :
 *  - 1 client (email) = 1 OutreachTarget, cycle perpétuel tous les 45 jours
 *  - Chaque mail de cycle = 1 OutreachTouch (nouveau thread Gmail)
 *  - Relance auto J+3 ouvrés dans le thread du touch (1 max), annulée si réponse
 *  - La réponse n'arrête PAS le cycle (info seulement) ; seul un stop manuel
 *  - From: boîte Gmail du target (target.fromEmail), défaut leyna@glowupagence.fr
 *  - Write-back HubSpot à chaque envoi (app_last_contacted_at / app_outreach_status)
 */

import { prisma } from "@/lib/prisma";
import {
  sendGmail,
  findRecentSentToRecipient,
  getMessageRfcId,
  getGmailFromName,
} from "@/lib/gmail";
import { injectOutreachTracking } from "@/lib/outreach-tracking";
import {
  normalizeEditorHtmlForEmail,
  buildQuotedOriginal,
} from "@/lib/email-body-html";
import {
  applyCastingTemplateVars,
  buildOutreachRelanceTemplate,
  CASTING_COOLDOWN_DAYS,
  LEYNA_FROM_EMAIL,
} from "@/lib/casting-auto-send";
import {
  findContactIdByEmail,
  markContactContactedFromApp,
} from "@/lib/hubspot";

export const OUTREACH_RELANCE_BUSINESS_DAYS = 3;
/** Jours calendaires avant le retour du client en file « À recontacter ». */
export const OUTREACH_RECONTACT_DAYS = 45;

/** Boîte expéditrice du cycle d'un client (défaut : Leyna). */
export function outreachFromEmail(target: { fromEmail?: string | null }): string {
  return (target.fromEmail || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
}

/**
 * Libellé des sous-marques couvertes par le contact (hors marque principale),
 * pour la variable {{ contact.marques }} — ex. « Dove, Axe ». Vide si le contact
 * ne couvre pas d'autres marques.
 */
async function coveredBrandsLabel(
  marqueContactId: string | null | undefined,
  company: string
): Promise<string> {
  if (!marqueContactId) return "";
  const rows = await prisma.marqueContactSousMarque.findMany({
    where: { contactId: marqueContactId },
    select: { marque: { select: { nom: true } } },
  });
  const names = Array.from(
    new Set(rows.map((r) => r.marque.nom).filter((n) => n && n !== company))
  );
  return names.join(", ");
}

export type OutreachSendResult =
  | {
      ok: true;
      touchId: string;
      messageId: string;
      hubspotSynced: boolean;
    }
  | {
      ok: false;
      error: string;
      /**
       * Vrai si le client a déjà été contacté (pipeline talent ou hors app) et
       * qu'une confirmation utilisateur est requise : envoyer quand même
       * (option `force`) ou mettre en attente (executeOutreachReschedule).
       */
      needsConfirmation?: boolean;
      /** Date du contact déjà détecté, si connue (ISO). */
      alreadyContactedAt?: string;
      /** Date de recontact suggérée si on met en attente (ISO). */
      suggestedNextRecontactAt?: string;
    };

function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** « 18 juin 2026 à 11:23 » — utilisé dans l'en-tête de citation des relances. */
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

/**
 * Cooldown anti-spam croisé avec le pipeline talent : si l'email a reçu un
 * mail via contact_missions dans les CASTING_COOLDOWN_DAYS derniers jours,
 * on bloque pour éviter le double contact.
 */
async function isEmailBlockedByPipelineCooldown(email: string): Promise<boolean> {
  const since = new Date(Date.now() - CASTING_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ sentMessageIds: unknown }>>`
    SELECT "sentMessageIds"
    FROM "contact_missions"
    WHERE "sentAt" >= ${since}
      AND "sentMessageIds" IS NOT NULL
  `;
  const lowered = email.toLowerCase();
  for (const row of rows) {
    if (!row.sentMessageIds || typeof row.sentMessageIds !== "object") continue;
    for (const key of Object.keys(row.sentMessageIds as Record<string, unknown>)) {
      if (key.toLowerCase() === lowered) return true;
    }
  }
  return false;
}

/**
 * Garde-fou : vérifie dans la boîte expéditrice (messages envoyés) si ce client
 * a déjà été contacté il y a moins de 45 jours — peu importe le canal
 * (séquence HubSpot, mail manuel, autre module). Les mails envoyés par le
 * cycle outreach de ce client lui-même (threads de ses touches) sont ignorés,
 * sinon un recontact anticipé volontaire serait bloqué.
 * Fail-open : si la recherche Gmail échoue techniquement, on n'empêche pas l'envoi.
 */
type RecentExternalContact = {
  /** Un mail externe (hors cycle de ce target) a été trouvé < 45j. */
  contacted: boolean;
  /** Date du mail externe le plus récent, si Gmail l'a renvoyée. */
  lastDate: Date | null;
};

async function detectRecentExternalContact(
  fromEmail: string,
  targetId: string,
  email: string
): Promise<RecentExternalContact> {
  try {
    const sent = await findRecentSentToRecipient(
      fromEmail,
      email.toLowerCase(),
      OUTREACH_RECONTACT_DAYS
    );
    if (sent.length === 0) return { contacted: false, lastDate: null };

    const ownTouches = await prisma.outreachTouch.findMany({
      where: { targetId, threadId: { not: null } },
      select: { threadId: true },
    });
    const ownThreadIds = new Set(ownTouches.map((t) => t.threadId as string));

    const external = sent.filter((m) => !ownThreadIds.has(m.threadId));
    if (external.length === 0) return { contacted: false, lastDate: null };

    const timestamps = external
      .map((m) => m.internalDate)
      .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
    const lastDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

    return { contacted: true, lastDate };
  } catch (error) {
    console.warn(`[outreach] vérif boîte ${fromEmail} impossible pour ${email}:`, error);
    return { contacted: false, lastDate: null };
  }
}

/**
 * Write-back HubSpot best-effort (jamais bloquant) : retrouve le contact par
 * email et pousse app_last_contacted_at + app_outreach_status, puis mémorise
 * l'id HubSpot sur le target.
 */
async function syncHubspotAfterSend(
  targetId: string,
  email: string,
  knownHubspotContactId: string | null
): Promise<boolean> {
  try {
    const contactId = knownHubspotContactId || (await findContactIdByEmail(email));
    if (!contactId) return false;
    const ok = await markContactContactedFromApp(contactId, "contacte");
    if (!ok) return false;
    await prisma.outreachTarget.update({
      where: { id: targetId },
      data: { hubspotContactId: contactId, hubspotSyncedAt: new Date() },
    });
    return true;
  } catch (error) {
    console.warn(`[outreach] write-back HubSpot échoué pour ${email}:`, error);
    return false;
  }
}

/**
 * Envoie un mail de cycle à un client : crée le touch (cycle N), personnalise
 * les variables, injecte le tracking, envoie via Gmail (nouveau thread), puis
 * remet le compteur 45 jours à zéro (status WAITING + nextRecontactAt).
 */
export async function executeOutreachSend(
  targetId: string,
  input: {
    subject: string;
    bodyHtml: string;
    sentById?: string | null;
    /**
     * Force l'envoi malgré un contact récent déjà détecté (pipeline talent ou
     * hors app). Activé quand l'utilisateur choisit « Envoyer quand même ».
     */
    force?: boolean;
  }
): Promise<OutreachSendResult> {
  const target = await prisma.outreachTarget.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, error: "Client introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce client est sorti du cycle (stoppé)." };
  }

  const subjectTpl = input.subject.trim();
  const bodyRaw = input.bodyHtml.trim();
  if (!subjectTpl || !bodyRaw) {
    return { ok: false, error: "Sujet et corps du mail requis." };
  }
  if (!isValidEmail(target.email)) {
    return { ok: false, error: `Email invalide : ${target.email}` };
  }

  const fromEmail = outreachFromEmail(target);

  // Garde-fous « déjà contacté » : sauf si l'utilisateur force l'envoi, on ne
  // bloque ni ne replanifie automatiquement — on remonte une demande de
  // confirmation (« Envoyer quand même » ou « Mettre en attente »).
  if (!input.force) {
    if (await isEmailBlockedByPipelineCooldown(target.email)) {
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail (pipeline talent) dans les ${CASTING_COOLDOWN_DAYS} derniers jours.`,
      };
    }

    // Garde-fou boîte expéditrice : déjà contacté < 45j via un autre canal
    // (séquence HubSpot, mail manuel…).
    const externalContact = await detectRecentExternalContact(
      fromEmail,
      target.id,
      target.email
    );
    if (externalContact.contacted) {
      if (externalContact.lastDate) {
        const suggestedNextRecontactAt = new Date(
          externalContact.lastDate.getTime() +
            OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
        );
        return {
          ok: false,
          needsConfirmation: true,
          alreadyContactedAt: externalContact.lastDate.toISOString(),
          suggestedNextRecontactAt: suggestedNextRecontactAt.toISOString(),
          error:
            `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
            `${fromEmail} (hors app : séquence HubSpot ou envoi manuel).`,
        };
      }

      // Mail externe détecté mais date illisible.
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${OUTREACH_RECONTACT_DAYS} jours (HubSpot ou envoi manuel).`,
      };
    }
  }

  const vars = {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: target.company || "",
    marques: await coveredBrandsLabel(target.marqueContactId, target.company || ""),
  };
  const personalizedSubject = applyCastingTemplateVars(subjectTpl, vars);
  const bodyTpl = normalizeEditorHtmlForEmail(bodyRaw);
  const personalizedBody = applyCastingTemplateVars(bodyTpl, vars);

  const cycleNumber = target.cycleCount + 1;
  const touch = await prisma.outreachTouch.create({
    data: {
      targetId: target.id,
      cycleNumber,
      subject: personalizedSubject,
      bodyHtml: bodyTpl,
      fromEmail,
      sentById: input.sentById || null,
    },
  });

  const trackedBody = injectOutreachTracking(personalizedBody, touch.id);

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
    await prisma.outreachTouch.update({
      where: { id: touch.id },
      data: { sendError: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }

  const now = new Date();
  const nextRecontactAt = new Date(
    now.getTime() + OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.$transaction([
    prisma.outreachTouch.update({
      where: { id: touch.id },
      data: { sentAt: now, messageId, threadId: messageId, sendError: null },
    }),
    prisma.outreachTarget.update({
      where: { id: target.id },
      data: {
        status: "WAITING",
        cycleCount: cycleNumber,
        lastSentAt: now,
        nextRecontactAt,
        // Le brouillon est consommé : le prochain cycle repart de zéro
        draftSubject: null,
        draftBodyHtml: null,
        // Un envoi réel rend obsolète toute replanification auto précédente
        autoRescheduleReason: null,
        autoRescheduledAt: null,
      },
    }),
  ]);

  const hubspotSynced = await syncHubspotAfterSend(
    target.id,
    target.email,
    target.hubspotContactId
  );

  console.info(
    `[outreach] envoi cycle ${cycleNumber} → ${target.email} (touch=${touch.id}, hubspot=${hubspotSynced})`
  );

  return { ok: true, touchId: touch.id, messageId, hubspotSynced };
}

export type OutreachRescheduleResult =
  | { ok: true; nextRecontactAt: string; reason: string }
  | { ok: false; error: string };

/**
 * Met un client « en attente » sans envoyer de mail : utilisé quand
 * l'utilisateur, prévenu que le client a déjà été contacté, choisit de NE PAS
 * renvoyer maintenant. On (re)détecte la date du dernier contact pour caler le
 * recontact à J+45 ; à défaut on part de maintenant.
 */
export async function executeOutreachReschedule(
  targetId: string
): Promise<OutreachRescheduleResult> {
  const target = await prisma.outreachTarget.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, error: "Client introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce client est sorti du cycle (stoppé)." };
  }

  const fromEmail = outreachFromEmail(target);
  const externalContact = await detectRecentExternalContact(
    fromEmail,
    target.id,
    target.email
  );

  const baseDate = externalContact.lastDate ?? new Date();
  const nextRecontactAt = new Date(
    baseDate.getTime() + OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
  );

  const reason = externalContact.lastDate
    ? `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
      `${fromEmail} (hors app : séquence HubSpot ou envoi manuel). ` +
      `Recontact replanifié au ${formatFrDate(nextRecontactAt)} (J+${OUTREACH_RECONTACT_DAYS}).`
    : `Mis en attente : recontact replanifié au ${formatFrDate(nextRecontactAt)} (J+${OUTREACH_RECONTACT_DAYS}).`;

  await prisma.outreachTarget.update({
    where: { id: target.id },
    data: {
      status: "WAITING",
      lastSentAt: baseDate,
      nextRecontactAt,
      autoRescheduleReason: reason,
      autoRescheduledAt: new Date(),
    },
  });

  console.info(
    `[outreach] mis en attente ${target.email} → recontact le ${nextRecontactAt.toISOString()}`
  );

  return { ok: true, nextRecontactAt: nextRecontactAt.toISOString(), reason };
}

export type OutreachScheduleResult =
  | { ok: true; scheduledSendAt: string }
  | {
      ok: false;
      error: string;
      needsConfirmation?: boolean;
      alreadyContactedAt?: string;
      suggestedNextRecontactAt?: string;
    };

/**
 * Programme (sans envoyer) un mail de cycle pour un client à une échéance
 * précise (option « à une heure précise »). Applique le même garde-fou anti
 * double-contact que l'envoi immédiat, puis fige le sujet/corps (déjà traduits)
 * et l'échéance sur le target. Le cron enverra effectivement le mail quand
 * `scheduledSendAt` sera atteint.
 */
export async function executeOutreachSchedule(
  targetId: string,
  input: {
    subject: string;
    bodyHtml: string;
    scheduledSendAt: Date;
    sentById?: string | null;
    force?: boolean;
  }
): Promise<OutreachScheduleResult> {
  const target = await prisma.outreachTarget.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, error: "Client introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce client est sorti du cycle (stoppé)." };
  }

  const subjectTpl = input.subject.trim();
  const bodyTpl = input.bodyHtml.trim();
  if (!subjectTpl || !bodyTpl) {
    return { ok: false, error: "Sujet et corps du mail requis." };
  }
  if (!isValidEmail(target.email)) {
    return { ok: false, error: `Email invalide : ${target.email}` };
  }

  const fromEmail = outreachFromEmail(target);

  if (!input.force) {
    if (await isEmailBlockedByPipelineCooldown(target.email)) {
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail (pipeline talent) dans les ${CASTING_COOLDOWN_DAYS} derniers jours.`,
      };
    }

    const externalContact = await detectRecentExternalContact(
      fromEmail,
      target.id,
      target.email
    );
    if (externalContact.contacted) {
      if (externalContact.lastDate) {
        const suggestedNextRecontactAt = new Date(
          externalContact.lastDate.getTime() +
            OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
        );
        return {
          ok: false,
          needsConfirmation: true,
          alreadyContactedAt: externalContact.lastDate.toISOString(),
          suggestedNextRecontactAt: suggestedNextRecontactAt.toISOString(),
          error:
            `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
            `${fromEmail} (hors app : séquence HubSpot ou envoi manuel).`,
        };
      }
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${OUTREACH_RECONTACT_DAYS} jours (HubSpot ou envoi manuel).`,
      };
    }
  }

  await prisma.outreachTarget.update({
    where: { id: target.id },
    data: {
      scheduledSendAt: input.scheduledSendAt,
      scheduledSubject: subjectTpl,
      scheduledBodyHtml: bodyTpl,
      scheduledById: input.sentById || null,
      // On repart d'un état propre côté brouillon / auto-reschedule.
      draftSubject: null,
      draftBodyHtml: null,
      autoRescheduleReason: null,
      autoRescheduledAt: null,
    },
  });

  return { ok: true, scheduledSendAt: input.scheduledSendAt.toISOString() };
}

/**
 * Cron : envoie les mails programmés (« à une heure précise ») dont l'échéance
 * est atteinte. Sur échec, on vide la programmation et on notifie le créateur
 * (pas de retry en boucle). Utilise `force: true` car le garde-fou anti
 * double-contact a déjà été appliqué au moment de la programmation.
 */
export async function processOutreachScheduledSends(
  now: Date = new Date(),
  limit = 50
): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await prisma.outreachTarget.findMany({
    where: {
      status: { not: "STOPPED" },
      scheduledSendAt: { not: null, lte: now },
    },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      company: true,
      marqueId: true,
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
      // Programmation incohérente : on nettoie pour éviter une boucle.
      await prisma.outreachTarget
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

    // executeOutreachSend consomme et remet à zéro le brouillon, mais pas les
    // champs scheduled* : on les vide d'abord pour ne jamais renvoyer en boucle.
    await prisma.outreachTarget
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

    const result = await executeOutreachSend(t.id, {
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
          titre: "Envoi programmé échoué (Outreach)",
          message: `Le mail programmé pour ${t.firstname} ${t.lastname || ""} (${t.company}, ${t.email}) n'a pas pu partir : ${result.error}`,
          lien: "/outreach",
          marqueId: t.marqueId,
        },
      })
      .catch((e) => console.warn("[outreach] notif envoi programmé échoué:", e));
  }

  return { processed: due.length, sent, failed };
}

export type OutreachRelanceResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Relance rapprochée J+3 : répond dans le thread Gmail du touch avec un
 * template générique. Une seule relance par touch ; sautée si le client a
 * répondu sur ce touch (la relance MANUELLE reste possible via l'API).
 */
export async function executeOutreachRelance(
  touchId: string,
  options: { subjectOverride?: string; bodyOverride?: string } = {}
): Promise<OutreachRelanceResult> {
  const touch = await prisma.outreachTouch.findUnique({
    where: { id: touchId },
    include: { target: true },
  });
  if (!touch) return { ok: false, error: "Touch introuvable." };
  if (!touch.sentAt || !touch.threadId) {
    return { ok: false, error: "Le mail initial n'a pas été envoyé." };
  }
  if (touch.relanceSentAt) {
    return { ok: false, error: "Une relance a déjà été envoyée pour ce mail." };
  }

  const target = touch.target;
  const subjectSrc = touch.subject.trim();
  const relanceSubject =
    options.subjectOverride?.trim() ||
    (subjectSrc.toLowerCase().startsWith("re:") ? subjectSrc : `Re: ${subjectSrc}`);

  const bodyTemplate =
    options.bodyOverride?.trim() ||
    buildOutreachRelanceTemplate(
      target.company,
      target.language === "en" ? "en" : "fr",
      touch.sentAt
    );

  const vars = {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: target.company || "",
    marques: await coveredBrandsLabel(target.marqueContactId, target.company || ""),
  };
  const bodyWithVars = applyCastingTemplateVars(bodyTemplate, vars);
  const body = normalizeEditorHtmlForEmail(bodyWithVars);
  const trackedBody = injectOutreachTracking(body, touch.id);

  // Le thread Gmail appartient à la boîte qui a envoyé le mail initial :
  // la relance part de cette même boîte, même si le target a changé depuis.
  const fromEmail = outreachFromEmail({ fromEmail: touch.fromEmail });

  // Citation du mail d'origine + In-Reply-To : la relance devient une vraie
  // réponse, rangée dans le même fil côté destinataire (et le contenu initial
  // reste visible même si l'original est tombé dans ses spams).
  const fromName = await getGmailFromName(fromEmail);
  const originalPersonalized = applyCastingTemplateVars(touch.bodyHtml || "", vars);
  const quotedOriginal = buildQuotedOriginal(originalPersonalized, {
    dateLabel: touch.sentAt ? formatFrDateTime(touch.sentAt) : "",
    senderLabel: `${fromName} <${fromEmail}>`,
  });
  const finalHtml = `${trackedBody}${quotedOriginal}`;

  let inReplyTo: string | undefined;
  if (touch.messageId) {
    inReplyTo = (await getMessageRfcId(fromEmail, touch.messageId)) || undefined;
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

    await prisma.outreachTouch.update({
      where: { id: touch.id },
      data: { relanceSentAt: new Date(), relanceMessageId: messageId, relanceError: null },
    });

    console.info(`[outreach] relance J+3 → ${target.email} (touch=${touch.id})`);
    return { ok: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.outreachTouch.update({
      where: { id: touch.id },
      data: { relanceError: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }
}
