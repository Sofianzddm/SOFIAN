import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { domainFromWebsite } from "@/lib/email-pattern";
import { compareEnrichmentProviders } from "@/lib/enrichment/compare";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { cannesContactWhere } from "@/lib/cannes-partenaires/contacts";

/**
 * Enrich Apollo/Lusha pour Cannes — accessible STRATEGY_PLANNER.
 * Ne touche pas aux routes /api/outreach/email-lookup/*.
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
      prenom?: string;
      nom?: string;
      linkedinUrl?: string;
      company?: string;
      refs?: Array<{ id?: string; market?: string }>;
    };

    const nom = String(body.nom || "").trim();
    if (!nom) {
      return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    }

    let company = String(body.company || "").trim() || null;
    let domain: string | null = null;
    const refId = body.refs?.[0]?.id;
    if (refId) {
      const c = await prisma.marqueContact.findFirst({
        where: { id: String(refId), ...cannesContactWhere },
        select: {
          marque: { select: { nom: true, siteWeb: true } },
        },
      });
      if (c) {
        company = company || c.marque.nom;
        domain = domainFromWebsite(c.marque.siteWeb);
      }
    }

    const result = await compareEnrichmentProviders({
      prenom: body.prenom ? String(body.prenom).trim() : null,
      nom,
      linkedinUrl: body.linkedinUrl ? String(body.linkedinUrl).trim() : null,
      company,
      domain,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[cannes] enrich:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur enrichissement" },
      { status: 500 }
    );
  }
}