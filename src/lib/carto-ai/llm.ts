/**
 * Appels multi-IA pour la carto influence.
 * ChatGPT = moteur principal (qualité des bons profils influence).
 * Claude / x.ai / Apollo = compléments.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { xaiResponse } from "@/lib/xai";
import type {
  CartoAiContactCandidate,
  CartoAiMarche,
  CartoAiSource,
} from "@/lib/carto-ai/types";

function parseMarche(
  raw: unknown,
  localisation: string | null,
  poste: string | null,
  perimetre: string | null
): CartoAiMarche {
  const explicit = String(raw || "")
    .trim()
    .toUpperCase();
  if (explicit === "FR" || explicit === "FRANCE") return "FR";
  if (
    explicit === "EU" ||
    explicit === "EUROPE" ||
    explicit === "EMEA" ||
    explicit === "BE" ||
    explicit === "BENELUX"
  ) {
    return "EU";
  }
  if (
    explicit === "INT" ||
    explicit === "INTERNATIONAL" ||
    explicit === "US" ||
    explicit === "GLOBAL" ||
    explicit === "WORLDWIDE"
  ) {
    return "INT";
  }

  const blob = `${localisation || ""} ${poste || ""} ${perimetre || ""}`.toLowerCase();
  if (
    /\b(france|paris|lyon|marseille|montrouge|france\/|\bfr\b|french market)\b/.test(
      blob
    )
  ) {
    return "FR";
  }
  if (
    /\b(europe|emea|benelux|belgium|belgique|netherlands|luxembourg|germany|deutschland|spain|italia|italy|uk|united kingdom|mid-size zone)\b/.test(
      blob
    )
  ) {
    return "EU";
  }
  if (
    /\b(international|global|worldwide|united states|\busa\b|\bus\b|americas|apac|latam)\b/.test(
      blob
    )
  ) {
    return "INT";
  }
  // Défaut Glow-up : on cherche d'abord la France.
  return "FR";
}

/** Modèle dispo sur la clé Anthropic prod Glow-up. */
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
/** ChatGPT — moteur principal carto. */
const OPENAI_MODEL = "gpt-4.1";
const OPENAI_FALLBACK_MODEL = "gpt-4o";
const XAI_MODEL = "grok-4.20-reasoning";

function stripJsonFence(raw: string): string {
  return raw
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    // Citations / footnotes parfois collées après le JSON (Responses web_search)
    .replace(/【[^】]*】/g, "")
    .replace(/\[[0-9]+\](?=\s|$)/g, "")
    .trim();
}

/** Extrait le 1er tableau/objet JSON équilibré (ignore le texte après). */
function extractBalancedJson(text: string, openChar: "[" | "{"): string | null {
  const closeChar = openChar === "[" ? "]" : "}";
  const start = text.indexOf(openChar);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function repairJsonLoose(s: string): string {
  return s
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function asContactList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.contacts)) return o.contacts;
    if (Array.isArray(o.results)) return o.results;
    if (Array.isArray(o.people)) return o.people;
  }
  return [];
}

/**
 * Parse robuste : ChatGPT/Claude collent parfois du texte après le JSON
 * (« Unexpected non-whitespace character after JSON… »).
 */
function parseContactsJson(raw: string): unknown[] {
  const cleaned = stripJsonFence(raw);
  if (!cleaned) return [];

  const attempts: string[] = [];
  const arr = extractBalancedJson(cleaned, "[");
  if (arr) attempts.push(arr);
  const obj = extractBalancedJson(cleaned, "{");
  if (obj) attempts.push(obj);
  // Fallback naïf (ancien comportement)
  const i0 = cleaned.indexOf("[");
  const i1 = cleaned.lastIndexOf("]");
  if (i0 >= 0 && i1 > i0) attempts.push(cleaned.slice(i0, i1 + 1));

  for (const candidate of attempts) {
    for (const variant of [candidate, repairJsonLoose(candidate)]) {
      try {
        const list = asContactList(JSON.parse(variant));
        if (list.length) return list;
      } catch {
        // try next
      }
    }
  }

  // Dernier recours : objets { ... } individuels
  const objs: unknown[] = [];
  const re = /\{[^{}]*"nom"\s*:\s*"[^"]+"[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    try {
      objs.push(JSON.parse(repairJsonLoose(m[0])));
    } catch {
      // skip
    }
  }
  if (objs.length) {
    console.warn(
      `[carto-ai] parseContactsJson fallback objets isolés n=${objs.length}`
    );
    return objs;
  }

  console.warn(
    "[carto-ai] parseContactsJson échec, preview:",
    cleaned.slice(0, 240).replace(/\n/g, " ")
  );
  return [];
}

