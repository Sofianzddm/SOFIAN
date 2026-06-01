/**
 * Envoi automatique des mails de prospection talent depuis la boite de Leyna.
 *
 * Utilise par :
 *  - POST /api/strategy/contact-missions/[id]/send-now (declenchement client a J+30s)
 *  - GET  /api/cron/send-scheduled-casting (filet de securite serveur)
 *  - GET  /api/cron/casting-relances (relance J+3)
 *
 * Regle metier :
 *  - 1 mail par contact client
 *  - From: leyna@glowupagence.fr
 *  - Variables {{contact.firstname}}, {{contact.lastname}}, {{contact.company}},
 *    {{owner.firstname}} sont remplacees au moment de l'envoi
 *  - Tracking ouvertures + clics injecte (pixel + reecriture liens)
 *  - Si un contact echoue, on log dans sendError mais on passe quand meme
 *    en SENT pour ne pas bloquer toute la mission
 */

import { prisma } from "@/lib/prisma";
import { sendGmail } from "@/lib/gmail";
import { injectCastingTracking } from "@/lib/casting-tracking";
import {
  type TalentLinkInput,
  upgradeTalentLinksInHtml,
} from "@/lib/talent-email-links";
import { normalizeEditorHtmlForEmail } from "@/lib/email-body-html";

export const LEYNA_FROM_EMAIL = "leyna@glowupagence.fr";
export const LEYNA_OWNER_FIRSTNAME = "Leyna";
export const CASTING_COOLDOWN_DAYS = 20;
/**
 * Délai avant la relance automatique J+3 (jours ouvrés Lun-Ven en Europe/Paris).
 * On utilise des jours ouvrés pour éviter de relancer le week-end ou
 * d'envoyer une relance « pile » alors que le destinataire n'a pas eu
 * de vrai jour de travail entre les deux mails.
 */
export const CASTING_RELANCE_BUSINESS_DAYS = 3;
export const CASTING_SEND_DELAY_MS = 30 * 1000;

export type CastingContact = {
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

type SentMessageRecord = {
  messageId?: string;
  threadId?: string;
  error?: string;
};

type SendOutcome = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
  byEmail: Record<string, SentMessageRecord>;
};

/**
 * Remplace les jetons type HubSpot dans le sujet et le corps.
 * Garde le meme set de variables que le composer cote client.
 */
export function applyCastingTemplateVars(
  text: string,
  contact: { firstname: string; lastname: string; company: string }
): string {
  if (!text) return text;
  const prenom = (contact.firstname || "").trim();
  const nom = (contact.lastname || "").trim();
  const marque = (contact.company || "").trim() || "—";
  let s = text;
  s = s.replace(/\{\{\s*contact\.firstname\s*\}\}/gi, prenom || "—");
  s = s.replace(/\{\{\s*contact\.lastname\s*\}\}/gi, nom);
  s = s.replace(/\{\{\s*contact\.company\s*\}\}/gi, marque);
  s = s.replace(/\{\{\s*owner\.firstname\s*\}\}/gi, LEYNA_OWNER_FIRSTNAME);
  return s;
}

