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

export function projetOppRecipients(contacts: unknown): string[] {
  const arr = Array.isArray(contacts) ? (contacts as OppContact[]) : [];
  return Array.from(
    new Set(
      arr
        .map((c) => String(c?.email || "").trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )
  );
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
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Relance J+3 dans le thread Gmail du mail de prospection. Une seule relance
 * par mail ; sautée si la marque a déjà répondu.
 */
export async function executeProjetRelance(oppId: string): Promise<ProjetRelanceResult> {
  const opp = await prisma.opportuniteMarque.findUnique({ where: { id: oppId } });
  if (!opp) return { ok: false, error: "Opportunité introuvable." };
  if (!opp.lastEmailSentAt || !opp.lastEmailThreadId) {
    return { ok: false, error: "Aucun mail de prospection envoyé." };
  }
  if (opp.relanceSentAt) {
    return { ok: false, error: "Une relance a déjà été envoyée." };
  }
  if (opp.emailRepliedAt) {
    return { ok: false, error: "La marque a déjà répondu." };
  }

  const recipients = projetOppRecipients(opp.contacts);
  if (recipients.length === 0) {
    return { ok: false, error: "Aucun contact avec email valide." };
  }

  const fromEmail = (opp.lastEmailFrom || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
  const subjectSrc = (opp.emailSubject || "").trim() || `Glow Up x ${opp.nomMarque}`;
  const relanceSubject = subjectSrc.toLowerCase().startsWith("re:")
    ? subjectSrc
    : `Re: ${subjectSrc}`;

  const contacts = Array.isArray(opp.contacts) ? (opp.contacts as OppContact[]) : [];
  const firstName = String(contacts[0]?.firstName || "").trim();
  const body = injectProjetTracking(
    buildProjetRelanceBody(firstName, opp.nomMarque),
    opp.id
  );

  try {
    const messageId = await sendGmail({
      fromEmail,
      to: recipients.join(", "),
      subject: relanceSubject,
      htmlBody: body,
      threadId: opp.lastEmailThreadId,
    });

    await prisma.opportuniteMarque.update({
      where: { id: opp.id },
      data: { relanceSentAt: new Date(), relanceError: null },
    });

    console.info(
      `[projet-prospection] relance J+${PROJET_RELANCE_BUSINESS_DAYS} → ${opp.nomMarque} (${recipients.join(", ")}) depuis ${fromEmail}`
    );
    return { ok: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
    await prisma.opportuniteMarque.update({
      where: { id: opp.id },
      data: { relanceError: msg },
    });
    return { ok: false, error: `Échec Gmail : ${msg}` };
  }
}
