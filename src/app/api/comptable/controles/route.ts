import { NextRequest, NextResponse } from "next/server";
import { requireComptable } from "@/lib/comptable/auth";
import {
  getComptaData,
  buildControles,
  parsePeriode,
} from "@/lib/comptable/accounting";

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
    const data = await getComptaData(periode);
    const anomalies = buildControles(data);
    return NextResponse.json({ success: true, anomalies });
  } catch (error) {
    console.error("Erreur GET /api/comptable/controles:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'exécution des contrôles" },
      { status: 500 }
    );
  }
}
