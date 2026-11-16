/**
 * Transforme une réponse Chat (prose) en contacts carto structurés.
 * Isolé du scrap carto-pipeline v1.
 */

import type {
  CartoAiContactCandidate,
  CartoAiMarche,
} from "@/lib/carto-ai/types";

/** Classement JSON post-Chat — mini = rapide (le research est déjà fait par Chat). */
const OPENAI_MODEL = "gpt-4o-mini";

/** gpt-4o-mini ~128k : on envoie quasi tout le research pour ne pas perdre les tableaux. */
const MAX_ANSWER_CHARS = 90_000;

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

/** Sous ce seuil → 2e passe pour récupérer les oubliés (com DPP, digital, P4…). */
const MIN_CONTACTS_BEFORE_SECOND_PASS = 18;

function personKey(c: CartoAiContactCandidate): string {
  return `${normPersonToken(c.prenom || "")}|${normPersonToken(c.nom || "")}`;
}

function clipAnswer(full: string): string {
  if (full.length <= MAX_ANSWER_CHARS) return full;
  return `${full.slice(0, 70_000)}\n\n…\n\n${full.slice(-20_000)}`;
}

function parseAgencies(raw: unknown[]): StructuredAgency[] {
  return raw
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
}

function jsonSchemaHint(): string {
  return `{
  "agencies": [{
    "name":"…",
    "role":"RP|influence|créa|autre",
    "note":"preuve / nuance mandat",
    "primary": true
  }],
  "contacts": [{
    "marche":"FR"|"EU"|"INT",
    "priorite":"P1"|"P2"|"P3"|"P4",
    "prenom":"…",
    "nom":"…",
    "poste":"…",
    "perimetre":"Marque" | "Agence NOM" | "Groupe" | "Autre agence NOM",
    "localisation":"…",
    "linkedinUrl":"https://linkedin.com/in/… ou null",
    "note":"preuve courte (communiqué, offre, LinkedIn…)"
  }]
}`;
}

function perimeterRules(): string {
  return `- Sépare STRICTEMENT marque vs agence:
  - Salarié·e L'Oréal / marque / DPP / annonceur → "Marque" ou "Groupe" (même si cité·e dans un post WOO).
  - Employé·e d'agence (AM, cheffe de projet agence, Brand Manager agence) → "Agence {NOM}".
  - One-shot / autre boîte (La Boss Corp, Globe, Skeepers…) → "Autre agence {NOM}", PAS l'agence mandat.
  - Interlocuteur L'Oréal « cité par » l'agence → Marque, PAS Agence.`;
}

async function callStructureModel(opts: {
  apiKey: string;
  system: string;
  user: string;
}): Promise<{ contacts: CartoAiContactCandidate[]; agencies: StructuredAgency[] }> {
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

  return {
    contacts,
    agencies: parseAgencies(
      Array.isArray(parsed.agencies) ? parsed.agencies : []
    ),
  };
}

