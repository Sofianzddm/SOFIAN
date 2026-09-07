import {
  DC_DEFAULT_SETTINGS,
  type DcDomain,
  type DcLevel,
  type DcRole,
} from "./constants";
import {
  evaluateReceivableAge,
  evaluateRecurringCommitment,
  evaluateSmallPurchase,
  evaluateTravelAmount,
} from "./engine";
import { DC_ROLE_LABELS } from "./labels";

export type SearchablePolicy = {
  id?: string;
  code: string;
  domain: DcDomain;
  title: string;
  description: string;
  ownerRole: DcRole;
  executorRole: DcRole | null;
  finalDecisionRole: DcRole;
  level: DcLevel;
  autonomyRule: string;
  thresholdType: string | null;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  escalationRule: string;
  keywords: string[];
  examples: string[];
  isActive: boolean;
};

export type SearchHit = {
  policy: SearchablePolicy;
  score: number;
  verdictOverride?: {
    level: DcLevel;
    headline: string;
    reason: string;
    cta: "none" | "prepare";
  };
};

const SYNONYMS: Record<string, string[]> = {
  bagage: ["bagage", "valise", "cabin", "soute"],
  train: ["train", "billet", "sncf", "tgv", "avion", "vol", "hotel", "hôtel", "deplacement", "déplacement"],
  achat: ["achat", "amazon", "commande", "fourniture"],
  fournisseur: ["fournisseur", "prestataire", "vendor"],
  saas: ["saas", "abonnement", "licence", "hubspot", "outil", "software"],
  facture: ["facture", "facturation", "billing", "correction facture"],
  impaye: ["impaye", "impayé", "creance", "créance", "retard paiement", "recouvrement"],
  avance: ["avance", "avance talent", "acompte talent"],
  pricing: ["nego", "négociation", "prix", "plancher", "remise", "discount", "tarif", "baisse"],
  talent: ["talent", "signature", "contrat talent", "onboarding talent"],
  rh: ["teletravail", "télétravail", "conge", "congé", "retard", "sanction", "avertissement"],
  crm: ["hubspot", "crm", "contact", "lead"],
  rights: ["buyout", "perpetual", "whitelisting", "paid media", "droits"],
  legal: ["contrat", "litige", "mise en demeure", "juridique"],
  tech: ["bug", "incident", "data", "cyber", "fuite"],
};

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .trim();
}

