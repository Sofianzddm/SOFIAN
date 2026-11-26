import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { commitCannesCartoContacts } from "@/lib/cannes-partenaires/commit-contacts";

export const maxDuration = 300;

/**
 * Commit carto Cannes → table cannes_contacts (isolée).
 * Ne crée plus de MarqueContact sur le CRM Marques.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      company?: string;
      domain?: string;
      language?: string;
      selectedRows?: CartoAiContactCandidate[];
    };

    const company = String(body.company || "").trim();
    if (!company) {
      return NextResponse.json(
        { error: "Nom de marque requis" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.selectedRows) || body.selectedRows.length === 0) {
      return NextResponse.json(
        { error: "Sélectionne au moins un contact" },
        { status: 400 }
      );
    }

    const result = await commitCannesCartoContacts({
      company,
      domain: String(body.domain || "").trim() || null,
      language: body.language === "en" ? "en" : "fr",
      selectedRows: body.selectedRows,
      createdById: session.user.id,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[cannes-partenaires/carto] commit:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur commit" },
      { status: 500 }
    );
  }
}
