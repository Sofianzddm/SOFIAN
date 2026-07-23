import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  queueBeneluxEnrichissement,
  queueMarqueEnrichissement,
} from "@/lib/envoyer-marque-outreach";

/**
 * POST → met les contacts sans email en file d'enrichissement.
 * Body optionnel : { market?: "FR" | "BENELUX" } (défaut FR).
 * id = marqueId (FR) ou companyId (BENELUX).
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { market?: string };
    const market = body.market === "BENELUX" ? "BENELUX" : "FR";

    const result =
      market === "BENELUX"
        ? await queueBeneluxEnrichissement({ companyId: id })
        : await queueMarqueEnrichissement({ marqueId: id });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }
    return NextResponse.json({ ...result, market });
  } catch (error) {
    console.error("POST /api/marques/[id]/queue-enrichissement:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
