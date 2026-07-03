import { prisma } from "@/lib/prisma";
import { checkThreadForReply, sendGmail } from "@/lib/gmail";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "@/lib/business-days";

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

const R1_HTML =
  "<p>Bonjour,</p><p>Je me permets de revenir vers vous suite à mon message de quelques jours concernant une collaboration avec nos talents.</p><p>Avez-vous eu l'occasion d'en prendre connaissance ? Je reste disponible pour échanger.</p><p>Belle journée,<br/>Leyna - Glow Up Agence</p>";

const R2_HTML =
  "<p>Bonjour,</p><p>Dernière relance de ma part, je reste disponible pour échanger si le sujet vous intéresse.</p><p>Belle journée,<br/>Leyna - Glow Up Agence</p>";

function extractEmail(fromValue: string): string {
  const trimmed = fromValue.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return trimmed;
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

    const hasReply = await checkThreadForReply(LEYNA_FROM_EMAIL, threadId);
    if (hasReply) {
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
      continue;
    }

    const to =
      demande.kind === "demande"
        ? extractEmail(demande.toEmail)
        : demande.toEmail.trim();
    if (!to || !to.includes("@") || !demande.sujetPret) continue;

    // Rattrapage R1 d'abord : si la R1 n'est jamais partie, on l'envoie
    // toujours en tant que R1 (jamais convertie en R2), même si l'envoi
    // initial est très ancien. La R2 ne pourra partir qu'au passage suivant,
    // une fois la R1 enregistrée et l'espacement respecté.
    if (r1Due) {
      await sendGmail({
        fromEmail: LEYNA_FROM_EMAIL,
        to,
        subject: `Re: ${demande.sujetPret}`,
        htmlBody: R1_HTML,
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
        htmlBody: R2_HTML,
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
    }
  }

  return { processed: rows.length, r1Sent, r2Sent, replied };
}
