import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";

export const maxDuration = 120;

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

type BriefAnalysisPayload = {
  agence: string;
  marqueFinale: string | null;
  objectif: string;
  criteresTalents: string;
  typeCollab: string;
  deadline: string;
  pointsCles: string;
};

function tryParseBriefJson(raw: string): BriefAnalysisPayload {
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
      const parsed = JSON.parse(c) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed === "object" &&
        "agence" in parsed &&
        "marqueFinale" in parsed &&
        "objectif" in parsed &&
        "criteresTalents" in parsed &&
        "typeCollab" in parsed &&
        "deadline" in parsed &&
        "pointsCles" in parsed
      ) {
        return {
          agence: String(parsed.agence ?? ""),
          marqueFinale:
            parsed.marqueFinale === null || parsed.marqueFinale === "null"
              ? null
              : String(parsed.marqueFinale ?? ""),
          objectif: String(parsed.objectif ?? ""),
          criteresTalents: String(parsed.criteresTalents ?? ""),
          typeCollab: String(parsed.typeCollab ?? ""),
          deadline: String(parsed.deadline ?? ""),
          pointsCles: String(parsed.pointsCles ?? ""),
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

    const body = (await request.json().catch(() => null)) as { brief?: unknown } | null;
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
    if (!brief) {
      return NextResponse.json({ error: "Le champ brief est requis." }, { status: 400 });
    }

    const prompt = `Tu es un expert en marketing d'influence.
Analyse ce brief reçu d'une agence ou marque et extrais
les informations clés pour aider un Casting Manager
à sélectionner les bons talents.

Brief :
${brief}

Réponds UNIQUEMENT en JSON strict sans markdown :
{
  "agence": "nom de l'agence ou marque qui envoie",
  "marqueFinale": "nom de la marque finale si mentionnée, sinon null",
  "objectif": "objectif de la campagne en 1 phrase",
  "criteresTalents": "critères recherchés (audience, niche, taille...)",
  "typeCollab": "type de collaboration si mentionné",
  "deadline": "deadline si mentionnée",
  "pointsCles": "autres points importants à retenir"
}`;

    let text: string;
    try {
      text = await xaiResponse(prompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    try {
      const parsed = tryParseBriefJson(text);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: "Erreur de parsing IA" }, { status: 500 });
    }
  } catch (e) {
    console.error("POST /api/casting/analyze-brief:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'analyse du brief." },
      { status: 500 }
    );
  }
}

