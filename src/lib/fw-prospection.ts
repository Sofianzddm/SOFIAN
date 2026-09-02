/**
 * Prospection Fashion Week (base isolée du CRM) :
 *  - tracking ouvertures / clics sur FwClient
 *  - relance auto J+3 ouvrés dans le thread Gmail (1 max)
 *
 * L’envoi part de la boîte du projet `fashion-week` (ines@glowupagence.fr).
 */

import { prisma } from "@/lib/prisma";
import { sendGmail, checkThreadForReply } from "@/lib/gmail";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";
import { relanceDue } from "@/lib/business-days";
import {
  applyProjetVars,
  parseProjetEmailThreads,
  projetOppMailContacts,
  PROJET_RELANCE_BUSINESS_DAYS,
  PROJET_TRACKING_WINDOW_DAYS,
  type ProjetEmailThread,
  type ProjetRelanceResult,
} from "@/lib/projet-prospection";
import { fwVilleLabel } from "@/lib/fw-villes";
import { fwLanguage, type FwLanguage } from "@/lib/fw-language";

export const FW_PROJET_SLUG = "fashion-week";
export const FW_RELANCE_BUSINESS_DAYS = PROJET_RELANCE_BUSINESS_DAYS;
export const FW_TRACKING_WINDOW_DAYS = PROJET_TRACKING_WINDOW_DAYS;

export const FW_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FW_STATUTS = [
  "ATTENTE_EMAILS",
  "PRET",
  "ENVOYE",
  "EN_NEGO",
  "GAGNE",
  "PERDU",
] as const;

export type FwStatut = (typeof FW_STATUTS)[number];

export const FW_STATUTS_MANUELS = ["ENVOYE", "EN_NEGO", "GAGNE", "PERDU"] as const;

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