function cleanStr(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

function normalizeLinkedin(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!u.hostname.includes("linkedin.com")) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function friendlyProviderError(provider: CartoAiSource, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e || "Erreur");
  if (/429|insufficient_quota|no credits remaining/i.test(msg)) {
    return provider === "chatgpt"
      ? "ChatGPT (moteur principal) : plus de crédits OpenAI — recharge le billing"
      : "Plus de crédits API";
  }
  if (/401|invalid.*api.?key|authentication/i.test(msg)) {
    return `Clé ${provider} invalide`;
  }
  return msg.slice(0, 180);
}

export function mapRawContact(
  raw: unknown,
  provider: CartoAiSource
): CartoAiContactCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const prenom = cleanStr(o.prenom ?? o.firstName ?? o.first_name);
  const nom = cleanStr(o.nom ?? o.lastName ?? o.last_name ?? o.name);
  if (!nom && !prenom) return null;
  const linkedinUrl = normalizeLinkedin(
    cleanStr(o.linkedinUrl ?? o.linkedin_url ?? o.linkedin ?? o.url)
  );
  const poste = cleanStr(o.poste ?? o.title ?? o.role ?? o.job);
  const perimetre = cleanStr(o.perimetre ?? o.scope ?? o.team);
  const localisation = cleanStr(o.localisation ?? o.location ?? o.city);
  return {
    marche: parseMarche(
      o.marche ?? o.market ?? o.geo ?? o.region,
      localisation,
      poste,
      perimetre
    ),
    priorite: cleanStr(o.priorite ?? o.priority),
    prenom,
    nom: nom || prenom || "Contact",
    poste,
    perimetre,
    localisation,
    linkedinUrl,
    note: cleanStr(o.note ?? o.notes ?? o.why),
    sources: [provider],
  };
}

/** Prompt standard (Claude / x.ai). */
export function buildCartoPrompt(opts: {
  company: string;
  domain: string | null;
  language: "fr" | "en";
  max: number;
}): string {
  const domainLine = opts.domain
    ? `Domaine web probable : ${opts.domain}`
    : "Domaine web inconnu — déduis-le si possible.";
  return `Tu es un expert prospection influence marketing (agence créateurs FR).

Marque cible : ${opts.company}
${domainLine}

GÉO — 3 catégories OBLIGATOIRES (champ "marche") :
1) "FR" = France (priorité absolue)
2) "EU" = Europe hors France (Benelux, UK, DE, ES, IT, EMEA mid-size…)
3) "INT" = International hors Europe (US, global HQ, APAC…)
Concentre-toi d'abord sur FR, puis EU, puis INT. Ne remplis INT que si utile.

Mission : cartographie influence = marque + maison-mère + agence influence.

Règles :
- Contacts réels uniquement.
- Influence / Advocacy / Earned & Owned Media (Manager ET Associate/Coordinator) / Press / Partnerships / Social / Account Manager Influence.
- P1 / P2 / P3 + marche FR|EU|INT.
- Maximum ${opts.max}.
- N'oublie pas les Associates Earned Media (ops FR), pas seulement les Managers.

JSON array UNIQUEMENT :
[
  {
    "marche": "FR",
    "priorite": "P1",
    "prenom": "...",
    "nom": "...",
    "poste": "...",
    "perimetre": "...",
    "localisation": "...",
    "linkedinUrl": "https://www.linkedin.com/in/...",
    "note": "pourquoi"
  }
]`;
}

