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
 * On ne drop JAMAIS un LinkedIn déjà présent (même LLM) — priorité à ne louper aucun profil.
 * Si Exa/Apollo a un match nom → on préfère ce lien (plus fiable).
 * Sinon on garde le lien fourni, juste normalisé.
 */
export function attachVerifiedLinkedin(opts: {
  contacts: CartoAiContactCandidate[];
  snippets: ExaGroundingSnippet[];
}): CartoAiContactCandidate[] {
  const verified = collectVerifiedLinkedinFromExa(opts.snippets);

  let kept = 0;
  let upgraded = 0;
  let attached = 0;

  const out = opts.contacts.map((c) => {
    const existing = normalizePersonLinkedin(c.linkedinUrl);
    const matched = matchExaLinkedin(c, verified);

    if (matched) {
      if (!existing) attached += 1;
      else if (existing.toLowerCase() !== matched.toLowerCase()) upgraded += 1;
      else kept += 1;
      return { ...c, linkedinUrl: matched };
    }

    if (existing) {
      kept += 1;
      return { ...c, linkedinUrl: existing };
    }

    // Garder l'URL brute si normalise a échoué mais qu'il y a quelque chose
    if (c.linkedinUrl?.trim()) {
      kept += 1;
      return c;
    }
    return { ...c, linkedinUrl: null };
  });

  console.log(
    `[carto-ai] linkedin: kept=${kept} upgraded_exa=${upgraded} attached_exa=${attached} exa_profiles=${verified.length}`
  );
  return out;
}
