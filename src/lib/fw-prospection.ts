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

export function statutFromContacts(
  current: string,
  hasEmails: boolean
): string {
  if (current === "ATTENTE_EMAILS" || current === "PRET") {
    return hasEmails ? "PRET" : "ATTENTE_EMAILS";
  }
  return current;
}

type FwContactLike = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
};

export function serializeFwClient<
  T extends { statut: string; contacts: FwContactLike[]; emailThreads?: unknown },
>(client: T, role: string, includeContacts: boolean) {
  const contactCount = client.contacts.length;
  const hasEmails = contactCount > 0;
  const { contacts, emailThreads, ...rest } = client;
  const isAdmin = role === "ADMIN";
  const base = {
    ...rest,
    contactCount,
    hasEmails,
    ...(isAdmin ? { emailThreads } : {}),
  };
  if (includeContacts && (isAdmin || client.statut !== "ATTENTE_EMAILS")) {
    return { ...base, contacts };
  }
  return base;
}

function buildFwRelanceBody(firstName: string, nomClient: string): string {
  const hello = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const brandLine = nomClient
    ? `concernant notre proposition de collaboration Fashion Week pour <strong>${nomClient}</strong>`
    : "concernant notre proposition de collaboration Fashion Week";
  return [
    `<p>${hello}</p>`,
    `<p>Je me permets de revenir vers vous ${brandLine}.</p>`,
    `<p>Avez-vous eu l'occasion d'en prendre connaissance ? Je reste à votre disposition pour échanger ou répondre à vos questions.</p>`,
    `<p>Au plaisir d'avoir de vos nouvelles,</p>`,
    `<p>Belle journée,</p>`,
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
    const body = injectFwTracking(buildFwRelanceBody(thread.firstName, client.nom), client.id);
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
