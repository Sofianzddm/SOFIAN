import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listFacturesTalentLiables } from "@/lib/depenses";

/**
 * GET /api/depenses/factures-talent?depenseId=xxx
 * Factures talents (uploadées sur les collabs / cycles) disponibles pour
 * justifier une dépense bancaire (débit Defacto, Libeo, virement talent).
 * Inclut celles déjà liées à `depenseId` pour le pré-cochage.
 */
export async function GET(request: NextRequest) {
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

  try {
    const depenseId = request.nextUrl.searchParams.get("depenseId");
    const { collabs, cycles } = await listFacturesTalentLiables(depenseId);
    return NextResponse.json({ collabs, cycles });
  } catch (error) {
    console.error("Erreur GET /api/depenses/factures-talent:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des factures talents" },
      { status: 500 }
    );
  }
}
