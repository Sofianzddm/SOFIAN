import { NextRequest, NextResponse } from "next/server";
import { syncQontoTransactions } from "@/lib/qonto/sync";

/**
 * GET /api/cron/qonto-sync
 *
 * Déclenchée automatiquement par Vercel Cron (cf. vercel.json).
 * Protégée par `Authorization: Bearer ${CRON_SECRET}` que Vercel ajoute
 * automatiquement quand la variable d'env `CRON_SECRET` est définie.
 *
 * Manuel : on peut tester en local avec
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/qonto-sync
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const daysBack = Number(url.searchParams.get("daysBack")) || 7;

    console.log(`⏰ Cron sync Qonto (${daysBack}j)`);
    const stats = await syncQontoTransactions(daysBack);
    console.log(
      `✅ Cron sync OK: ${stats.imported} importées, ${stats.updated} mises à jour, ${stats.skipped} ignorées`
    );

    return NextResponse.json({
      success: true,
      ranAt: new Date().toISOString(),
      daysBack,
      stats,
    });
  } catch (error: unknown) {
    console.error("❌ Erreur cron Qonto sync:", error);
    return NextResponse.json(
      {
        error: "Cron Qonto sync failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
