import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCastingSend } from "@/lib/casting-auto-send";

/**
 * Filet de securite : si le client a ferme l'onglet pendant les 30s d'attente,
 * personne ne va appeler send-now. Ce cron passe regulierement et envoie
 * toutes les missions dont scheduledSendAt est echu.
 *
 * Frequence recommandee : toutes les 5 minutes (cf. vercel.json).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  const now = new Date();

  const due = await contactMissionModel.findMany({
    where: {
      scheduledSendAt: { lte: now, not: null },
      sentAt: null,
      stage: "TO_SEND",
    },
    select: { id: true },
    take: 50,
  });

  const results: Array<{
    id: string;
    succeeded: number;
    failed: number;
    error?: string;
  }> = [];

  for (const row of due) {
    try {
      const outcome = await executeCastingSend(row.id);
      results.push({
        id: row.id,
        succeeded: outcome.succeeded,
        failed: outcome.failed,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur inconnue";
      results.push({ id: row.id, succeeded: 0, failed: 0, error: msg });
      console.error("[cron/send-scheduled-casting]", row.id, msg);
    }
  }

  return NextResponse.json({ processed: due.length, results });
}