/**
 * Prompt ChatGPT — qualité type réponse NYX (Turner-Cohen / Soriano / WOÔ).
 * ChatGPT = moteur de vérité pour “qui contacter”.
 */
export function buildChatgptCartoPrompt(opts: {
  company: string;
  domain: string | null;
  language: "fr" | "en";
  max: number;
  groundingBlock?: string;
}): string {
  const domainLine = opts.domain
    ? `Site / domaine : ${opts.domain}`
    : "Domaine inconnu — déduis-le (site officiel, LinkedIn company).";
  const grounding = opts.groundingBlock?.trim()
    ? `\n\n${opts.groundingBlock.trim()}\n`
    : "\n\n(Pas de preuves Exa fournies — utilise UNIQUEMENT ta recherche web réelle. Si tu ne trouves rien de solide, renvoie [].)\n";

  return `Tu es LE meilleur researcher organigramme influence pour Glow-up (Paris).
Référence : NYX France → Violette Turner-Cohen (Advocacy & Influence Manager), Agathe Soriano, Orana Sève (WOÔ).
PAS de responsables de boutique. PAS de fausses agences inventées.

OBJECTIF
Pour « ${opts.company} », contacts HQ / groupe / agence influence.
${domainLine}
${grounding}

3 CATÉGORIES GÉO (champ "marche" OBLIGATOIRE) — dans CET ordre de priorité :
1) "FR" = France (marché principal Glow-up — cherche D'ABORD ici)
2) "EU" = Europe hors France (Benelux, UK, DE, ES, IT, EMEA…)
3) "INT" = International hors Europe (US / global / APAC…)
Remplis surtout FR. EU ensuite. INT seulement si vraiment utile pour pitcher depuis la France.

COUCHES (si preuves)
A) Marque influence HQ — Managers ET ops (Associate / Coordinator)
B) Maison-mère / groupe
C) Agence influence réelle + Account Managers

RÔLES À INCLURE (souvent ratés)
- "Earned & Owned Media Associate/Coordinator" (ex. Mathilde Stévenart Meeûs chez MAC & Bobbi Brown) → P2 ops FR, très utile Glow-up
- Press & Influencer Manager / Associate
- Artist Relations, PR & Influence Coordinator
Ne te limite PAS aux titres "Manager" / "Director" : les Associates Earned Media sont des contacts opérationnels clés.

INTERDIT
- Retail / boutique / vendeur / ecommerce sans influence
- Mettre le NOM D'UNE AGENCE en prénom/nom (ex. YKONE/YKONE, Matriochka Influences). Si agence → sors les PERSONNES (Managing Partner, Account Manager…), pas la boîte.
- Noms sans preuve web/LinkedIn
- Emails
- Contaminer avec une autre marque (si le domaine fourni ne correspond pas à la marque, IGNORE le domaine)

P1/P2/P3 + marche FR|EU|INT. Max ${opts.max}. Qualité > quantité.

Objet JSON UNIQUEMENT (rien avant/après, pas de markdown) :
{"contacts":[{"marche":"FR","priorite":"P1","prenom":"Violette","nom":"Turner-Cohen","poste":"Advocacy & Influence Manager — NYX France","perimetre":"NYX / L'Oréal","localisation":"Paris, France","linkedinUrl":"https://www.linkedin.com/in/...","note":"P1 France"}]}`;
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
    const o = item as Record<string, unknown>;
    if (typeof o.text === "string" && o.text.trim()) chunks.push(o.text.trim());
    if (!Array.isArray(o.content)) continue;
    for (const block of o.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string" && b.text.trim()) chunks.push(b.text.trim());
    }
  }
  return chunks.length ? chunks[chunks.length - 1]! : "";
}

async function chatgptViaResponses(
  apiKey: string,
  prompt: string
): Promise<string> {
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
            'Tu es le meilleur researcher carto influence FR. Utilise la recherche web. Réponds UNIQUEMENT avec {"contacts":[...]} — JSON valide, aucun texte avant/après.',
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.15,
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
  if (!text) throw new Error("Réponse ChatGPT (Responses) vide");
  return text;
}

