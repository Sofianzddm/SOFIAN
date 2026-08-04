import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getFinanceStats, resolvePeriode } from "@/lib/finance/analytics";

// GET - Stats financières globales
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if ((session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "mois"; // "mois" | "mois-dernier" | "annee" | "custom"
    const dateDebut = searchParams.get("dateDebut");
    const dateFin = searchParams.get("dateFin");
    const pole = searchParams.get("pole") as "INFLUENCE" | "SALES" | null;

    const periode = resolvePeriode({ type, dateDebut, dateFin, pole });
    const stats = await getFinanceStats(periode);

    return NextResponse.json({
      success: true,
      periode: {
        dateDebut: periode.dateDebut,
        dateFin: periode.dateFin,
        type,
      },
      stats,
    });
  } catch (error) {
    console.error("Erreur GET /api/finance/analytics:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des statistiques" },
      { status: 500 }
    );
  }
}
