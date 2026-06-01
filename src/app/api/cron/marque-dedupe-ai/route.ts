import { NextRequest, NextResponse } from "next/server";
import { runMarqueDedupeAiJob, getMarqueDedupeJobConfig } from "@/lib/marque-ai-dedupe";

/**
 * GET /api/cron/marque-dedupe-ai
 *
 * Cron nocturne : détecte les doublons proches, analyse via GPT-4o-mini,
 * enregistre les suggestions et fusionne automatiquement si configuré.
 *
 * Variables d'environnement :
 *   MARQUE_DEDUPE_AI_DRY_RUN=true          (défaut — ne fusionne pas, crée des suggestions)
 *   MARQUE_DEDUPE_AI_AUTO_MERGE=false      (fusion auto si dry_run=false et confiance ≥ seuil)
 *   MARQUE_DEDUPE_AI_AUTO_THRESHOLD=0.95
 *   MARQUE_DEDUPE_AI_REVIEW_THRESHOLD=0.70
 *   MARQUE_DEDUPE_AI_MAX_GROUPS=40
 *   OPENAI_API_KEY                         (requis pour l'analyse floue)
 *
 * Test local :
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "http://localhost:3000/api/cron/marque-dedupe-ai?dryRun=true"
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const dryRunParam = url.searchParams.get("dryRun");
    const autoMergeParam = url.searchParams.get("autoMerge");

    const overrides: Parameters<typeof runMarqueDedupeAiJob>[0] = {};
    if (dryRunParam !== null) overrides.dryRun = dryRunParam === "true";
    if (autoMergeParam !== null) overrides.autoMerge = autoMergeParam === "true";

    const config = getMarqueDedupeJobConfig(overrides);
    console.log(
      `⏰ Cron dédoublonnage marques IA (dryRun=${config.dryRun}, autoMerge=${config.autoMerge})`
    );

    const stats = await runMarqueDedupeAiJob(overrides);

    console.log(
      `✅ Cron dédup marques: ${stats.analyzed} analysés, ${stats.autoMerged} fusionnés, ${stats.pendingReview} en revue`
    );

    return NextResponse.json({
      success: true,
      ranAt: new Date().toISOString(),
      config: {
        dryRun: config.dryRun,
        autoMerge: config.autoMerge,
        autoThreshold: config.autoThreshold,
        reviewThreshold: config.reviewThreshold,
      },
      stats,
    });
  } catch (error: unknown) {
    console.error("❌ Erreur cron marque-dedupe-ai:", error);
    return NextResponse.json(
      {
        error: "Cron marque dedupe failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
