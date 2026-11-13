/**
 * Transforme une réponse Chat (prose) en contacts carto structurés.
 * Isolé du scrap carto-pipeline v1.
 */

import type {
  CartoAiContactCandidate,
  CartoAiMarche,
} from "@/lib/carto-ai/types";

const OPENAI_MODEL = "gpt-4.1";

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
    throw new Error("JSON illisible");
  }
}

function parseMarche(raw: unknown): CartoAiMarche {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "EU" || s === "EUROPE" || s === "EMEA" || s === "BENELUX") return "EU";
  if (s === "INT" || s === "INTERNATIONAL" || s === "US" || s === "GLOBAL")
    return "INT";
  return "FR";
}

function mapContact(raw: Record<string, unknown>): CartoAiContactCandidate | null {
  const nom = String(raw.nom || raw.lastName || raw.name || "").trim();
  if (!nom || nom.length < 2) return null;
  const prenomRaw = String(raw.prenom || raw.firstName || "").trim();
  const linkedinUrl = String(
    raw.linkedinUrl || raw.linkedin || raw.linkedin_url || ""
  ).trim();
  return {
    marche: parseMarche(raw.marche || raw.market),
    priorite: String(raw.priorite || raw.priority || "").trim() || null,
    prenom: prenomRaw || null,
    nom: prenomRaw && nom.toLowerCase().startsWith(prenomRaw.toLowerCase())
      ? nom.slice(prenomRaw.length).trim() || nom
      : nom,
    poste: String(raw.poste || raw.title || raw.role || "").trim() || null,
    perimetre:
      String(raw.perimetre || raw.scope || raw.agence || "").trim() || null,
    localisation:
      String(raw.localisation || raw.location || "").trim() || null,
    linkedinUrl: linkedinUrl || null,
    note: String(raw.note || raw.preuve || raw.proof || "").trim() || null,
    sources: ["chatgpt"],
  };
}

export type StructuredChat = {
  contacts: CartoAiContactCandidate[];
  agencies: Array<{ name: string; role: string | null; note: string | null }>;
};

export async function structureChatAnswer(opts: {
  company: string;
  chatAnswer: string;
}): Promise<StructuredChat> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  const prompt = `Tu structures la réponse ChatGPT suivante pour Glow-up (carto influence).

Marque: ${opts.company}

Réponse Chat:
"""
${opts.chatAnswer.slice(0, 14000)}
"""

Extrais UNIQUEMENT un JSON:
{
  "agencies": [{"name":"…","role":"RP|influence|créa|autre","note":"preuve / nuance mandat"}],
  "contacts": [{
    "marche":"FR"|"EU"|"INT",
    "priorite":"P1"|"P2"|"P3",
    "prenom":"…",
    "nom":"…",
    "poste":"…",
    "perimetre":"Marque | Agence NOM | Groupe",
    "localisation":"…",
    "linkedinUrl":"https://linkedin.com/in/… ou null",
    "note":"preuve courte (communiqué, offre, LinkedIn…)"
  }]
}

Règles:
- Personnes nommées (interne marque OU agence) → contacts.
- Si seulement une agence sans personne: ne invente PAS de noms; agencies suffit.
- Emails: ne les mets PAS dans linkedinUrl; tu peux les citer dans note.
- Ne pas inventer de LinkedIn.
- Priorité: P1 contacts agence mandat + influence marque FR, P2 partenaires secondaires, P3 contexte.
- Réponds JSON pur.`;

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
        {
          role: "system",
          content: "Tu structures des réponses research influence en JSON strict.",
        },
        { role: "user", content: prompt },
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
    contacts?: unknown[];
    agencies?: unknown[];
  };

  const contacts = (Array.isArray(parsed.contacts) ? parsed.contacts : [])
    .map((c) =>
      c && typeof c === "object"
        ? mapContact(c as Record<string, unknown>)
        : null
    )
    .filter((c): c is CartoAiContactCandidate => Boolean(c));

  const agencies = (Array.isArray(parsed.agencies) ? parsed.agencies : [])
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const name = String(o.name || o.nom || "").trim();
      if (!name) return null;
      return {
        name,
        role: String(o.role || o.roleAgence || "").trim() || null,
        note: String(o.note || "").trim() || null,
      };
    })
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return { contacts, agencies };
}