export function extractAmountEuros(query: string): number | null {
  const n = fold(query);
  const patterns = [
    /(\d+(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?)\s*(?:€|euros?|eur)\b/,
    /(?:€|euros?|eur)\s*(\d+(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?)/,
    /(\d+(?:[.,]\d+)?)\s*(?:€)/,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    if (m?.[1]) return parseFrNumber(m[1]);
  }
  return null;
}

export function extractDays(query: string): number | null {
  const n = fold(query);
  const m = n.match(/(\d+)\s*(?:j|jours?|day|days)\b/);
  if (m?.[1]) return Number(m[1]);
  return null;
}

export function extractTwoPrices(query: string): { proposed: number; original: number } | null {
  const n = fold(query);
  const nums = [...n.matchAll(/(\d+(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?)/g)]
    .map((m) => parseFrNumber(m[1]))
    .filter((v) => v >= 100);
  if (nums.length >= 2) {
    return { proposed: Math.min(nums[0], nums[1]), original: Math.max(nums[0], nums[1]) };
  }
  return null;
}

function parseFrNumber(raw: string): number {
  const cleaned = raw.replace(/[ \u00a0]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function tokenSet(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9€]+/)
    .filter((t) => t.length >= 2);
}

function scorePolicy(query: string, policy: SearchablePolicy): number {
  const q = fold(query);
  const qTokens = tokenSet(query);
  let score = 0;

  const hay = fold(
    [
      policy.code,
      policy.title,
      policy.description,
      policy.autonomyRule,
      policy.keywords.join(" "),
      policy.examples.join(" "),
    ].join(" ")
  );

  if (hay.includes(q) && q.length >= 4) score += 12;

  for (const t of qTokens) {
    if (t.length < 3) continue;
    if (fold(policy.title).includes(t)) score += 6;
    if (fold(policy.code).includes(t)) score += 4;
    if (policy.keywords.some((k) => fold(k).includes(t) || t.includes(fold(k)))) score += 5;
    if (hay.includes(t)) score += 2;
  }

  for (const group of Object.values(SYNONYMS)) {
    const hit = group.some((g) => q.includes(fold(g)));
    if (!hit) continue;
    if (group.some((g) => hay.includes(fold(g)))) score += 4;
  }

  if (!policy.isActive) score -= 50;
  return score;
}

function headlineFor(policy: SearchablePolicy): { headline: string; cta: "none" | "prepare" } {
  const owner = DC_ROLE_LABELS[policy.finalDecisionRole] ?? policy.finalDecisionRole;
  if (policy.level === "GREEN") {
    return { headline: `${owner} peut décider`, cta: "none" };
  }
  if (policy.level === "ORANGE") {
    return {
      headline: `${owner} décide dans le cadre — exception → escalade`,
      cta: "prepare",
    };
  }
  return { headline: `Validation ${DC_ROLE_LABELS[policy.finalDecisionRole]} nécessaire`, cta: "prepare" };
}

export function searchPolicies(
  query: string,
  policies: SearchablePolicy[],
  opts?: { includeInactive?: boolean }
): SearchHit[] {
  const q = query.trim();
  if (!q) return [];

  const amount = extractAmountEuros(q);
  const days = extractDays(q);
  const twoPrices = extractTwoPrices(q);
  const folded = fold(q);

  const contextual: SearchHit[] = [];

  const travelish =
    /train|billet|hotel|hôtel|avion|vol|deplacement|déplacement|taxi|parking|bagage|sncf|tgv/.test(
      folded
    );
  const purchaseish = /achat|amazon|commande|fourniture/.test(folded);
  const saasNew =
    /(nouvel|nouveau).*(outil|saas|abonnement|licence)/.test(folded) ||
    /(outil|saas|abonnement).*(nouveau|nouvel)/.test(folded);
  const pricingish =
    /nego|négoc|prix|plancher|tarif|remise|baisse|4500|5000|marge/.test(folded);
  const receivableish = /impaye|impayé|creance|créance|retard/.test(folded);

  if (travelish && amount != null) {
    const v = evaluateTravelAmount(amountTtcSafe(amount));
    const policy = policies.find((p) => p.code === v.policyCode);
    if (policy) {
      contextual.push({
        policy,
        score: 100,
        verdictOverride: {
          level: v.level,
          headline:
            v.level === "GREEN"
              ? "Maud peut décider"
              : "Validation Sofian nécessaire",
          reason: v.reason,
          cta: v.level === "RED" ? "prepare" : "none",
        },
      });
    }
  }

  if (purchaseish && amount != null && !travelish) {
    const v = evaluateSmallPurchase(amount);
    const policy = policies.find((p) => p.code === v.policyCode);
    if (policy) {
      contextual.push({
        policy,
        score: 95,
        verdictOverride: {
          level: v.level,
          headline:
            v.level === "GREEN"
              ? "Maud peut décider"
              : "Validation Sofian nécessaire",
          reason: v.reason,
          cta: v.level === "RED" ? "prepare" : "none",
        },
      });
    }
  }

  if (saasNew && amount != null) {
    const monthsMatch = folded.match(/(\d+)\s*mois/);
    const months = monthsMatch ? Number(monthsMatch[1]) : 12;
    const rec = evaluateRecurringCommitment(amount, months);
    const policy = policies.find((p) => p.code === "SAAS_NEW");
    if (policy && rec.treatAsSignificant) {
      contextual.push({
        policy,
        score: 98,
        verdictOverride: {
          level: "RED",
          headline: "Engagement récurrent — validation Sofian",
          reason: `Ne pas juger sur la mensualité seule. Valeur d’engagement ≈ ${rec.total.toLocaleString("fr-FR")} €.`,
          cta: "prepare",
        },
      });
    }
  }

  if (pricingish) {
    const policyGuide = policies.find((p) => p.code === "SALES_ABOVE_FLOOR");
    const below = policies.find((p) => p.code === "SALES_BELOW_FLOOR");
    if (twoPrices && policyGuide) {
      contextual.push({
        policy: policyGuide,
        score: 90,
        verdictOverride: {
          level: "ORANGE",
          headline: "Le montant seul ne détermine pas l’autorité",
          reason:
            "Vérifie le prix plancher et la marge minimale du deal. Si le tarif reste au-dessus du plancher → Leyna peut décider. Sinon → validation Sofian.",
          cta: "prepare",
        },
      });
    } else if (policyGuide && below) {
      contextual.push({
        policy: policyGuide,
        score: 80,
        verdictOverride: {
          level: "ORANGE",
          headline: "Négociation : plancher, pas un −10 %",
          reason:
            "Leyna négocie librement tant que le prix plancher et la marge minimale acceptable sont respectés. Sous le plancher → Sofian.",
          cta: "prepare",
        },
      });
    }
  }

  if (receivableish && days != null) {
    const v = evaluateReceivableAge(days);
    const policy = policies.find((p) => p.code === v.policyCode);
    if (policy) {
      contextual.push({
        policy,
        score: 96,
        verdictOverride: {
          level: v.level,
          headline:
            v.level === "GREEN"
              ? `${DC_ROLE_LABELS[v.ownerRole]} peut relancer`
              : v.level === "ORANGE"
                ? "Maud suit — digest CEO"
                : "Escalade Sofian",
          reason: v.reason,
          cta: v.level === "RED" ? "prepare" : "none",
        },
      });
    }
  }

  const scored = policies
    .filter((p) => opts?.includeInactive || p.isActive)
    .map((policy) => {
      const score = scorePolicy(q, policy);
      const h = headlineFor(policy);
      return {
        policy,
        score,
        verdictOverride: {
          level: policy.level,
          headline: h.headline,
          reason: policy.autonomyRule,
          cta: h.cta,
        },
      } satisfies SearchHit;
    })
    .filter((h) => h.score > 4)
    .sort((a, b) => b.score - a.score);

  const byCode = new Set(contextual.map((c) => c.policy.code));
  const merged = [...contextual, ...scored.filter((s) => !byCode.has(s.policy.code))];
  return merged.slice(0, 8);
}

function amountTtcSafe(n: number): number {
  return n;
}

export function prefillFromQuery(
  query: string,
  hit: SearchHit
): {
  title: string;
  domain: DcDomain;
  question: string;
  amount: number | null;
  policyCode: string;
} {
  const amount = extractAmountEuros(query);
  return {
    title: query.trim().slice(0, 120),
    domain: hit.policy.domain,
    question: hit.policy.title,
    amount,
    policyCode: hit.policy.code,
  };
}

export { DC_DEFAULT_SETTINGS };
