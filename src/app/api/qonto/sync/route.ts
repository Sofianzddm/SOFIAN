import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncQontoTransactions } from "@/lib/qonto/sync";

/**
 * POST /api/qonto/sync
 * Synchroniser manuellement les transactions Qonto (ADMIN)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const daysBack = Number(body.daysBack) || 30;

    console.log(`🔄 Sync Qonto manuelle (${daysBack}j)`);
    const stats = await syncQontoTransactions(daysBack);
    console.log(
      `✅ Sync terminée: ${stats.imported} importées, ${stats.updated} mises à jour, ${stats.skipped} ignorées`
    );

    return NextResponse.json({
      success: true,
      message: "Synchronisation réussie",
      stats,
    });
  } catch (error: unknown) {
    console.error("❌ Erreur POST /api/qonto/sync:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de la synchronisation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
