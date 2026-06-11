/**
 * Suivi du mail de prospection des opportunités marque des projets strategy
 * (Ski Trip, Villa Cannes…) :
 *  - tracking ouvertures (pixel) + clics (liens réécrits) stocké sur
 *    OpportuniteMarque (id de l'opportunité en paramètre)
 *  - relance auto J+3 ouvrés dans le thread Gmail du mail initial (1 max),
 *    annulée si la marque a répondu — même mécanique que le module Outreach.
 *
 * La relance part de la boîte qui a envoyé le mail initial (lastEmailFrom,
 * ex : Ines pour Ski Trip) ; sa signature Gmail est ajoutée automatiquement.
 */

import { prisma } from "@/lib/prisma";
import { sendGmail } from "@/lib/gmail";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";

export const PROJET_RELANCE_BUSINESS_DAYS = 3;
/** Fenêtre pendant laquelle le cron surveille réponses/relances (jours). */
export const PROJET_TRACKING_WINDOW_DAYS = 45;

/* ------------------------------------------------------------------ */
/* Tracking (pixel + liens) — compteurs sur OpportuniteMarque          */
/* ------------------------------------------------------------------ */

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

export function decodeProjetUrlParam(encoded: string): string | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const url = Buffer.from(b64 + pad, "base64").toString("utf-8");
    if (!/^https?:\/\//i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

function rewriteLinks(html: string, oppId: string): string {
  const baseUrl = getBaseUrl();
  return html.replace(
    /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, url: string, after: string) => {
      if (url.includes("/api/email/track/")) return match;
      const encoded = encodeUrlParam(url);
      const newUrl = `${baseUrl}/api/email/track/projet/click?id=${encodeURIComponent(
        oppId
      )}&u=${encoded}`;
      return `<a ${before}href=${quote}${newUrl}${quote}${after}>`;
    }
  );
}

function buildPixelTag(oppId: string): string {
  const baseUrl = getBaseUrl();
  const src = `${baseUrl}/api/email/track/projet/open?id=${encodeURIComponent(oppId)}`;
  return `<img src="${src}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0;visibility:hidden;overflow:hidden;mso-hide:all" />`;
}

export function injectProjetTracking(html: string, oppId: string): string {
  if (!oppId) return html;
  const withLinks = rewriteLinks(html, oppId);
  const pixel = buildPixelTag(oppId);
  if (/<\/body>/i.test(withLinks)) {
    return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${withLinks}${pixel}`;
}

/* ------------------------------------------------------------------ */
/* Relance auto J+3 ouvrés                                             */
/* ------------------------------------------------------------------ */

type OppContact = { firstName?: string; lastName?: string; email?: string; role?: string };

export type ProjetMailContact = { email: string; firstName: string; lastName: string };

/** Contacts dédupliqués (par email) avec prénom/nom pour les variables. */
export function projetOppMailContacts(contacts: unknown): ProjetMailContact[] {
  const arr = Array.isArray(contacts) ? (contacts as OppContact[]) : [];
  const seen = new Set<string>();
  const out: ProjetMailContact[] = [];
  for (const c of arr) {
    const email = String(c?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      firstName: String(c?.firstName || "").trim(),
      lastName: String(c?.lastName || "").trim(),
    });
  }
  return out;
}

/**
 * Variables du composer prospection projet, remplacées PAR CONTACT au moment
 * de l'envoi (chaque contact reçoit son propre mail / thread Gmail) :
 *   {{prenom}} / {{prénom}}, {{nom}}, {{marque}} — espaces et casse tolérés.
 */
export function applyProjetVars(
  text: string,
  vars: { prenom: string; nom: string; marque: string }
): string {
  return text
    .replace(/\{\{\s*pr[eé]nom\s*\}\}/gi, vars.prenom)
    .replace(/\{\{\s*nom\s*\}\}/gi, vars.nom)
    .replace(/\{\{\s*marque\s*\}\}/gi, vars.marque);
}

/** [{ email, firstName, lastName, threadId, repliedAt }] sur OpportuniteMarque. */
export type ProjetEmailThread = {
  email: string;
  firstName: string;
  lastName: string;
  threadId: string;
  repliedAt: string | null;
};

export function parseProjetEmailThreads(value: unknown): ProjetEmailThread[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>)
    .filter((t) => typeof t?.threadId === "string" && typeof t?.email === "string")
    .map((t) => ({
      email: String(t.email),
      firstName: String(t.firstName || ""),
      lastName: String(t.lastName || ""),
      threadId: String(t.threadId),
      repliedAt: typeof t.repliedAt === "string" ? t.repliedAt : null,
    }));
}

/**
 * Template de relance générique. Pas de prénom d'expéditrice en dur :
 * la signature Gmail de la boîte expéditrice est ajoutée à l'envoi.
 */
function buildProjetRelanceBody(firstName: string, nomMarque: string): string {
  const hello = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const brandLine = nomMarque
    ? `concernant notre proposition de collaboration pour <strong>${nomMarque}</strong>`
    : "concernant notre proposition de collaboration";
  return [
    `<p>${hello}</p>`,
    `<p>Je me permets de revenir vers vous ${brandLine}.</p>`,
    `<p>Avez-vous eu l'occasion d'en prendre connaissance ? Je reste à votre disposition pour échanger ou répondre à vos questions.</p>`,
    `<p>Au plaisir d'avoir de vos nouvelles,</p>`,
    `<p>Belle journée,</p>`,
  ].join("");
}

