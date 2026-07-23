/**
 * Déduit le motif d'email d'une marque à partir des adresses déjà connues,
 * puis propose une adresse pour un contact sans email.
 *
 * Exemples de motifs détectés :
 *  - prenom.nom@domaine.fr          → sophie.martin@joeo.fr
 *  - p.nom@domaine.fr                → s.martin@joeo.fr
 *  - prenom@domaine.fr               → sophie@joeo.fr
 *  - prenom_nom@domaine.fr           → sophie_martin@joeo.fr
 *  - prenomnom@domaine.fr            → sophiemartin@joeo.fr
 */

export type EmailPatternKind =
  | "prenom.nom"
  | "p.nom"
  | "prenom"
  | "prenom_nom"
  | "prenomnom"
  | "nom.prenom"
  | "nom";

export type DetectedEmailPattern = {
  kind: EmailPatternKind;
  domain: string;
  /** Nombre d'emails connus qui matchent ce motif (confiance). */
  matches: number;
  /** Total d'emails analysés sur le domaine. */
  sampleSize: number;
};

export type EmailSuggestion = {
  email: string;
  kind: EmailPatternKind;
  domain: string;
  confidence: "high" | "medium" | "low";
  label: string;
};

const stripAccents = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Slug email : minuscules, sans accents, lettres/chiffres uniquement. */
export function emailSlug(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

export function extractEmailDomain(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return m?.[1] || null;
}

function buildLocal(
  kind: EmailPatternKind,
  prenom: string,
  nom: string
): string | null {
  const p = emailSlug(prenom);
  const n = emailSlug(nom);
  if (!n && kind !== "prenom") return null;
  if (!p && (kind === "prenom" || kind === "prenom.nom" || kind === "p.nom" || kind === "prenom_nom" || kind === "prenomnom" || kind === "nom.prenom")) {
    return null;
  }
  switch (kind) {
    case "prenom.nom":
      return p && n ? `${p}.${n}` : null;
    case "p.nom":
      return p && n ? `${p[0]}.${n}` : null;
    case "prenom":
      return p || null;
    case "prenom_nom":
      return p && n ? `${p}_${n}` : null;
    case "prenomnom":
      return p && n ? `${p}${n}` : null;
    case "nom.prenom":
      return p && n ? `${n}.${p}` : null;
    case "nom":
      return n || null;
    default:
      return null;
  }
}

const PATTERN_LABELS: Record<EmailPatternKind, string> = {
  "prenom.nom": "prénom.nom@",
  "p.nom": "p.nom@",
  prenom: "prénom@",
  prenom_nom: "prénom_nom@",
  prenomnom: "prénomnom@",
  "nom.prenom": "nom.prénom@",
  nom: "nom@",
};

const ALL_KINDS: EmailPatternKind[] = [
  "prenom.nom",
  "p.nom",
  "prenom",
  "prenom_nom",
  "prenomnom",
  "nom.prenom",
  "nom",
];

/**
 * Pour un email connu + identité, retrouve quel motif a produit le local-part.
 */
export function matchPatternKind(
  email: string,
  prenom: string | null | undefined,
  nom: string | null | undefined
): EmailPatternKind | null {
  const at = email.indexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at).toLowerCase();
  const p = prenom?.trim() || "";
  const n = nom?.trim() || "";
  if (!p && !n) return null;

  for (const kind of ALL_KINDS) {
    const built = buildLocal(kind, p || n, n || p);
    if (built && built === local) return kind;
  }
  return null;
}

/**
 * Détecte le motif dominant parmi des emails déjà connus d'une marque.
 * Si plusieurs domaines, on privilégie celui avec le plus d'échantillons
 * (et un seul motif clair dessus).
 */
export function detectEmailPattern(
  known: Array<{ email: string; prenom?: string | null; nom?: string | null }>
): DetectedEmailPattern | null {
  type Acc = { kindCounts: Map<EmailPatternKind, number>; total: number };
  const byDomain = new Map<string, Acc>();

  for (const row of known) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const domain = extractEmailDomain(email);
    if (!domain) continue;
    // Ignore free mail — pas de motif entreprise.
    if (
      /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|protonmail|orange|free|sfr|wanadoo|laposte)\./i.test(
        domain
      )
    ) {
      continue;
    }

    const kind = matchPatternKind(email, row.prenom, row.nom);
    if (!kind) continue;

    let acc = byDomain.get(domain);
    if (!acc) {
      acc = { kindCounts: new Map(), total: 0 };
      byDomain.set(domain, acc);
    }
    acc.total += 1;
    acc.kindCounts.set(kind, (acc.kindCounts.get(kind) || 0) + 1);
  }

  let best: DetectedEmailPattern | null = null;
  for (const [domain, acc] of byDomain) {
    let topKind: EmailPatternKind | null = null;
    let topCount = 0;
    for (const [kind, count] of acc.kindCounts) {
      if (count > topCount) {
        topCount = count;
        topKind = kind;
      }
    }
    if (!topKind || topCount === 0) continue;
    // Au moins 50 % des emails matchables sur ce domaine, ou ≥ 2 matches.
    if (topCount < 2 && acc.total > 1 && topCount / acc.total < 0.5) continue;

    const candidate: DetectedEmailPattern = {
      kind: topKind,
      domain,
      matches: topCount,
      sampleSize: acc.total,
    };
    if (
      !best ||
      candidate.matches > best.matches ||
      (candidate.matches === best.matches && candidate.sampleSize > best.sampleSize)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Domaine de secours depuis le site web de la marque (sans www).
 */
export function domainFromWebsite(siteWeb: string | null | undefined): string | null {
  if (!siteWeb?.trim()) return null;
  try {
    const raw = siteWeb.trim().startsWith("http") ? siteWeb.trim() : `https://${siteWeb.trim()}`;
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Propose 1+ emails pour un contact, à partir du motif détecté
 * (et éventuellement d'un domaine site web en fallback).
 */
export function suggestEmailsForContact(opts: {
  prenom?: string | null;
  nom?: string | null;
  pattern?: DetectedEmailPattern | null;
  fallbackDomain?: string | null;
}): EmailSuggestion[] {
  const prenom = opts.prenom?.trim() || "";
  const nom = opts.nom?.trim() || "";
  if (!prenom && !nom) return [];

  const out: EmailSuggestion[] = [];
  const seen = new Set<string>();

  const push = (
    kind: EmailPatternKind,
    domain: string,
    confidence: EmailSuggestion["confidence"]
  ) => {
    const local = buildLocal(kind, prenom || nom, nom || prenom);
    if (!local || !domain) return;
    const email = `${local}@${domain}`.toLowerCase();
    if (seen.has(email)) return;
    seen.add(email);
    out.push({
      email,
      kind,
      domain,
      confidence,
      label: `${PATTERN_LABELS[kind]}${domain}`,
    });
  };

  if (opts.pattern) {
    push(opts.pattern.kind, opts.pattern.domain, opts.pattern.matches >= 2 ? "high" : "medium");
    // Alternatives courantes sur le même domaine si le motif principal est p.nom / prenom.nom
    if (opts.pattern.kind === "p.nom") {
      push("prenom.nom", opts.pattern.domain, "low");
    } else if (opts.pattern.kind === "prenom.nom") {
      push("p.nom", opts.pattern.domain, "low");
    }
  } else if (opts.fallbackDomain) {
    // Pas encore de motif : on propose les 2 formes les plus fréquentes en France.
    push("prenom.nom", opts.fallbackDomain, "low");
    push("p.nom", opts.fallbackDomain, "low");
  }

  return out;
}