function encodeUrlParam(url: string): string {
  return Buffer.from(url, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function rewriteLinks(html: string, clientId: string): string {
  const baseUrl = getBaseUrl();
  return html.replace(
    /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, url: string, after: string) => {
      if (url.includes("/api/email/track/")) return match;
      const encoded = encodeUrlParam(url);
      const newUrl = `${baseUrl}/api/email/track/fw/click?id=${encodeURIComponent(
        clientId
      )}&u=${encoded}`;
      return `<a ${before}href=${quote}${newUrl}${quote}${after}>`;
    }
  );
}

function buildPixelTag(clientId: string): string {
  const baseUrl = getBaseUrl();
  const src = `${baseUrl}/api/email/track/fw/open?id=${encodeURIComponent(clientId)}`;
  return `<img src="${src}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0;visibility:hidden;overflow:hidden;mso-hide:all" />`;
}

export function injectFwTracking(html: string, clientId: string): string {
  if (!clientId) return html;
  const withLinks = rewriteLinks(html, clientId);
  const pixel = buildPixelTag(clientId);
  if (/<\/body>/i.test(withLinks)) {
    return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${withLinks}${pixel}`;
}

export function contactHasFwEmail(email: string | null | undefined): boolean {
  return FW_EMAIL_RE.test(String(email || "").trim());
}

export function statutFromContacts(
  current: string,
  hasEmails: boolean
): string {
  if (current === "ATTENTE_EMAILS" || current === "PRET") {
    return hasEmails ? "PRET" : "ATTENTE_EMAILS";
  }
  return current;
}

export async function refreshFwClientStatut(clientId: string) {
  const client = await prisma.fwClient.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      statut: true,
      contacts: { select: { email: true } },
    },
  });
  if (!client) return;
  const hasEmails = client.contacts.some((c) => contactHasFwEmail(c.email));
  const next = statutFromContacts(client.statut, hasEmails);
  if (next !== client.statut) {
    await prisma.fwClient.update({ where: { id: clientId }, data: { statut: next } });
  }
}

export const FW_CARTO_FILE_PUBLIC_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

export const fwClientInclude = {
  contacts: { orderBy: { createdAt: "asc" as const } },
  cartoFiles: {
    select: FW_CARTO_FILE_PUBLIC_SELECT,
    orderBy: { createdAt: "desc" as const },
  },
};

type FwCartoFileLite = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date | string;
};

type FwContactLike = {
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
};

export function serializeFwClient<
  T extends {
    statut: string;
    contacts: FwContactLike[];
    emailThreads?: unknown;
    cartoFiles?: FwCartoFileLite[];
  },
>(client: T, role: string, includeContacts: boolean) {
  const contactCount = client.contacts.length;
  const hasEmails = client.contacts.some((c) => contactHasFwEmail(c.email));
  const { contacts, emailThreads, cartoFiles, ...rest } = client;
  const isAdmin = role === "ADMIN";
  const base = {
    ...rest,
    contactCount,
    hasEmails,
    ...(isAdmin ? { emailThreads, cartoFiles: cartoFiles || [] } : {}),
  };
  if (includeContacts && (isAdmin || client.statut !== "ATTENTE_EMAILS")) {
    return { ...base, contacts };
  }
  return base;
}

function formatFwRelanceDate(date: Date, language: FwLanguage): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * Relance J+3 : suivi d'une invitation au défilé (pas une collab).
 * Ville + date si renseignées sur la fiche. Langue du client (FR / EN).
 */
function buildFwRelanceBody(input: {
  firstName: string;
  nomClient: string;
  ville?: string | null;
  dateDefile?: Date | null;
  language?: string | null;
}): string {
  const language = fwLanguage(input.language);
  const ville = fwVilleLabel(input.ville, language);
  const maison = input.nomClient.trim();

  if (language === "en") {
    const hello = input.firstName ? `Hi ${input.firstName},` : "Hi,";
    const dateBit = input.dateDefile
      ? `, on ${formatFwRelanceDate(input.dateDefile, "en")}`
      : "";
    const showLine = maison
      ? `the invitation to the <strong>${maison}</strong> show in ${ville}${dateBit}`
      : `the invitation to the show in ${ville}${dateBit}`;
    return [
      `<p>${hello}</p>`,
      `<p>I'm following up on ${showLine}.</p>`,
      `<p>The lists are locking in now — would you be able to confirm whether an invitation might be possible on your side?</p>`,
      `<p>Even a very short reply would help me a lot.</p>`,
      `<p>Best,<br/><strong>Inès</strong><br/>Glow Up Agence</p>`,
    ].join("");
  }

  const hello = input.firstName ? `Bonjour ${input.firstName},` : "Bonjour,";
  const dateBit = input.dateDefile
    ? `, le ${formatFwRelanceDate(input.dateDefile, "fr")}`
    : "";
  const showLine = maison
    ? `l'invitation au défilé <strong>${maison}</strong> à ${ville}${dateBit}`
    : `l'invitation au défilé à ${ville}${dateBit}`;

  return [
    `<p>${hello}</p>`,
    `<p>Je me permets de faire remonter ${showLine}.</p>`,
    `<p>Les listes se figent en ce moment — pourriez-vous me confirmer si une invitation serait possible de votre côté ?</p>`,
    `<p>Un retour même très court m'aiderait beaucoup.</p>`,
    `<p>Belle journée,<br/><strong>Inès</strong><br/>Glow Up Agence</p>`,
  ].join("");
}

