import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getRepartitionParTalent,
  getRepartitionParMarque,
  getRepartitionParSource,
  getPeriodeMoisEnCours,
  PeriodeFilter,
} from "@/lib/finance/analytics";

// GET - Répartitions du CA
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
    const type = searchParams.get("type"); // "talent" | "marque" | "source"
    const dateDebut = searchParams.get("dateDebut");
    const dateFin = searchParams.get("dateFin");
    const limit = parseInt(searchParams.get("limit") || "10");
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

    let repartition;

    switch (type) {
      case "talent":
        repartition = await getRepartitionParTalent(periode, limit);
        break;
      case "marque":
        repartition = await getRepartitionParMarque(periode, limit);
        break;
      case "source":
        repartition = await getRepartitionParSource(periode);
        break;
      default:
        // Retourner toutes les répartitions
        const [talents, marques, sources] = await Promise.all([
          getRepartitionParTalent(periode, limit),
          getRepartitionParMarque(periode, limit),
          getRepartitionParSource(periode),
        ]);
        return NextResponse.json({
          success: true,
          repartitions: {
            talents,
            marques,
            sources,
          },
        });
    }

    return NextResponse.json({
      success: true,
      repartition,
    });
  } catch (error) {
    console.error("Erreur GET /api/finance/repartition:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des répartitions" },
      { status: 500 }
    );
  }
}
