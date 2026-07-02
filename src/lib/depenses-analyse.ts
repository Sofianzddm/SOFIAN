/**
 * Analyse IA des justificatifs de dépenses (reçus, factures fournisseurs).
 *
 * L'IA lit la photo / le PDF et en extrait fournisseur, montants, date et
 * une catégorie suggérée. Le résultat sert à :
 *   1. pré-remplir la dépense (plus de saisie manuelle dans 90 % des cas)
 *   2. contrôler la cohérence avec la transaction bancaire liée
 *
 * Fournisseurs : Claude (images + PDF) en premier, bascule sur OpenAI
 * (images uniquement) si la clé Anthropic est absente ou en erreur.
 * L'analyse ne doit JAMAIS bloquer un upload : toute erreur renvoie null.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { DEPENSE_CATEGORIES } from "@/lib/depenses";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const OPENAI_MODEL = "gpt-4o";

/** Formats acceptés par l'API vision de Claude. */
const CLAUDE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export interface AnalyseJustificatif {
  fournisseur: string | null;
  montantTTC: number | null;
  montantTVA: number | null;
  tauxTVA: number | null;
  date: string | null; // ISO YYYY-MM-DD
  categorie: string | null; // Une des DEPENSE_CATEGORIES
  analyseLe: string; // Timestamp ISO de l'analyse
}

const PROMPT = `Tu analyses le justificatif d'une dépense d'entreprise (reçu, ticket, facture fournisseur).

Extrais les informations suivantes et réponds UNIQUEMENT en JSON (pas de markdown) :
{
  "fournisseur": "nom du commerçant / fournisseur, ou null",
  "montantTTC": nombre (montant total TTC payé) ou null,
  "montantTVA": nombre (montant total de TVA) ou null,
  "tauxTVA": nombre (taux de TVA principal en %, ex 20) ou null,
  "date": "date du reçu au format YYYY-MM-DD, ou null",
  "categorie": "une catégorie parmi la liste ci-dessous, ou null"
}

Catégories possibles : ${DEPENSE_CATEGORIES.join(", ")}.

Règles :
- Les montants sont des nombres positifs (pas de symbole €, point décimal).
- S'il y a plusieurs taux de TVA, donne le taux principal et le total de TVA.
- Si une information est illisible ou absente, mets null. N'invente rien.`;

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function parseResult(raw: string): Omit<AnalyseJustificatif, "analyseLe"> | null {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  const fournisseur =
    typeof parsed.fournisseur === "string" && parsed.fournisseur.trim()
      ? parsed.fournisseur.trim()
      : null;
  const categorie =
    typeof parsed.categorie === "string" &&
    (DEPENSE_CATEGORIES as readonly string[]).includes(parsed.categorie)
      ? parsed.categorie
      : null;
  const date =
    typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : null;

  return {
    fournisseur,
    montantTTC: toNum(parsed.montantTTC),
    montantTVA: toNum(parsed.montantTVA),
    tauxTVA: toNum(parsed.tauxTVA),
    date,
    categorie,
  };
}

/**
 * Analyse un justificatif (image ou PDF). Renvoie null si le format n'est
 * pas analysable, si aucune clé API n'est disponible, ou en cas d'erreur.
 */
export async function analyzeJustificatif(
  buffer: Buffer,
  mimeType: string
): Promise<AnalyseJustificatif | null> {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  const isPdf = type === "application/pdf";
  if (!isPdf && !CLAUDE_IMAGE_TYPES.has(type)) return null;

  const base64 = buffer.toString("base64");

  if (process.env.ANTHROPIC_API_KEY) {
    const viaClaude = await analyzeWithClaude(base64, type, isPdf);
    if (viaClaude) return viaClaude;
  }
  // Fallback OpenAI (vision images uniquement, pas de PDF)
  if (process.env.OPENAI_API_KEY && !isPdf) {
    return analyzeWithOpenAI(base64, type);
  }
  return null;
}

async function analyzeWithClaude(
  base64: string,
  type: string,
  isPdf: boolean
): Promise<AnalyseJustificatif | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? {
                  type: "document" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "application/pdf" as const,
                    data: base64,
                  },
                }
              : {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: type as
                      | "image/jpeg"
                      | "image/png"
                      | "image/gif"
                      | "image/webp",
                    data: base64,
                  },
                },
            { type: "text" as const, text: PROMPT },
          ],
        },
      ],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "";
    const result = parseResult(text);
    if (!result) return null;

    return { ...result, analyseLe: new Date().toISOString() };
  } catch (error) {
    console.error("Analyse justificatif (Claude) échouée:", error);
    return null;
  }
}

async function analyzeWithOpenAI(
  base64: string,
  type: string
): Promise<AnalyseJustificatif | null> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 500,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${type};base64,${base64}` },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const result = parseResult(text);
    if (!result) return null;

    return { ...result, analyseLe: new Date().toISOString() };
  } catch (error) {
    console.error("Analyse justificatif (OpenAI) échouée:", error);
    return null;
  }
}
