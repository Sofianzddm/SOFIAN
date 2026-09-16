import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { transferMarqueToBenelux } from "@/lib/crm-market-transfer";

/**
 * POST /api/marques/[id]/transfer-to-benelux
 *
 * Passe une fiche CRM France vers l'annuaire BENELUX :
 * copie contacts + cycles, stoppe les targets FR, conserve la Marque FR.
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
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await transferMarqueToBenelux({
      marqueId: id,
      userId: session.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/marques/[id]/transfer-to-benelux:", error);
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur serveur",
      },
      { status: statusCode || 500 }
    );
  }
}
