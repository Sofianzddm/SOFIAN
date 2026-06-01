import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { marqueSlug } from "@/lib/marque-resolver";

const ALLOWED = ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"];

type Counts = {
  collaborations: number;
  negociations: number;
  inboundOpportunities: number;
  contactMissions: number;
  demandesGift: number;
  contacts: number;
};

type MarqueRow = {
  id: string;
  nom: string;
  slug: string;
  createdAt: Date;
  counts: Counts;
};

type Group = {
  key: string;
  reason: "EXACT" | "TYPO" | "PREFIX" | "TRIGRAM";
  marques: MarqueRow[];
};

/**
 * Distance de Levenshtein (typos courts). O(n*m).
 */
function levenshtein(a: string, b: string): number {
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

/**
 * Similarité par trigrammes (0..1) — Jaccard sur trigrammes.
 * Robuste contre les ordres / abréviations partielles.
 */
function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}
function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * GET /api/marques/duplicates
 *
 * @param mode  "exact" (défaut) — même slug
 *              "fuzzy"          — slug égal + typos (Levenshtein ≤ 2) + préfixe + trigrammes ≥ seuil
 * @param threshold  0.0..1.0 (défaut 0.78) — seuil de similarité trigramme
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!ALLOWED.includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "exact") as "exact" | "fuzzy";
    const threshold = Math.max(0.5, Math.min(0.95, parseFloat(searchParams.get("threshold") || "0.78")));

    const all = await prisma.marque.findMany({
      select: {
        id: true,
        nom: true,
        slug: true,
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

    const rows: MarqueRow[] = all.map((m) => ({
      id: m.id,
      nom: m.nom,
      slug: (m.slug && m.slug.trim()) || marqueSlug(m.nom),
      createdAt: m.createdAt,
      counts: {
        collaborations: m._count.collaborations,
        negociations: m._count.negociations,
        inboundOpportunities: m._count.inboundOpportunities,
        contactMissions: m._count.contactMissions,
        demandesGift: m._count.demandesGift,
        contacts: m._count.contacts,
      },
    }));

    const score = (r: MarqueRow) =>
      r.counts.collaborations * 10 +
      r.counts.negociations * 5 +
      r.counts.inboundOpportunities +
      r.counts.contactMissions +
      r.counts.contacts;

    const sortByScore = (arr: MarqueRow[]) =>
      arr.sort((a, b) => {
        const sb = score(b);
        const sa = score(a);
        if (sb !== sa) return sb - sa;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    // -----------------------------------------------------------------
    // 1) Doublons exacts (même slug)
    // -----------------------------------------------------------------
    const bySlug = new Map<string, MarqueRow[]>();
    for (const r of rows) {
      if (!r.slug) continue;
      const arr = bySlug.get(r.slug) ?? [];
      arr.push(r);
      bySlug.set(r.slug, arr);
    }

    const groups: Group[] = [];
    const claimedIds = new Set<string>();

    for (const [slug, marques] of bySlug.entries()) {
      if (marques.length < 2) continue;
      sortByScore(marques);
      groups.push({ key: `exact:${slug}`, reason: "EXACT", marques });
      for (const m of marques) claimedIds.add(m.id);
    }

    // -----------------------------------------------------------------
    // 2) Mode "fuzzy" : ajoute typos, préfixes, trigrammes
    // -----------------------------------------------------------------
    if (mode === "fuzzy") {
      const free = rows.filter((r) => !claimedIds.has(r.id) && r.slug);

      // Index par 1ère lettre pour limiter les paires testées
      const byFirstLetter = new Map<string, MarqueRow[]>();
      for (const r of free) {
        const k = r.slug[0];
        const arr = byFirstLetter.get(k) ?? [];
        arr.push(r);
        byFirstLetter.set(k, arr);
      }

      // Union-find pour clusteriser les paires "proches"
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

      // Comparaisons : on regarde aussi les voisins 1 lettre à côté (typos sur 1ère lettre rares mais possibles)
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

            // PRÉFIXE — "avene" préfixe de "aveneultraserumspf50"
            // On accepte si l'un est strict préfixe de l'autre ET que le nom court a ≥ 4 chars
            const short = a.slug.length <= b.slug.length ? a.slug : b.slug;
            const long = a.slug.length <= b.slug.length ? b.slug : a.slug;
            if (short.length >= 4 && long.startsWith(short) && long.length > short.length) {
              union(a.id, b.id);
              setReason(a.id, b.id, "PREFIX");
              continue;
            }

            // TYPO — Levenshtein 1 ou 2 sur slugs courts (sinon faux positifs)
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

            // TRIGRAMME — similarité ≥ threshold
            const sim = trigramSimilarity(a.slug, b.slug);
            if (sim >= threshold) {
              union(a.id, b.id);
              setReason(a.id, b.id, "TRIGRAM");
            }
          }
        }
      }

      // Construire les clusters
      const clusters = new Map<string, MarqueRow[]>();
      for (const r of free) {
        const root = find(r.id);
        const arr = clusters.get(root) ?? [];
        arr.push(r);
        clusters.set(root, arr);
      }

      for (const [root, marques] of clusters.entries()) {
        if (marques.length < 2) continue;
        sortByScore(marques);
        // Raison majoritaire dans le cluster
        let reason: Group["reason"] = "TRIGRAM";
        const reasons: Record<string, number> = {};
        for (let i = 0; i < marques.length; i++) {
          for (let j = i + 1; j < marques.length; j++) {
            const a = marques[i].id;
            const b = marques[j].id;
            const k = a < b ? `${a}::${b}` : `${b}::${a}`;
            const r = reasonByPair.get(k);
            if (r) reasons[r] = (reasons[r] || 0) + 1;
          }
        }
        if ((reasons.TYPO ?? 0) > 0) reason = "TYPO";
        else if ((reasons.PREFIX ?? 0) > 0) reason = "PREFIX";
        groups.push({ key: `fuzzy:${root}`, reason, marques });
      }
    }

    groups.sort((a, b) => b.marques.length - a.marques.length);

    return NextResponse.json({
      mode,
      threshold,
      groups,
      totalGroups: groups.length,
      totalMarquesAFusionner: groups.reduce((sum, g) => sum + (g.marques.length - 1), 0),
    });
  } catch (error) {
    console.error("GET /api/marques/duplicates:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
