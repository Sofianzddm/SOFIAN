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
import { sendGmail, findRecentSentToRecipient } from "@/lib/gmail";
import { injectOutreachTracking } from "@/lib/outreach-tracking";
import { normalizeEditorHtmlForEmail } from "@/lib/email-body-html";
import {
  applyCastingTemplateVars,
  buildDefaultRelanceTemplate,
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

export type OutreachSendResult =
  | {
      ok: true;
      touchId: string;
      messageId: string;
      hubspotSynced: boolean;
    }
  | { ok: false; error: string };

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
async function isRecentlyContactedFromSenderInbox(
  fromEmail: string,
  targetId: string,
  email: string
): Promise<boolean> {
  try {
    const sent = await findRecentSentToRecipient(
      fromEmail,
      email.toLowerCase(),
      OUTREACH_RECONTACT_DAYS
    );
    if (sent.length === 0) return false;

    const ownTouches = await prisma.outreachTouch.findMany({
      where: { targetId, threadId: { not: null } },
      select: { threadId: true },
    });
    const ownThreadIds = new Set(ownTouches.map((t) => t.threadId as string));

    return sent.some((m) => !ownThreadIds.has(m.threadId));
  } catch (error) {
    console.warn(`[outreach] vérif boîte ${fromEmail} impossible pour ${email}:`, error);
    return false;
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
  input: { subject: string; bodyHtml: string; sentById?: string | null }
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

  if (await isEmailBlockedByPipelineCooldown(target.email)) {
    return {
      ok: false,
      error: `${target.email} a déjà reçu un mail (pipeline talent) dans les ${CASTING_COOLDOWN_DAYS} derniers jours.`,
    };
  }

  const fromEmail = outreachFromEmail(target);

  // Garde-fou boîte expéditrice : déjà contacté < 45j via un autre canal
  // (séquence HubSpot, mail manuel…) → on bloque pour éviter le doublon.
  if (await isRecentlyContactedFromSenderInbox(fromEmail, target.id, target.email)) {
    return {
      ok: false,
      error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${OUTREACH_RECONTACT_DAYS} jours (HubSpot ou envoi manuel). Envoi bloqué pour éviter le doublon.`,
    };
  }

  const vars = {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: target.company || "",
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
    options.bodyOverride?.trim() || buildDefaultRelanceTemplate(target.company);

  const bodyWithVars = applyCastingTemplateVars(bodyTemplate, {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: target.company || "",
  });
  const body = normalizeEditorHtmlForEmail(bodyWithVars);
  const trackedBody = injectOutreachTracking(body, touch.id);

  try {
    // Le thread Gmail appartient à la boîte qui a envoyé le mail initial :
    // la relance part de cette même boîte, même si le target a changé depuis.
    const messageId = await sendGmail({
      fromEmail: outreachFromEmail({ fromEmail: touch.fromEmail }),
      to: target.email.toLowerCase(),
      subject: relanceSubject,
      htmlBody: trackedBody,
      threadId: touch.threadId,
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
