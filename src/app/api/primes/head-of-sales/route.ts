import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { calculerPrimeHeadOfSalesFromCA, getSalesCollabsMensuel } from "@/lib/primeCA";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!["HEAD_OF_SALES", "ADMIN"].includes(String(session.user.role))) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const mois = Number(searchParams.get("mois"));
    const annee = Number(searchParams.get("annee"));
    if (!Number.isInteger(mois) || mois < 1 || mois > 12 || !Number.isInteger(annee) || annee < 2020) {
      return NextResponse.json({ error: "mois/annee invalides." }, { status: 400 });
    }

    const collabs = await getSalesCollabsMensuel(mois, annee);
    const ca = collabs.reduce((sum, c) => sum + c.montantBrut, 0);
    const prime = calculerPrimeHeadOfSalesFromCA(ca);
    return NextResponse.json({ prime, collabs });
  } catch (e) {
    console.error("GET /api/primes/head-of-sales:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
