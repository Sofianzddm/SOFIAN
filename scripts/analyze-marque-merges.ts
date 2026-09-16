/**
 * ANALYSE EN LECTURE SEULE — quelles marques peut-on fusionner ?
 *
 * Ne modifie / ne supprime RIEN. Réutilise exactement l'algorithme de
 * détection de /api/marques/duplicates (exact + typo + préfixe + trigrammes)
 * et produit un rapport priorisé avec, pour chaque groupe :
 *   - la fiche à GARDER (score de relations le plus élevé, sinon la plus ancienne)
 *   - les fiches à FUSIONNER dedans
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/analyze-marque-merges.ts
 *   npx tsx --env-file=.env scripts/analyze-marque-merges.ts --threshold=0.72
 */
import { prisma } from "../src/lib/prisma";

const THRESHOLD = (() => {
  const arg = process.argv.find((a) => a.startsWith("--threshold="));
  const v = arg ? parseFloat(arg.split("=")[1]) : 0.78;
  return Math.max(0.5, Math.min(0.95, Number.isFinite(v) ? v : 0.78));
})();

function marqueSlug(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

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

type Counts = {
  collaborations: number;
  negociations: number;
  inboundOpportunities: number;
  contactMissions: number;
  demandesGift: number;
  contacts: number;
};
type Row = {
  id: string;
  nom: string;
  secteur: string | null;
  slug: string;
  createdAt: Date;
  counts: Counts;
};
type Reason = "EXACT" | "TYPO" | "PREFIX" | "TRIGRAM";
type Group = { key: string; reason: Reason; marques: Row[] };

const REASON_FR: Record<Reason, string> = {
  EXACT: "DOUBLON EXACT (même nom normalisé)",
  TYPO: "TYPO / FAUTE DE FRAPPE",
  PREFIX: "SOUS-PRODUIT / PRÉFIXE",
  TRIGRAM: "VARIANTE PROCHE",
};

const score = (r: Row) =>
  r.counts.collaborations * 10 +
  r.counts.negociations * 5 +
  r.counts.inboundOpportunities +
  r.counts.contactMissions +
  r.counts.contacts;

const totalRel = (r: Row) =>
  r.counts.collaborations +
  r.counts.negociations +
  r.counts.inboundOpportunities +
  r.counts.contactMissions +
  r.counts.demandesGift +
  r.counts.contacts;

const sortByScore = (arr: Row[]) =>
  arr.sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

async function main() {
  const all = await prisma.marque.findMany({
    select: {
      id: true,
      nom: true,
      secteur: true,
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

  const rows: Row[] = all.map((m) => ({
    id: m.id,
    nom: m.nom,
    secteur: m.secteur,
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

  const groups: Group[] = [];
  const claimedIds = new Set<string>();

  // 1) Doublons exacts (même slug)
  const bySlug = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.slug) continue;
    const arr = bySlug.get(r.slug) ?? [];
    arr.push(r);
    bySlug.set(r.slug, arr);
  }
  for (const [slug, marques] of bySlug.entries()) {
    if (marques.length < 2) continue;
    sortByScore(marques);
    groups.push({ key: `exact:${slug}`, reason: "EXACT", marques });
    for (const m of marques) claimedIds.add(m.id);
  }

  // 2) Fuzzy : typos, préfixes, trigrammes
  const free = rows.filter((r) => !claimedIds.has(r.id) && r.slug);
  const byFirstLetter = new Map<string, Row[]>();
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
  const simByPair = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);
  const setReason = (a: string, b: string, why: "TYPO" | "PREFIX" | "TRIGRAM", sim: number) => {
    const k = pairKey(a, b);
    if (!reasonByPair.has(k)) {
      reasonByPair.set(k, why);
      simByPair.set(k, sim);
    }
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
        if (short.length >= 4 && long.startsWith(short) && long.length > short.length) {
          union(a.id, b.id);
          setReason(a.id, b.id, "PREFIX", trigramSimilarity(a.slug, b.slug));
          continue;
        }

        const minLen = Math.min(a.slug.length, b.slug.length);
        const maxLen = Math.max(a.slug.length, b.slug.length);
        if (maxLen - minLen <= 2 && minLen >= 4) {
          const d = levenshtein(a.slug, b.slug);
          if (d > 0 && d <= Math.min(2, Math.floor(minLen / 4))) {
            union(a.id, b.id);
            setReason(a.id, b.id, "TYPO", trigramSimilarity(a.slug, b.slug));
            continue;
          }
        }

        const sim = trigramSimilarity(a.slug, b.slug);
        if (sim >= THRESHOLD) {
          union(a.id, b.id);
          setReason(a.id, b.id, "TRIGRAM", sim);
        }
      }
    }
  }

  const clusters = new Map<string, Row[]>();
  for (const r of free) {
    const root = find(r.id);
    const arr = clusters.get(root) ?? [];
    arr.push(r);
    clusters.set(root, arr);
  }
  for (const [root, marques] of clusters.entries()) {
    if (marques.length < 2) continue;
    sortByScore(marques);
    let reason: Reason = "TRIGRAM";
    const reasons: Record<string, number> = {};
    for (let i = 0; i < marques.length; i++) {
      for (let j = i + 1; j < marques.length; j++) {
        const r = reasonByPair.get(pairKey(marques[i].id, marques[j].id));
        if (r) reasons[r] = (reasons[r] || 0) + 1;
      }
    }
    if ((reasons.TYPO ?? 0) > 0) reason = "TYPO";
    else if ((reasons.PREFIX ?? 0) > 0) reason = "PREFIX";
    groups.push({ key: `fuzzy:${root}`, reason, marques });
  }

  // Tri : d'abord exact, puis par nombre de fiches puis par relations impactées
  const order: Record<Reason, number> = { EXACT: 0, TYPO: 1, TRIGRAM: 2, PREFIX: 3 };
  groups.sort((a, b) => {
    if (order[a.reason] !== order[b.reason]) return order[a.reason] - order[b.reason];
    return b.marques.length - a.marques.length;
  });

  // ---------------------------------------------------------------- Rapport
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString("fr-FR");
  const bar = "=".repeat(80);
  const exactGroups = groups.filter((g) => g.reason === "EXACT");
  const fuzzyGroups = groups.filter((g) => g.reason !== "EXACT");
  const totalToMerge = groups.reduce((s, g) => s + (g.marques.length - 1), 0);

  console.log(bar);
  console.log("ANALYSE FUSION DE MARQUES — LECTURE SEULE (aucune modif effectuée)");
  console.log(bar);
  console.log(`Marques en base            : ${rows.length}`);
  console.log(`Groupes fusionnables       : ${groups.length}`);
  console.log(`  • doublons exacts (sûrs) : ${exactGroups.length}`);
  console.log(`  • variantes/typos (revue): ${fuzzyGroups.length}`);
  console.log(`Fiches à absorber au total : ${totalToMerge}  (→ ${rows.length} deviendrait ${rows.length - totalToMerge})`);
  console.log(`Seuil trigramme utilisé    : ${Math.round(THRESHOLD * 100)}%`);
  console.log(bar);

  const printGroup = (g: Group, n: number) => {
    const keep = g.marques[0];
    const sources = g.marques.slice(1);
    console.log(`\n[${n}] ${REASON_FR[g.reason]}  — ${g.marques.length} fiches`);
    console.log(`    ✅ GARDER : "${keep.nom}"  (${totalRel(keep)} relations · créée ${fmtDate(keep.createdAt)}${keep.secteur ? ` · ${keep.secteur}` : ""})`);
    for (const s of sources) {
      const simTxt = (() => {
        const k = pairKey(keep.id, s.id);
        const sim = simByPair.get(k);
        return sim != null ? ` · ~${Math.round(sim * 100)}%` : "";
      })();
      console.log(`    ↳ fusionner : "${s.nom}"  (${totalRel(s)} relations · créée ${fmtDate(s.createdAt)}${simTxt})`);
    }
  };

  if (exactGroups.length) {
    console.log("\n" + "#".repeat(80));
    console.log("# DOUBLONS EXACTS — fusion recommandée sans risque");
    console.log("#".repeat(80));
    exactGroups.forEach((g, i) => printGroup(g, i + 1));
  }
  if (fuzzyGroups.length) {
    console.log("\n" + "#".repeat(80));
    console.log("# VARIANTES / TYPOS / SOUS-PRODUITS — à valider à l'œil");
    console.log("#".repeat(80));
    fuzzyGroups.forEach((g, i) => printGroup(g, exactGroups.length + i + 1));
  }

  // Dump JSON structuré (pour le canvas) — index stable = ordre d'affichage.
  const fs = await import("fs");
  const jsonOut = groups.map((g, i) => ({
    n: i + 1,
    reason: g.reason,
    keep: { nom: g.marques[0].nom, rel: totalRel(g.marques[0]) },
    sources: g.marques.slice(1).map((s) => ({ nom: s.nom, rel: totalRel(s) })),
  }));
  fs.writeFileSync(
    "scripts/marque-merge-groups.json",
    JSON.stringify(jsonOut, null, 2),
    "utf8"
  );
  console.log(`\n[JSON écrit] scripts/marque-merge-groups.json (${jsonOut.length} groupes)`);

  if (!groups.length) {
    console.log("\n🎉 Aucun doublon détecté. Base propre !");
  } else {
    console.log("\n" + bar);
    console.log("Pour fusionner : /marques/duplicates (onglet Strict = exacts, Flou = variantes).");
    console.log("La fiche « à garder » absorbe automatiquement les relations des autres.");
    console.log(bar);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