export type ProjetRelanceResult =
  | { ok: true; sent: number }
  | { ok: false; error: string };

/**
 * Relance J+3 dans le(s) thread(s) Gmail du mail de prospection : chaque
 * contact est relancé individuellement dans son propre thread, avec son
 * prénom — sauf ceux qui ont déjà répondu. Une seule relance par mail.
 */
export async function executeProjetRelance(oppId: string): Promise<ProjetRelanceResult> {
  const opp = await prisma.opportuniteMarque.findUnique({ where: { id: oppId } });
  if (!opp) return { ok: false, error: "Opportunité introuvable." };
  if (!opp.lastEmailSentAt) {
    return { ok: false, error: "Aucun mail de prospection envoyé." };
  }
  if (opp.relanceSentAt) {
    return { ok: false, error: "Une relance a déjà été envoyée." };
  }

  // Threads individuels ; fallback legacy : 1 seul thread groupé (anciens envois)
  let threads = parseProjetEmailThreads(opp.emailThreads);
  if (threads.length === 0 && opp.lastEmailThreadId) {
    const contacts = projetOppMailContacts(opp.contacts);
    threads = contacts.slice(0, 1).map((c) => ({
      email: contacts.map((x) => x.email).join(", "),
      firstName: c.firstName,
      lastName: c.lastName,
      threadId: opp.lastEmailThreadId as string,
      repliedAt: opp.emailRepliedAt ? opp.emailRepliedAt.toISOString() : null,
    }));
  }
  const pending = threads.filter((t) => !t.repliedAt);
  if (pending.length === 0) {
    return { ok: false, error: "Tous les contacts ont déjà répondu." };
  }

  const fromEmail = (opp.lastEmailFrom || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
  const subjectSrc = (opp.emailSubject || "").trim() || `Glow Up x ${opp.nomMarque}`;
  const relanceSubject = subjectSrc.toLowerCase().startsWith("re:")
    ? subjectSrc
    : `Re: ${subjectSrc}`;

  let sent = 0;
  let lastError: string | null = null;
  for (const thread of pending) {
    const body = injectProjetTracking(
      buildProjetRelanceBody(thread.firstName, opp.nomMarque),
      opp.id
    );
    try {
      await sendGmail({
        fromEmail,
        to: thread.email,
        subject: applyProjetVars(relanceSubject, {
          prenom: thread.firstName,
          nom: thread.lastName,
          marque: opp.nomMarque,
        }),
        htmlBody: body,
        threadId: thread.threadId,
      });
      sent += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Erreur Gmail inconnue";
      console.warn(`[projet-prospection] relance ${thread.email} (${opp.nomMarque}):`, error);
    }
  }

  if (sent === 0) {
    await prisma.opportuniteMarque.update({
      where: { id: opp.id },
      data: { relanceError: lastError || "Échec de toutes les relances." },
    });
    return { ok: false, error: `Échec Gmail : ${lastError || "aucune relance envoyée"}` };
  }

  await prisma.opportuniteMarque.update({
    where: { id: opp.id },
    data: { relanceSentAt: new Date(), relanceError: lastError },
  });

  console.info(
    `[projet-prospection] relance J+${PROJET_RELANCE_BUSINESS_DAYS} → ${opp.nomMarque} (${sent}/${pending.length} contacts) depuis ${fromEmail}`
  );
  return { ok: true, sent };
}
