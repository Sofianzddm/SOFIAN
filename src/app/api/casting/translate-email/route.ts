import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";

export const maxDuration = 60;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "STRATEGY_PLANNER",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

interface TranslateEmailBody {
  subject?: string;
  bodyHtml?: string;
  targetLanguage?: "fr" | "en";
}

// Protection des éléments à NE PAS traduire : on les remplace par des sentinelles
// uniques, on traduit, puis on restaure. Bullet-proof contre tout dérapage IA.
type Sentinel = { key: string; value: string };

function protectTokens(input: string): { protectedText: string; sentinels: Sentinel[] } {
  const sentinels: Sentinel[] = [];
  let counter = 0;
  const make = (value: string): string => {
    const key = `§§GLOW${counter++}§§`;
    sentinels.push({ key, value });
    return key;
  };

  // Ordre important : on protège d'abord les liens <a> entiers, puis les autres balises
  // HTML pour éviter que l'IA ne casse les attributs href / class / etc.
  let s = input;

  // 1) Balises <a ...>...</a> : on garde le contenu interne pour traduction
  s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string) => {
    const open = _m.slice(0, _m.indexOf(">") + 1);
    const close = "</a>";
    return `${make(open)}${inner}${make(close)}`;
  });

  // 2) Balises ouvrantes/fermantes "simples" qui ne portent que du style → on les garde telles quelles
  s = s.replace(/<\/?(strong|em|u|b|i|br|p|ul|ol|li|span|div)\b[^>]*\/?>/gi, (m) => make(m));

  // 3) Jetons Handlebars {{ ... }} (HubSpot / pipeline) — TOUS protégés
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

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès refusé pour ce rôle." },
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
      | Partial<TranslateEmailBody>
      | null;
    const subject = String(body?.subject ?? "").trim();
    const bodyHtml = String(body?.bodyHtml ?? "").trim();
    const targetLanguage: "fr" | "en" = body?.targetLanguage === "fr" ? "fr" : "en";

    if (!subject && !bodyHtml) {
      return NextResponse.json(
        { error: "Aucun contenu à traduire (objet et corps vides)." },
        { status: 400 }
      );
    }

    // Protéger tokens / HTML / URLs avant traduction
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
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    let parsed: { subject: string; body: string };
    try {
      parsed = tryParseTranslationJson(text);
    } catch {
      return NextResponse.json(
        { error: "Réponse de traduction invalide." },
        { status: 500 }
      );
    }

    const translatedSubject = restoreTokens(parsed.subject, subjectSentinels);
    const translatedBody = restoreTokens(parsed.body, bodySentinels);

    return NextResponse.json({
      subject: translatedSubject,
      body: translatedBody,
      targetLanguage,
    });
  } catch (e) {
    console.error("POST /api/casting/translate-email:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la traduction." },
      { status: 500 }
    );
  }
}
