import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";

export const maxDuration = 120;

/**
 * Rédaction IA d'un mail de PROSPECTION AGENCES (B2B agence ↔ agence), distincte
 * du pitch clients : ici on se présente à une agence partenaire, on met en avant
 * nos créateurs, on cherche à comprendre comment travailler ensemble et on
 * demande leurs prochaines campagnes.
 *
 * Sur le marché BENELUX, on précise qu'on est une agence française qui développe
 * le Benelux avec des créateurs benelux (belges / Pays-Bas / Luxembourg).
 *
 * Le corps utilise les mêmes jetons que le composer agences :
 *   {{ contact.firstname }}, {{ agence.nom }}, et un lien roster cliquable
 *   <a href="{{ agence.lien }}">…</a> (remplacé à l'envoi par /partners/{slug}).
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

function isAllowed(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

interface GenerateAgencyEmailBody {
  language?: "fr" | "en";
  market?: "FR" | "BENELUX";
  agencyName?: string;
  contactFirstName?: string;
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
        return { subject: String(o.subject ?? ""), body: String(o.body ?? "") };
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
      | Partial<GenerateAgencyEmailBody>
      | null;

    const language: "fr" | "en" = body?.language === "en" ? "en" : "fr";
    const isBenelux = body?.market === "BENELUX";
    const agencyName = (body?.agencyName || "").trim();
    const firstName = (body?.contactFirstName || "").trim();

    const firstNameToken = firstName || "{{ contact.firstname }}";
    const agencyToken = agencyName || "{{ agence.nom }}";

    const beneluxFr = isBenelux
      ? `\nCONTEXTE MARCHÉ BENELUX (OBLIGATOIRE) : ${agencyToken} est une agence basée au Benelux (Belgique / Pays-Bas / Luxembourg). Tu DOIS indiquer naturellement, tôt dans le mail, que Glow Up Agence est une agence française qui se développe sur le Benelux, avec des créateurs benelux. Une seule phrase, variée à chaque mail, sans argument commercial lourd.\n`
      : "";
    const beneluxEn = isBenelux
      ? `\nBENELUX MARKET CONTEXT (MANDATORY): ${agencyToken} is an agency based in the Benelux (Belgium / Netherlands / Luxembourg). You MUST state naturally, early in the email, that Glow Up Agence is a French agency expanding into the Benelux, with Benelux creators. One sentence, varied every time, no heavy sales pitch.\n`
      : "";

    const creatorsFr = isBenelux ? "nos créateurs benelux" : "nos créateurs";
    const creatorsEn = isBenelux ? "our Benelux creators" : "our creators";

    const PROMPT =
      language === "en"
        ? `You write like a human who works in influencer marketing, not like an AI. You are part of the Glow Up Agence team and you're reaching out to ANOTHER AGENCY (a partner agency), not to a brand. This is a peer-to-peer, agency-to-agency message: the goal is to introduce ourselves, showcase our creators, understand how they work and how we could collaborate, and ask about their upcoming campaigns so we can propose relevant profiles.
Tone: professional, composed, natural and genuine — never corporate, never salesy, never casual. It should read like a real email from a human. No stacked superlatives.

CONTEXT
Agency contacted: ${agencyToken}
${beneluxEn}
STRUCTURE (a logical flow, not a rigid template — vary the wording every time):
- MUST start with: "Hi ${firstNameToken},"
- MUST add right after, on a new line, this EXACT sentence: "I hope you are doing well?"
- Briefly introduce Glow Up Agence and ${creatorsEn} (we represent creators and manage their brand collaborations).
- Make it clear we're reaching out agency-to-agency: we'd like to understand how ${agencyToken} works and how we could collaborate together.
- Ask about their upcoming campaigns / current needs, so we can suggest relevant creators from our roster.
- MUST include the token {{ agence.lien }} on its own, to point to our roster (it is automatically turned into a clickable link — write it as plain text, do NOT wrap it in an <a> tag). E.g. "You can see our roster here: {{ agence.lien }}".
- Propose a short 10-15 minute call next week to introduce our agency and our creators (rephrase naturally, do not copy verbatim).
- Closing: "Best regards,"

FORMATTING
- Body uses \\n for line breaks. Bold only sparingly (agency name at most).
- Keep it concise (a real outreach email, not a wall of text).

PROHIBITIONS
- Never invent campaigns, names or facts. Never mention the villa. No corporate buzzwords. No disparaging comparisons.

Reply ONLY with valid JSON and nothing else:
{
  "subject": "short, human subject line",
  "body": "full email text with \\n line breaks, the {{ agence.lien }} roster token and the {{ contact.firstname }} / {{ agence.nom }} tokens where relevant"
}
`
        : `Tu écris comme un humain qui travaille dans l'influence, pas comme une IA. Tu fais partie de l'équipe Glow Up Agence et tu écris à UNE AUTRE AGENCE (une agence partenaire), pas à une marque. C'est un échange entre agences : l'objectif est de se présenter, mettre en avant nos créateurs, comprendre comment elles travaillent et comment on pourrait collaborer, et demander leurs prochaines campagnes pour proposer des profils pertinents.
Ton : professionnel, posé, naturel et incarné — jamais corporate, jamais commercial calibré, jamais familier. Vouvoiement de rigueur. Ça doit ressembler à un vrai mail écrit par un humain. Pas d'empilement de superlatifs.

CONTEXTE
Agence contactée : ${agencyToken}
${beneluxFr}
STRUCTURE (un fil logique, pas un gabarit rigide — varie les formulations à chaque mail) :
- Commencer OBLIGATOIREMENT par : "Bonjour ${firstNameToken},"
- Ajouter OBLIGATOIREMENT juste après, sur une nouvelle ligne, cette phrase EXACTE : "J'espère que vous allez bien ?"
- Présenter brièvement Glow Up Agence et ${creatorsFr} (nous représentons des créateurs et gérons leurs collaborations avec les marques).
- Dire clairement qu'on s'adresse à eux d'agence à agence : on aimerait comprendre comment ${agencyToken} travaille et comment on pourrait collaborer ensemble.
- Demander leurs prochaines campagnes / besoins actuels, pour pouvoir leur proposer des créateurs pertinents de notre roster.
- Inclure OBLIGATOIREMENT le jeton {{ agence.lien }} pour pointer vers notre roster (il devient automatiquement un lien cliquable — écris-le en texte brut, NE l'entoure PAS d'une balise <a>). Ex. « Vous pouvez voir notre roster ici : {{ agence.lien }} ».
- Proposer un court appel de 10-15 minutes la semaine prochaine pour présenter notre agence et nos créateurs (reformule naturellement, ne recopie pas mot pour mot).
- Clôture : "Belle journée,"

FORMATAGE
- Le corps utilise des \\n pour les sauts de ligne. Gras avec parcimonie (le nom de l'agence au maximum).
- Reste concis (un vrai mail de prospection, pas un pavé).

INTERDITS
- Jamais inventer de campagnes, de noms ou de faits. Jamais mentionner la villa. Pas de jargon corporate. Pas de comparaison dévalorisante.

Réponds UNIQUEMENT avec un JSON valide et rien d'autre :
{
  "subject": "objet court et humain",
  "body": "le texte complet du mail avec des \\n, le jeton roster {{ agence.lien }} et les jetons {{ contact.firstname }} / {{ agence.nom }} là où c'est pertinent"
}
`;

    let text: string;
    try {
      text = await xaiResponse(PROMPT);
    } catch (e: unknown) {
      console.error("x.ai agency generate-email:", e);
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    try {
      const parsed = tryParseEmailJson(text);
      if (!parsed.subject.trim() || !parsed.body.trim()) {
        return NextResponse.json({ error: "Erreur de parsing Grok" }, { status: 500 });
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: "Erreur de parsing Grok" }, { status: 500 });
    }
  } catch (e) {
    console.error("POST /api/agency-outreach/generate-email:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération d'email." },
      { status: 500 }
    );
  }
}