async function chatgptViaChatCompletions(
  apiKey: string,
  prompt: string,
  model: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.15,
    max_tokens: 6000,
    // Objet JSON forcé → évite le texte après le tableau (erreur "non-whitespace after JSON")
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Tu es le moteur PRINCIPAL de cartographie influence pour Glow-up. Réponds UNIQUEMENT avec un objet JSON valide de la forme {"contacts":[...]} — aucun texte avant/après. Chaque contact a: marche, priorite, prenom, nom, poste, perimetre, localisation, linkedinUrl, note. Jamais d\'emails inventés.',
      },
      {
        role: "user",
        content: `${prompt}\n\nIMPORTANT: wrap the array in {"contacts":[...]} only.`,
      },
    ],
  });
  const text = completion.choices[0]?.message?.content || "";
  if (!text.trim()) throw new Error("Réponse ChatGPT vide");
  return text;
}

export async function fetchCartoFromClaude(
  prompt: string
): Promise<{ ok: boolean; error: string | null; contacts: CartoAiContactCandidate[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY manquante", contacts: [] };
  }
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    const rawList = parseContactsJson(text);
    const contacts = rawList
      .map((r) => mapRawContact(r, "claude"))
      .filter((c): c is CartoAiContactCandidate => Boolean(c));
    return { ok: true, error: null, contacts };
  } catch (e) {
    return {
      ok: false,
      error: friendlyProviderError("claude", e),
      contacts: [],
    };
  }
}

export async function fetchCartoFromChatgpt(opts: {
  company: string;
  domain: string | null;
  language: "fr" | "en";
  max: number;
  groundingBlock?: string;
}): Promise<{ ok: boolean; error: string | null; contacts: CartoAiContactCandidate[] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY manquante", contacts: [] };
  }

  const prompt = buildChatgptCartoPrompt(opts);

  try {
    let text: string;
    try {
      // Chemin fort : Responses + web search (si dispo sur le compte)
      text = await chatgptViaResponses(apiKey, prompt);
      console.log("[carto-ai] chatgpt via Responses+web_search");
    } catch (responsesErr) {
      console.warn(
        "[carto-ai] chatgpt Responses fallback chat.completions:",
        responsesErr instanceof Error ? responsesErr.message : responsesErr
      );
      try {
        text = await chatgptViaChatCompletions(apiKey, prompt, OPENAI_MODEL);
      } catch {
        text = await chatgptViaChatCompletions(
          apiKey,
          prompt,
          OPENAI_FALLBACK_MODEL
        );
      }
    }

    const rawList = parseContactsJson(text);
    const contacts = rawList
      .map((r) => mapRawContact(r, "chatgpt"))
      .filter((c): c is CartoAiContactCandidate => Boolean(c));
    if (!contacts.length && text.trim()) {
      console.warn(
        "[carto-ai] chatgpt parse 0 contacts, text preview:",
        text.slice(0, 300).replace(/\n/g, " ")
      );
      return {
        ok: false,
        error: "ChatGPT a répondu mais le JSON était illisible — relance",
        contacts: [],
      };
    }
    return { ok: true, error: null, contacts };
  } catch (e) {
    return {
      ok: false,
      error: friendlyProviderError("chatgpt", e),
      contacts: [],
    };
  }
}

export async function fetchCartoFromXai(
  prompt: string
): Promise<{ ok: boolean; error: string | null; contacts: CartoAiContactCandidate[] }> {
  if (!process.env.XAI_API_KEY?.trim()) {
    return { ok: false, error: "XAI_API_KEY manquante", contacts: [] };
  }
  try {
    const text = await xaiResponse(prompt, {
      model: XAI_MODEL,
      tools: [{ type: "web_search" }, { type: "x_search" }],
      timeoutMs: 110_000,
    });
    const rawList = parseContactsJson(text);
    const contacts = rawList
      .map((r) => mapRawContact(r, "xai"))
      .filter((c): c is CartoAiContactCandidate => Boolean(c));
    return { ok: true, error: null, contacts };
  } catch (e) {
    return {
      ok: false,
      error: friendlyProviderError("xai", e),
      contacts: [],
    };
  }
}
