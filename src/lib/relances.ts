import { prisma } from "@/lib/prisma";
import { checkThreadActivity, sendGmail } from "@/lib/gmail";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "@/lib/business-days";
import {
  bridgeDemandeEntranteAfterSend,
  bridgeInboundOpportunityAfterSend,
} from "@/lib/outreach-bridge";

const LEYNA_FROM_EMAIL = "leyna@glowupagence.fr";

export const RELANCE_1_BUSINESS_DAYS = 3;
// Espacement entre R1 et R2 (jours ouvrés). En flux normal : R1 à J+3,
// R2 à J+3+4 = J+7. Sur un rattrapage, la R2 part 4 jours ouvrés après la R1
// réellement envoyée, pour ne jamais coller R1 et R2 le même jour.
export const RELANCE_GAP_BUSINESS_DAYS = 4;

type RelanceRow = {
  id: string;
  kind: "demande" | "inbound";
  toEmail: string;
  senderName: string | null;
  contactLanguage: string | null;
  sujetPret: string | null;
  gmailSentMessageId: string | null;
  sentAt: Date | null;
  relance1SentAt: Date | null;
  relance2SentAt: Date | null;
  replied: boolean;
};

export type RelancesResult = {
  processed: number;
  r1Sent: number;
  r2Sent: number;
  replied: number;
  skipped?: "weekend" | "hors-heures";
};

function extractEmail(fromValue: string): string {
  const trimmed = fromValue.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return trimmed;
}

/** Vendredi calendaire Europe/Paris (pour le « bon week-end »). */
function isFridayParis(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
  }).format(date);
  return weekday === "Fri";
}

/**
 * Prénom affichable depuis un nom complet, un header From, ou un email.
 * Ex. "Capucine Brendle <c@…>" → "Capucine" ; "capucine.brendle@…" → "Capucine".
 */
