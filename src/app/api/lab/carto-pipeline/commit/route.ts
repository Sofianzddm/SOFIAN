import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessCartoAiPipeline } from "@/lib/carto-ai/constants";
import { commitCartoAiPipeline } from "@/lib/carto-ai/run-pipeline";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !canAccessCartoAiPipeline({
        email: session.user.email,
        role: session.user.role,
      })
    ) {
      return NextResponse.json({ error: "Lab non disponible" }, { status: 403 });
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
    const market = body.market === "BENELUX" ? "BENELUX" : "FR";

    const result = await commitCartoAiPipeline({
      company: company || "Marque",
      marqueId,
      domain,
      language,
      market,
      selectedRows: body.selectedRows,
      userId: session.user.id,
      skipAutoEnrich: body.skipAutoEnrich === true,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[carto-ai] commit:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur commit" },
      { status: 500 }
    );
  }
}
