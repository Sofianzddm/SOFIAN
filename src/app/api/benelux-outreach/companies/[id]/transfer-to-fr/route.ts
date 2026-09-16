import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { transferBeneluxToMarque } from "@/lib/crm-market-transfer";

/**
 * POST /api/benelux-outreach/companies/[id]/transfer-to-fr
 *
 * Passe une entreprise BENELUX vers le CRM France :
 * copie contacts + cycles, stoppe les targets BE, conserve la fiche BENELUX.
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
    const result = await transferBeneluxToMarque({
      companyId: id,
      userId: session.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "POST /api/benelux-outreach/companies/[id]/transfer-to-fr:",
      error
    );
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
