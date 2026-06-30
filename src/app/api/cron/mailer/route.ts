import { NextRequest, NextResponse } from "next/server";
import {
  processScheduledMails,
  processMailFollowups,
} from "@/lib/admin-mailer";

/**
 * Cron du rédacteur de mails admin :
 *  1) envoie les mails programmés dont l'échéance est atteinte
 *  2) détecte les réponses et envoie les relances échues
 *
 * Fréquence recommandée : toutes les 5 minutes (cf. vercel.json).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const scheduled = await processScheduledMails();
  const followups = await processMailFollowups();

  return NextResponse.json({ scheduled, followups });
}
