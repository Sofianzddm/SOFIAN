import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadForReply, sendGmail } from "@/lib/gmail";

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

function extractEmail(fromValue: string): string {
  const trimmed = fromValue.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return trimmed;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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
    WHERE "status" = 'traite'
      AND "replied" = false
      AND "gmailSentMessageId" IS NOT NULL
      AND "sentAt" IS NOT NULL
  `) as RelanceRow[];

  const now = Date.now();
  const j3Ms = 3 * 24 * 60 * 60 * 1000;
  const j7Ms = 7 * 24 * 60 * 60 * 1000;

  for (const demande of rows) {
    const threadId = demande.gmailSentMessageId;
    if (!threadId) continue;

    const hasReply = await checkThreadForReply("leyna@glowupagence.fr", threadId);
    if (hasReply) {
      if (demande.kind === "demande") {
        await prisma.$executeRaw`
          UPDATE "DemandeEntrante"
          SET "replied" = true, "status" = 'repondu', "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "inbound_opportunities"
          SET "replied" = true, "status" = 'repondu', "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      }
      continue;
    }

    const sentAtMs = demande.sentAt ? new Date(demande.sentAt).getTime() : null;
    if (!sentAtMs) continue;

    const to = demande.kind === "demande" ? extractEmail(demande.toEmail) : demande.toEmail.trim();
    if (!to || !to.includes("@") || !demande.sujetPret) continue;

    if (now - sentAtMs >= j7Ms && !demande.relance2SentAt) {
      await sendGmail({
        fromEmail: "leyna@glowupagence.fr",
        to,
        subject: `Re: ${demande.sujetPret}`,
        htmlBody:
          "<p>Bonjour,</p><p>Dernière relance de ma part, je reste disponible pour échanger si le sujet vous intéresse.</p><p>Belle journée,<br/>Leyna - Glow Up Agence</p>",
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
            "status" = 'relance_terminee',
            "updatedAt" = NOW()
          WHERE "id" = ${demande.id}
        `;
      }
      continue;
    }

    if (now - sentAtMs >= j3Ms && !demande.relance1SentAt) {
      await sendGmail({
        fromEmail: "leyna@glowupagence.fr",
        to,
        subject: `Re: ${demande.sujetPret}`,
        htmlBody:
          "<p>Bonjour,</p><p>Je me permets de revenir vers vous suite à mon message de quelques jours concernant une collaboration avec nos talents.</p><p>Avez-vous eu l'occasion d'en prendre connaissance ? Je reste disponible pour échanger.</p><p>Belle journée,<br/>Leyna - Glow Up Agence</p>",
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
    }
  }

  return NextResponse.json({ processed: rows.length });
}
