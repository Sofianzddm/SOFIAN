import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";

export const maxDuration = 120;

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export interface TalentPayload {
  name: string;
  niche: string;
  followers: number;
  engagementRate?: number;
}

export interface GenerateEmailBody {
  brandName: string;
  brandResearch: {
    recentCampaigns: string;
    newProducts: string;
    brandPositioning: string;
    influenceStrategy: string;
  };
  talents: TalentPayload[];
}

function tryParseEmailJson(raw: string): { subject: string; body: string } {
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
        "subject" in parsed &&
        "body" in parsed
      ) {
        const o = parsed as Record<string, unknown>;
        return {
          subject: String(o.subject ?? ""),
          body: String(o.body ?? ""),
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

    const body = (await request.json().catch(() => null)) as
      | Partial<GenerateEmailBody>
      | null;
    if (!body?.brandName?.trim() || !body.brandResearch || !Array.isArray(body.talents)) {
      return NextResponse.json(
        { error: "Requête invalide : brandName, brandResearch et talents requis." },
        { status: 400 }
      );
    }

    const brandName = body.brandName.trim();
    const { newProducts, brandPositioning } = body.brandResearch;

    const talentsString = body.talents
      .map((t) => {
        const eng =
          typeof t.engagementRate === "number" && !Number.isNaN(t.engagementRate)
            ? `, ${t.engagementRate}% engagement`
            : "";
        return `- ${t.name} (${t.niche}, ${t.followers.toLocaleString("fr-FR")} abonnés${eng})`;
      })
      .join("\n\n");

    const GROK_SYSTEM_PROMPT = `Tu es un copywriter senior chez Glow Up Agence, spécialisé dans les mails de prospection haut de gamme.

Tu dois rédiger des mails extrêmement fluides, élégants et percutants.

Ne jamais utiliser de Markdown (**, *, #, etc.). Utilise uniquement du texte brut sans aucune mise en forme.

CONTEXTE ACTUEL : avril 2026
Marque : ${brandName}
Nouveautés / collections à citer en priorité : ${newProducts}
Positionnement : ${brandPositioning}
Talents disponibles : ${talentsString}

VARIABLES HUBSPOT OBLIGATOIRES :
- {{ contact.firstname }}
- {{ contact.company }} (mettre en **gras** quand tu l'utilises)
- {{ owner.firstname }}

STYLE EXACT À REPRODUIRE À CHAQUE FOIS (ne jamais dévier) :
1. Commencer par : "Bonjour {{ contact.firstname }},"
2. Première phrase : une variation fluide et naturelle autour de "On a immédiatement pensé à {{ contact.company }} en regardant nos talents."
3. Citer précisément la nouveauté la plus récente ou la plus forte (phrase courte, élégante et impactante).
4. Expliquer le fit de façon naturelle, précise et séduisante.
5. Transition obligatoire vers les talents : "Ça nous a fait penser à quelques créateurs qui pourraient parfaitement correspondre à votre univers :"
6. Lister les talents en format clair et aéré :
   - Nom (nombre d'abonnés – Catégorie) → raison courte (10-15 mots max) mais très pertinente et intelligente
7. Phrase de transition OBLIGATOIRE : "Ces profils apportent à la fois une belle notoriété, une vraie crédibilité [catégorie] et une capacité à créer du contenu vécu qui colle à votre direction actuelle."
8. Phrase collaboration : "Nous serions ravis d'explorer une collaboration sur le long terme (campagnes saisonnières, prises de parole, ambassadrices…)."
9. CTA exact : "Seriez-vous disponible pour un échange de 15 minutes dans les prochains jours ? Je suis dispo mardi ou mercredi après-midi."
10. Clôture : "Belle journée," puis {{ owner.firstname }} Glow Up Agence

FORMATAGE OBLIGATOIRE :
- Utilise **gras** Markdown pour le nom de la marque et les produits phares.
- Aère bien la liste des talents avec des tirets.
- Phrases courtes, rythmées, élégantes et directes. Ton chaleureux mais premium.

INTERDITS STRICTS :
- Jamais mentionner la villa.
- Jamais de ton corporate ou formel.
- Jamais inventer de faits ou de campagnes.

Réponds UNIQUEMENT avec un JSON valide et rien d'autre :
IMPORTANT : texte brut uniquement, zéro Markdown, zéro astérisque.
{
  "subject": "titre court et premium",
  "body": "le texte complet du mail avec \\n pour les sauts de ligne et **gras** Markdown"
}
`;

    let text: string;
    try {
      text = await xaiResponse(GROK_SYSTEM_PROMPT);
    } catch (e: unknown) {
      console.error("x.ai generate-email:", e);
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    try {
      const parsed = tryParseEmailJson(text);
      if (!parsed.subject.trim() || !parsed.body.trim()) {
        return NextResponse.json(
          { error: "Erreur de parsing Grok" },
          { status: 500 }
        );
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(
        { error: "Erreur de parsing Grok" },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error("POST /api/casting/generate-email:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération d’email." },
      { status: 500 }
    );
  }
}
