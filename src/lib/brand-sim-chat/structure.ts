/**
 * Prose Chat (simulateur marque) → cartes marques structurées + match CRM.
 */

import prisma from "@/lib/prisma";
import { asStr, uniqueCollabLabels, type CrmTalent } from "@/lib/talent-research-core";

const OPENAI_MODEL = "gpt-4o-mini";
const MAX_ANSWER_CHARS = 90_000;

export type BrandSimStructuredBrand = {
  marqueId: string | null;
  nom: string;
  secteur: string | null;
  fitScore: number;
  whyFit: string;
  suggestedAngle: string;
  inCrm: boolean;
  alreadyContacted: boolean;
  alreadyWorkedWith: boolean;
};

export type BrandSimStructured = {
  profileSummary: string;
  whoTheyAre: string;
  whatTheyDo: string;
  profileAnalysis: string;
  contentThemes: string;
  brandUniverseHints: string;
  detectedMoments: string;
  brands: BrandSimStructuredBrand[];
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

function safeSlice(s: string, start: number, end?: number): string {
  let a = Math.max(0, start);
  let b = end === undefined ? s.length : Math.min(end, s.length);
  if (a > 0 && a < s.length) {
    const c = s.charCodeAt(a);
    if (c >= 0xdc00 && c <= 0xdfff) a += 1;
  }
  if (b > 0 && b <= s.length) {
    const c = s.charCodeAt(b - 1);
    if (c >= 0xd800 && c <= 0xdbff) b -= 1;
  }
  if (b < a) b = a;
  return s.slice(a, b);
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
  const head = safeSlice(clean, 0, 70_000);
  const tail = safeSlice(clean, Math.max(0, clean.length - 20_000));
  return `${head}\n\n…\n\n${tail}`;
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = String(text || "")
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    const p = JSON.parse(cleaned);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return p as Record<string, unknown>;
    }
  } catch {
    /* fallback */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  }
  throw new Error("JSON marques illisible");
}

function clampScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  if (n <= 10) return Math.round(Math.min(100, Math.max(0, n * 10)));
  return Math.round(Math.min(100, Math.max(0, n)));
}

async function resolveBrandsAgainstCrm(
  brands: BrandSimStructuredBrand[]
): Promise<BrandSimStructuredBrand[]> {
  if (brands.length === 0) return brands;
  const names = brands.map((b) => b.nom).filter(Boolean);
  const crmRows = await prisma.marque.findMany({
    where: {
      OR: [
        ...names.map((n) => ({
          nom: { equals: n, mode: "insensitive" as const },
        })),
        {
          aliases: {
            some: {
              OR: names.map((n) => ({
                label: { equals: n, mode: "insensitive" as const },
              })),
            },
          },
        },
      ],
    },
    select: {
      id: true,
      nom: true,
      secteur: true,
      aliases: { select: { label: true }, take: 8 },
    },
    take: 120,
  });

  const byKey = new Map<
    string,
    { id: string; nom: string; secteur: string | null }
  >();
  for (const m of crmRows) {
    byKey.set(m.nom.trim().toLowerCase(), {
      id: m.id,
      nom: m.nom,
      secteur: m.secteur,
    });
    for (const a of m.aliases || []) {
      const lab = String(a.label || "").trim().toLowerCase();
      if (lab) {
        byKey.set(lab, { id: m.id, nom: m.nom, secteur: m.secteur });
      }
    }
  }

  return brands.map((b) => {
    if (b.marqueId) return { ...b, inCrm: true };
    const hit = byKey.get(b.nom.trim().toLowerCase());
    if (!hit) return b;
    return {
      ...b,
      marqueId: hit.id,
      nom: hit.nom,
      secteur: hit.secteur || b.secteur,
      inCrm: true,
    };
  });
}

