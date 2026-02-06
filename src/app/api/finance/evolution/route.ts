import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCAParMois } from "@/lib/finance/analytics";

// GET - Évolution du CA par mois
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
    const nbMois = parseInt(searchParams.get("nbMois") || "12");
    const pole = searchParams.get("pole") as "INFLUENCE" | "SALES" | null;

    const evolution = await getCAParMois(nbMois, pole || undefined);

    return NextResponse.json({
      success: true,
      evolution,
    });
  } catch (error) {
    console.error("Erreur GET /api/finance/evolution:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'évolution" },
      { status: 500 }
    );
  }
}
