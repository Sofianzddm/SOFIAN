/**
 * Moteur du module Prospection Agences : cycle de contact agences 45 jours.
 *
 * Variante du module Outreach (clients marques), mais 100 % isolé des marques :
 *  - cible = contacts d'AGENCES partenaires (model Partner / AgencyContact)
 *  - aucune FK vers Marque / MarqueContact, aucun write-back HubSpot
 *  - le corps du mail peut contenir le token {{agence.lien}} → /partners/{slug}
 *
 * Utilisé par :
 *  - POST /api/agency-outreach/targets/[id]/send  (envoi d'un mail de cycle)
 *  - POST /api/agency-outreach/send-bulk          (envoi groupé personnalisé)
 *  - GET  /api/cron/agency-outreach               (relances auto + bascule J+45)
 *
 * Règle métier (identique à l'outreach marques) :
 *  - 1 contact (email) = 1 AgencyOutreachTarget, cycle perpétuel tous les 45 jours
 *  - Chaque mail de cycle = 1 AgencyOutreachTouch (nouveau thread Gmail)
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
import { injectAgencyOutreachTracking } from "@/lib/agency-outreach-tracking";
import {
  normalizeEditorHtmlForEmail,
  buildQuotedOriginal,
} from "@/lib/email-body-html";
import { LEYNA_FROM_EMAIL, LEYNA_OWNER_FIRSTNAME } from "@/lib/casting-auto-send";

export const AGENCY_OUTREACH_RELANCE_BUSINESS_DAYS = 3;
/** Jours calendaires avant le retour de l'agence en file « À recontacter ». */
export const AGENCY_OUTREACH_RECONTACT_DAYS = 45;

