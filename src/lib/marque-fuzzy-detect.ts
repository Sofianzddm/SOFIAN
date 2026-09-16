import type { PrismaClient } from "@prisma/client";
import { marqueSlug } from "@/lib/marque-resolver";

export type MarqueDedupeCounts = {
  collaborations: number;
  negociations: number;
  inboundOpportunities: number;
  contactMissions: number;
  demandesGift: number;
  contacts: number;
};

export type MarqueDedupeRow = {
  id: string;
  nom: string;
  slug: string;
  secteur: string | null;
  createdAt: Date;
  counts: MarqueDedupeCounts;
};

export type DedupeGroupReason = "EXACT" | "TYPO" | "PREFIX" | "TRIGRAM";

export type DedupeGroup = {
  key: string;
  reason: DedupeGroupReason;
  marques: MarqueDedupeRow[];
};

export function marqueActivityScore(r: MarqueDedupeRow): number {
  return (
    r.counts.collaborations * 10 +
    r.counts.negociations * 5 +
    r.counts.inboundOpportunities +
    r.counts.contactMissions +
    r.counts.contacts
  );
}

export function sortMarquesByScore(arr: MarqueDedupeRow[]): MarqueDedupeRow[] {
  return arr.sort((a, b) => {
    const sb = marqueActivityScore(b);
    const sa = marqueActivityScore(a);
    if (sb !== sa) return sb - sa;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Détection de doublons CRM marques FR uniquement.
 * L'annuaire BENELUX (`BeneluxCompany`) est une table séparée : jamais chargé
 * ni fusionné ici.
 */
export async function loadMarquesForDedupe(
  client: Pick<PrismaClient, "marque">
): Promise<MarqueDedupeRow[]> {
  const all = await client.marque.findMany({
    select: {
      id: true,
      nom: true,
      slug: true,
      secteur: true,
      createdAt: true,
      _count: {
        select: {
          collaborations: true,
          negociations: true,
          inboundOpportunities: true,
          contactMissions: true,
          demandesGift: true,
          contacts: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return all
    .map((m) => ({
      id: m.id,
      nom: m.nom,
      slug: (m.slug && m.slug.trim()) || marqueSlug(m.nom),
      secteur: m.secteur,
      createdAt: m.createdAt,
      counts: {
        collaborations: m._count.collaborations,
        negociations: m._count.negociations,
        inboundOpportunities: m._count.inboundOpportunities,
        contactMissions: m._count.contactMissions,
        demandesGift: m._count.demandesGift,
        contacts: m._count.contacts,
      },
    }))
    .filter((r) => Boolean(r.slug));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for (let i = 0; i <= bl; i++) v0[i] = i;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Groupes avec le même slug stocké OU le même nom normalisé (doublons exacts). */
export function detectExactDuplicateGroups(rows: MarqueDedupeRow[]): DedupeGroup[] {
  const byKey = new Map<string, MarqueDedupeRow[]>();
  for (const r of rows) {
    // Clé = nom normalisé (ex. deux « Boohoo » avec slugs légaux différents).
    // Fallback sur le slug stocké si le nom est vide.
    const key = marqueSlug(r.nom) || r.slug;
    if (!key) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  const groups: DedupeGroup[] = [];
  const claimed = new Set<string>();
  for (const [key, marques] of byKey.entries()) {
    if (marques.length < 2) continue;
    groups.push({ key: `exact:${key}`, reason: "EXACT", marques: sortMarquesByScore([...marques]) });
    for (const m of marques) claimed.add(m.id);
  }

  // Doublons de slug stocké non déjà couverts (ex. alias / nom différent, même slug).
  const bySlug = new Map<string, MarqueDedupeRow[]>();
  for (const r of rows) {
    if (claimed.has(r.id) || !r.slug) continue;
    const arr = bySlug.get(r.slug) ?? [];
    arr.push(r);
    bySlug.set(r.slug, arr);
  }
  for (const [slug, marques] of bySlug.entries()) {
    if (marques.length < 2) continue;
    groups.push({ key: `exact-slug:${slug}`, reason: "EXACT", marques: sortMarquesByScore([...marques]) });
  }

  return groups;
}

/**
 * Groupes flous : typos, préfixes (sous-produits), similarité trigrammes.
 * Exclut les IDs déjà dans un groupe exact.
 */
export function detectFuzzyDuplicateGroups(
  rows: MarqueDedupeRow[],
  threshold = 0.78,
  excludeIds: Set<string> = new Set()
): DedupeGroup[] {
  const free = rows.filter((r) => !excludeIds.has(r.id));
  if (free.length < 2) return [];

  const byFirstLetter = new Map<string, MarqueDedupeRow[]>();
  for (const r of free) {
    const k = r.slug[0];
    const arr = byFirstLetter.get(k) ?? [];
    arr.push(r);
    byFirstLetter.set(k, arr);
  }

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) || x;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const r of free) parent.set(r.id, r.id);

  const reasonByPair = new Map<string, "TYPO" | "PREFIX" | "TRIGRAM">();
  const setReason = (a: string, b: string, why: "TYPO" | "PREFIX" | "TRIGRAM") => {
    const k = a < b ? `${a}::${b}` : `${b}::${a}`;
    if (!reasonByPair.has(k)) reasonByPair.set(k, why);
  };

  const letters = Array.from(byFirstLetter.keys());
  for (const L of letters) {
    const bucket = byFirstLetter.get(L) || [];
    const neighbors = [bucket];
    const idx = letters.indexOf(L);
    if (idx > 0) neighbors.push(byFirstLetter.get(letters[idx - 1]) || []);
    if (idx < letters.length - 1) neighbors.push(byFirstLetter.get(letters[idx + 1]) || []);
    const candidates = neighbors.flat();

    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      for (let j = 0; j < candidates.length; j++) {
        const b = candidates[j];
        if (b.id === a.id) continue;
        if (a.slug.length < 3 || b.slug.length < 3) continue;

        const short = a.slug.length <= b.slug.length ? a.slug : b.slug;
        const long = a.slug.length <= b.slug.length ? b.slug : a.slug;
        // Préfixe : "apm" → "apmmonaco" (suffixe ≥ 3 chars pour éviter "abc"+"abcd")
        if (short.length >= 3 && long.startsWith(short) && long.length - short.length >= 3) {
          union(a.id, b.id);
          setReason(a.id, b.id, "PREFIX");
          continue;
        }

        const minLen = Math.min(a.slug.length, b.slug.length);
        const maxLen = Math.max(a.slug.length, b.slug.length);
        if (maxLen - minLen <= 2 && minLen >= 4) {
          const d = levenshtein(a.slug, b.slug);
          if (d > 0 && d <= Math.min(2, Math.floor(minLen / 4))) {
            union(a.id, b.id);
            setReason(a.id, b.id, "TYPO");
            continue;
          }
        }

        const sim = trigramSimilarity(a.slug, b.slug);
        if (sim >= threshold) {
          union(a.id, b.id);
          setReason(a.id, b.id, "TRIGRAM");
        }
      }
    }
  }

  const clusters = new Map<string, MarqueDedupeRow[]>();
  for (const r of free) {
    const root = find(r.id);
    const arr = clusters.get(root) ?? [];
    arr.push(r);
    clusters.set(root, arr);
  }

  const groups: DedupeGroup[] = [];
  for (const [root, marques] of clusters.entries()) {
    if (marques.length < 2) continue;
    const sorted = sortMarquesByScore([...marques]);
    let reason: DedupeGroupReason = "TRIGRAM";
    const reasons: Record<string, number> = {};
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i].id;
        const b = sorted[j].id;
        const k = a < b ? `${a}::${b}` : `${b}::${a}`;
        const r = reasonByPair.get(k);
        if (r) reasons[r] = (reasons[r] || 0) + 1;
      }
    }
    if ((reasons.TYPO ?? 0) > 0) reason = "TYPO";
    else if ((reasons.PREFIX ?? 0) > 0) reason = "PREFIX";
    groups.push({ key: `fuzzy:${root}`, reason, marques: sorted });
  }

  return groups;
}

/** Exact + fuzzy (sans doublons entre les deux listes). */
export function detectAllCandidateGroups(
  rows: MarqueDedupeRow[],
  fuzzyThreshold = 0.78
): DedupeGroup[] {
  const exact = detectExactDuplicateGroups(rows);
  const claimed = new Set<string>();
  for (const g of exact) for (const m of g.marques) claimed.add(m.id);
  const fuzzy = detectFuzzyDuplicateGroups(rows, fuzzyThreshold, claimed);
  return [...exact, ...fuzzy].sort((a, b) => b.marques.length - a.marques.length);
}

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

export function groupMemberKey(marqueIds: string[]): string {
  return [...marqueIds].sort().join("|");
}

export type SimilarMarqueMatch = {
  marque: MarqueDedupeRow;
  reason: DedupeGroupReason;
  /** Similarité trigramme 0..1 (1 = slug identique). */
  similarity: number;
};

/**
 * Trouve les fiches proches d'une marque donnée (exact / typo / préfixe / trigramme).
 * Utilisé sur la fiche marque pour proposer une fusion en place.
 *
 * Important : on compare à la fois le slug stocké (souvent une raison sociale)
 * ET le nom normalisé — sinon deux fiches « Boohoo » avec des slugs légaux
 * différents (`boohoofrancesas` / `boohoocomuklimited`) ne matchent jamais.
 */
export function findSimilarToMarque(
  rows: MarqueDedupeRow[],
  marqueId: string,
  threshold = 0.78
): SimilarMarqueMatch[] {
  const target = rows.find((r) => r.id === marqueId);
  if (!target) return [];

  const targetNameKey = marqueSlug(target.nom);
  const targetKeys = Array.from(
    new Set([target.slug, targetNameKey].filter((k) => k && k.length >= 2))
  );
  if (targetKeys.length === 0) return [];

  const matches: SimilarMarqueMatch[] = [];
  const seen = new Set<string>();

  for (const other of rows) {
    if (other.id === target.id) continue;
    const otherNameKey = marqueSlug(other.nom);
    const otherKeys = Array.from(
      new Set([other.slug, otherNameKey].filter((k) => k && k.length >= 2))
    );
    if (otherKeys.length === 0) continue;

    // Exact : même nom normalisé OU même slug stocké.
    if (
      (targetNameKey && otherNameKey && targetNameKey === otherNameKey) ||
      (target.slug && other.slug && target.slug === other.slug)
    ) {
      matches.push({ marque: other, reason: "EXACT", similarity: 1 });
      seen.add(other.id);
      continue;
    }

    let best: SimilarMarqueMatch | null = null;
    for (const a of targetKeys) {
      for (const b of otherKeys) {
        if (a.length < 3 || b.length < 3) continue;

        const short = a.length <= b.length ? a : b;
        const long = a.length <= b.length ? b : a;
        if (short.length >= 3 && long.startsWith(short) && long.length - short.length >= 3) {
          const cand: SimilarMarqueMatch = {
            marque: other,
            reason: "PREFIX",
            similarity: short.length / long.length,
          };
          if (!best || cand.similarity > best.similarity) best = cand;
          continue;
        }

        const minLen = Math.min(a.length, b.length);
        const maxLen = Math.max(a.length, b.length);
        if (maxLen - minLen <= 2 && minLen >= 4) {
          const d = levenshtein(a, b);
          if (d > 0 && d <= Math.min(2, Math.floor(minLen / 4))) {
            const cand: SimilarMarqueMatch = {
              marque: other,
              reason: "TYPO",
              similarity: 1 - d / maxLen,
            };
            if (!best || cand.similarity > best.similarity) best = cand;
            continue;
          }
        }

        const sim = trigramSimilarity(a, b);
        if (sim >= threshold) {
          const cand: SimilarMarqueMatch = {
            marque: other,
            reason: "TRIGRAM",
            similarity: sim,
          };
          if (!best || cand.similarity > best.similarity) best = cand;
        }
      }
    }

    if (best && !seen.has(other.id)) {
      matches.push(best);
      seen.add(other.id);
    }
  }

  return matches.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return marqueActivityScore(b.marque) - marqueActivityScore(a.marque);
  });
}
