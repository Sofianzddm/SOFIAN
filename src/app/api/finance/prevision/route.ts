import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrevisionCA } from "@/lib/finance/analytics";

// GET - Prévisions CA
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

    const prevision = await getPrevisionCA();

    return NextResponse.json({
      success: true,
      prevision,
    });
  } catch (error) {
    console.error("Erreur GET /api/finance/prevision:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des prévisions" },
      { status: 500 }
    );
  }
}