/** Boîte expéditrice du cycle d'une agence (défaut : Leyna). */
export function agencyOutreachFromEmail(target: {
  fromEmail?: string | null;
}): string {
  return (target.fromEmail || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
}

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

/** Lien public talent book de l'agence : /partners/{slug}. */
export function buildPartnerLink(slug: string | null | undefined): string {
  const s = (slug || "").trim();
  if (!s) return "";
  return `${getBaseUrl()}/partners/${s}`;
}

/**
 * Variables de personnalisation propres à la prospection agences :
 *  - {{contact.firstname}} / {{contact.lastname}} : le contact de l'agence
 *  - {{agence.nom}}  : nom de l'agence (Partner.name)
 *  - {{agence.lien}} : lien talent book /partners/{slug} (rendu cliquable)
 *  - {{owner.firstname}} : prénom de l'expéditrice (Leyna)
 *
 * Le lien est injecté soit en texte brut (s'il n'est pas dans une balise <a>),
 * soit comme href si le token sert d'attribut. On gère les deux cas : un token
 * seul dans le corps devient un lien cliquable.
 */
export function applyAgencyTemplateVars(
  text: string,
  vars: { firstname: string; lastname: string; company: string; link: string }
): string {
  if (!text) return text;
  return applyAgencyTemplateVarsInternal(text, {
    firstname: (vars.firstname || "").trim() || "—",
    lastname: (vars.lastname || "").trim(),
    company: (vars.company || "").trim() || "—",
    link: (vars.link || "").trim(),
  });
}

type _Vars = { firstname: string; lastname: string; company: string; link: string };
function applyAgencyTemplateVarsInternal(text: string, v: _Vars): string {
  let s = text;
  s = s.replace(/\{\{\s*contact\.firstname\s*\}\}/gi, v.firstname);
  s = s.replace(/\{\{\s*contact\.lastname\s*\}\}/gi, v.lastname);
  s = s.replace(/\{\{\s*agence\.nom\s*\}\}/gi, v.company);
  s = s.replace(/\{\{\s*owner\.firstname\s*\}\}/gi, LEYNA_OWNER_FIRSTNAME);

  // Lien agence : si le token est déjà l'href d'un <a>, on remplace l'URL.
  // Sinon, un token "nu" devient un lien cliquable vers le talent book.
  if (v.link) {
    s = s.replace(/href=(["'])\{\{\s*agence\.lien\s*\}\}\1/gi, `href=$1${v.link}$1`);
    s = s.replace(
      /\{\{\s*agence\.lien\s*\}\}/gi,
      `<a href="${v.link}">${v.link}</a>`
    );
  } else {
    // Pas de slug : on retire proprement le token plutôt que de laisser un lien mort.
    s = s.replace(/\{\{\s*agence\.lien\s*\}\}/gi, "");
  }
  return s;
}

export type AgencyOutreachSendResult =
  | { ok: true; touchId: string; messageId: string }
  | {
      ok: false;
      error: string;
      /** Confirmation requise (déjà contacté < 45j hors app). */
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
 * Garde-fou : vérifie dans la boîte expéditrice si ce contact a déjà reçu un
 * mail < 45j hors du cycle de prospection agence (les threads des touches de ce
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
      AGENCY_OUTREACH_RECONTACT_DAYS
    );
    if (sent.length === 0) return { contacted: false, lastDate: null };

    const ownTouches = await prisma.agencyOutreachTouch.findMany({
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
      `[agency-outreach] vérif boîte ${fromEmail} impossible pour ${email}:`,
      error
    );
    return { contacted: false, lastDate: null };
  }
}

/**
 * Envoie un mail de cycle à un contact d'agence : crée le touch (cycle N),
 * personnalise les variables (dont {{agence.lien}}), injecte le tracking,
 * envoie via Gmail (nouveau thread), puis remet le compteur 45 jours à zéro.
 */
export async function executeAgencyOutreachSend(
  targetId: string,
  input: {
    subject: string;
    bodyHtml: string;
    sentById?: string | null;
    force?: boolean;
  }
): Promise<AgencyOutreachSendResult> {
  const target = await prisma.agencyOutreachTarget.findUnique({
    where: { id: targetId },
    include: { partner: { select: { name: true, slug: true } } },
  });
  if (!target) return { ok: false, error: "Contact agence introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce contact est sorti du cycle (stoppé)." };
  }

  // Nom + lien LIVE depuis /partners (privilégiés au snapshot à l'envoi).
  const liveCompany = target.partner?.name || target.company;
  const liveSlug = target.partner?.slug || target.partnerSlug;

  const subjectTpl = input.subject.trim();
  const bodyRaw = input.bodyHtml.trim();
  if (!subjectTpl || !bodyRaw) {
    return { ok: false, error: "Sujet et corps du mail requis." };
  }
  if (!isValidEmail(target.email)) {
    return { ok: false, error: `Email invalide : ${target.email}` };
  }

  const fromEmail = agencyOutreachFromEmail(target);

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
            AGENCY_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
        );
        return {
          ok: false,
          needsConfirmation: true,
          alreadyContactedAt: externalContact.lastDate.toISOString(),
          suggestedNextRecontactAt: suggestedNextRecontactAt.toISOString(),
          error:
            `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
            `${fromEmail} (hors prospection agences : envoi manuel ou autre canal).`,
        };
      }
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${AGENCY_OUTREACH_RECONTACT_DAYS} jours.`,
      };
    }
  }

  const vars = {
    firstname: target.firstname || "",
    lastname: target.lastname || "",
    company: liveCompany || "",
    link: buildPartnerLink(liveSlug),
  };
  const personalizedSubject = applyAgencyTemplateVars(subjectTpl, vars);
  const bodyTpl = normalizeEditorHtmlForEmail(bodyRaw);
  const personalizedBody = applyAgencyTemplateVars(bodyTpl, vars);

  const cycleNumber = target.cycleCount + 1;
  const touch = await prisma.agencyOutreachTouch.create({
    data: {
      targetId: target.id,
      cycleNumber,
      subject: personalizedSubject,
      bodyHtml: bodyTpl,
      fromEmail,
      sentById: input.sentById || null,
    },
  });

  const trackedBody = injectAgencyOutreachTracking(personalizedBody, touch.id);

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
    await prisma.agencyOutreachTouch.update({
      where: { id: touch.id },
      data: { sendError: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }

  const now = new Date();
  const nextRecontactAt = new Date(
    now.getTime() + AGENCY_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.$transaction([
    prisma.agencyOutreachTouch.update({
      where: { id: touch.id },
      data: { sentAt: now, messageId, threadId: messageId, sendError: null },
    }),
    prisma.agencyOutreachTarget.update({
      where: { id: target.id },
      data: {
        status: "WAITING",
        cycleCount: cycleNumber,
        lastSentAt: now,
        nextRecontactAt,
        draftSubject: null,
        draftBodyHtml: null,
        // L'envoi (immédiat ou programmé) vide toujours la file « envoi décalé ».
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
    `[agency-outreach] envoi cycle ${cycleNumber} → ${target.email} (touch=${touch.id})`
  );

  return { ok: true, touchId: touch.id, messageId };
}

// ============================================================================
// ENVOI DÉCALÉ (staggered) : étale l'envoi groupé dans la journée
// ============================================================================
// Plutôt que d'envoyer tous les mails d'un coup, on répartit les envois entre
// « maintenant » et 18h30 (heure de Paris) pour que les destinataires ne
// reçoivent pas tous au même instant (meilleure délivrabilité, plus naturel).
// Le cron /api/cron/agency-outreach envoie chaque mail quand son échéance
// (scheduledSendAt) est atteinte.

const PARIS_TZ = "Europe/Paris";

/** Heure limite (Paris) : tous les mails décalés partent AVANT cette heure. */
export const AGENCY_STAGGER_END_HOUR = 18;
export const AGENCY_STAGGER_END_MINUTE = 30;
/**
 * Repli si on démarre déjà trop tard : on étale quand même jusqu'à cette heure
 * (Paris) LE JOUR MÊME — on ne reporte jamais au lendemain. C'est aussi le
 * maximum absolu : aucun mail ne part après 20h30.
 */
export const AGENCY_STAGGER_LATE_END_HOUR = 20;
export const AGENCY_STAGGER_LATE_END_MINUTE = 30;

/** Convertit une heure « murale » de Paris (y/m/d h:min) en instant UTC. */
function parisWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  // 24:xx (minuit) formaté par Intl selon l'env → ramené à 0.
  const h = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, h, map.minute, map.second);
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Renvoie l'instant UTC correspondant à `hour:minute` (Paris) le jour de `base`. */
function parisTimeOnDay(base: Date, hour: number, minute: number): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(base)
    .split("-")
    .map(Number);
  return parisWallClockToUtc(y, m, d, hour, minute);
}

/**
 * Fenêtre d'étalement des envois : de « maintenant » jusqu'à 18h30 (Paris) LE
 * JOUR MÊME. On ne reporte jamais au lendemain : si 18h30 est déjà passé (ou
 * trop proche), on étale quand même jusqu'à 20h30 — le maximum absolu, aucun
 * mail ne part plus tard. Passé 20h30, tout part au plus tôt (prochain cron).
 */
export function computeAgencyStaggerWindow(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const MIN_LEAD_MS = 60_000; // on démarre ~1 min après maintenant
  const MIN_WINDOW_MS = 10 * 60_000; // il faut au moins 10 min de marge

  const start = new Date(now.getTime() + MIN_LEAD_MS);
  let end = parisTimeOnDay(now, AGENCY_STAGGER_END_HOUR, AGENCY_STAGGER_END_MINUTE);

  if (end.getTime() - start.getTime() < MIN_WINDOW_MS) {
    // Plus assez de marge avant 18h30 → on étale jusqu'à 20h30 (maximum absolu).
    end = parisTimeOnDay(now, AGENCY_STAGGER_LATE_END_HOUR, AGENCY_STAGGER_LATE_END_MINUTE);
  }
  // On ne dépasse jamais 20h30 : si on est déjà après, la fenêtre est vide et
  // tous les envois partent au plus tôt (dès le prochain passage du cron).
  if (end.getTime() < start.getTime()) {
    end = new Date(now.getTime());
  }

  return { start, end };
}

/**
 * Répartit `count` envois dans la fenêtre [start, end] : un créneau par mail,
 * avec un décalage aléatoire à l'intérieur du créneau. Les dates renvoyées sont
 * strictement croissantes et toutes < end.
 */
export function computeAgencyStaggeredTimes(
  count: number,
  now: Date = new Date()
): Date[] {
  const { start, end } = computeAgencyStaggerWindow(now);
  if (count <= 0) return [];
  if (count === 1) return [new Date(start)];

  const span = Math.max(0, end.getTime() - start.getTime());
  const slot = span / count;
  const times: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    const slotStart = start.getTime() + slot * i;
    const jitter = Math.random() * slot;
    times.push(new Date(Math.min(end.getTime() - 1, slotStart + jitter)));
  }
  times.sort((a, b) => a.getTime() - b.getTime());
  return times;
}

export type AgencyOutreachScheduleResult =
  | { ok: true; scheduledSendAt: string }
  | {
      ok: false;
      error: string;
      needsConfirmation?: boolean;
      alreadyContactedAt?: string;
      suggestedNextRecontactAt?: string;
    };

/**
 * Programme (sans envoyer) un mail de cycle pour un contact d'agence : applique
 * le même garde-fou anti double-contact que l'envoi immédiat, puis fige le
 * sujet/corps (déjà traduits) et l'échéance sur le target. Le cron enverra
 * effectivement le mail quand `scheduledSendAt` sera atteint.
 */
export async function executeAgencyOutreachSchedule(
  targetId: string,
  input: {
    subject: string;
    bodyHtml: string;
    scheduledSendAt: Date;
    sentById?: string | null;
    force?: boolean;
  }
): Promise<AgencyOutreachScheduleResult> {
  const target = await prisma.agencyOutreachTarget.findUnique({
    where: { id: targetId },
    select: { id: true, status: true, email: true, fromEmail: true },
  });
  if (!target) return { ok: false, error: "Contact agence introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce contact est sorti du cycle (stoppé)." };
  }

  const subjectTpl = input.subject.trim();
  const bodyTpl = input.bodyHtml.trim();
  if (!subjectTpl || !bodyTpl) {
    return { ok: false, error: "Sujet et corps du mail requis." };
  }
  if (!isValidEmail(target.email)) {
    return { ok: false, error: `Email invalide : ${target.email}` };
  }

  const fromEmail = agencyOutreachFromEmail(target);

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
            AGENCY_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
        );
        return {
          ok: false,
          needsConfirmation: true,
          alreadyContactedAt: externalContact.lastDate.toISOString(),
          suggestedNextRecontactAt: suggestedNextRecontactAt.toISOString(),
          error:
            `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
            `${fromEmail} (hors prospection agences : envoi manuel ou autre canal).`,
        };
      }
      return {
        ok: false,
        needsConfirmation: true,
        error: `${target.email} a déjà reçu un mail depuis la boîte ${fromEmail} il y a moins de ${AGENCY_OUTREACH_RECONTACT_DAYS} jours.`,
      };
    }
  }

  await prisma.agencyOutreachTarget.update({
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
 * Cron : envoie les mails programmés (envoi décalé) dont l'échéance est
 * atteinte. Sur échec, on vide la programmation et on notifie le créateur
 * (pas de retry en boucle). Utilise `force: true` car le garde-fou anti
 * double-contact a déjà été appliqué au moment de la programmation.
 */
export async function processAgencyScheduledSends(
  now: Date = new Date(),
  limit = 50
): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await prisma.agencyOutreachTarget.findMany({
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
      await prisma.agencyOutreachTarget
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

    const result = await executeAgencyOutreachSend(t.id, {
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
    // Échec (Gmail, email invalide…) : on vide la programmation + notification.
    await prisma.agencyOutreachTarget
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
    await prisma.notification
      .create({
        data: {
          userId: t.createdById,
          type: "GENERAL",
          titre: "Envoi décalé échoué (Prospection Agences)",
          message: `Le mail programmé pour ${t.firstname} ${t.lastname || ""} (${t.company}, ${t.email}) n'a pas pu partir : ${result.error}`,
          lien: "/agency-outreach",
        },
      })
      .catch((e) => console.warn("[agency-outreach] notif envoi décalé échoué:", e));
  }

  return { processed: due.length, sent, failed };
}

