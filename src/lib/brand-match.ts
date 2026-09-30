/**
 * Matching marque tolérant aux fautes / casses / suffixes,
 * sans fusionner des marques distinctes d'un même groupe (Kiehl's ≠ L'Oréal).
 */

const COMMON_SUFFIX =
  /^(beauty|beaute|cosmetics|cosmetic|paris|milano|enprovence|bijoux|sport|france|fr|official|co|ltd|sa|collection)?$/;

/** Préfixes marketing fréquents : Yves Saint Laurent ↔ Saint Laurent. */
const OPTIONAL_PREFIXES = ["yves", "polo"] as const;

/**
 * Fautes / orthographes connues → empreinte canonique.
 * (évite d'abaisser le seuil Levenshtein qui fusionnerait Zag/Gas, etc.)
 */
const BRAND_ALIASES: Record<string, string> = {
  clarcks: "clarks",
  bulgari: "bvlgari",
  porshe: "porsche",
  sworvski: "swarovski",
  swarowski: "swarovski",
  aquazurra: "aquazzura",
  dyptique: "diptyque",
  voyagepirate: "voyageprive",
  voyageprivee: "voyageprive",
  yooji: "yoogi",
  // Faultes pipeline casting (audit 2026-09)
  jimmyfaily: "jimmyfairly",
  isabelmarrant: "isabelmarant",
  gallerieslafayette: "galerieslafayette",
  keratase: "kerastase",
  veuvecliquot: "veuveclicquot",
  linvoges: "linvosges",
  rogerviver: "rogervivier",
  vestiairecollectif: "vestiairecollective",
  juliettehasgun: "juliettehasagun",
  ciaokonbucha: "ciaokombucha",
  doledemonsieur: "droledemonsieur",
  dressange: "dessange",
  ceio: "celio",
  acnestudio: "acnestudios",
};

/** Libellé principal : ignore "(groupe…)" et "A / B". */
export function primaryBrandLabel(value: string): string {
  return String(value || "")
    .split(/[(/]/)[0]
    .trim();
}

function canonicalizeFingerprint(fp: string): string {
  return BRAND_ALIASES[fp] || fp;
}

/** Empreinte comparable : accents, apostrophes, ponctuation retirés. */
export function brandFingerprint(value: string): string {
  const fp = primaryBrandLabel(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "")
    .replace(/&/g, "and")
    // "The North Face" ↔ "Northface" (mot entier, pas Theory / Lacoste)
    .replace(/^(the|le|la|les)\s+/i, "")
    // "Palais du thé" ↔ "Palais des thés"
    .replace(/\b(du|des|de)\s+/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return canonicalizeFingerprint(fp);
}

/** Variantes d'empreinte après retrait d'un préfixe optionnel (yves, polo). */
function fingerprintVariants(fp: string): string[] {
  const out = [fp];
  for (const prefix of OPTIONAL_PREFIXES) {
    if (fp.startsWith(prefix) && fp.length > prefix.length + 4) {
      out.push(canonicalizeFingerprint(fp.slice(prefix.length)));
    }
  }
  return out;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

/**
 * true si A et B désignent très probablement la même marque.
 * - égalité normalisée / alias
 * - faute de frappe (similarité élevée, longueurs proches)
 * - forme courte vs longue avec suffixe usuel (Benefit / Benefit Cosmetics)
 * - préfixe optionnel (Yves Saint Laurent / Saint Laurent)
 */
export function brandsLookSame(a: string, b: string): boolean {
  const fa0 = brandFingerprint(a);
  const fb0 = brandFingerprint(b);
  if (!fa0 || !fb0) return false;

  const as = fingerprintVariants(fa0);
  const bs = fingerprintVariants(fb0);
  for (const fa of as) {
    for (const fb of bs) {
      if (fa === fb) return true;

      const lenRatio =
        Math.min(fa.length, fb.length) / Math.max(fa.length, fb.length);
      if (fa.length >= 5 && fb.length >= 5 && lenRatio >= 0.8) {
        if (levenshteinSimilarity(fa, fb) >= 0.88) return true;
      }

      const [shorter, longer] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
      if (shorter.length >= 5 && longer.startsWith(shorter)) {
        const rest = longer.slice(shorter.length);
        if (COMMON_SUFFIX.test(rest)) return true;
      }
    }
  }

  return false;
}

/** true si un libellé de `as` matche un libellé de `bs`. */
export function anyBrandLabelsMatch(
  as: Array<string | null | undefined>,
  bs: Array<string | null | undefined>
): boolean {
  const left = as.map((x) => String(x || "").trim()).filter(Boolean);
  const right = bs.map((x) => String(x || "").trim()).filter(Boolean);
  for (const a of left) {
    for (const b of right) {
      if (brandsLookSame(a, b)) return true;
    }
  }
  return false;
}
