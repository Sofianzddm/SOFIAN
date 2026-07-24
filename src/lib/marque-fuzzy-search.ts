import { marqueSlug } from "@/lib/marque-resolver";
import { levenshtein, trigramSimilarity } from "@/lib/marque-fuzzy-detect";

/**
 * Recherche floue « tolérante aux fautes » pour l'autocomplete marque/entreprise.
 *
 * Le `contains` SQL ne trouve rien si une lettre diffère ("nkie" ≠ "nike").
 * Ici on classe des candidats par similarité (sous-chaîne, distance de
 * Levenshtein, trigrammes) sur le slug normalisé (minuscules, sans accents),
 * mot par mot, pour rapprocher les marques même en cas de typo.
 */

/** Score 0→1 entre une requête et un libellé unique. */
function scorePair(qs: string, ts: string): number {
  if (!qs || !ts) return 0;
  if (qs === ts) return 1;
  // Sous-chaîne : "nik" dans "nike", ou "nike" dans "nikefrance"
  if (ts.includes(qs) || qs.includes(ts)) {
    const ratio = Math.min(qs.length, ts.length) / Math.max(qs.length, ts.length);
    return 0.9 + 0.1 * ratio;
  }
  const maxLen = Math.max(qs.length, ts.length);
  const lev = levenshtein(qs, ts);
  const levScore = maxLen === 0 ? 0 : 1 - lev / maxLen;
  const tri = trigramSimilarity(qs, ts);
  return Math.max(levScore, tri);
}

/**
 * Meilleur score entre la requête et un libellé, en tenant compte de chaque mot
 * (ex. "france" doit rapprocher "Nike France", "dove" → "Dove Beauty").
 */
export function fuzzyLabelScore(query: string, label: string): number {
  const qs = marqueSlug(query);
  if (!qs) return 0;
  const full = marqueSlug(label);
  let best = scorePair(qs, full);
  // Mots individuels (on garde les séparateurs d'origine avant slugification)
  const words = label
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => marqueSlug(w))
    .filter((w) => w.length >= 2);
  for (const w of words) {
    const s = scorePair(qs, w);
    if (s > best) best = s;
  }
  return best;
}

export type FuzzyCandidate = {
  id: string;
  /** Libellés à comparer : nom de la marque + alias éventuels. */
  labels: string[];
};

export type FuzzyRanked = { id: string; score: number };

/**
 * Classe des candidats par score décroissant et ne garde que ceux au-dessus du
 * seuil. `threshold` par défaut ≈ tolère une faute sur un mot court.
 */
export function rankFuzzyCandidates(
  query: string,
  candidates: FuzzyCandidate[],
  { threshold = 0.5, limit = 8 }: { threshold?: number; limit?: number } = {}
): FuzzyRanked[] {
  const scored: FuzzyRanked[] = [];
  for (const c of candidates) {
    let best = 0;
    for (const label of c.labels) {
      const s = fuzzyLabelScore(query, label);
      if (s > best) best = s;
    }
    if (best >= threshold) scored.push({ id: c.id, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Cache mémoire court pour la liste légère des candidats (id + libellés).
 * Évite de recharger toute la table à chaque frappe de l'autocomplete.
 */
const candidatesCache = new Map<string, { at: number; data: FuzzyCandidate[] }>();

export async function loadFuzzyCandidatesCached(
  cacheKey: string,
  fetcher: () => Promise<FuzzyCandidate[]>,
  ttlMs = 60_000
): Promise<FuzzyCandidate[]> {
  const cached = candidatesCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.at < ttlMs) return cached.data;
  const data = await fetcher();
  candidatesCache.set(cacheKey, { at: now, data });
  return data;
}
