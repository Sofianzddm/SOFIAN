import { NextRequest, NextResponse } from "next/server";
import { runRelances } from "@/lib/relances";
import {
  runOutreachBridgeSweep,
  runCrmDormantEnrollSweep,
} from "@/lib/outreach-bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const result = await runRelances();

  // Pont vers le cycle outreach 45j : les inbound / demandes entrantes dont
  // l'échange est clôturé rejoignent le pipeline outreach (aucun envoi de mail
  // ici, donc pas de garde-fou week-end / heures de bureau).
  let bridge = null;
  try {
    bridge = await runOutreachBridgeSweep();
  } catch (error) {
    console.error("[cron/relances] sweep pont outreach:", error);
  }

  // Filet « aucune fiche ne dort » : les contacts CRM avec email, dans aucun
  // pipeline et sans échange récent, entrent en TO_CONTACT par petits lots
  // (aucun envoi de mail ici non plus).
  let crmEnroll = null;
  try {
    crmEnroll = await runCrmDormantEnrollSweep();
  } catch (error) {
    console.error("[cron/relances] sweep contacts CRM dormants:", error);
  }

  return NextResponse.json({ ...result, bridge, crmEnroll });
}
