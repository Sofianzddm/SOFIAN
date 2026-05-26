import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { refreshTalentSocialStats } from "@/lib/refresh-talent-stats";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * POST /api/talents/[id]/refresh-stats
 *
 * Rafraîchit instantanément les compteurs d'abonnés Instagram & TikTok
 * du talent en allant scraper les profils publics via Apify.
 *
 * Retourne le résultat détaillé (ancien / nouveau / évolution) pour que
 * l'UI puisse afficher un toast et rafraîchir l'affichage.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json(
      {
        error:
          "APIFY_TOKEN manquant. Ajoute la variable d'environnement pour activer la mise à jour automatique des stats.",
      },
      { status: 500 }
    );
  }

  try {
    const result = await refreshTalentSocialStats(id);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("refresh-stats error", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