export async function executeFwRelance(clientId: string): Promise<ProjetRelanceResult> {
  const client = await prisma.fwClient.findUnique({
    where: { id: clientId },
    include: { contacts: true },
  });
  if (!client) return { ok: false, error: "Client FW introuvable." };
  if (!client.lastEmailSentAt) {
    return { ok: false, error: "Aucun mail de prospection envoyé." };
  }
  if (client.relanceSentAt) {
    return { ok: false, error: "Une relance a déjà été envoyée." };
  }

  let threads = parseProjetEmailThreads(client.emailThreads);
  if (threads.length === 0 && client.lastEmailThreadId) {
    const contacts = projetOppMailContacts(client.contacts);
    threads = contacts.slice(0, 1).map((c) => ({
      email: contacts.map((x) => x.email).join(", "),
      firstName: c.firstName,
      lastName: c.lastName,
      threadId: client.lastEmailThreadId as string,
      repliedAt: client.emailRepliedAt ? client.emailRepliedAt.toISOString() : null,
    }));
  }
  const pending = threads.filter((t) => !t.repliedAt);
  if (pending.length === 0) {
    return { ok: false, error: "Tous les contacts ont déjà répondu." };
  }

  const fromEmail = (client.lastEmailFrom || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
  const subjectSrc = (client.emailSubject || "").trim() || `Glow Up x ${client.nom}`;
  const relanceSubject = subjectSrc.toLowerCase().startsWith("re:")
    ? subjectSrc
    : `Re: ${subjectSrc}`;

  let sent = 0;
  let lastError: string | null = null;
  for (const thread of pending) {
    const body = injectFwTracking(
      buildFwRelanceBody({
        firstName: thread.firstName,
        nomClient: client.nom,
        ville: client.ville,
        dateDefile: client.dateDefile,
        language: client.language,
      }),
      client.id
    );
    try {
      await sendGmail({
        fromEmail,
        to: thread.email,
        subject: applyProjetVars(relanceSubject, {
          prenom: thread.firstName,
          nom: thread.lastName,
          marque: client.nom,
        }),
        htmlBody: body,
        threadId: thread.threadId,
      });
      sent += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Erreur Gmail inconnue";
      console.warn(`[fw-prospection] relance ${thread.email} (${client.nom}):`, error);
    }
  }

  if (sent === 0) {
    await prisma.fwClient.update({
      where: { id: client.id },
      data: { relanceError: lastError || "Échec de toutes les relances." },
    });
    return { ok: false, error: `Échec Gmail : ${lastError || "aucune relance envoyée"}` };
  }

  await prisma.fwClient.update({
    where: { id: client.id },
    data: { relanceSentAt: new Date(), relanceError: lastError },
  });

  console.info(
    `[fw-prospection] relance J+${FW_RELANCE_BUSINESS_DAYS} → ${client.nom} (${sent}/${pending.length} contacts) depuis ${fromEmail}`
  );
  return { ok: true, sent };
}

export async function processFwProspectionCron(now: Date, withinRelanceHours: boolean) {
  let replies = 0;
  let relances = 0;

  const windowStart = new Date(now.getTime() - FW_TRACKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clients = await prisma.fwClient.findMany({
    where: {
      lastEmailSentAt: { not: null, gte: windowStart },
      lastEmailThreadId: { not: null },
    },
  });

  for (const client of clients) {
    if (!client.lastEmailSentAt || !client.lastEmailThreadId) continue;
    const fromEmail = (client.lastEmailFrom || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;

    let hasReplied = Boolean(client.emailRepliedAt);
    const threads = parseProjetEmailThreads(client.emailThreads);
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
            `[cron/outreach] checkThreadForReply fw ${client.nom} (${thread.email}):`,
            error
          );
        }
      }
      if (threadsChanged) {
        await prisma.fwClient.update({
          where: { id: client.id },
          data: {
            emailThreads: threads,
            ...(client.emailRepliedAt ? {} : { emailRepliedAt: now }),
          },
        });
        hasReplied = true;
      }
    } else if (!hasReplied) {
      try {
        newReply = await checkThreadForReply(fromEmail, client.lastEmailThreadId);
      } catch (error) {
        console.warn(`[cron/outreach] checkThreadForReply fw ${client.nom}:`, error);
      }
      if (newReply) {
        hasReplied = true;
        await prisma.fwClient.update({
          where: { id: client.id },
          data: { emailRepliedAt: now },
        });
      }
    }

    if (newReply) {
      replies += 1;
      const senderToken = await prisma.gmailToken
        .findUnique({ where: { email: fromEmail }, select: { userId: true } })
        .catch(() => null);
      const notifyIds = Array.from(
        new Set([senderToken?.userId, client.createdById].filter(Boolean) as string[])
      );
      for (const userId of notifyIds) {
        await prisma.notification
          .create({
            data: {
              userId,
              type: "GENERAL",
              titre: "Réponse marque (Fashion Week)",
              message: `${client.nom} a répondu au mail de prospection.`,
              lien: "/strategy/projets/fashion-week",
            },
          })
          .catch((e) => console.warn("[cron/outreach] notification fw réponse:", e));
      }
    }

    if (
      withinRelanceHours &&
      !hasReplied &&
      !client.relanceSentAt &&
      relanceDue(client.lastEmailSentAt, FW_RELANCE_BUSINESS_DAYS, client.id, now)
    ) {
      const result = await executeFwRelance(client.id);
      if (result.ok) relances += 1;
      else console.warn(`[cron/outreach] relance fw ${client.nom}: ${result.error}`);
    }
  }

  return { processed: clients.length, replies, relances };
}

export type { ProjetEmailThread };