export type AgencyOutreachRescheduleResult =
  | { ok: true; nextRecontactAt: string; reason: string }
  | { ok: false; error: string };

/**
 * Met un contact « en attente » sans envoyer de mail (quand l'utilisateur,
 * prévenu d'un contact récent, choisit de ne pas renvoyer maintenant).
 */
export async function executeAgencyOutreachReschedule(
  targetId: string
): Promise<AgencyOutreachRescheduleResult> {
  const target = await prisma.agencyOutreachTarget.findUnique({
    where: { id: targetId },
  });
  if (!target) return { ok: false, error: "Contact agence introuvable." };
  if (target.status === "STOPPED") {
    return { ok: false, error: "Ce contact est sorti du cycle (stoppé)." };
  }

  const fromEmail = agencyOutreachFromEmail(target);
  const externalContact = await detectRecentExternalContact(
    fromEmail,
    target.id,
    target.email
  );

  const baseDate = externalContact.lastDate ?? new Date();
  const nextRecontactAt = new Date(
    baseDate.getTime() + AGENCY_OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000
  );

  const reason = externalContact.lastDate
    ? `Déjà contacté le ${formatFrDate(externalContact.lastDate)} depuis la boîte ` +
      `${fromEmail}. Recontact replanifié au ${formatFrDate(nextRecontactAt)} (J+${AGENCY_OUTREACH_RECONTACT_DAYS}).`
    : `Mis en attente : recontact replanifié au ${formatFrDate(nextRecontactAt)} (J+${AGENCY_OUTREACH_RECONTACT_DAYS}).`;

  await prisma.agencyOutreachTarget.update({
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

export type AgencyOutreachRelanceResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** Template de relance J+3 pour une agence (campagnes d'influence). */
export function buildAgencyRelanceTemplate(
  language: "fr" | "en",
  firstSentAt?: Date | null
): string {
  if (language === "en") {
    return [
      `Hello {{contact.firstname}},`,
      `<br /><br />`,
      `Just a quick follow-up on my email from last week 🙂`,
      `<br /><br />`,
      `Do you have any campaigns or creator needs coming up at the moment?`,
      `<br /><br />`,
      `Let me know whenever, I'll put together a quick selection for you.`,
      `<br /><br />`,
      `Have a great day!<br />{{owner.firstname}}`,
    ].join("");
  }
  return [
    `Hello {{contact.firstname}},`,
    `<br /><br />`,
    `Juste un petit follow-up sur mon mail de la semaine dernière 🙂`,
    `<br /><br />`,
    `As-tu des campagnes ou besoins en créateurs qui se préparent en ce moment ?`,
    `<br /><br />`,
    `Dis-moi quand tu veux, je te fais une sélection rapide.`,
    `<br /><br />`,
    `Bonne journée !<br />{{owner.firstname}}`,
  ].join("");
}

/**
 * Relance rapprochée J+3 : répond dans le thread Gmail du touch. Une seule
 * relance par touch ; sautée par le cron si réponse (relance manuelle possible).
 */
export async function executeAgencyOutreachRelance(
  touchId: string,
  options: { subjectOverride?: string; bodyOverride?: string } = {}
): Promise<AgencyOutreachRelanceResult> {
  const touch = await prisma.agencyOutreachTouch.findUnique({
    where: { id: touchId },
    include: { target: { include: { partner: { select: { name: true, slug: true } } } } },
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
    buildAgencyRelanceTemplate(target.language === "en" ? "en" : "fr", touch.sentAt);

  const vars = {
    firstname: (target.firstname || "").trim() || "—",
    lastname: (target.lastname || "").trim(),
    company: (target.partner?.name || target.company || "").trim() || "—",
    link: buildPartnerLink(target.partner?.slug || target.partnerSlug),
  };
  const bodyWithVars = applyAgencyTemplateVarsInternal(bodyTemplate, vars);
  const body = normalizeEditorHtmlForEmail(bodyWithVars);
  const trackedBody = injectAgencyOutreachTracking(body, touch.id);

  const fromEmail = agencyOutreachFromEmail({ fromEmail: touch.fromEmail });

  const fromName = await getGmailFromName(fromEmail);
  const originalPersonalized = applyAgencyTemplateVarsInternal(
    touch.bodyHtml || "",
    vars
  );
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

    await prisma.agencyOutreachTouch.update({
      where: { id: touch.id },
      data: {
        relanceSentAt: new Date(),
        relanceMessageId: messageId,
        relanceError: null,
      },
    });

    console.info(`[agency-outreach] relance J+3 → ${target.email} (touch=${touch.id})`);
    return { ok: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.agencyOutreachTouch.update({
      where: { id: touch.id },
      data: { relanceError: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }
}