function isValidEmail(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function parseCastingContacts(raw: unknown): CastingContact[] {
  if (!Array.isArray(raw)) return [];
  return (raw as CastingContact[])
    .map((c) => ({
      firstname: String(c?.firstname || "").trim(),
      lastname: String(c?.lastname || "").trim(),
      email: String(c?.email || "").trim().toLowerCase(),
      role: String(c?.role || "").trim(),
    }))
    .filter((c) => c.firstname && c.email && isValidEmail(c.email));
}

/**
 * Cooldown anti-spam : meme email contacte dans les CASTING_COOLDOWN_DAYS
 * derniers jours = on bloque cet email precis (les autres passent).
 *
 * On regarde toutes les missions deja envoyees ou en cours d'envoi pour
 * tester si un mail a deja ete envoye a cet email.
 */
async function findEmailsBlockedByCooldown(
  emails: string[],
  excludeMissionId: string
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const since = new Date(Date.now() - CASTING_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ sentMessageIds: unknown }>>`
    SELECT "sentMessageIds"
    FROM "contact_missions"
    WHERE "id" <> ${excludeMissionId}
      AND "sentAt" >= ${since}
      AND "sentMessageIds" IS NOT NULL
  `;
  const blocked = new Set<string>();
  const lowered = new Set(emails.map((e) => e.toLowerCase()));
  for (const row of rows) {
    if (!row.sentMessageIds || typeof row.sentMessageIds !== "object") continue;
    for (const key of Object.keys(row.sentMessageIds as Record<string, unknown>)) {
      const normalized = key.toLowerCase();
      if (lowered.has(normalized)) blocked.add(normalized);
    }
  }
  return blocked;
}

export type ScheduleSendPreflight =
  | { ok: true; contacts: CastingContact[] }
  | { ok: false; error: string };

/**
 * Verifie qu'une mission peut etre envoyee :
 *  - sujet + corps non vides
 *  - au moins 1 contact valide
 *  - au moins 1 contact pas encore contacte sur cette mission
 *  - les emails ne sont pas tous bloques par le cooldown
 *
 * Si la mission est deja partiellement envoyee, seuls les nouveaux
 * contacts (absents de `sentMessageIds`) sont consideres.
 */
export async function preflightCastingSend(
  mission: {
    id: string;
    draftEmailSubject: string | null;
    draftEmailBody: string | null;
    clientContacts: unknown;
    sentMessageIds?: unknown;
  }
): Promise<ScheduleSendPreflight> {
  const subject = String(mission.draftEmailSubject || "").trim();
  const body = String(mission.draftEmailBody || "").trim();
  if (!subject || !body) {
    return { ok: false, error: "Le brouillon est incomplet (sujet et corps requis)." };
  }
  const contacts = parseCastingContacts(mission.clientContacts);
  if (contacts.length === 0) {
    return {
      ok: false,
      error: "Aucun contact client valide (prenom + email obligatoires).",
    };
  }
  const alreadySent = extractAlreadySentEmails(mission.sentMessageIds);
  const newContacts = contacts.filter(
    (c) => !alreadySent.has((c.email || "").toLowerCase())
  );
  if (newContacts.length === 0) {
    return {
      ok: false,
      error:
        "Tous les contacts ont deja recu le mail sur cette mission. Ajoute un nouveau contact pour declencher un envoi.",
    };
  }
  const emails = newContacts.map((c) => c.email!);
  const blocked = await findEmailsBlockedByCooldown(emails, mission.id);
  const reachable = newContacts.filter((c) => !blocked.has((c.email || "").toLowerCase()));
  if (reachable.length === 0) {
    return {
      ok: false,
      error: `Tous les nouveaux contacts ont deja recu un mail (autre mission) dans les ${CASTING_COOLDOWN_DAYS} derniers jours.`,
    };
  }
  return { ok: true, contacts: reachable };
}

/** Talent(s) lies a la mission pour mettre a jour les liens du brouillon a l'envoi. */
async function loadMissionTalentsForSend(mission: {
  talentId?: string | null;
  creatorName?: string | null;
}): Promise<TalentLinkInput[]> {
  if (mission.talentId) {
    const talent = await prisma.talent.findUnique({
      where: { id: mission.talentId },
      select: { prenom: true, nom: true, instagram: true },
    });
    if (talent) return [talent];
  }
  const name = String(mission.creatorName || "").trim();
  if (!name) return [];
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  return [{ prenom: parts[0], nom: parts.slice(1).join(" ") || null, instagram: null }];
}

/**
 * Set des emails deja envoyes avec SUCCES sur la mission (presents dans
 * `sentMessageIds` sans `error`). Ces emails ne seront pas re-envoyes : on
 * permet ainsi d'ajouter de nouveaux contacts apres l'envoi initial et de
 * leur envoyer le mail sans rejouer l'envoi sur les destinataires deja
 * contactes.
 */
function extractAlreadySentEmails(sentMessageIds: unknown): Set<string> {
  if (!sentMessageIds || typeof sentMessageIds !== "object") return new Set();
  const out = new Set<string>();
  for (const [email, record] of Object.entries(
    sentMessageIds as Record<string, SentMessageRecord>
  )) {
    if (record?.messageId && !record.error) {
      out.add(email.toLowerCase());
    }
  }
  return out;
}

/**
 * Envoi reel : pour chaque contact recevable (non bloque par cooldown ni
 * deja contacte avec succes sur cette mission), remplace les variables,
 * injecte le tracking, envoie via Gmail. Si la mission est deja SENT et
 * qu'on ajoute un nouveau contact, seuls les nouveaux contacts recoivent
 * le mail. Les anciennes lignes de `sentMessageIds` sont preservees.
 */
export async function executeCastingSend(missionId: string): Promise<SendOutcome> {
  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  const mission = await contactMissionModel.findUnique({ where: { id: missionId } });
  if (!mission) {
    throw new Error("Mission introuvable");
  }

  const subjectTpl = String(mission.draftEmailSubject || "").trim();
  const bodyRaw = String(mission.draftEmailBody || "").trim();
  const missionTalents = await loadMissionTalentsForSend(mission);
  const bodyTpl = normalizeEditorHtmlForEmail(
    upgradeTalentLinksInHtml(bodyRaw, missionTalents)
  );
  const allContacts = parseCastingContacts(mission.clientContacts);
  const alreadySent = extractAlreadySentEmails(mission.sentMessageIds);
  const newContacts = allContacts.filter(
    (c) => !alreadySent.has((c.email || "").toLowerCase())
  );
  const emails = newContacts.map((c) => c.email!);
  const blocked = await findEmailsBlockedByCooldown(emails, missionId);

  const outcome: SendOutcome = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
    byEmail: {},
  };

  for (const contact of newContacts) {
    const email = (contact.email || "").toLowerCase();
    if (!email) continue;
    outcome.attempted += 1;
    if (blocked.has(email)) {
      outcome.failed += 1;
      const msg = `${email} : cooldown ${CASTING_COOLDOWN_DAYS}j actif`;
      outcome.errors.push(msg);
      outcome.byEmail[email] = { error: msg };
      continue;
    }
    const personalizedSubject = applyCastingTemplateVars(subjectTpl, {
      firstname: contact.firstname || "",
      lastname: contact.lastname || "",
      company: String(mission.targetBrand || ""),
    });
    const personalizedBody = applyCastingTemplateVars(bodyTpl, {
      firstname: contact.firstname || "",
      lastname: contact.lastname || "",
      company: String(mission.targetBrand || ""),
    });
    const trackedBody = injectCastingTracking(personalizedBody, missionId);
    try {
      const messageId = await sendGmail({
        fromEmail: LEYNA_FROM_EMAIL,
        to: email,
        subject: personalizedSubject,
        htmlBody: trackedBody,
      });
      outcome.succeeded += 1;
      outcome.byEmail[email] = { messageId, threadId: messageId };
    } catch (error) {
      outcome.failed += 1;
      const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
      outcome.errors.push(`${email} : ${msg}`);
      outcome.byEmail[email] = { error: msg };
    }
  }

  const previousMessages =
    mission.sentMessageIds && typeof mission.sentMessageIds === "object"
      ? (mission.sentMessageIds as Record<string, SentMessageRecord>)
      : {};
  const mergedMessages = { ...previousMessages, ...outcome.byEmail };

  // Si la mission etait deja envoyee, on garde le sentAt initial pour ne
  // pas faire repartir le compteur des relances J+3 a zero. On ne touche
  // pas non plus au stage / status (qui sont deja SENT ou apres).
  const wasAlreadySent = Boolean(mission.sentAt);
  const stageUpdate = wasAlreadySent
    ? {}
    : outcome.succeeded > 0
    ? { stage: "SENT" as const, status: "SENT" as const, sentAt: new Date() }
    : {};

  await contactMissionModel.update({
    where: { id: missionId },
    data: {
      ...stageUpdate,
      sentMessageIds: mergedMessages,
      sendError: outcome.errors.length > 0 ? outcome.errors.join(" | ") : null,
      scheduledSendAt: null,
      ...(outcome.succeeded > 0 && bodyTpl !== bodyRaw ? { draftEmailBody: bodyTpl } : {}),
    },
  });

  return outcome;
}

