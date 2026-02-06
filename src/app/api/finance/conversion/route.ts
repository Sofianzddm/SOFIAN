import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTauxConversion,
  getPeriodeMoisEnCours,
  PeriodeFilter,
} from "@/lib/finance/analytics";

// GET - Taux de conversion
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const dateDebut = searchParams.get("dateDebut");
    const dateFin = searchParams.get("dateFin");
    const pole = searchParams.get("pole") as "INFLUENCE" | "SALES" | null;

    let periode: PeriodeFilter;

    if (dateDebut && dateFin) {
      periode = {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        pole: pole || undefined,
      };
    } else {
      periode = { ...getPeriodeMoisEnCours(), pole: pole || undefined };
    }

    const conversion = await getTauxConversion(periode);

    return NextResponse.json({
      success: true,
      conversion,
    });
  } catch (error) {
    console.error("Erreur GET /api/finance/conversion:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des taux de conversion" },
      { status: 500 }
    );
  }
}
