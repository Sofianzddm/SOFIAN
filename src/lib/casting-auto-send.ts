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
import { sendGmail, getMessageRfcId, getGmailFromName } from "@/lib/gmail";
import { injectCastingTracking } from "@/lib/casting-tracking";
import {
  type TalentLinkInput,
  upgradeTalentLinksInHtml,
} from "@/lib/talent-email-links";
import {
  normalizeEditorHtmlForEmail,
  buildQuotedOriginal,
} from "@/lib/email-body-html";
import { translateEmail, TranslateEmailError } from "@/lib/translate-email";

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
  | { ok: false; error: string; canForce?: boolean };

/**
 * Verifie qu'une mission peut etre envoyee :
 *  - sujet + corps non vides
 *  - au moins 1 contact valide
 *  - au moins 1 contact pas encore contacte sur cette mission
 *  - les emails ne sont pas tous bloques par le cooldown
 *
 * Si la mission est deja partiellement envoyee, seuls les nouveaux
 * contacts (absents de `sentMessageIds`) sont consideres.
 *
 * Avec `options.force`, on ignore le cooldown anti-spam de 20 jours : si le
 * SEUL motif de blocage etait "contact deja contacte recemment (autre
 * mission)", on laisse passer. Les autres garde-fous (brouillon incomplet,
 * aucun contact valide, tous deja contactes sur CETTE mission) restent
 * appliques car les forcer ne changerait rien.
 */
