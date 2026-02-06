import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getFinanceStats,
  getPeriodeMoisEnCours,
  getPeriodeAnneeEnCours,
  PeriodeFilter,
} from "@/lib/finance/analytics";

// GET - Stats financières globales
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent accéder aux stats financières
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "mois"; // "mois" | "annee" | "custom"
    const dateDebut = searchParams.get("dateDebut");
    const dateFin = searchParams.get("dateFin");
    const pole = searchParams.get("pole") as "INFLUENCE" | "SALES" | null;

    let periode: PeriodeFilter;

    if (type === "custom" && dateDebut && dateFin) {
      periode = {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        pole: pole || undefined,
      };
    } else if (type === "annee") {
      periode = { ...getPeriodeAnneeEnCours(), pole: pole || undefined };
    } else {
      periode = { ...getPeriodeMoisEnCours(), pole: pole || undefined };
    }

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
