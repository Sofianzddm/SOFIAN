import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DepenseError, setFacturesTalentDepense } from "@/lib/depenses";

/**
 * PUT /api/depenses/[id]/factures-talent
 * Body : { collabIds: string[], cycleIds: string[],
 *          tvaCollabIds?: string[], tvaCycleIds?: string[] }
 *
 * `tvaCollabIds` / `tvaCycleIds` : factures dont le talent facture la TVA
 * (montantNet est un HT). Fournis, la TVA déductible du débit est recalculée
 * et enregistrée sur la dépense ; absents, les montants restent inchangés.
 *
 * Justifie une dépense bancaire (débit Defacto / Libeo / virement talent)
 * avec des factures talents déjà uploadées sur les collabs — pas de
 * re-upload. Marque au passage les collabs concernées comme payées.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const ids = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === "string") : [];
    const collabIds = ids(body.collabIds);
    const cycleIds = ids(body.cycleIds);
    const tva =
      "tvaCollabIds" in body || "tvaCycleIds" in body
        ? { collabIds: ids(body.tvaCollabIds), cycleIds: ids(body.tvaCycleIds) }
        : undefined;

    const depense = await setFacturesTalentDepense(id, collabIds, cycleIds, tva);
    return NextResponse.json({ success: true, depense });
  } catch (error) {
    if (error instanceof DepenseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erreur PUT /api/depenses/[id]/factures-talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de la liaison des factures talents" },
      { status: 500 }
    );
  }
}
