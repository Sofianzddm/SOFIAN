/**
 * LinkedIn carto : ne garder que des URLs réelles (Exa / Apollo).
 * Les LLM inventent souvent /in/prenom-nom → 404.
 */

import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";
import type { ExaGroundingSnippet } from "@/lib/carto-ai/exa-grounding";
import { contactPersonKey } from "@/lib/contact-person-key";

const PLACEHOLDER =
  /(\.\.\.|example|prenom|nom|username|profile|xxx|placeholder)/i;

export function normalizePersonLinkedin(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const raw = url.trim();
    if (PLACEHOLDER.test(raw)) return null;
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!u.hostname.includes("linkedin.com")) return null;
    // Profil personne uniquement
    const m = u.pathname.match(/\/in\/([^/?#]+)/i);
    if (!m?.[1]) return null;
    const slug = decodeURIComponent(m[1]).replace(/\/$/, "");
    if (!slug || PLACEHOLDER.test(slug) || slug.length < 3) return null;
    return `https://www.linkedin.com/in/${slug}`;
  } catch {
    return null;
  }
}

function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Extrait les profils /in/ des preuves Exa. */
export function collectVerifiedLinkedinFromExa(
  snippets: ExaGroundingSnippet[]
): Array<{ url: string; blob: string }> {
  const out: Array<{ url: string; blob: string }> = [];
  const seen = new Set<string>();

  for (const s of snippets) {
    const candidates = [s.url, s.text, s.title]
      .join("\n")
      .match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/in\/[^\s"'<>)\]]+/gi);
    const urls = new Set<string>();
    if (s.url) {
      const n = normalizePersonLinkedin(s.url);
      if (n) urls.add(n);
    }
    for (const raw of candidates || []) {
      const n = normalizePersonLinkedin(raw.replace(/[.,;]+$/, ""));
      if (n) urls.add(n);
    }
    for (const url of urls) {
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        url,
        blob: `${s.title}\n${s.text}\n${url}`.toLowerCase(),
      });
    }
  }
  return out;
}

function matchExaLinkedin(
  c: CartoAiContactCandidate,
  verified: Array<{ url: string; blob: string }>
): string | null {
  const prenom = (c.prenom || "").trim();
  const nom = (c.nom || "").trim();
  if (!nom && !prenom) return null;

  const tokens = nameTokens(`${prenom} ${nom}`);
  if (tokens.length === 0) return null;

  for (const v of verified) {
    const blobTokens = nameTokens(v.blob);
    const slug = (v.url.split("/in/")[1] || "").toLowerCase();
    // Match fort : tous les tokens du nom dans le blob Exa
    if (tokens.every((t) => v.blob.includes(t))) return v.url;
    // Match slug LinkedIn ≈ prenom-nom
    if (
      tokens.length >= 2 &&
      tokens.every((t) => slug.includes(t) || blobTokens.includes(t))
    ) {
      return v.url;
    }
    const nomTok = nameTokens(nom)[0];
    const prenomTok = prenom ? nameTokens(prenom)[0] : null;
    if (nomTok && nomTok.length >= 3 && slug.includes(nomTok)) {
      if (!prenomTok || slug.includes(prenomTok)) return v.url;
    }
  }
  return null;
}

/**
 * Si Exa a un match nom → on préfère ce lien.
 * Sinon on garde le lien fourni s'il matche encore le slug (sinon null).
 */
