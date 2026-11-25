/**
 * Prose Chat CANNES_BRANDS → cartes marques structurées + match pipeline.
 */

import prisma from "@/lib/prisma";
import { CANNES_PARTENAIRES_SLUG } from "@/lib/cannes-partenaires/constants";

const OPENAI_MODEL = "gpt-4o-mini";
const MAX_ANSWER_CHARS = 90_000;

export type CannesBrandIdea = {
  nom: string;
  secteur: string | null;
  priorite: "P1" | "P2" | "P3";
  /** HISTORIQUE = déjà à Cannes les années précédentes ; POTENTIEL = pourrait y être */
  typologie: "HISTORIQUE" | "POTENTIEL";
  whyContact: string;
  suggestedAngle: string;
  signals: string | null;
  alreadyInPipeline: boolean;
  marqueId: string | null;
};

export type CannesBrandsStructured = {
  summary: string;
  brands: CannesBrandIdea[];
};

function stripLoneSurrogates(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i]! + s[i + 1]!;
        i++;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += s[i]!;
  }
  return out;
}

function sanitizeOpenAiText(raw: string): string {
  return stripLoneSurrogates(
    String(raw || "").replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
      " "
    )
  );
}

function clipAnswer(full: string): string {
  const clean = sanitizeOpenAiText(full);
  if (clean.length <= MAX_ANSWER_CHARS) return clean;
  return `${clean.slice(0, 70_000)}\n…\n${clean.slice(-20_000)}`;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function extractJsonObject(text: string): Record<string, unknown> {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("JSON invalide (structure marques Cannes)");
  }
}

function normalizePriorite(v: unknown): "P1" | "P2" | "P3" {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (s === "P1" || s === "1" || s === "HAUTE" || s === "HIGH") return "P1";
  if (s === "P3" || s === "3" || s === "BASSE" || s === "LOW") return "P3";
  return "P2";
}

function normalizeTypologie(v: unknown): "HISTORIQUE" | "POTENTIEL" {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (
    s.includes("HISTOR") ||
    s.includes("DEJA") ||
    s.includes("DÉJÀ") ||
    s.includes("PASSEE") ||
    s.includes("PASSÉE") ||
    s.includes("PREVIOUS")
  ) {
    return "HISTORIQUE";
  }
  return "POTENTIEL";
}

async function matchMarques(noms: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const cleaned = noms.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return map;

  const marques = await prisma.marque.findMany({
    where: {
      OR: cleaned.map((nom) => ({
        nom: { equals: nom, mode: "insensitive" as const },
      })),
    },
    select: { id: true, nom: true },
    take: 80,
  });
  for (const m of marques) {
    map.set(m.nom.trim().toLowerCase(), m.id);
  }
  return map;
}

async function pipelineNames(): Promise<Set<string>> {
  const projet = await prisma.projetEvenement.findUnique({
    where: { slug: CANNES_PARTENAIRES_SLUG },
    select: { id: true },
  });
  if (!projet) return new Set();
  const opps = await prisma.opportuniteMarque.findMany({
    where: { projetId: projet.id },
    select: { nomMarque: true },
    take: 200,
  });
  return new Set(
    opps.map((o) => o.nomMarque.trim().toLowerCase()).filter(Boolean)
  );
}

export async function structureCannesBrandsAnswer(opts: {
  chatAnswer: string;
  limit?: number;
}): Promise<CannesBrandsStructured> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  const limit = Math.min(Math.max(opts.limit ?? 35, 20), 45);
  const answerForModel = clipAnswer(opts.chatAnswer);
  const inPipeline = await pipelineNames();

  const system = sanitizeOpenAiText(
    "Tu structures une shortlist partenariats Festival de Cannes en JSON strict. Extraction EXHAUSTIVE des marques listées. Conserve l’ordre."
  );
  const user = sanitizeOpenAiText(`Tu structures la réponse d'analyse suivante pour Glow Up — Cannes Partenaires.

Réponse analyse (${opts.chatAnswer.length} caractères):
"""
${answerForModel}
"""

Extrais UNIQUEMENT un JSON:
{
  "summary": "résumé 3–6 phrases : angles prioritaires Glow Up × Cannes",
  "brands": [{
    "nom": "Nom marque exact",
    "secteur": "Beauté|Luxe|Mode|Champagne/Spirits|Auto|Tech|Travel|Joaillerie|Lifestyle|Autre|null",
    "priorite": "P1|P2|P3",
    "typologie": "HISTORIQUE|POTENTIEL",
    "whyContact": "pourquoi les contacter + preuves / signaux",
    "suggestedAngle": "pitch / angle Glow Up villa-talents",
    "signals": "villa|beach|Lions|hospitality|collab talents|event FR|autre + année si connue"
  }]
}

Règles:
- Extrais TOUTES les marques listées (objectif ${limit}, max ${limit})
- typologie HISTORIQUE = déjà présentes années précédentes ; POTENTIEL = pourraient y être
- Conserve l’ordre du texte (historique d’abord si le texte le fait)
- Ne invente PAS de marques absentes du texte
- whyContact : garde les preuves / signaux cités
- Réponds JSON pur.`);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Erreur classement HTTP ${res.status}`);
  }

  const text = data.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(text);
  const rawBrands = Array.isArray(parsed.brands) ? parsed.brands : [];
  const summary = asStr(parsed.summary);

  const seen = new Set<string>();
  const draft: Array<Omit<CannesBrandIdea, "alreadyInPipeline" | "marqueId">> =
    [];
  for (const item of rawBrands) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const nom = asStr(r.nom);
    if (!nom) continue;
    const key = nom.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    draft.push({
      nom,
      secteur: asStr(r.secteur) || null,
      priorite: normalizePriorite(r.priorite),
      typologie: normalizeTypologie(r.typologie),
      whyContact: asStr(r.whyContact) || "—",
      suggestedAngle: asStr(r.suggestedAngle) || "—",
      signals: asStr(r.signals) || null,
    });
    if (draft.length >= limit) break;
  }

  const marqueMap = await matchMarques(draft.map((b) => b.nom));
  const brands: CannesBrandIdea[] = draft.map((b) => {
    const key = b.nom.toLowerCase();
    return {
      ...b,
      alreadyInPipeline: inPipeline.has(key),
      marqueId: marqueMap.get(key) || null,
    };
  });

  return { summary, brands };
}
