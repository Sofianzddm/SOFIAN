/**
 * Prototype « Chat style » pour /lab/carto-pipeline2.
 * Approche: même type de question que ChatGPT web (prose + preuves),
 * via Responses + web_search (+ ancrage Exa), puis structuration JSON.
 * Le scrap carto-pipeline v1 n’est PAS touché.
 *
 * Plus tard (VPS): remplacer runChatDiscover par un driver navigateur
 * sur la session ChatGPT de l’utilisateur.
 */

import { gatherInfluenceGrounding } from "@/lib/carto-ai/exa-grounding";
import { answerMatchesCompany } from "@/lib/carto-chat-vps/answer-match";
import {
  appendEndMarkerInstruction,
  stripEndMarker,
} from "@/lib/carto-chat-vps/end-marker";
import { structureChatAnswer } from "@/lib/carto-chat-vps/structure";
import {
  cartoChatVpsAsk,
  cartoChatVpsAskAsync,
  cartoChatVpsReadLast,
} from "@/lib/carto-chat-vps/vps-client";
import type { CartoChatVpsPreviewResult } from "@/lib/carto-chat-vps/types";

const OPENAI_MODEL = "gpt-4.1";

function buildChatStylePrompt(
  company: string,
  domain: string | null,
  groundingBlock: string | null
): string {
  const domaine = domain ? ` (site ${domain})` : "";
  const grounding = groundingBlock?.trim()
    ? `\n\n## Sources web / LinkedIn (Exa) — utilise-les en priorité\n${groundingBlock.trim()}\n`
    : "";
  return `Tu es un researcher influence / RP senior pour une agence casting française (Glow-up).

Marque: **${company}**${domaine}
Marché prioritaire: France (puis Europe si pertinent).
${grounding}
Réponds comme dans ChatGPT web, en français, structuré, avec preuves. Pas de JSON.
Cherche activement l'agence RP/influence (ex. références "clients", communiqués, offres LinkedIn "compte ${company}").

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

Sois précis et sourcé. Si une piste est forte (ex. agence qui cite ${company} en référence), développe-la. N'invente pas de personnes.`;
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

async function gatherAgencyHints(company: string): Promise<string> {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) return "";
  const queries = [
    `${company} agence RP OR influence OR presse France (187 OR YKONE OR WOÔ OR Matriochka OR LEVELED OR 26PMX)`,
    `"${company}" "relations presse" OR "influence" agence site:.fr`,
    `${company} France communiqué presse agence contact`,
  ];
  const bits: string[] = [];
  for (const query of queries) {
    try {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query,
          type: "auto",
          numResults: 5,
          contents: { text: { maxCharacters: 700 } },
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; text?: string }>;
      };
      for (const r of data.results || []) {
        bits.push(
          `- ${String(r.title || "").trim()}\n  ${String(r.url || "").trim()}\n  ${String(r.text || "").slice(0, 500)}`
        );
      }
    } catch {
      /* ignore */
    }
  }
  if (!bits.length) return "";
  return `### Pistes agences / communiqués\n${bits.slice(0, 12).join("\n\n")}`;
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

  const [grounding, agencyHints] = await Promise.all([
    gatherInfluenceGrounding({ company, domain }),
    gatherAgencyHints(company),
  ]);
  const groundingBlock = [grounding.contextBlock, agencyHints]
    .filter(Boolean)
    .join("\n\n");

  const prompt = buildChatStylePrompt(company, domain, groundingBlock || null);
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

/** Prompt style Sofian / Chat Glow Up. */
export function buildUserChatPrompt(company: string, custom?: string | null): string {
  const c = custom?.trim();
  const base = c
    ? c.includes("{marque}")
      ? c.replaceAll("{marque}", company)
      : c
    : `qui gère l'influence chez ${company} en france en interne et si il y a une agence ?

Réponds en 3 blocs clairement séparés :

## 1. Marque (interne)
Personnes salariées chez ${company} / le groupe qui gèrent influence, créateurs, casting influence, social. Pour chacune: prénom, nom, poste exact, LinkedIn réel (/in/…).

## 2. Agence (mandat principal)
Quelle agence RP / influence travaille avec ${company} en France ? Preuves. Puis les contacts CHEZ CETTE AGENCE (pas chez la marque): prénom, nom, rôle, LinkedIn.

## 3. Autres partenaires
Autres agences / freelances one-shot (historique), clairement notés comme secondaires.

Trie par pertinence casting influence. Ne mélange pas les salariés marque et les gens d'agence. LinkedIn réels uniquement.`;
  return appendEndMarkerInstruction(base);
}