export async function structureBrandSimAnswer(opts: {
  talent: CrmTalent;
  talentName: string;
  chatAnswer: string;
  pastBrands: string[];
  limit?: number;
}): Promise<BrandSimStructured> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  const limit = Math.min(Math.max(opts.limit ?? 50, 8), 50);
  const answerForModel = clipAnswer(opts.chatAnswer);
  const pastKeys = new Set(
    opts.pastBrands.map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
  const crmPast = uniqueCollabLabels(opts.talent, 40);
  for (const n of crmPast) pastKeys.add(n.toLowerCase());

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const history = await prisma.contactMission.findMany({
    where: {
      talentId: opts.talent.id,
      sentAt: { gte: since },
    },
    select: {
      targetBrand: true,
      marque: { select: { nom: true } },
    },
    take: 80,
  });
  const contactedKeys = new Set(
    history
      .map((h) => String(h.marque?.nom || h.targetBrand || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const system = sanitizeOpenAiText(
    "Tu structures une analyse strategy influence en JSON strict. Extraction EXHAUSTIVE des marques citées. Conserve l’ordre de pertinence."
  );
  const user = sanitizeOpenAiText(`Tu structures la réponse d'analyse suivante pour Glow-up (simulateur marque).

Talent: ${opts.talentName}

Réponse analyse (${opts.chatAnswer.length} caractères):
"""
${answerForModel}
"""

Extrais UNIQUEMENT un JSON:
{
  "whoTheyAre": "…",
  "whatTheyDo": "…",
  "profileAnalysis": "…",
  "contentThemes": "…",
  "brandUniverseHints": "…",
  "detectedMoments": "…",
  "profileSummary": "résumé 2–4 phrases (inclure la veille collabs 3 mois si présente)",
  "brands": [{
    "nom": "Nom marque exact",
    "secteur": "Mode|Beauté|Sport|Food|Tech|Luxe|Retail|Maison|Voyage|Institution/Cause|Autre|null",
    "fitScore": 0-100,
    "whyFit": "pourquoi ça match CE talent + preuve collab récente/peer si citée",
    "suggestedAngle": "angle / pitch"
  }]
}

Règles:
- Extrais TOUTES les marques nommées (objectif ${limit}, max ${limit}).
- Conserve l’ordre du texte (meilleur fit d’abord) ; fitScore: si /10 → ×10 ; sinon estime 50–95 sans aplatir tout le monde à 70.
- Ne invente PAS de marques absentes du texte.
- whyFit / suggestedAngle : garde le détail spécifique du texte (preuves peers / campagnes 3 mois), pas de phrases génériques.
- detectedMoments: moments de vie / projets cités (sinon "").
- brandUniverseHints: peut résumer la veille 3 mois (marques actives / peers).
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

  const seen = new Set<string>();
  let brands: BrandSimStructuredBrand[] = [];
  for (const item of rawBrands) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const nom = asStr(r.nom);
    if (!nom) continue;
    const key = nom.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push({
      marqueId: null,
      nom,
      secteur: asStr(r.secteur) || null,
      fitScore: clampScore(r.fitScore),
      whyFit: asStr(r.whyFit) || "Fit non précisé.",
      suggestedAngle: asStr(r.suggestedAngle),
      inCrm: false,
      alreadyContacted: contactedKeys.has(key),
      alreadyWorkedWith: pastKeys.has(key),
    });
    if (brands.length >= limit) break;
  }

  brands = await resolveBrandsAgainstCrm(brands);
  brands = brands
    .map((b) => ({
      ...b,
      alreadyContacted:
        b.alreadyContacted ||
        contactedKeys.has(b.nom.trim().toLowerCase()),
      alreadyWorkedWith:
        b.alreadyWorkedWith || pastKeys.has(b.nom.trim().toLowerCase()),
    }))
    .sort((a, b) => b.fitScore - a.fitScore);

  return {
    profileSummary: asStr(parsed.profileSummary),
    whoTheyAre: asStr(parsed.whoTheyAre),
    whatTheyDo: asStr(parsed.whatTheyDo),
    profileAnalysis: asStr(parsed.profileAnalysis),
    contentThemes: asStr(parsed.contentThemes),
    brandUniverseHints: asStr(parsed.brandUniverseHints),
    detectedMoments: asStr(parsed.detectedMoments),
    brands,
  };
}
