import { xaiResponse } from "@/lib/xai";
import { protectTokens, restoreTokens } from "@/lib/translate-email";

/**
 * Réécriture tutoiement / vouvoiement d'un email (français) via x.ai.
 *
 * Même mécanique bullet-proof que la traduction (translate-email) : les liens,
 * balises HTML, variables {{…}} et URLs sont remplacés par des sentinelles
 * avant le passage IA puis restaurés. Seuls les pronoms, conjugaisons et
 * formules de politesse changent — pas le contenu ni la structure.
 *
 * Utilisé par /api/casting/rewrite-tone (bouton « Tutoyer » / « Vouvoyer »
 * du composer).
 */

export type EmailTone = "tu" | "vous";

export class RewriteEmailToneError extends Error {}

export interface RewriteEmailToneResult {
  subject: string;
  body: string;
  targetTone: EmailTone;
}

function tryParseRewriteJson(raw: string): { subject: string; body: string } {
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

/**
 * Réécrit l'email en tutoiement (`targetTone: "tu"`) ou en vouvoiement
 * (`targetTone: "vous"`). Lève RewriteEmailToneError en cas de souci.
 */
export async function rewriteEmailTone(args: {
  subject: string;
  bodyHtml: string;
  targetTone: EmailTone;
}): Promise<RewriteEmailToneResult> {
  const subject = String(args.subject ?? "").trim();
  const bodyHtml = String(args.bodyHtml ?? "").trim();
  const targetTone: EmailTone = args.targetTone === "vous" ? "vous" : "tu";

  if (!process.env.XAI_API_KEY?.trim()) {
    throw new RewriteEmailToneError("Clé XAI_API_KEY non configurée sur le serveur.");
  }
  if (!subject && !bodyHtml) {
    throw new RewriteEmailToneError("Aucun contenu à réécrire (objet et corps vides).");
  }

  const { protectedText: protectedSubject, sentinels: subjectSentinels } =
    protectTokens(subject);
  const { protectedText: protectedBody, sentinels: bodySentinels } =
    protectTokens(bodyHtml);

  const toneInstruction =
    targetTone === "tu"
      ? `Rewrite the email so the recipient is addressed informally with "tu" (tutoiement) instead of "vous". Adjust pronouns, verb conjugations, possessives (votre → ton/ta/tes, vos → tes) and greetings/closings naturally (e.g. "J'espère que vous allez bien" → "J'espère que tu vas bien", "Belle journée à vous" → "Belle journée à toi"). Keep the same warm, premium, professional-yet-friendly tone.`
      : `Rewrite the email so the recipient is addressed formally with "vous" (vouvoiement) instead of "tu". Adjust pronouns, verb conjugations, possessives (ton/ta/tes → votre/vos) and greetings/closings naturally (e.g. "J'espère que tu vas bien" → "J'espère que vous allez bien"). Keep the same warm, premium tone.`;

  const prompt = `You are an expert copywriter for premium influencer-marketing emails written in French.

${toneInstruction}

ABSOLUTE RULES:
- The text contains sentinel tokens like §§GLOW0§§, §§GLOW1§§, etc. KEEP THEM EXACTLY as-is, in the same positions. NEVER translate, modify, remove or merge them.
- KEEP exact line breaks (\\n) and HTML structure.
- DO NOT add, remove, reorder or rephrase any content beyond what is strictly required by the tone change (pronouns, conjugations, possessives, greetings).
- DO NOT change proper nouns, brand names, numbers or facts.
- The email stays in French.

INPUT (JSON):
{
  "subject": ${JSON.stringify(protectedSubject)},
  "body": ${JSON.stringify(protectedBody)}
}

Reply with ONLY a valid JSON object, nothing else:
{
  "subject": "rewritten subject with sentinels intact",
  "body": "rewritten body with sentinels and \\n intact"
}`;

  let text: string;
  try {
    text = await xaiResponse(prompt);
  } catch (e: unknown) {
    console.error("x.ai rewrite-email-tone:", e);
    throw new RewriteEmailToneError(
      e instanceof Error ? e.message : "Erreur API x.ai."
    );
  }

  let parsed: { subject: string; body: string };
  try {
    parsed = tryParseRewriteJson(text);
  } catch {
    throw new RewriteEmailToneError("Réponse de réécriture invalide.");
  }

  return {
    subject: restoreTokens(parsed.subject, subjectSentinels),
    body: restoreTokens(parsed.body, bodySentinels),
    targetTone,
  };
}