export async function preflightCastingSend(
  mission: {
    id: string;
    draftEmailSubject: string | null;
    draftEmailBody: string | null;
    clientContacts: unknown;
    sentMessageIds?: unknown;
  },
  options: { force?: boolean } = {}
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
  // En mode force, on saute le cooldown : tous les nouveaux contacts sont
  // consideres recevables.
  if (options.force) {
    return { ok: true, contacts: newContacts };
  }
  const emails = newContacts.map((c) => c.email!);
  const blocked = await findEmailsBlockedByCooldown(emails, mission.id);
  const reachable = newContacts.filter((c) => !blocked.has((c.email || "").toLowerCase()));
  if (reachable.length === 0) {
    return {
      ok: false,
      error: `Tous les nouveaux contacts ont deja recu un mail (autre mission) dans les ${CASTING_COOLDOWN_DAYS} derniers jours.`,
      canForce: true,
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
 * Capte la langue de chaque contact depuis la FICHE CLIENT (fiche marque) :
 * renvoie une map email(minuscule) -> "fr" | "en" à partir de
 * `MarqueContact.language`. C'est la source de vérité de la langue d'envoi :
 * la langue définie sur la fiche client pilote la traduction automatique, sans
 * réglage manuel sur la carte pipeline.
 */
async function loadBrandContactLanguages(mission: {
  marqueId?: string | null;
}): Promise<Map<string, "fr" | "en">> {
  const map = new Map<string, "fr" | "en">();
  const marqueId = String(mission.marqueId || "").trim();
  if (!marqueId) return map;
  const contacts = await prisma.marqueContact.findMany({
    where: { marqueId },
    select: { email: true, language: true },
  });
  for (const c of contacts) {
    const email = String(c.email || "").trim().toLowerCase();
    if (!email) continue;
    map.set(email, String(c.language || "").toLowerCase() === "en" ? "en" : "fr");
  }
  return map;
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

export type CastingSendPreviewRecipient = {
  email: string;
  firstname: string;
  lastname: string;
  language: "fr" | "en";
  translated: boolean;
  subject: string;
  bodyHtml: string;
  willSend: boolean;
  skipReason: string | null;
};

export type CastingSendPreview = {
  fromEmail: string;
  targetBrand: string;
  sourceLanguage: "fr" | "en";
  recipients: CastingSendPreviewRecipient[];
  warnings: string[];
};

/**
 * Apercu EXACT de l'envoi, sans rien envoyer ni rien ecrire en base.
 * Reutilise le MEME pipeline que executeCastingSend (liens talents,
 * normalisation HTML Gmail, langue captee par contact depuis la fiche
 * client, traduction auto, variables {{...}} remplacees par contact).
 * Seul le tracking (pixel invisible + reecriture des liens) n'est pas
 * injecte : il ne change rien visuellement et cliquer un lien depuis
 * l'apercu fausserait les stats d'ouverture/clic.
 *
 * `overrides` permet de previsualiser le contenu en cours de redaction
 * dans le composer (pas encore sauvegarde sur la mission).
 */
export async function buildCastingSendPreview(
  missionId: string,
  overrides: {
    subject?: string;
    bodyHtml?: string;
    sourceLanguage?: "fr" | "en";
  } = {}
): Promise<CastingSendPreview> {
  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  const mission = await contactMissionModel.findUnique({ where: { id: missionId } });
  if (!mission) {
    throw new Error("Mission introuvable");
  }

  const subjectTpl =
    overrides.subject !== undefined
      ? String(overrides.subject).trim()
      : String(mission.draftEmailSubject || "").trim();
  const bodyRaw =
    overrides.bodyHtml !== undefined
      ? String(overrides.bodyHtml).trim()
      : String(mission.draftEmailBody || "").trim();
  const missionTalents = await loadMissionTalentsForSend(mission);
  const bodyTpl = normalizeEditorHtmlForEmail(
    upgradeTalentLinksInHtml(bodyRaw, missionTalents)
  );

  const sourceLang: "fr" | "en" =
    overrides.sourceLanguage ??
    (String(mission.draftLanguage || "").toLowerCase() === "en" ? "en" : "fr");
  const fallbackLang: "fr" | "en" =
    String(mission.clientLanguage || "").toUpperCase() === "EN"
      ? "en"
      : String(mission.clientLanguage || "").toUpperCase() === "FR"
      ? "fr"
      : sourceLang;

  const contactLangByEmail = await loadBrandContactLanguages(mission);

  const versions = new Map<"fr" | "en", { subject: string; body: string }>();
  versions.set(sourceLang, { subject: subjectTpl, body: bodyTpl });
  const warnings: string[] = [];
  const getVersion = async (
    lang: "fr" | "en"
  ): Promise<{ subject: string; body: string }> => {
    const cached = versions.get(lang);
    if (cached) return cached;
    if (!subjectTpl && !bodyTpl) {
      const v = { subject: subjectTpl, body: bodyTpl };
      versions.set(lang, v);
      return v;
    }
    try {
      const tr = await translateEmail({
        subject: subjectTpl,
        bodyHtml: bodyTpl,
        targetLanguage: lang,
      });
      const v = { subject: tr.subject, body: tr.body };
      versions.set(lang, v);
      return v;
    } catch (e) {
      if (e instanceof TranslateEmailError) {
        warnings.push(
          `Traduction auto en ${lang === "en" ? "anglais" : "français"} indisponible : la version d'origine sera envoyée.`
        );
        const v = { subject: subjectTpl, body: bodyTpl };
        versions.set(lang, v);
        return v;
      }
      throw e;
    }
  };

  const allContacts = parseCastingContacts(mission.clientContacts);
  const alreadySent = extractAlreadySentEmails(mission.sentMessageIds);
  const newEmails = allContacts
    .map((c) => (c.email || "").toLowerCase())
    .filter((e) => e && !alreadySent.has(e));
  const forceSend = Boolean(mission.forceSend);
  const blocked = forceSend
    ? new Set<string>()
    : await findEmailsBlockedByCooldown(newEmails, missionId);

  const recipients: CastingSendPreviewRecipient[] = [];
  for (const contact of allContacts) {
    const email = (contact.email || "").toLowerCase();
    if (!email) continue;
    const isAlreadySent = alreadySent.has(email);
    const isBlocked = !isAlreadySent && blocked.has(email);
    const contactLang = contactLangByEmail.get(email) ?? fallbackLang;
    const version = await getVersion(contactLang);
    const vars = {
      firstname: contact.firstname || "",
      lastname: contact.lastname || "",
      company: String(mission.targetBrand || ""),
    };
    recipients.push({
      email,
      firstname: contact.firstname || "",
      lastname: contact.lastname || "",
      language: contactLang,
      translated: contactLang !== sourceLang,
      subject: applyCastingTemplateVars(version.subject, vars),
      bodyHtml: applyCastingTemplateVars(version.body, vars),
      willSend: !isAlreadySent && !isBlocked,
      skipReason: isAlreadySent
        ? "Déjà contacté sur cette carte : ne recevra pas de nouvel envoi."
        : isBlocked
        ? `Cooldown anti-spam ${CASTING_COOLDOWN_DAYS}j actif (contacté récemment via une autre carte).`
        : null,
    });
  }

  return {
    fromEmail: LEYNA_FROM_EMAIL,
    targetBrand: String(mission.targetBrand || "").trim(),
    sourceLanguage: sourceLang,
    recipients,
    warnings,
  };
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

  // Traduction auto (FR<->EN) — même système que /outreach, MAIS la langue
  // cible est captée AUTOMATIQUEMENT depuis la fiche client : chaque contact
  // reçoit le mail dans sa langue (MarqueContact.language), sans réglage manuel.
  // Le brouillon est rédigé dans `draftLanguage` (source). Si la langue d'un
  // contact diffère de la source, le mail est traduit (une seule fois par
  // langue, réutilisé pour tous les contacts de cette langue). En cas d'échec,
  // on retombe sur la version d'origine (l'erreur est consignée dans sendError).
  const sourceLang: "fr" | "en" =
    String(mission.draftLanguage || "").toLowerCase() === "en" ? "en" : "fr";
  // Langue par défaut si un contact n'est pas (encore) sur la fiche client :
  // on retombe sur clientLanguage de la mission, sinon sur la langue source.
  const fallbackLang: "fr" | "en" =
    String(mission.clientLanguage || "").toUpperCase() === "EN"
      ? "en"
      : String(mission.clientLanguage || "").toUpperCase() === "FR"
      ? "fr"
      : sourceLang;

  // Map email -> langue, lue depuis la fiche client (fiche marque).
  const contactLangByEmail = await loadBrandContactLanguages(mission);

  // Cache des versions traduites par langue (la source n'est jamais retraduite).
  const versions = new Map<"fr" | "en", { subject: string; body: string }>();
  versions.set(sourceLang, { subject: subjectTpl, body: bodyTpl });
  const translationErrors: string[] = [];
  const getVersion = async (
    lang: "fr" | "en"
  ): Promise<{ subject: string; body: string }> => {
    const cached = versions.get(lang);
    if (cached) return cached;
    if (!subjectTpl && !bodyTpl) {
      const v = { subject: subjectTpl, body: bodyTpl };
      versions.set(lang, v);
      return v;
    }
    try {
      const tr = await translateEmail({
        subject: subjectTpl,
        bodyHtml: bodyTpl,
        targetLanguage: lang,
      });
      const v = { subject: tr.subject, body: tr.body };
      versions.set(lang, v);
      return v;
    } catch (e) {
      if (e instanceof TranslateEmailError) {
        translationErrors.push(
          `Traduction auto en ${lang === "en" ? "anglais" : "français"} indisponible : version d'origine envoyée.`
        );
        const v = { subject: subjectTpl, body: bodyTpl };
        versions.set(lang, v);
        return v;
      }
      throw e;
    }
  };

  const allContacts = parseCastingContacts(mission.clientContacts);
  const alreadySent = extractAlreadySentEmails(mission.sentMessageIds);
  const newContacts = allContacts.filter(
    (c) => !alreadySent.has((c.email || "").toLowerCase())
  );
  const emails = newContacts.map((c) => c.email!);
  // Si l'envoi a ete force explicitement (case "envoyer quand meme"), on
  // ignore le cooldown anti-spam de 20 jours.
  const forceSend = Boolean(mission.forceSend);
  const blocked = forceSend
    ? new Set<string>()
    : await findEmailsBlockedByCooldown(emails, missionId);

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
    // Langue de CE contact, captée depuis la fiche client (sinon fallback).
    const contactLang = contactLangByEmail.get(email) ?? fallbackLang;
    const version = await getVersion(contactLang);
    const personalizedSubject = applyCastingTemplateVars(version.subject, {
      firstname: contact.firstname || "",
      lastname: contact.lastname || "",
      company: String(mission.targetBrand || ""),
    });
    const personalizedBody = applyCastingTemplateVars(version.body, {
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

  const combinedErrors =
    translationErrors.length > 0
      ? [...translationErrors, ...outcome.errors]
      : outcome.errors;

  await contactMissionModel.update({
    where: { id: missionId },
    data: {
      ...stageUpdate,
      sentMessageIds: mergedMessages,
      sendError: combinedErrors.length > 0 ? combinedErrors.join(" | ") : null,
      scheduledSendAt: null,
      // Le flag de forcage est a usage unique : on le remet a false apres
      // l'execution pour ne pas court-circuiter le cooldown sur de futurs ajouts.
      ...(forceSend ? { forceSend: false } : {}),
      ...(outcome.succeeded > 0 && bodyTpl !== bodyRaw ? { draftEmailBody: bodyTpl } : {}),
    },
  });

  return outcome;
}

/**
 * Template du mail de relance J+3 (manuel ou cron).
 * - Court, chaleureux, professionnel
 * - Variables : {{contact.firstname}} → Bonjour Marie / Bonjour
 * - Signature alignée avec le mail initial (Leyna · Glow Up Agence)
 */
export function buildDefaultRelanceTemplate(
  targetBrand: string,
  language: "fr" | "en" = "fr"
): string {
  const brand = (targetBrand || "").trim();

  if (language === "en") {
    const brandLine = brand
      ? `regarding our collaboration proposal with <strong>${brand}</strong>`
      : `regarding our collaboration proposal`;

    return [
      `<p>Hi {{contact.firstname}},</p>`,
      `<p>I just wanted to follow up ${brandLine}.</p>`,
      `<p>Have you had a chance to take a look? I would be happy to answer any questions or set up a quick call.</p>`,
      `<p>Looking forward to hearing from you,</p>`,
      `<p>Best regards,<br/><strong>Leyna</strong><br/>Glow Up Agence</p>`,
    ].join("");
  }

  const brandLine = brand
    ? `concernant notre proposition de collaboration avec <strong>${brand}</strong>`
    : `concernant notre proposition de collaboration`;

  return [
    `<p>Bonjour {{contact.firstname}},</p>`,
    `<p>Je me permets de revenir vers vous ${brandLine}.</p>`,
    `<p>Avez-vous eu l'occasion d'en prendre connaissance ? Je reste à votre disposition pour échanger ou répondre à vos questions.</p>`,
    `<p>Au plaisir d'avoir de vos nouvelles,</p>`,
    `<p>Belle journée,<br/><strong>Leyna</strong><br/>Glow Up Agence</p>`,
  ].join("");
}

/** Date du premier mail formatée (« 18 juin 2026 » / « June 18, 2026 »). */
function formatRelanceDate(date: Date, language: "fr" | "en"): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Modèle de relance J+3 du module Outreach (cycle client) : relance « valeur
 * ajoutée » qui rappelle la proposition initiale (date du premier mail), propose
 * des éléments concrets (media kits, reach…) et demande un court call.
 */
export function buildOutreachRelanceTemplate(
  targetBrand: string,
  language: "fr" | "en" = "fr",
  firstSentAt?: Date | null
): string {
  const brand = (targetBrand || "").trim();

  if (language === "en") {
    const brandPart = brand ? `<strong>${brand}</strong>` : `your brand`;
    const intro = firstSentAt
      ? `I'm following up on my message from ${formatRelanceDate(firstSentAt, "en")}, in which I suggested a multi-talent activation for ${brandPart}.`
      : `I'm following up on my previous message, in which I suggested a multi-talent activation for ${brandPart}.`;

    return [
      `Hi {{contact.firstname}},`,
      `<br /><br />`,
      `I hope you're doing well 😊`,
      `<br /><br />`,
      intro,
      `<br /><br />`,
      `I can send you right away:`,
      `<br />`,
      `→ the creators' full media kits<br />`,
      `→ reach &amp; engagement estimates<br />`,
      `→ a few content ideas tailored to your activations`,
      `<br /><br />`,
      `Would you be available for a quick 10-15 min call this week? I'm very flexible on timing.`,
      `<br /><br />`,
      `Feel free to let me know what works best for you!`,
      `<br /><br />`,
      `Have a great day,<br /><strong>Leyna</strong><br />Glow Up Agence`,
    ].join("");
  }

  const brandPart = brand ? `<strong>${brand}</strong>` : `votre marque`;
  const intro = firstSentAt
    ? `Je reviens vers vous suite à mon message du ${formatRelanceDate(firstSentAt, "fr")}, dans lequel je vous proposais une activation multi-talents pour ${brandPart}.`
    : `Je reviens vers vous suite à mon précédent message, dans lequel je vous proposais une activation multi-talents pour ${brandPart}.`;

  return [
    `Bonjour {{contact.firstname}},`,
    `<br /><br />`,
    `J'espère que vous allez bien 😊`,
    `<br /><br />`,
    intro,
    `<br /><br />`,
    `Je peux vous envoyer immédiatement :`,
    `<br />`,
    `→ les media kits complets des créatrices<br />`,
    `→ les estimations de reach &amp; engagement<br />`,
    `→ quelques idées de contenus adaptés à vos activations`,
    `<br /><br />`,
    `Seriez-vous disponible pour un petit call de 10-15 minutes cette semaine ? Je reste très flexible sur les créneaux.`,
    `<br /><br />`,
    `N'hésitez pas à me dire ce qui vous arrange le mieux !`,
    `<br /><br />`,
    `Belle journée à vous,<br /><strong>Leyna</strong><br />Glow Up Agence`,
  ].join("");
}

export type CastingRelanceRecipient = {
  email: string;
  firstname: string;
  lastname: string;
  threadId: string;
  body: string;
};

export type CastingRelanceDraft = {
  subject: string;
  /** Corps modèle "neutre" {{prenom}} → utile pour édition côté UI */
  bodyTemplate: string;
  recipients: CastingRelanceRecipient[];
  targetBrand: string;
};

/**
 * Construit la prévisualisation de la relance (sujet + corps par destinataire)
 * sans rien envoyer. Utilisé par le bouton "Relancer maintenant" du pipeline.
 */
export async function buildCastingRelanceDraft(
  missionId: string
): Promise<CastingRelanceDraft> {
  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  const mission = await contactMissionModel.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("Mission introuvable");

  const sentByEmail =
    mission.sentMessageIds && typeof mission.sentMessageIds === "object"
      ? (mission.sentMessageIds as Record<string, SentMessageRecord>)
      : {};

  const relanceLang: "fr" | "en" =
    String(mission.clientLanguage || "").toUpperCase() === "EN" ? "en" : "fr";

  const subjectSrc = String(mission.draftEmailSubject || "").trim();
  const defaultSubjectBase =
    relanceLang === "en" ? "Our collaboration proposal" : "Notre proposition de collaboration";
  const subject = subjectSrc.toLowerCase().startsWith("re:")
    ? subjectSrc
    : `Re: ${subjectSrc || defaultSubjectBase}`;

  const targetBrand = String(mission.targetBrand || "").trim();
  const bodyTemplate = buildDefaultRelanceTemplate(targetBrand, relanceLang);

  const recipients: CastingRelanceRecipient[] = [];
  for (const [email, record] of Object.entries(sentByEmail)) {
    if (!record?.threadId || record.error) continue;
    const contact = parseCastingContacts(mission.clientContacts).find(
      (c) => (c.email || "").toLowerCase() === email.toLowerCase()
    );
    const firstname = contact?.firstname || "";
    const lastname = contact?.lastname || "";
    const body = applyCastingTemplateVars(bodyTemplate, {
      firstname,
      lastname,
      company: targetBrand,
    });
    recipients.push({
      email,
      firstname,
      lastname,
      threadId: record.threadId,
      body,
    });
  }

  return { subject, bodyTemplate, recipients, targetBrand };
}

export type CastingRelanceSendOptions = {
  subjectOverride?: string;
  bodyOverride?: string;
};

/**
 * Relance J+3 : envoie une relance courte en repondant au thread Gmail
 * d'origine. Une seule fois (relanceSentAt non null = skip).
 *
 * @param options.subjectOverride remplace le sujet par défaut
 * @param options.bodyOverride    remplace le corps HTML ; les jetons
 *   {{contact.firstname}}, {{contact.lastname}}, {{contact.company}},
 *   {{owner.firstname}} y sont remplacés par contact.
 */
export async function executeCastingRelance(
  missionId: string,
  options: CastingRelanceSendOptions = {}
): Promise<{
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

  // Langue de la relance = captée PAR CONTACT depuis la fiche client
  // (MarqueContact.language), comme l'envoi initial. La relance et la citation
  // du mail d'origine partent donc dans la langue de chaque destinataire.
  const sourceLang: "fr" | "en" =
    String(mission.draftLanguage || "").toLowerCase() === "en" ? "en" : "fr";
  const fallbackLang: "fr" | "en" =
    String(mission.clientLanguage || "").toUpperCase() === "EN"
      ? "en"
      : String(mission.clientLanguage || "").toUpperCase() === "FR"
      ? "fr"
      : sourceLang;
  const contactLangByEmail = await loadBrandContactLanguages(mission);

  const subjectSrcRaw = String(mission.draftEmailSubject || "").trim();
  const originalSrcRaw = String(mission.draftEmailBody || "").trim();
  const targetBrand = String(mission.targetBrand || "").trim();
  // Si une relance a été éditée à la main (preview), on l'utilise telle quelle
  // pour tous (pas de retraduction par contact).
  const hasOverride = Boolean(
    (options.subjectOverride && options.subjectOverride.trim()) ||
      (options.bodyOverride && options.bodyOverride.trim())
  );

  type RelanceVersion = {
    subject: string;
    bodyTemplate: string;
    originalBodyTpl: string;
    sentDateLabel: string;
  };
  const relanceVersions = new Map<"fr" | "en", RelanceVersion>();
  const getRelanceVersion = async (lang: "fr" | "en"): Promise<RelanceVersion> => {
    const cached = relanceVersions.get(lang);
    if (cached) return cached;
    let subjectSrc = subjectSrcRaw;
    let originalBodyTpl = originalSrcRaw;
    if (!hasOverride && sourceLang !== lang && (subjectSrc || originalBodyTpl)) {
      try {
        const tr = await translateEmail({
          subject: subjectSrc,
          bodyHtml: originalBodyTpl,
          targetLanguage: lang,
        });
        subjectSrc = tr.subject || subjectSrc;
        originalBodyTpl = tr.body || originalBodyTpl;
      } catch (e) {
        if (!(e instanceof TranslateEmailError)) throw e;
      }
    }
    const defaultSubjectBase =
      lang === "en" ? "Our collaboration proposal" : "Notre proposition de collaboration";
    const subject =
      (options.subjectOverride && options.subjectOverride.trim()) ||
      (subjectSrc.toLowerCase().startsWith("re:")
        ? subjectSrc
        : `Re: ${subjectSrc || defaultSubjectBase}`);
    const bodyTemplate =
      (options.bodyOverride && options.bodyOverride.trim()) ||
      buildDefaultRelanceTemplate(targetBrand, lang);
    const sentDateLabel = mission.sentAt
      ? formatRelanceDate(new Date(mission.sentAt), lang)
      : "";
    const v: RelanceVersion = { subject, bodyTemplate, originalBodyTpl, sentDateLabel };
    relanceVersions.set(lang, v);
    return v;
  };

  const fromName = await getGmailFromName(LEYNA_FROM_EMAIL);
  const senderLabel = `${fromName} <${LEYNA_FROM_EMAIL}>`;

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
    const lastname = contact?.lastname || "";
    const vars = { firstname, lastname, company: targetBrand };
    // Langue de CE contact, captée depuis la fiche client.
    const contactLang = contactLangByEmail.get(email.toLowerCase()) ?? fallbackLang;
    const ver = await getRelanceVersion(contactLang);
    const bodyWithVars = applyCastingTemplateVars(ver.bodyTemplate, vars);
    const body = normalizeEditorHtmlForEmail(bodyWithVars);
    const trackedBody = injectCastingTracking(body, missionId);

    // Citation du mail d'origine + In-Reply-To : la relance devient une vraie
    // réponse, threadée côté destinataire (le contenu initial reste visible
    // même si l'original est tombé dans ses spams).
    const quotedOriginal = ver.originalBodyTpl
      ? buildQuotedOriginal(applyCastingTemplateVars(ver.originalBodyTpl, vars), {
          dateLabel: ver.sentDateLabel,
          senderLabel,
        })
      : "";
    const finalHtml = `${trackedBody}${quotedOriginal}`;
    const inReplyTo = record.messageId
      ? (await getMessageRfcId(LEYNA_FROM_EMAIL, record.messageId)) || undefined
      : undefined;

    try {
      const messageId = await sendGmail({
        fromEmail: LEYNA_FROM_EMAIL,
        to: email,
        subject: ver.subject,
        htmlBody: finalHtml,
        threadId: record.threadId,
        inReplyTo,
      });
      relanceMessages[email] = messageId;
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
      errors.push(`${email} : ${msg}`);
    }
  }

  try {
    const updated = await contactMissionModel.update({
      where: { id: missionId },
      data: {
        relanceSentAt: succeeded > 0 ? new Date() : mission.relanceSentAt,
        relanceMessageIds: succeeded > 0 ? relanceMessages : mission.relanceMessageIds,
        relanceError: errors.length > 0 ? errors.join(" | ") : null,
        status: succeeded > 0 ? "RELANCED" : mission.status,
        // Si l'envoi manuel réussit on lève l'éventuelle annulation pour
        // garder l'historique cohérent.
        ...(succeeded > 0 ? { relanceCancelledAt: null, relanceCancelledById: null } : {}),
      },
      select: { id: true, relanceSentAt: true, status: true },
    });
    console.info(
      `[executeCastingRelance] ${missionId} attempted=${attempted} succeeded=${succeeded} failed=${failed} → relanceSentAt=${updated.relanceSentAt?.toISOString() ?? "null"} status=${updated.status}`
    );
  } catch (err) {
    // Cas critique : Gmail a expédié mais la DB n'a pas pu être mise à jour.
    // On log loud pour qu'on retrouve la trace dans Vercel.
    console.error(
      `[executeCastingRelance] ❌ DB UPDATE FAILED for ${missionId} (succeeded=${succeeded})`,
      err
    );
    throw err;
  }

  return { attempted, succeeded, failed, errors };
}
