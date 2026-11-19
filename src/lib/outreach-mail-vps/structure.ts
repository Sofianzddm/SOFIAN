/**
 * Contabo (prose / HTML sale) → JSON mail propre.
 * Même schéma que carto-pipeline2 `structureChatAnswer` :
 * Chat web écrit, Chat API range.
 */

const OPENAI_MODEL = "gpt-4o-mini";
const MAX_ANSWER_CHARS = 48_000;

export type StructuredOutreachMail = {
  subject: string;
  bodyHtml: string;
  notes: string;
  engine: "openai-structure";
};

function stripJsonFence(raw: string): string {
  return raw
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();
}

function extractJsonObject(text: string): unknown {
  const cleaned = stripJsonFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("JSON mail illisible");
  }
}

function clipAnswer(raw: string): string {
  const s = String(raw || "");
  if (s.length <= MAX_ANSWER_CHARS) return s;
  // Garder la fin (SUBJECT/BODY souvent en queue)
  return s.slice(s.length - MAX_ANSWER_CHARS);
}

function normalizeBodyHtml(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  // Contabo escape parfois les balises
  s = s
    .replace(/\\</g, "<")
    .replace(/\\>/g, ">")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
  if (!s.trim().startsWith("<")) {
    s = s
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }
  return s.trim();
}

async function callStructureModel(opts: {
  apiKey: string;
  system: string;
  user: string;
}): Promise<{ subject: string; bodyHtml: string; notes: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI HTTP ${res.status}`);
  }

  const text = data.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(text) as {
    subject?: unknown;
    bodyHtml?: unknown;
    body?: unknown;
    notes?: unknown;
  };

  const subject = String(parsed.subject || "")
    .trim()
    .replace(/^["«]|["»]$/g, "");
  const bodyHtml = normalizeBodyHtml(
    String(parsed.bodyHtml || parsed.body || "")
  );
  const notes = String(parsed.notes || "").trim();

  if (!subject || subject.length < 8) {
    throw new Error("Structure mail : sujet manquant / trop court");
  }
  if (!bodyHtml || bodyHtml.length < 80) {
    throw new Error("Structure mail : BODY manquant / trop court");
  }

  return { subject, bodyHtml, notes };
}

/**
 * Retranscrit le transcript Contabo en `{ subject, bodyHtml, notes }`.
 * Ne remplace pas les filets `ensure*` / `assert` du job — elle range seulement.
 */
export async function structureOutreachMailAnswer(opts: {
  brandName: string;
  chatAnswer: string;
  joey?: boolean;
  language?: "fr" | "en";
  talentNames?: string[];
}): Promise<StructuredOutreachMail> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  const brand = opts.brandName.trim();
  if (!brand) throw new Error("Marque requise");
  const fullAnswer = String(opts.chatAnswer || "").trim();
  if (fullAnswer.length < 80) {
    throw new Error("Transcript serveur trop court pour structure");
  }

  const answerForModel = clipAnswer(fullAnswer);
  const talents = (opts.talentNames || [])
    .map((n) => String(n || "").trim())
    .filter(Boolean);
  const lang = opts.language === "en" ? "en" : "fr";
  const joey = Boolean(opts.joey);

  const talentRule =
    talents.length > 0
      ? `- Inclus 1 puce • / <li> pour CHAQUE talent : ${talents.join(", ")}.
- Garde les pitches serveur (ne vide pas, n'invente pas de talents hors liste / transcript).`
      : `- Garde toutes les puces talents présentes dans le transcript (ne pas en inventer).`;

  const joeyRule = joey
    ? `- Expéditeur Joey : après « J'espère… », intro « je viens de rejoindre le pôle Business Development ».
- Tutoiement ou vouvoiement selon le transcript ; CTA 15 minutes + clôture « Au plaisir… ».`
    : `- Expéditeur Leyna / BD classique : pas d'intro Joey inventée.
- Conserve le ton (tu/vous) du transcript.`;

  const { subject, bodyHtml, notes } = await callStructureModel({
    apiKey,
    system:
      "Tu structures des mails de prospection Glow Up en JSON strict. Tu ranges / nettoies — tu n'inventes pas le brief.",
    user: `Tu extrais le mail de prospection depuis le transcript serveur.

Marque: ${brand}
Langue: ${lang}
Mode: ${joey ? "Joey cold" : "Leyna / historique"}

Extrais UNIQUEMENT un JSON:
{
  "subject":"…",
  "bodyHtml":"<p>…</p>",
  "notes":"dossier NOTES serveur si présent, sinon \\"\\""
}

Règles BODY (critique):
- HTML email propre : <p>, <ul>/<li> ou •, <strong>, <a href> — PAS de markdown.
- Salut avec {{ contact.firstname }} (ne pas coller un vrai prénom CRM).
- INTERDIT : consignes prompt, « FIN DE BODY », « structure gold », « checklist », NOTES dans le body, backslashes avant balises.
- INTERDIT : recopier le prompt / les règles — uniquement le mail envoyable.
${talentRule}
${joeyRule}
- Sujet : accroche réelle serveur (marque x Glow Up — …), pas un placeholder.
- notes : uniquement le dossier post-mail (historique / alertes), jamais collé dans bodyHtml.
- Si plusieurs SUBJECT/BODY dans le transcript : prends le DERNIER mail complet et propre.

Transcript serveur (${fullAnswer.length} caractères):
"""
${answerForModel}
"""

Réponds JSON pur.`,
  });

  return {
    subject,
    bodyHtml,
    notes,
    engine: "openai-structure",
  };
}
