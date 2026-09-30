import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

/** Listes HubSpot casting : désactivées (CRM interne uniquement). */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role;
    if (!isAllowed(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      lists: [],
      disabled: true,
      message:
        "Listes HubSpot casting désactivées. Les contacts viennent de la fiche marque (base interne).",
    });
  } catch (e) {
    console.error("GET /api/hubspot/casting/lists:", e);
    return NextResponse.json(
      { error: "Impossible de charger les listes HubSpot." },
      { status: 500 }
    );
  }
}
