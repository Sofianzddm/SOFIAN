import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { commitCartoAiPipeline } from "@/lib/carto-ai/run-pipeline";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { enrollMarqueInCannesPartenaires } from "@/lib/cannes-partenaires/enroll";

export const maxDuration = 300;

/**
 * Commit carto Cannes : import contacts sur la fiche marque (même pipeline
 * que le lab) + enrôlement OpportuniteMarque cannes-partenaires.
 * skipAutoEnrich par défaut true (enrich panel côté UI).
 * Isolation stricte : cannesIsolated=true → contacts source CANNES_CARTO,
 * outreachExcluded, pas de file enrichissement, pas d'agences, pas d'enroll FR.
 * Destination métier = OpportuniteMarque cannes-partenaires uniquement.
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
      marqueId?: string;
      domain?: string;
      language?: string;
      market?: string;
      selectedRows?: CartoAiContactCandidate[];
      skipAutoEnrich?: boolean;
    };

    const company = String(body.company || "").trim();
    const marqueId = String(body.marqueId || "").trim() || null;
    if (!company && !marqueId) {
      return NextResponse.json(
        { error: "Sélectionne une fiche client" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.selectedRows) || body.selectedRows.length === 0) {
      return NextResponse.json(
        { error: "Sélectionne au moins un contact" },
        { status: 400 }
      );
    }

    const language = body.language === "en" ? "en" : "fr";
    const domain = String(body.domain || "").trim() || null;
    const marketRaw = String(body.market || "FR").toUpperCase();
    const market =
      marketRaw === "BENELUX" || marketRaw === "BE"
        ? "BENELUX"
        : marketRaw === "BOTH" || marketRaw === "FR+BE" || marketRaw === "FR_BE"
          ? "BOTH"
          : "FR";

    const result = await commitCartoAiPipeline({
      company: company || "Marque",
      marqueId,
      domain,
      language,
      market: "FR", // Cannes = France only
      selectedRows: body.selectedRows,
      userId: session.user.id,
      skipAutoEnrich: true,
      // Isolation totale : hors file /enrichissement + hors cycle outreach FR
      cannesIsolated: true,
    });

    const enroll = await enrollMarqueInCannesPartenaires({
      marqueId: result.marqueId,
      createdById: session.user.id,
      angleNote: "Import carto Cannes Partenaires",
    });

    return NextResponse.json({
      ...result,
      // Jamais /marques/[id] — fiche isolée Cannes Partenaires
      fichePath: `/cannes-partenaires/crm/${enroll.opportuniteId}`,
      cannesOpportunite: enroll,
    });
  } catch (e) {
    console.error("[cannes-partenaires/carto] commit:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur commit" },
      { status: 500 }
    );
  }
}