import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";

export const maxDuration = 120;

const ALLOWED_ROLES = ["CASTING_MANAGER", "STRATEGY_PLANNER", "ADMIN"] as const;

/** Recherche web + X (posts / buzz) — Agent Tools API x.ai */
const BRAND_RESEARCH_TOOLS = [{ type: "web_search" }, { type: "x_search" }] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export interface BrandResearchPayload {
  recentCampaigns: string;
  newProducts: string;
  brandPositioning: string;
  influenceStrategy: string;
}

function tryParseBrandJson(raw: string): BrandResearchPayload {
  const trimmed = raw.trim();
  const jsonSlice =
    trimmed.includes("{") && trimmed.includes("}")
      ? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
      : trimmed;
  const candidates = [
    trimmed,
    jsonSlice,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "recentCampaigns" in parsed &&
        "newProducts" in parsed &&
        "brandPositioning" in parsed &&
        "influenceStrategy" in parsed
      ) {
        const o = parsed as Record<string, unknown>;
        return {
          recentCampaigns: String(o.recentCampaigns ?? ""),
          newProducts: String(o.newProducts ?? ""),
          brandPositioning: String(o.brandPositioning ?? ""),
          influenceStrategy: String(o.influenceStrategy ?? ""),
        };
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("parse");
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    if (!process.env.XAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Clé XAI_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const brandName =
      typeof body?.brandName === "string" ? body.brandName.trim() : "";
    if (!brandName) {
      return NextResponse.json(
        { error: "Le champ brandName est requis." },
        { status: 400 }
      );
    }

    const prompt = `Tu es un expert en marketing d'influence et en analyse de marques.

Utilise les outils de recherche (web + X) pour identifier **la toute dernière nouveauté** de la marque "${brandName}" (contexte actuel : avril 2026).

Objectif prioritaire : Trouver et décrire précisément **le lancement le plus récent des 3-4 derniers mois** (janvier-avril 2026 si possible, ou fin 2025 si rien de plus récent).

Pour chaque champ JSON, rédige 3 à 5 phrases en français, concrètes et vivantes :

- recentCampaigns : les activations et campagnes les plus récentes (2025-2026), en mettant l'accent sur ce qui est en cours ou très frais.
- newProducts : **la toute dernière nouveauté** (nom exact du parfum/collection, date de lancement, notes clés, vibe). Si plusieurs, priorise le plus récent. Sois précis.
- brandPositioning : le positionnement actuel, ce qui les distingue vraiment aujourd'hui.
- influenceStrategy : comment ils travaillent avec les créateurs en ce moment (type de profils, formats, tonalité).

Règles strictes :
- Priorise toujours la nouveauté la plus récente des derniers mois.
- Sois concret : nom du produit, date approximative, notes ou caractéristiques clés.
- Si tu ne trouves rien de très récent, dis-le clairement au lieu d'inventer.
- Parle comme quelqu'un qui suit vraiment la marque, pas comme un communiqué.

Réponds UNIQUEMENT en JSON strict :

{
  "recentCampaigns": "...",
  "newProducts": "...",
  "brandPositioning": "...",
  "influenceStrategy": "..."
}
`;

    let text: string;
    try {
      text = await xaiResponse(prompt, { tools: [...BRAND_RESEARCH_TOOLS] });
    } catch (e: unknown) {
      console.error("x.ai brand-research:", e);
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    try {
      const parsed = tryParseBrandJson(text);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(
        { error: "Erreur de parsing Grok" },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error("POST /api/casting/brand-research:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la recherche marque." },
      { status: 500 }
    );
  }
}
