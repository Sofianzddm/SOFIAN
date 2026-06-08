import { NextRequest, NextResponse } from "next/server";
import { requireComptable } from "@/lib/comptable/auth";
import { getComptaSummary, parsePeriode } from "@/lib/comptable/accounting";

export async function GET(request: NextRequest) {
  const guard = await requireComptable(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periode = parsePeriode(
      searchParams.get("dateDebut"),
      searchParams.get("dateFin")
    );
    const summary = await getComptaSummary(periode);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("Erreur GET /api/comptable/summary:", error);
    return NextResponse.json(
      { error: "Erreur lors du calcul de la synthèse comptable" },
      { status: 500 }
    );
  }
}
