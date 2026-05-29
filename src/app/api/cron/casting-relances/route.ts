import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadForReply } from "@/lib/gmail";
import {
  CASTING_RELANCE_BUSINESS_DAYS,
  LEYNA_FROM_EMAIL,
  executeCastingRelance,
} from "@/lib/casting-auto-send";
import { hasBusinessDaysElapsed, isBusinessDay } from "@/lib/business-days";

/**
 * Relance J+3 : pour toutes les missions envoyees il y a au moins
 * `CASTING_RELANCE_BUSINESS_DAYS` jours ouvres (Lun-Ven, Europe/Paris),
 * pas encore relancees, on verifie via l'API Gmail si le thread a recu
 * une reponse. Si oui : on flag `replied=true`. Sinon : on envoie une
 * relance courte dans le meme thread.
 *
 * Frequence : quotidien (cf. vercel.json), ideal le matin.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const now = new Date();
  // On ne relance pas le samedi/dimanche : la relance partira au prochain
  // jour ouvre (cron quotidien 8h, cf. vercel.json).
  if (!isBusinessDay(now)) {
    return NextResponse.json({ processed: 0, skipped: "weekend" });
  }

  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  // Pre-filtre SQL large : N jours ouvres = au minimum N jours calendaires
  // (cas Lun-Jeu) et au maximum N + 2 (cas Jeu-Mar). On filtre donc sur le
  // minimum (N jours calendaires) pour ne rien rater, puis on affine en
  // memoire avec `hasBusinessDaysElapsed` pour exclure les missions envoyees
  // juste avant le week-end.
  const sqlCutoff = new Date(now.getTime() - CASTING_RELANCE_BUSINESS_DAYS * 24 * 60 * 60 * 1000);

  const rawCandidates = await contactMissionModel.findMany({
    where: {
      stage: "SENT",
      sentAt: { lte: sqlCutoff, not: null },
      relanceSentAt: null,
      replied: false,
      // L'utilisateur peut stopper manuellement la relance auto depuis le pipeline
      // ou la page "Mails envoyés". Si `relanceCancelledAt` est defini, on saute.
      relanceCancelledAt: null,
    },
    select: { id: true, sentMessageIds: true, sentAt: true },
    take: 100,
  });

  const candidates = (rawCandidates as Array<{ id: string; sentMessageIds: unknown; sentAt: Date | null }>).filter(
    (row) => row.sentAt && hasBusinessDaysElapsed(new Date(row.sentAt), CASTING_RELANCE_BUSINESS_DAYS, now)
  );

  const results: Array<{
    id: string;
    replied?: boolean;
    succeeded?: number;
    failed?: number;
    error?: string;
  }> = [];

  for (const row of candidates) {
    try {
      const messagesByEmail =
        row.sentMessageIds && typeof row.sentMessageIds === "object"
          ? (row.sentMessageIds as Record<string, { threadId?: string; error?: string }>)
          : {};

      let anyReply = false;
      for (const record of Object.values(messagesByEmail)) {
        if (!record?.threadId || record.error) continue;
        const replied = await checkThreadForReply(LEYNA_FROM_EMAIL, record.threadId);
        if (replied) {
          anyReply = true;
          break;
        }
      }
      if (anyReply) {
        await contactMissionModel.update({
          where: { id: row.id },
          data: { replied: true, stage: "RESPONSE_RECEIVED" },
        });
        results.push({ id: row.id, replied: true });
        continue;
      }

      const outcome = await executeCastingRelance(row.id);
      results.push({
        id: row.id,
        replied: false,
        succeeded: outcome.succeeded,
        failed: outcome.failed,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur inconnue";
      results.push({ id: row.id, error: msg });
      console.error("[cron/casting-relances]", row.id, msg);
    }
  }

  return NextResponse.json({ processed: candidates.length, results });
}
