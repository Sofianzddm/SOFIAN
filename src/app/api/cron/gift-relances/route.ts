import { NextRequest, NextResponse } from "next/server";
import { isBusinessDay, isWithinRelanceHours } from "@/lib/business-days";
import {
  findDueGiftRelances,
  executeGiftRelance,
  GIFT_RELANCE_BUSINESS_DAYS,
} from "@/lib/gifts/gift-auto-relance";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Relance auto gift J+2 ouvrés (IA), boîte Gmail de l'AM.
 * Auth : Bearer CRON_SECRET. Jours ouvrés 8h30–18h30 Paris.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const now = new Date();
  if (!isBusinessDay(now)) {
    return NextResponse.json({ processed: 0, skipped: "weekend" });
  }
  if (!isWithinRelanceHours(now)) {
    return NextResponse.json({ processed: 0, skipped: "hors-heures" });
  }

  const due = await findDueGiftRelances(now);
  const BATCH_CAP = 12;
  const candidates = due.slice(0, BATCH_CAP);

  const results = [];
  for (const row of candidates) {
    try {
      const outcome = await executeGiftRelance({
        demandeGiftId: row.demandeGiftId,
        marqueId: row.marqueId,
      });
      results.push(outcome);
    } catch (e) {
      results.push({
        demandeGiftId: row.demandeGiftId,
        marqueId: row.marqueId,
        marqueNom: row.marque.nom,
        ok: false,
        error: e instanceof Error ? e.message : "Erreur inconnue",
      });
    }
  }

  return NextResponse.json({
    businessDays: GIFT_RELANCE_BUSINESS_DAYS,
    processed: candidates.length,
    due: due.length,
    deferred: Math.max(0, due.length - candidates.length),
    results,
  });
}