function normalizePerimeters(
  contacts: CartoAiContactCandidate[],
  agencies: StructuredAgency[]
): void {
  let sawPrimary = false;
  for (const a of agencies) {
    if (a.primary && !sawPrimary) sawPrimary = true;
    else if (a.primary) a.primary = false;
  }
  if (!sawPrimary && agencies[0]) agencies[0].primary = true;

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

    // Annonceur L'Oréal / DPP même si le note cite WOO
    const isAdvertiser =
      /\bl'?or[eé]al\b|\bdpp\b|\bannonceur\b|\bmarque\b|\binterne\b|\badvocacy\b|\binfluence (redken|matrix)\b/i.test(
        blob
      ) &&
      !/\b(chez|agence)\s+(woo|woô|olyn)\b|\bbrand manager\b.*\bwoo\b|\bcheffe? de projet\b.*\bwoo\b|\bemploy[eé]e?\s+(de\s+)?(woo|woô)/i.test(
        blob
      );

    if (isAdvertiser && /^agence\b/i.test(pl)) {
      c.perimetre = /groupe/i.test(pl) ? "Groupe" : "Marque";
      continue;
    }

    // Autre boîte (Boss Corp, Globe…) collée à tort sur l'agence mandat
    if (
      /^agence\b/i.test(pl) &&
      primaryName &&
      /\b(boss\s*corp|globe|skeepers|guacamole|dcm)\b/i.test(blob) &&
      !new RegExp(`\\b${primaryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
        `${c.poste || ""} ${c.note || ""}`
      )
    ) {
      const other =
        blob.match(/\b(la\s+boss\s+corp|boss\s*corp|globe\s*groupe|skeepers|guacamole|dcm)\b/i)?.[1] ||
        "partenaire";
      c.perimetre = `Autre agence ${other}`;
      continue;
    }

    const autre = pl.match(/^autre\s*agence\s+(.+)$/i);
    if (autre) {
      const name = autre[1].trim();
      if (
        !primaryName ||
        agencies.length <= 1 ||
        name.toLowerCase().includes((primaryName || "").toLowerCase().slice(0, 4)) ||
        (primaryName || "").toLowerCase().includes(name.toLowerCase().slice(0, 4))
      ) {
        // Ne pas promouvoir Boss Corp / Globe en agence mandat
        if (!/\b(boss|globe|skeepers|guacamole|dcm)\b/i.test(name)) {
          const finalName = primaryName || name;
          c.perimetre = `Agence ${finalName}`;
          if (
            !agencies.some(
              (a) => a.name.toLowerCase() === finalName.toLowerCase()
            )
          ) {
            agencies.push({
              name: finalName,
              role: "influence",
              note: null,
              primary: agencies.length === 0,
            });
          }
        }
      }
      continue;
    }

    const worksAtAgency =
      /\b(chez|@)\s*(woo|woô|olyn)\b|\bagence\s+(woo|woô)\b|\bbrand manager\b|\bcheffe? de projet\b|\baccount\b|\bconsultant/i.test(
        blob
      ) &&
      (agencyNames.some((n) => n.length >= 3 && blob.includes(n)) ||
        /woo|woô|olyn/i.test(blob));

    if (worksAtAgency && !isAdvertiser) {
      if (!/^agence\s+/i.test(p)) {
        const fromBlob =
          agencies.find((a) => blob.includes(a.name.toLowerCase()))?.name ||
          primaryName;
        if (fromBlob) c.perimetre = `Agence ${fromBlob}`;
      }
      continue;
    }

    if (!p || /marque|interne|annonceur|l'?oréal|groupe/i.test(pl) || isAdvertiser) {
      if (!/^groupe$/i.test(p)) {
        c.perimetre = /groupe|l'?oréal/i.test(pl) ? "Groupe" : "Marque";
      }
    }
  }

  if (!agencies.some((a) => a.primary) && agencies[0]) {
    agencies[0].primary = true;
  }
}

function mergeContacts(
  a: CartoAiContactCandidate[],
  b: CartoAiContactCandidate[]
): CartoAiContactCandidate[] {
  const map = new Map<string, CartoAiContactCandidate>();
  for (const c of [...a, ...b]) {
    const k = personKey(c);
    if (!k || k === "|") continue;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, c);
      continue;
    }
    // Enrichit l'entrée existante si la 2e passe a plus d'info
    map.set(k, {
      ...prev,
      poste: prev.poste || c.poste,
      perimetre: prev.perimetre || c.perimetre,
      note: prev.note || c.note,
      linkedinUrl: prev.linkedinUrl || c.linkedinUrl,
      priorite: prev.priorite || c.priorite,
      localisation: prev.localisation || c.localisation,
    });
  }
  return Array.from(map.values());
}

export async function structureChatAnswer(opts: {
  company: string;
  chatAnswer: string;
}): Promise<StructuredChat> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()?.replace(/^["']|["']$/g, "");
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  const fullAnswer = opts.chatAnswer;
  const answerForModel = clipAnswer(fullAnswer);

  const first = await callStructureModel({
    apiKey,
    system:
      "Tu structures des réponses research influence en JSON strict. Extraction EXHAUSTIVE.",
    user: `Tu structures la réponse ChatGPT suivante pour Glow-up (carto influence).

Marque: ${opts.company}

Réponse Chat (${fullAnswer.length} caractères — extrais TOUTES les personnes nommées):
"""
${answerForModel}
"""

Extrais UNIQUEMENT un JSON:
${jsonSchemaHint()}

Règles EXHAUSTIVES (critique — ne pas sous-extraire):
- Objectif: 15 à 30 contacts si la réponse en cite autant. INTERDIT de s'arrêter à 3–10.
- Parcours TOUS les tableaux et listes (marque, agence, marketing, digital, com DPP, secondaires, top 10, périphèse).
- Inclus P1, P2, P3 ET P4 (historiques / périphériques / à vérifier).
- Une personne = une entrée. Déduplique prénom+nom. Ne invente PAS de noms.
${perimeterRules()}
- agencies[]: agences nommées; primary:true = mandat influence/RP le plus solide.
- poste: rôle réel — PAS "Profil LinkedIn…".
- note: preuve courte.
- LinkedIn: OBLIGATOIRE si URL /in/ présente (section "## LinkedIn URLs" ou sous le nom).
- Priorité: respecte P1–P4 du texte Chat; sinon P1 casting, P2 ops, P3 validation, P4 secondaire.
- Réponds JSON pur.`,
  });

  let contacts = first.contacts;
  let agencies = first.agencies;

  if (contacts.length < MIN_CONTACTS_BEFORE_SECOND_PASS) {
    const already = contacts
      .map((c) => `${c.prenom || ""} ${c.nom}`.trim())
      .filter(Boolean);
    console.warn(
      `[carto-structure] ${contacts.length} contacts < ${MIN_CONTACTS_BEFORE_SECOND_PASS} — 2e passe oubliés`
    );
    try {
      const second = await callStructureModel({
        apiKey,
        system:
          "Tu complètes une carto influence. N'extrais QUE les personnes manquantes. JSON strict.",
        user: `Passe 2 / 2 — contacts OUBLIÉS uniquement pour ${opts.company}.

Déjà extraits (NE PAS les renvoyer):
${already.map((n) => `- ${n}`).join("\n") || "(aucun)"}

Réponse Chat complète:
"""
${answerForModel}
"""

Extrais UNIQUEMENT un JSON (même schéma):
${jsonSchemaHint()}

Focus obligatoire — cherche surtout:
- Com / RP / événements DPP (Karina, Mathieu, Frédérique, Anne-Laure…)
- Digital / e-commerce marque (Margaux Antoine, Léa Amsellem…)
- Marketing produit cités dans les tableaux
- Historiques P4 et "contacts périphériques"
- Noms du top 10 / synthèseèse absents de la liste ci-dessus
- Agences one-shot (Boss Corp, Globe…) en "Autre agence …"

${perimeterRules()}
- Ne renvoie QUE des personnes ABSENTES de la liste "déjà extraits".
- agencies[]: seulement si nouvelle agence utile (sinon []).
- Réponds JSON pur.`,
      });
      contacts = mergeContacts(contacts, second.contacts);
      for (const a of second.agencies) {
        if (
          !agencies.some(
            (x) => x.name.toLowerCase() === a.name.toLowerCase()
          )
        ) {
          agencies.push({ ...a, primary: false });
        }
      }
    } catch (e) {
      console.warn(
        "[carto-structure] 2e passe échouée:",
        e instanceof Error ? e.message : e
      );
    }
  }

  normalizePerimeters(contacts, agencies);
  const withLi = attachLinkedInFromAnswer(contacts, opts.chatAnswer);
  return { contacts: withLi, agencies };
}
