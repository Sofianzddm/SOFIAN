import { xaiResponse } from "@/lib/xai";

/**
 * Traduction d'emails premium (FR ↔ EN) via x.ai.
 *
 * Protège liens, balises HTML, signature, variables {{…}} et URLs en les
 * remplaçant par des sentinelles uniques avant traduction, puis les restaure.
 * Bullet-proof contre tout dérapage de l'IA.
 *
 * Utilisé par :
 *  - /api/casting/translate-email (bouton « Traduire » du composer)
 *  - /api/outreach/send-bulk (traduction auto à l'envoi pour clients mixtes)
 */

type Sentinel = { key: string; value: string };

function protectTokens(input: string): {
  protectedText: string;
  sentinels: Sentinel[];
} {
  const sentinels: Sentinel[] = [];
  let counter = 0;
  const make = (value: string): string => {
    const key = `§§GLOW${counter++}§§`;
    sentinels.push({ key, value });
    return key;
  };

  let s = input;

  // 1) Balises <a ...>...</a> : on garde le contenu interne pour traduction
  s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string) => {
    const open = _m.slice(0, _m.indexOf(">") + 1);
    const close = "</a>";
    return `${make(open)}${inner}${make(close)}`;
  });

  // 2) Balises ouvrantes/fermantes "simples" (style uniquement)
  s = s.replace(
    /<\/?(strong|em|u|b|i|br|p|ul|ol|li|span|div)\b[^>]*\/?>/gi,
    (m) => make(m)
  );

  // 3) Jetons Handlebars {{ ... }}
  s = s.replace(/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g, (m) => make(m));

  // 4) URLs nues
  s = s.replace(/https?:\/\/[^\s<"']+/g, (m) => make(m));

  return { protectedText: s, sentinels };
}

function restoreTokens(text: string, sentinels: Sentinel[]): string {
  let out = text;
  for (const { key, value } of sentinels) {
    out = out.split(key).join(value);
  }
  return out;
}

function tryParseTranslationJson(raw: string): { subject: string; body: string } {
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

export class TranslateEmailError extends Error {}

export interface TranslateEmailResult {
  subject: string;
  body: string;
  targetLanguage: "fr" | "en";
}

/**
 * Traduit un email vers `targetLanguage`. Lève TranslateEmailError en cas
 * de souci (clé absente, API en erreur, réponse invalide).
 */
export async function translateEmail(args: {
  subject: string;
  bodyHtml: string;
  targetLanguage: "fr" | "en";
}): Promise<TranslateEmailResult> {
  const subject = String(args.subject ?? "").trim();
  const bodyHtml = String(args.bodyHtml ?? "").trim();
  const targetLanguage: "fr" | "en" = args.targetLanguage === "fr" ? "fr" : "en";

  if (!process.env.XAI_API_KEY?.trim()) {
    throw new TranslateEmailError("Clé XAI_API_KEY non configurée sur le serveur.");
  }
  if (!subject && !bodyHtml) {
    throw new TranslateEmailError("Aucun contenu à traduire (objet et corps vides).");
  }

  const { protectedText: protectedSubject, sentinels: subjectSentinels } =
    protectTokens(subject);
  const { protectedText: protectedBody, sentinels: bodySentinels } =
    protectTokens(bodyHtml);

  const sourceLangLabel = targetLanguage === "en" ? "French" : "English";
  const targetLangLabel = targetLanguage === "en" ? "English" : "French";

  const prompt = `You are a professional translator specialized in premium influencer-marketing emails.

Translate the following email from ${sourceLangLabel} to ${targetLangLabel}, keeping a warm, elegant, premium tone (not corporate, not stiff).

ABSOLUTE RULES:
- The text contains sentinel tokens like §§GLOW0§§, §§GLOW1§§, etc. KEEP THEM EXACTLY as-is, in the same positions. NEVER translate, modify, remove or merge them.
- KEEP exact line breaks (\\n) and HTML structure.
- KEEP all email signature norms of the target language (e.g. "Best regards," for English, "Belle journée," for French).
- DO NOT add any new content, footer, or comment. Translate only.
- Keep the same overall length and rhythm.

INPUT (JSON):
{
  "subject": ${JSON.stringify(protectedSubject)},
  "body": ${JSON.stringify(protectedBody)}
}

Reply with ONLY a valid JSON object, nothing else:
{
  "subject": "translated subject with sentinels intact",
  "body": "translated body with sentinels and \\n intact"
}`;

  let text: string;
  try {
    text = await xaiResponse(prompt);
  } catch (e: unknown) {
    console.error("x.ai translate-email:", e);
    throw new TranslateEmailError(
      e instanceof Error ? e.message : "Erreur API x.ai."
    );
  }

  let parsed: { subject: string; body: string };
  try {
    parsed = tryParseTranslationJson(text);
  } catch {
    throw new TranslateEmailError("Réponse de traduction invalide.");
  }

  return {
    subject: restoreTokens(parsed.subject, subjectSentinels),
    body: restoreTokens(parsed.body, bodySentinels),
    targetLanguage,
  };
}