/**
 * Mode VPS / Chrome : tape dans Chat exactement comme toi.
 */
export async function runChatVps(opts: {
  company: string;
  domain?: string | null;
  language?: "fr" | "en";
  /** Override du message (sinon la question influence FR). */
  chatPrompt?: string | null;
}): Promise<CartoChatVpsPreviewResult> {
  const started = Date.now();
  const company = opts.company.trim();
  if (!company) throw new Error("Marque requise");
  const domain = opts.domain?.trim() || null;
  const language = opts.language === "en" ? "en" : "fr";

  const prompt = buildUserChatPrompt(company, opts.chatPrompt);
  let answer: string;
  try {
    const asked = await cartoChatVpsAsk({ prompt, timeoutMs: 540_000 });
    answer = stripEndMarker(asked.answer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Timeout / capture : la réponse est souvent déjà à l'écran.
    // Pas de fallback si le prompt est introuvable (évite de recycler une vieille marque).
    const canReadLast =
      /timeout|timed out|occupé|busy|réponse Chat non lue|fetch failed|headers timeout|UND_ERR|socket hang up|connexion VPS/i.test(
        msg
      ) && !/prompt ChatGPT introuvable|non connecté/i.test(msg);
    if (!canReadLast) throw e;
    console.warn("[carto-chat-vps] ask failed, fallback read-last:", msg);
    const read = await cartoChatVpsReadLast();
    answer = stripEndMarker(read.answer);
  }

  const matchAsk = answerMatchesCompany(answer, company);
  if (!matchAsk.ok) {
    throw new Error(matchAsk.reason);
  }

  let structured = await structureChatAnswer({
    company,
    chatAnswer: answer,
  });

  // Capture trop tôt (0 contact) alors que Chat a fini → relire l'écran
  if (structured.contacts.length === 0) {
    console.warn(
      "[carto-chat-vps] 0 contact après structure — re-read écran"
    );
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const read = await cartoChatVpsReadLast();
      if (read.answer.length > answer.length + 100) {
        answer = read.answer;
      } else if (read.answer.length > 400) {
        answer = read.answer;
      }
      structured = await structureChatAnswer({
        company,
        chatAnswer: answer,
      });
    } catch (e) {
      console.warn(
        "[carto-chat-vps] re-read failed:",
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    company,
    domain,
    language,
    mode: "vps",
    chatAnswer: answer,
    contacts: structured.contacts,
    agencies: structured.agencies,
    meta: {
      model: "chatgpt-web-vps",
      usedWebSearch: true,
      elapsedMs: Date.now() - started,
    },
  };
}

/** Lance Chat async (ne structure pas) — lab poll + read_screen ensuite. */
export async function startChatVps(opts: {
  company: string;
  chatPrompt?: string | null;
}): Promise<{
  ok: true;
  started: true;
  company: string;
  startedAt: number;
  promptPreview: string;
}> {
  const company = opts.company.trim();
  if (!company) throw new Error("Marque requise");
  const prompt = buildUserChatPrompt(company, opts.chatPrompt);
  const started = await cartoChatVpsAskAsync({ prompt, timeoutMs: 540_000 });
  return {
    ok: true,
    started: true,
    company,
    startedAt: started.startedAt,
    promptPreview: started.promptPreview,
  };
}

/** Mode lecture : Chat a fini à l’écran, on récupère sans renvoyer. */
export async function runChatReadScreen(opts: {
  company: string;
  domain?: string | null;
  language?: "fr" | "en";
}): Promise<CartoChatVpsPreviewResult> {
  const started = Date.now();
  const company = opts.company.trim();
  if (!company) throw new Error("Marque requise");

  const read = await cartoChatVpsReadLast();
  const answer = stripEndMarker(read.answer);
  const match = answerMatchesCompany(answer, company);
  if (!match.ok) {
    throw new Error(match.reason);
  }
  const structured = await structureChatAnswer({
    company,
    chatAnswer: answer,
  });

  return {
    company,
    domain: opts.domain?.trim() || null,
    language: opts.language === "en" ? "en" : "fr",
    mode: "vps",
    chatAnswer: answer,
    contacts: structured.contacts,
    agencies: structured.agencies,
    meta: {
      model: "chatgpt-web-read",
      usedWebSearch: true,
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
