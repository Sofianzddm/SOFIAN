import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadForReply } from "@/lib/gmail";
import {
  CASTING_RELANCE_DELAY_MS,
  LEYNA_FROM_EMAIL,
  executeCastingRelance,
} from "@/lib/casting-auto-send";

/**
 * Relance J+3 : pour toutes les missions envoyees il y a au moins 3 jours,
 * pas encore relancees, on verifie via l'API Gmail si le thread a recu une
 * reponse. Si oui : on flag `replied=true`. Sinon : on envoie une relance
 * courte dans le meme thread.
 *
 * Frequence : quotidien (cf. vercel.json), ideal le matin.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  const cutoff = new Date(Date.now() - CASTING_RELANCE_DELAY_MS);

  const candidates = await contactMissionModel.findMany({
    where: {
      stage: "SENT",
      sentAt: { lte: cutoff, not: null },
      relanceSentAt: null,
      replied: false,
    },
    select: { id: true, sentMessageIds: true },
    take: 100,
  });

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