export function attachVerifiedLinkedin(opts: {
  contacts: CartoAiContactCandidate[];
  snippets: ExaGroundingSnippet[];
}): CartoAiContactCandidate[] {
  const verified = collectVerifiedLinkedinFromExa(opts.snippets);

  let kept = 0;
  let upgraded = 0;
  let attached = 0;
  let dropped = 0;

  const out = opts.contacts.map((c) => {
    const existing = normalizePersonLinkedin(c.linkedinUrl);
    const matched = matchExaLinkedin(c, verified);

    if (matched) {
      if (!existing) attached += 1;
      else if (existing.toLowerCase() !== matched.toLowerCase()) upgraded += 1;
      else kept += 1;
      return { ...c, linkedinUrl: matched };
    }

    if (existing && slugLooksLikePerson(existing, c.prenom, c.nom)) {
      kept += 1;
      return { ...c, linkedinUrl: existing };
    }

    if (existing) {
      dropped += 1;
      return { ...c, linkedinUrl: null };
    }
    return { ...c, linkedinUrl: null };
  });

  console.log(
    `[carto-ai] linkedin: kept=${kept} upgraded_exa=${upgraded} attached_exa=${attached} dropped_mismatch=${dropped} exa_profiles=${verified.length}`
  );
  return out;
}

function slugLooksLikePerson(
  url: string,
  prenom: string | null | undefined,
  nom: string | null | undefined
): boolean {
  const slug = (url.split("/in/")[1] || "").toLowerCase();
  const tokens = nameTokens(`${prenom || ""} ${nom || ""}`);
  if (!tokens.length || !slug) return false;
  // Au moins 1 token significatif (≥3) dans le slug
  return tokens.some((t) => t.length >= 3 && slug.includes(t));
}

async function exaPeopleLookup(query: string): Promise<ExaGroundingSnippet[]> {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) return [];
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
        category: "people",
        numResults: 5,
        contents: { text: { maxCharacters: 600 } },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; text?: string }>;
    };
    return (data.results || []).map((r) => ({
      title: String(r.title || "").trim(),
      url: String(r.url || "").trim(),
      text: String(r.text || "").trim(),
      kind: "people" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Filet pour les contacts sans LinkedIn après Chat/structure
 * (ex. Aline Rombaut → /in/aline-rombaut-… alors que Chat a collé un faux lien).
 */
export async function fillMissingLinkedInViaExa(opts: {
  contacts: CartoAiContactCandidate[];
  company: string;
  /** Max lookups Exa (P1/P2 d'abord). */
  maxLookups?: number;
}): Promise<CartoAiContactCandidate[]> {
  const max = opts.maxLookups ?? 10;
  const company = opts.company.trim();
  const missing = opts.contacts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !normalizePersonLinkedin(c.linkedinUrl))
    .sort((a, b) => {
      const rank = (p: string | null) =>
        p === "P1" ? 0 : p === "P2" ? 1 : p === "P3" ? 2 : 3;
      return rank(a.c.priorite) - rank(b.c.priorite);
    })
    .slice(0, max);

  if (!missing.length) return opts.contacts;

  const out = [...opts.contacts];
  let filled = 0;

  for (const { c, i } of missing) {
    const name = [c.prenom, c.nom].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const queries = [
      `"${name}" ${company} LinkedIn`,
      `"${name}" site:linkedin.com/in`,
    ];
    const batches = await Promise.all(queries.map((q) => exaPeopleLookup(q)));
    const snippets = batches.flat();
    // Aussi scraper les /in/ et auteurs /posts/ des titres/textes
    const enriched: ExaGroundingSnippet[] = [];
    for (const s of snippets) {
      enriched.push(s);
      const post = (s.url || "").match(
        /linkedin\.com\/posts\/([^/?#]+)/i
      );
      if (post?.[1]) {
        const slug = decodeURIComponent(post[1]).split("_")[0] || "";
        if (slug.length >= 3) {
          enriched.push({
            ...s,
            url: `https://www.linkedin.com/in/${slug}`,
          });
        }
      }
    }
    const matched = matchExaLinkedin(c, collectVerifiedLinkedinFromExa(enriched));
    if (matched && slugLooksLikePerson(matched, c.prenom, c.nom)) {
      out[i] = { ...c, linkedinUrl: matched };
      filled += 1;
    }
  }

  console.log(
    `[carto-ai] linkedin fill-exa: looked=${missing.length} filled=${filled}`
  );
  return out;
}
