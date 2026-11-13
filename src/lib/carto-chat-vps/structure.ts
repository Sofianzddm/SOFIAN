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

function normalizeLinkedInUrl(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!/linkedin\.com/i.test(u.hostname)) return null;
    if (!/\/in\//i.test(u.pathname)) return null;
    let path = u.pathname.replace(/\/+$/, "");
    // drop locale suffix /en /fr
    path = path.replace(/\/(en|fr|de|es|pt|it)$/i, "");
    return `https://www.linkedin.com${path}`;
  } catch {
    return null;
  }
}

function mapContact(raw: Record<string, unknown>): CartoAiContactCandidate | null {
  const nom = String(raw.nom || raw.lastName || raw.name || "").trim();
  if (!nom || nom.length < 2) return null;
  const prenomRaw = String(raw.prenom || raw.firstName || "").trim();
  const linkedinUrl =
    normalizeLinkedInUrl(
      String(raw.linkedinUrl || raw.linkedin || raw.linkedin_url || "").trim()
    ) || null;
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
    linkedinUrl,
    note: String(raw.note || raw.preuve || raw.proof || "").trim() || null,
    sources: ["chatgpt"],
  };
}

function normPersonToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Chat affiche souvent « Profil » sans URL dans le texte ; les hrefs sont
 * appendés en fin (## LinkedIn URLs). On rattache par slug /in/≈ prénom+nom.
 */
export function attachLinkedInFromAnswer(
  contacts: CartoAiContactCandidate[],
  chatAnswer: string
): CartoAiContactCandidate[] {
  const re =
    /https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[^\s)\]>"']+/gi;
  const found: Array<{ url: string; slug: string; context: string }> = [];
  const seen = new Set<string>();
  for (const m of chatAnswer.matchAll(re)) {
    const url = normalizeLinkedInUrl(m[0].replace(/[.,;:]+$/, ""));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const slugRaw = decodeURIComponent(
      (url.match(/\/in\/([^/?#]+)/i) || [])[1] || ""
    );
    const slug = normPersonToken(slugRaw);
    const i = m.index ?? 0;
    const context = chatAnswer.slice(Math.max(0, i - 180), i + 80);
    found.push({ url, slug, context });
  }
  if (!found.length) return contacts;

  const used = new Set<string>();
  return contacts.map((c) => {
    if (c.linkedinUrl) {
      used.add(c.linkedinUrl);
      return c;
    }
    const prenom = normPersonToken(c.prenom || "");
    const nom = normPersonToken(c.nom || "");
    if (!prenom && !nom) return c;

    let best: { url: string; score: number } | null = null;
    for (const f of found) {
      if (used.has(f.url)) continue;
      let score = 0;
      if (prenom && f.slug.includes(prenom) && prenom.length >= 3) score += 2;
      if (nom && f.slug.includes(nom) && nom.length >= 3) score += 3;
      if (prenom && nom && f.slug.includes(prenom) && f.slug.includes(nom)) {
        score += 4;
      }
      const ctx = normPersonToken(f.context);
      if (prenom && ctx.includes(prenom)) score += 1;
      if (nom && ctx.includes(nom)) score += 2;
      if (score >= 3 && (!best || score > best.score)) {
        best = { url: f.url, score };
      }
    }
    if (!best) return c;
    used.add(best.url);
    return { ...c, linkedinUrl: best.url };
  });
}

export type StructuredAgency = {
  name: string;
  role: string | null;
  note: string | null;
  primary: boolean;
};

export type StructuredChat = {
  contacts: CartoAiContactCandidate[];
  agencies: StructuredAgency[];
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
${(() => {
  const full = opts.chatAnswer;
  if (full.length <= 16000) return full;
  // garde le début + la section LinkedIn en fin (hrefs)
  return `${full.slice(0, 11000)}\n\n…\n\n${full.slice(-5000)}`;
})()}
"""

Extrais UNIQUEMENT un JSON:
{
  "agencies": [{
    "name":"…",
    "role":"RP|influence|créa|autre",
    "note":"preuve / nuance mandat",
    "primary": true
  }],
  "contacts": [{
    "marche":"FR"|"EU"|"INT",
    "priorite":"P1"|"P2"|"P3",
    "prenom":"…",
    "nom":"…",
    "poste":"…",
    "perimetre":"Marque" | "Agence NOM" | "Groupe" | "Autre agence NOM",
    "localisation":"…",
    "linkedinUrl":"https://linkedin.com/in/… ou null",
    "note":"preuve courte (communiqué, offre, LinkedIn…)"
  }]
}

Règles:
- Sépare STRICTEMENT marque vs agence (NE PAS tout mettre en Marque):
  - Salarié·e interne marque / siège / filiale annonceur → perimetre = "Marque" (ou "Groupe").
  - Personne qui TRAVAILLE CHEZ une agence (même historique) → JAMAIS "Marque".
    - Agence du mandat principal → perimetre = "Agence {NOM_EXACT}" (ex. "Agence Matahari").
    - Autre agence one-shot / ancienne → perimetre = "Autre agence {NOM}".
  - Si la réponse Chat ne cite qu'UNE agence → c'est la principale (primary:true), pas "Autre".
- agencies[]: liste les agences nommées; primary:true = mandat influence/RP le plus solide.
- poste: rôle réel (ex. "Influence Manager", "Account Director") — PAS "Profil LinkedIn…".
- note: preuve courte (agence, campagne, source) — pas une phrase générique.
- Personnes nommées → contacts. Ne invente PAS de noms.
- LinkedIn: OBLIGATOIRE. La réponse contient souvent une section "## LinkedIn URLs (hrefs page)"
  avec des lignes "- Nom… / https://linkedin.com/in/…". Recopie l'URL /in/ exacte sur le bon contact.
  Si le tableau dit seulement « Profil », cherche l'URL dans cette section ou juste sous le nom.
  Ne mets null QUE si aucune URL /in/ n'existe pour cette personne.
- Priorité: P1 décideurs marque + contacts agence principale, P2 secondaires.
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
    .map((a, idx) => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const name = String(o.name || o.nom || "").trim();
      if (!name) return null;
      return {
        name,
        role: String(o.role || o.roleAgence || "").trim() || null,
        note: String(o.note || "").trim() || null,
        primary: o.primary === true || idx === 0,
      };
    })
    .filter((a): a is StructuredAgency => Boolean(a));

  // Une seule primary
  let sawPrimary = false;
  for (const a of agencies) {
    if (a.primary && !sawPrimary) {
      sawPrimary = true;
    } else if (a.primary) {
      a.primary = false;
    }
  }
  if (!sawPrimary && agencies[0]) agencies[0].primary = true;

  // Normalise perimetre Marque vs Agence
  const primaryName =
    agencies.find((a) => a.primary)?.name || agencies[0]?.name || null;
  const agencyNames = agencies
    .map((a) => a.name)
    .filter(Boolean)
    .map((n) => n.toLowerCase());

  for (const c of contacts) {
    const p = (c.perimetre || "").trim();
    const pl = p.toLowerCase();
    const blob = `${p} ${c.poste || ""} ${c.note || ""}`.toLowerCase();

    // "Autre agence X" alors que X = seule / primary → promouvoir en Agence X
    const autre = pl.match(/^autre\s*agence\s+(.+)$/i);
    if (autre) {
      const name = autre[1].trim();
      if (
        !primaryName ||
        agencies.length <= 1 ||
        name.toLowerCase().includes((primaryName || "").toLowerCase().slice(0, 4)) ||
        (primaryName || "").toLowerCase().includes(name.toLowerCase().slice(0, 4))
      ) {
        const finalName = primaryName || name;
        c.perimetre = `Agence ${finalName}`;
        if (!agencies.some((a) => a.name.toLowerCase() === finalName.toLowerCase())) {
          agencies.push({
            name: finalName,
            role: "influence",
            note: null,
            primary: agencies.length === 0,
          });
        }
      }
      continue;
    }

    const hitsKnownAgency =
      /woo|woô|187|ykone|matriochka|leveled|26pmx|matahari|publicis|havas|omnicom|we?are\s*social|influence4you|kolsquare/i.test(
        blob
      ) ||
      agencyNames.some((n) => n.length >= 3 && blob.includes(n));

    if (/^agence\b/i.test(p) || (hitsKnownAgency && !/marque|interne|annonceur/i.test(pl))) {
      if (!/^agence\s+/i.test(p)) {
        const fromBlob =
          agencies.find((a) => blob.includes(a.name.toLowerCase()))?.name ||
          primaryName;
        if (fromBlob) c.perimetre = `Agence ${fromBlob}`;
      }
      continue;
    }

    if (!p || /marque|interne|annonceur|l'?oréal|groupe/i.test(pl)) {
      if (!/^groupe$/i.test(p)) {
        c.perimetre = /groupe|l'?oréal/i.test(pl) ? "Groupe" : "Marque";
      }
    }
  }

  // Re-fix primary si on a promu une agence
  if (!agencies.some((a) => a.primary) && agencies[0]) {
    agencies[0].primary = true;
  }

  const withLi = attachLinkedInFromAnswer(contacts, opts.chatAnswer);
  return { contacts: withLi, agencies };
}