/**
 * Relance J+3 : envoie une relance courte en repondant au thread Gmail
 * d'origine. Une seule fois (relanceSentAt non null = skip).
 */
export async function executeCastingRelance(missionId: string): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  const mission = await contactMissionModel.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("Mission introuvable");

  const sentByEmail =
    mission.sentMessageIds && typeof mission.sentMessageIds === "object"
      ? (mission.sentMessageIds as Record<string, SentMessageRecord>)
      : {};

  const subjectSrc = String(mission.draftEmailSubject || "").trim();
  const relanceSubject = subjectSrc.toLowerCase().startsWith("re:")
    ? subjectSrc
    : `Re: ${subjectSrc || "Notre derniere proposition"}`;

  const relanceMessages: Record<string, string> = {};
  const errors: string[] = [];
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  for (const [email, record] of Object.entries(sentByEmail)) {
    if (!record?.threadId || record.error) continue;
    attempted += 1;
    const contact = parseCastingContacts(mission.clientContacts).find(
      (c) => (c.email || "").toLowerCase() === email.toLowerCase()
    );
    const firstname = contact?.firstname || "";
    const body = normalizeEditorHtmlForEmail(
      `<p>Bonjour${firstname ? ` ${firstname}` : ""},</p><p>Je me permets de revenir vers vous suite a mon message de quelques jours concernant une collaboration avec <strong>${String(
        mission.targetBrand || ""
      )}</strong>.</p><p>Avez-vous eu le temps d'y jeter un oeil ? Je reste a votre disposition pour echanger.</p><p>Belle journee,<br/>Leyna - Glow Up Agence</p>`
    );
    const trackedBody = injectCastingTracking(body, missionId);
    try {
      const messageId = await sendGmail({
        fromEmail: LEYNA_FROM_EMAIL,
        to: email,
        subject: relanceSubject,
        htmlBody: trackedBody,
        threadId: record.threadId,
      });
      relanceMessages[email] = messageId;
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
      errors.push(`${email} : ${msg}`);
    }
  }

  await contactMissionModel.update({
    where: { id: missionId },
    data: {
      relanceSentAt: succeeded > 0 ? new Date() : mission.relanceSentAt,
      relanceMessageIds: succeeded > 0 ? relanceMessages : mission.relanceMessageIds,
      relanceError: errors.length > 0 ? errors.join(" | ") : null,
      status: succeeded > 0 ? "RELANCED" : mission.status,
    },
  });

  return { attempted, succeeded, failed, errors };
}
