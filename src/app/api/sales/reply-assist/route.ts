import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";

export const maxDuration = 120;

/**
 * Assistant Réponses Sales : la Head of Sales colle un mail reçu (marque,
 * agence, prospect…) et Grok rédige une réponse avenante et vendeuse, prête
 * à copier-coller dans Gmail.
 *
 * Entrée : le mail reçu brut + options (consigne libre, ton, langue, longueur).
 * Sortie : { reply } (texte du mail avec \n) + { subject } suggéré si utile.
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

function isAllowed(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

interface ReplyAssistBody {
  /** Le mail reçu, collé tel quel (texte brut). */
  emailContent?: string;
  /** Consigne libre optionnelle (ex. « propose un call mardi », « décline poliment mais garde la porte ouverte »). */
  instructions?: string;
  /** Langue de la réponse. "auto" = même langue que le mail reçu. */
  language?: "auto" | "fr" | "en";
  /** Tutoiement ou vouvoiement (français uniquement). */
  tone?: "vous" | "tu";
  /** Longueur souhaitée. */
  length?: "court" | "normal" | "detaille";
}

function tryParseReplyJson(raw: string): { subject: string; reply: string } {
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
      if (parsed && typeof parsed === "object" && "reply" in parsed) {
        const o = parsed as Record<string, unknown>;
        return {
          subject: String(o.subject ?? ""),
          reply: String(o.reply ?? ""),
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
        { error: "Accès réservé aux rôles Administrateur ou Head of Sales." },
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
      | Partial<ReplyAssistBody>
      | null;

    const emailContent = String(body?.emailContent ?? "").trim();
    if (!emailContent) {
      return NextResponse.json(
        { error: "Collez le mail reçu avant de générer une réponse." },
        { status: 400 }
      );
    }
    if (emailContent.length > 20_000) {
      return NextResponse.json(
        { error: "Le mail collé est trop long (20 000 caractères max)." },
        { status: 400 }
      );
    }

    const instructions = String(body?.instructions ?? "").trim().slice(0, 2_000);
    const language: "auto" | "fr" | "en" =
      body?.language === "fr" || body?.language === "en" ? body.language : "auto";
    const tone: "vous" | "tu" = body?.tone === "tu" ? "tu" : "vous";
    const length: "court" | "normal" | "detaille" =
      body?.length === "court" || body?.length === "detaille"
        ? body.length
        : "normal";

    const senderName = (session.user.name || "").trim();

    const languageRule =
      language === "fr"
        ? "La réponse est en FRANÇAIS, quelle que soit la langue du mail reçu."
        : language === "en"
          ? "La réponse est en ANGLAIS, quelle que soit la langue du mail reçu."
          : "La réponse est dans la MÊME LANGUE que le mail reçu (détecte-la toi-même).";

    const toneRule =
      tone === "tu"
        ? "Si la réponse est en français : TUTOIEMENT (tu). Reste néanmoins professionnel."
        : "Si la réponse est en français : VOUVOIEMENT (vous), de rigueur.";

    const lengthRule =
      length === "court"
        ? "Réponse COURTE : 3 à 6 phrases maximum, droit au but."
        : length === "detaille"
          ? "Réponse DÉTAILLÉE : tu peux développer les arguments, mais reste un mail lisible (pas un pavé)."
          : "Réponse de longueur normale : un vrai mail, concis mais complet.";

    const PROMPT = `Tu écris comme un humain qui travaille dans le marketing d'influence, pas comme une IA. Tu es Head of Sales chez Glow Up Agence, une agence française qui représente des créateurs de contenu et gère leurs collaborations avec les marques et les agences. Tu réponds à un mail que tu viens de recevoir.

MISSION
Rédige la MEILLEURE réponse possible à ce mail : avenante, chaleureuse et orientée business. Ton objectif de fond est toujours de faire avancer la relation commerciale (obtenir un call, un brief, un budget, une prochaine étape concrète) — mais avec finesse, jamais en mode vendeur agressif.

TON
Professionnel, posé, naturel et incarné. Enthousiaste et positif sans en faire trop. Jamais corporate, jamais robotique, pas d'empilement de superlatifs, pas de jargon marketing creux. Ça doit ressembler à un vrai mail écrit par une vraie personne qui connaît son métier.

MAIL REÇU (réponds à CE mail, en t'appuyant uniquement sur son contenu réel) :
"""
${emailContent}
"""
${instructions ? `\nCONSIGNE PARTICULIÈRE DE L'EXPÉDITRICE (à respecter en priorité) :\n${instructions}\n` : ""}
RÈGLES
- ${languageRule}
- ${toneRule}
- ${lengthRule}
- Réponds précisément aux questions ou demandes du mail reçu. Ne laisse aucune question importante sans réponse.
- Termine toujours par une prochaine étape claire et facile à accepter (ex. proposer un créneau d'appel, envoyer le roster, demander le brief ou les dates).
- Si le mail reçu est une objection ou un refus : réponds avec élégance, garde la porte ouverte, propose une alternative.
- Si le mail demande des informations que tu n'as pas (tarifs précis, disponibilités d'un talent, chiffres) : n'invente RIEN. Mets un espace réservé entre crochets, ex. [tarif à confirmer], [créneau à préciser].
- Commence par une salutation adaptée au mail reçu (reprends le prénom de l'interlocuteur s'il est identifiable).
- Signe simplement avec le prénom${senderName ? ` « ${senderName.split(" ")[0]} »` : ""} en fin de mail (pas de bloc signature complet, il est ajouté par Gmail).
- N'invente jamais de faits, de campagnes, de noms ou de références qui ne sont pas dans le mail reçu.

FORMATAGE
- Le corps utilise des \\n pour les sauts de ligne, en texte brut (pas de HTML, pas de markdown).
- Aère le mail : paragraphes courts.

Réponds UNIQUEMENT avec un JSON valide et rien d'autre :
{
  "subject": "objet suggéré si on ne répond pas dans le fil (sinon reprends l'objet du mail précédé de Re:)",
  "reply": "le texte complet de la réponse avec des \\n"
}`;

    let text: string;
    try {
      text = await xaiResponse(PROMPT);
    } catch (e: unknown) {
      console.error("x.ai sales reply-assist:", e);
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    try {
      const parsed = tryParseReplyJson(text);
      if (!parsed.reply.trim()) {
        return NextResponse.json({ error: "Erreur de parsing Grok" }, { status: 500 });
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: "Erreur de parsing Grok" }, { status: 500 });
    }
  } catch (e) {
    console.error("POST /api/sales/reply-assist:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération de la réponse." },
      { status: 500 }
    );
  }
}