function extractFirstName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let name = raw.trim();
  const beforeAngle = name.match(/^([^<]+)</);
  if (beforeAngle?.[1]) {
    name = beforeAngle[1].trim().replace(/^["']|["']$/g, "");
  } else if (name.includes("@")) {
    name = name.split("@")[0]?.split(/[._+\-]/)[0] || "";
  }
  const first = name.split(/\s+/)[0]?.trim();
  if (!first || first.length < 2) return null;
  if (/^(noreply|no-reply|contact|info|hello|bonjour|team|service)$/i.test(first)) {
    return null;
  }
  if (first === first.toUpperCase() || first === first.toLowerCase()) {
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return first;
}

function resolveRelanceFirstName(row: RelanceRow): string | null {
  if (row.kind === "inbound") {
    return extractFirstName(row.senderName) || extractFirstName(row.toEmail);
  }
  // DemandeEntrante : `toEmail` = header From complet ("Prénom Nom <email>")
  return extractFirstName(row.toEmail);
}

/** Corps R1/R2 façon Leyna : prénom, tutoiement, « bon week-end » le vendredi. */
function buildRelanceHtml(opts: {
  step: 1 | 2;
  firstName: string | null;
  language: "fr" | "en";
  now: Date;
}): string {
  const friday = isFridayParis(opts.now);
  const hello = opts.firstName
    ? `Hello ${opts.firstName},`
    : opts.language === "en"
      ? "Hello,"
      : "Bonjour,";

  if (opts.language === "en") {
    const closing = friday
      ? "Have a lovely day and a great weekend :)"
      : "Have a lovely day !";
    if (opts.step === 1) {
      return `<p>${hello}</p><p>just following up on my previous message — did you get a chance to take a look?</p><p>Happy to chat whenever it works for you.</p><p>${closing}</p>`;
    }
    return `<p>${hello}</p><p>just a quick last follow-up from my side</p><p>Feel free to reply if the topic is still of interest</p><p>${closing}</p>`;
  }

  const closing = friday
    ? "Belle journée ! et bon week-end :)"
    : "Belle journée !";

  if (opts.step === 1) {
    return `<p>${hello}</p><p>je me permets de revenir vers toi suite à mon message de quelques jours concernant une collaboration avec nos talents.</p><p>Tu as eu l'occasion d'en prendre connaissance ? N'hésite pas si tu veux en discuter.</p><p>${closing}</p>`;
  }
  return `<p>${hello}</p><p>je te fais une petite dernière relance</p><p>N'hésite pas si le sujet t'intéresse</p><p>${closing}</p>`;
}

async function pushOutreachAfterInboundExchange(
  kind: "demande" | "inbound",
  id: string,
  label: string
): Promise<void> {
  try {
    if (kind === "demande") {
      await bridgeDemandeEntranteAfterSend(id, null, { label });
    } else {
      await bridgeInboundOpportunityAfterSend(id, null, { label });
    }
  } catch (error) {
    console.warn(`[relances] bridge outreach ${kind} ${id}:`, error);
  }
}

/**
 * Traite les relances automatiques R1 (J+3 ouvrés) et R2 (J+4 ouvrés après R1)
 * pour les demandes entrantes et les opportunités inbound envoyées depuis Leyna.
 *
 * - `ignoreWeekend` : utilisé par le bouton « Relancer maintenant » pour forcer
 *   l'envoi même un week-end ou hors heures de bureau. Le cron le laisse à `false`.
 */
export async function runRelances(
  options: { ignoreWeekend?: boolean } = {}
): Promise<RelancesResult> {
  // Le cron ne relance pas le samedi/dimanche : l'échéance courante reprend
  // au prochain jour ouvré. Le déclenchement manuel peut forcer l'envoi.
  if (!options.ignoreWeekend && !isBusinessDay(new Date())) {
    return { processed: 0, r1Sent: 0, r2Sent: 0, replied: 0, skipped: "weekend" };
  }
  // Pas de relance auto en dehors des heures de bureau (8h30–18h30 Paris) :
  // une échéance qui tombe le soir est reportée au prochain passage dans la
  // fenêtre (le lendemain matin ouvré). Le déclenchement manuel force l'envoi.
  if (!options.ignoreWeekend && !isWithinRelanceHours(new Date())) {
    return { processed: 0, r1Sent: 0, r2Sent: 0, replied: 0, skipped: "hors-heures" };
  }

  const rows = (await prisma.$queryRaw`
    SELECT
      'demande'::text AS "kind",
      "id",
      "from" AS "toEmail",
      NULL::text AS "senderName",
      'fr'::text AS "contactLanguage",
      "sujetPret",
      "gmailSentMessageId",
      "sentAt",
      "relance1SentAt",
      "relance2SentAt",
      "replied"
    FROM "DemandeEntrante"
    WHERE "status" = 'envoye'
      AND "replied" = false
      AND "gmailSentMessageId" IS NOT NULL
      AND "sentAt" IS NOT NULL
    UNION ALL
    SELECT
      'inbound'::text AS "kind",
      "id",
      "senderEmail" AS "toEmail",
      "senderName",
      "contactLanguage",
      COALESCE("draftEmailSubject", "subject") AS "sujetPret",
      "gmailSentMessageId",
      "sentAt",
      "relance1SentAt",
      "relance2SentAt",
      "replied"
    FROM "inbound_opportunities"
    WHERE "status"::text = 'READY'
      AND "replied" = false
      AND "gmailSentMessageId" IS NOT NULL
      AND "sentAt" IS NOT NULL
  `) as RelanceRow[];

  const nowDate = new Date();
  let r1Sent = 0;
  let r2Sent = 0;
  let replied = 0;

  for (const demande of rows) {
    const threadId = demande.gmailSentMessageId;
    if (!threadId) continue;

    const sentAtDate = demande.sentAt ? new Date(demande.sentAt) : null;
    if (!sentAtDate) continue;

    // Échéance ~ à l'heure d'envoi (pas au jour), mais avec un décalage stable
    // anti-robot propre à chaque mail : un mail parti à 17h verra sa R1 partir
    // un peu après 17h le 3e jour ouvré (jamais pile à la même minute). Le cron
    // tourne toutes les 15 min pour coller à cette heure.
    const r1Due =
      !demande.relance1SentAt &&
      relanceDue(sentAtDate, RELANCE_1_BUSINESS_DAYS, demande.id, nowDate);
    const r2Due =
      !!demande.relance1SentAt &&
      !demande.relance2SentAt &&
      relanceDue(
        new Date(demande.relance1SentAt),
        RELANCE_GAP_BUSINESS_DAYS,
        demande.id,
        nowDate
      );

    // Rien à faire pour cette ligne : on ne touche pas à Gmail (économie d'API
    // à cadence 15 min). La détection de réponse se fait au moment où une
    // relance est due, juste avant l'envoi.
    if (!r1Due && !r2Due) continue;

    // Vraie réponse externe uniquement (pas nos R1/R2, pas les bounces).
    // Avant : checkThreadForReply (= messages.length > 1) marquait replied dès
    // que la R1 était dans le thread → R2 jamais envoyée.
    const activity = await checkThreadActivity(LEYNA_FROM_EMAIL, threadId);
    if (activity.replied) {
      replied += 1;
      if (demande.kind === "demande") {
        await prisma.$executeRaw`
          UPDATE "DemandeEntrante"
          SET "replied" = true, "status" = 'repondu', "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "inbound_opportunities"
          SET "replied" = true, "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      }
      await pushOutreachAfterInboundExchange(
        demande.kind,
        demande.id,
        "Réponse client reçue"
      );
      continue;
    }
    // Bounce : inutile de relancer, on saute sans marquer replied.
    if (activity.bounced) continue;

    const to =
      demande.kind === "demande"
        ? extractEmail(demande.toEmail)
        : demande.toEmail.trim();
    if (!to || !to.includes("@") || !demande.sujetPret) continue;

    const firstName = resolveRelanceFirstName(demande);
    const language =
      demande.contactLanguage?.toLowerCase() === "en" ? "en" : "fr";

    // Rattrapage R1 d'abord : si la R1 n'est jamais partie, on l'envoie
    // toujours en tant que R1 (jamais convertie en R2), même si l'envoi
    // initial est très ancien. La R2 ne pourra partir qu'au passage suivant,
    // une fois la R1 enregistrée et l'espacement respecté.
    if (r1Due) {
      await sendGmail({
        fromEmail: LEYNA_FROM_EMAIL,
        to,
        subject: `Re: ${demande.sujetPret}`,
        htmlBody: buildRelanceHtml({
          step: 1,
          firstName,
          language,
          now: nowDate,
        }),
        threadId,
      });
      if (demande.kind === "demande") {
        await prisma.$executeRaw`
          UPDATE "DemandeEntrante"
          SET "relance1SentAt" = NOW(), "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "inbound_opportunities"
          SET "relance1SentAt" = NOW(), "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      }
      r1Sent += 1;
      await pushOutreachAfterInboundExchange(
        demande.kind,
        demande.id,
        "Relance inbound R1 envoyée"
      );
      continue;
    }

    // R2 (dernière) : uniquement après que la R1 soit partie, en respectant
    // l'espacement R1 → R2 (4 jours ouvrés). En flux normal R1 ~ J+3 et donc
    // R2 ~ J+7. Sur un rattrapage, la R2 garde le bon décalage après la R1.
    if (r2Due) {
      await sendGmail({
        fromEmail: LEYNA_FROM_EMAIL,
        to,
        subject: `Re: ${demande.sujetPret}`,
        htmlBody: buildRelanceHtml({
          step: 2,
          firstName,
          language,
          now: nowDate,
        }),
        threadId,
      });
      if (demande.kind === "demande") {
        await prisma.$executeRaw`
          UPDATE "DemandeEntrante"
          SET
            "relance2SentAt" = NOW(),
            "status" = 'relance_terminee',
            "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "inbound_opportunities"
          SET
            "relance2SentAt" = NOW(),
            "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      }
      r2Sent += 1;
      await pushOutreachAfterInboundExchange(
        demande.kind,
        demande.id,
        "Relance inbound R2 envoyée"
      );
    }
  }

  return { processed: rows.length, r1Sent, r2Sent, replied };
}
