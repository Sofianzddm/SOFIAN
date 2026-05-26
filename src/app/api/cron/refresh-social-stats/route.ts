import { NextRequest, NextResponse } from "next/server";
import { refreshAllTalentsSocialStats } from "@/lib/refresh-talent-stats";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// La tâche peut prendre plusieurs minutes (100 talents × 2 plateformes via Apify)
export const maxDuration = 300;

/**
 * GET /api/cron/refresh-social-stats
 *
 * Cron quotidien (cf. vercel.json) qui met à jour les compteurs d'abonnés
 * Instagram & TikTok de tous les talents ayant un handle renseigné.
 *
 * Protégée par `Authorization: Bearer ${CRON_SECRET}` que Vercel ajoute
 * automatiquement quand la variable d'env est définie.
 *
 * Manuel : `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh-social-stats`
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json(
      { error: "APIFY_TOKEN manquant" },
      { status: 500 }
    );
  }

  console.log("⏰ Cron refresh-social-stats start");
  const t0 = Date.now();

  try {
    const stats = await refreshAllTalentsSocialStats();
    const ms = Date.now() - t0;
    console.log(
      `✅ Cron refresh-social-stats OK en ${(ms / 1000).toFixed(1)}s — ` +
        `${stats.ok} OK / ${stats.failed} échecs sur ${stats.total} talents`
    );

    return NextResponse.json({
      success: true,
      ranAt: new Date().toISOString(),
      durationMs: ms,
      total: stats.total,
      ok: stats.ok,
      failed: stats.failed,
      // On renvoie un résumé compact (pas tous les détails pour ne pas exploser
      // les logs Vercel)
      sample: stats.results.slice(0, 5).map((r) => ({
        talentId: r.talentId,
        ig: r.instagram.after,
        tt: r.tiktok.after,
        changed: r.changed,
      })),
    });
  } catch (error: unknown) {
    console.error("❌ Erreur cron refresh-social-stats:", error);
    return NextResponse.json(
      {
        error: "Cron refresh-social-stats failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
