/**
 * Prototype « Chat style » pour /lab/carto-pipeline2.
 * Approche: même type de question que ChatGPT web (prose + preuves),
 * via Responses + web_search, puis structuration JSON.
 * Le scrap carto-pipeline v1 n’est PAS touché.
 *
 * Plus tard (VPS): remplacer runChatDiscover par un driver navigateur
 * sur la session ChatGPT de l’utilisateur.
 */

import { structureChatAnswer } from "@/lib/carto-chat-vps/structure";
import type { CartoChatVpsPreviewResult } from "@/lib/carto-chat-vps/types";

const OPENAI_MODEL = "gpt-4.1";

function buildChatStylePrompt(company: string, domain: string | null): string {
  const domaine = domain ? ` (site ${domain})` : "";
  return `Tu es un researcher influence / RP senior pour une agence casting française (Glow-up).

Marque: **${company}**${domaine}
Marché prioritaire: France (puis Europe si pertinent).

Réponds comme dans ChatGPT web, en français, structuré, avec preuves. Pas de JSON.

## 1. Influence / communication chez la marque (interne)
- Noms + postes (Influence, Brand, Digital, Marketing…)
- LinkedIn si trouvé
- Périmètre FR vs EMEA / groupe

## 2. L'agence qui travaille avec ${company} (France)
- Quelle agence RP / influence / events est la plus solidement liée ?
- Preuves: références site agence, offres LinkedIn, communiqués, events
- Contacts nommés chez l'agence (prénom, nom, rôle, email si publié officiellement)
- Ne confonds pas un mandat UTMB / événement ponctuel avec le mandat marque général

## 3. Autres partenaires
- Autres agences / activations créateurs (avec nuance: mandat fort vs one-shot)

Sois précis et sourcé. Si tu n'es pas sûr, dis-le. N'invente pas de personnes.`;
}

function extractOpenAiResponseText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const output = data.output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; text?: string };
      if ((p.type === "output_text" || p.type === "text") && p.text) {
        chunks.push(p.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

async function chatViaResponses(
  apiKey: string,
  prompt: string
): Promise<{ text: string; model: string; usedWebSearch: boolean }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content:
            "Tu researches l'écosystème influence/RP des marques comme un expert ChatGPT avec navigation web. Réponses riches, sourcées, en français. Pas de JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = data.error as { message?: string } | string | undefined;
    const msg =
      typeof err === "string"
        ? err
        : err?.message || `OpenAI Responses HTTP ${res.status}`;
    throw new Error(msg);
  }
  const text = extractOpenAiResponseText(data);
  if (!text) throw new Error("Réponse Chat vide");
  return { text, model: OPENAI_MODEL, usedWebSearch: true };
}

/** Mode API : simule le Chat web (prose + web_search) puis structure. */
export async function runChatDiscover(opts: {
  company: string;
  domain?: string | null;
  language?: "fr" | "en";
}): Promise<CartoChatVpsPreviewResult> {
  const started = Date.now();
  const company = opts.company.trim();
  if (!company) throw new Error("Marque requise");
  const domain = opts.domain?.trim() || null;
  const language = opts.language === "en" ? "en" : "fr";

  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  const prompt = buildChatStylePrompt(company, domain);
  const chat = await chatViaResponses(apiKey, prompt);
  const structured = await structureChatAnswer({
    company,
    chatAnswer: chat.text,
  });

  return {
    company,
    domain,
    language,
    mode: "api_chat",
    chatAnswer: chat.text,
    contacts: structured.contacts,
    agencies: structured.agencies,
    meta: {
      model: chat.model,
      usedWebSearch: chat.usedWebSearch,
      elapsedMs: Date.now() - started,
    },
  };
}

/** Mode paste : réponse collée depuis ChatGPT web / VPS navigateur. */
export async function runChatPaste(opts: {
  company: string;
  domain?: string | null;
  language?: "fr" | "en";
  chatAnswer: string;
}): Promise<CartoChatVpsPreviewResult> {
  const started = Date.now();
  const company = opts.company.trim();
  const chatAnswer = opts.chatAnswer.trim();
  if (!company) throw new Error("Marque requise");
  if (chatAnswer.length < 40) throw new Error("Colle une réponse Chat plus longue");

  const structured = await structureChatAnswer({ company, chatAnswer });

  return {
    company,
    domain: opts.domain?.trim() || null,
    language: opts.language === "en" ? "en" : "fr",
    mode: "paste",
    chatAnswer,
    contacts: structured.contacts,
    agencies: structured.agencies,
    meta: {
      model: null,
      usedWebSearch: false,
      elapsedMs: Date.now() - started,
    },
  };
}
