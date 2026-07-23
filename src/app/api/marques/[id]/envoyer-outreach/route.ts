import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { envoyerMarqueEnOutreach } from "@/lib/envoyer-marque-outreach";

/**
 * POST → envoie la carto influence en outreach (gate AO + enrichissement si mails manquants).
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
    const result = await envoyerMarqueEnOutreach({
      marqueId: id,
      userId: session.user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          missingAo: result.missingAo || false,
          missingInfluence: result.missingInfluence || false,
        },
        { status: result.statusCode }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/marques/[id]/envoyer-outreach:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
