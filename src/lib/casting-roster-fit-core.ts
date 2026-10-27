/**
 * Cœur analyse casting roster (marque × talents) — partagé API sync + job serveur.
 */
import { xaiResponse } from "@/lib/xai";
import {
  asStr,
  formatCrmContentPerformanceBlock,
  formatFullTalentFicheBlock,
  formatTalentStatsBits,
  loadCrmTalent,
  type CrmTalent,
  type IgBundle,
} from "@/lib/talent-research-core";

export const ROSTER_FIT_MAX_TALENTS = 30;

export type RosterFitItem = {
  talentId: string;
  recommended: boolean;
  fitScore: number;
  whyFit: string;
  risks: string;
  suggestedAngle: string;
  proofPoints: string;
};

export type BrandResearchInput = {
  recentCampaigns?: string;
  newProducts?: string;
  availabilityFrEu?: string;
  brandPositioning?: string;
  influenceStrategy?: string;
};

const EMPTY_IG: IgBundle = {
  biography: "",
  fullName: "",
  captions: [],
  topHashtags: [],
  topMentions: [],
  tiktokCaptions: [],
  note: "non scrapé (batch roster-fit)",
};

function formatBrandBriefBlock(
  brandName: string,
  research: BrandResearchInput
): string {
  const lines = [
    `MARQUE : ${brandName}`,
    research.newProducts?.trim()
      ? `Nouveautés : ${research.newProducts.trim()}`
      : null,
    research.availabilityFrEu?.trim()
      ? `Dispo FR/EU : ${research.availabilityFrEu.trim()}`
      : null,
    research.brandPositioning?.trim()
      ? `Positionnement : ${research.brandPositioning.trim()}`
      : null,
    research.influenceStrategy?.trim()
      ? `Influence : ${research.influenceStrategy.trim()}`
      : null,
    research.recentCampaigns?.trim()
      ? `Campagnes récentes : ${research.recentCampaigns.trim()}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatTalentBlock(talent: CrmTalent): string {
  const name = `${talent.prenom} ${talent.nom}`.trim();
  const geo =
    [talent.ville, talent.pays].filter(Boolean).join(", ") || "ville inconnue";
  return `─── TALENT id=${talent.id} | ${name} | HABITE : ${geo} ───
(Toute activation magasin / déplacement DOIT être crédible depuis ${geo}.)
${formatFullTalentFicheBlock(talent)}
Stats : ${formatTalentStatsBits(talent, EMPTY_IG)}
Perf contenu :
${formatCrmContentPerformanceBlock(talent)}`;
}

function buildPrompt(args: {
  brandName: string;
  brandResearch: BrandResearchInput;
  talents: CrmTalent[];
}): string {
  const roster = args.talents.map(formatTalentBlock).join("\n\n");
  const ids = args.talents.map((t) => t.id).join(", ");

  return `Tu es un expert casting / influence Glow Up. Mission : pour CETTE marque, juger CHAQUE talent de la roster — OUI on le pitch, ou NON.

═══ BRIEF MARQUE (source de vérité — issu de l'analyse marque) ═══
${formatBrandBriefBlock(args.brandName, args.brandResearch)}

═══ ROSTER À ÉVALUER (${args.talents.length} talents) ═══
IDs obligatoires à couvrir (AUCUN oubli) : ${ids}

${roster}

═══ RÈGLES DE DÉCISION ═══
1) Évalue CHAQUE talentId listé ci-dessus — un objet JSON par talent, aucun manquant.
2) recommended=true (OUI) UNIQUEMENT si le créateur colle concrètement au brief marque (positionnement, nouveautés, ton influence, dispo, campagnes). Pas de OUI par politesse.
3) recommended=false (NON) si hors sujet, trop générique, risque d'image, univers incompatible, ou angle trop forcé.
4) Sois sélectif : typiquement 0–4 OUI sur une roster, pas tout le monde.
5) fitScore 0–100 cohérent avec le verdict (OUI attendu ≥ 60 ; NON souvent < 55).
6) whyFit : 2–4 phrases — pourquoi OUI ou pourquoi NON, ancré dans le brief marque × fiche talent.
7) risks : points de vigilance (concurrence, tonalité, audience, dispo, géo…). Si rien de notable, une courte phrase.
8) suggestedAngle : angle de pitch actionnable si OUI ; si NON, "" ou une phrase « ne pas pitcher ».
9) proofPoints : preuves courtes séparées par « ; » (collabs, contenu, lifestyle, stats CRM). N'invente RIEN.
10) Français, concret, utile pour un casting manager.

═══ GÉO / LIEUX (CRITIQUE — ne pas se planter) ═══
- Lis la **Ville / pays** de CHAQUE talent sur sa fiche. L'angle DOIT être crédible depuis SA ville.
- Interdit de proposer une visite / vlog / journée en magasin dans une ville du brief (ex. Villeneuve-d’Ascq, Gennevilliers) si le talent n'y habite PAS et n'a aucun lien géographique.
- Les magasins pilotes / villes citées dans le brief marque = contexte marque, PAS un lieu à coller à tous les talents.
- Si le concept magasin est pertinent mais loin du talent : angle déclinable chez LUI (magasin local de sa ville / région, e-commerce, unboxing, conseil à distance, Seconde Vie en ligne…) OU mentionne en risks « activation magasin pilote hors zone ».
- Exemple FAUX : talent Lyon → « Une journée à Villeneuve-d’Ascq ». Exemple OK : talent Lyon → « test conseil augmenté / Seconde Vie dans un Boulanger lyonnais » ou angle digital sans déplacement absurde.

Réponds UNIQUEMENT en JSON strict :
{
  "talents": [
    {
      "talentId": "...",
      "recommended": true,
      "fitScore": 82,
      "whyFit": "...",
      "risks": "...",
      "suggestedAngle": "...",
      "proofPoints": "..."
    }
  ]
}
`;
}

function tryParseRosterFitJson(raw: string): Array<Record<string, unknown>> {
  const trimmed = raw.trim();
  const jsonSlice =
    trimmed.includes("{") && trimmed.includes("}")
      ? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
      : trimmed;
  const candidates = [
    trimmed,
    jsonSlice,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const o = parsed as Record<string, unknown>;
      const list = Array.isArray(o.talents)
        ? o.talents
        : Array.isArray(parsed)
          ? parsed
          : null;
      if (!list) continue;
      return list.filter(
        (x): x is Record<string, unknown> =>
          Boolean(x) && typeof x === "object"
      );
    } catch {
      /* try next */
    }
  }
  throw new Error("parse");
}

function normalizeItem(
  raw: Record<string, unknown>,
  expectedIds: Set<string>
): RosterFitItem | null {
  const talentId = asStr(raw.talentId || raw.id).trim();
  if (!talentId || !expectedIds.has(talentId)) return null;

  let fitScore = Number(raw.fitScore ?? raw.score);
  if (!Number.isFinite(fitScore)) fitScore = 50;
  fitScore = Math.max(0, Math.min(100, Math.round(fitScore)));

  let recommended =
    raw.recommended === true ||
    raw.recommended === "true" ||
    String(raw.verdict || raw.decision || "")
      .trim()
      .toLowerCase() === "oui" ||
    String(raw.verdict || raw.decision || "")
      .trim()
      .toLowerCase() === "yes";

  if (recommended && fitScore < 50) recommended = false;

  return {
    talentId,
    recommended,
    fitScore,
    whyFit: asStr(raw.whyFit) || asStr(raw.whyRelevant) || "Non précisé.",
    risks: asStr(raw.risks) || asStr(raw.risk) || "",
    suggestedAngle: asStr(raw.suggestedAngle) || asStr(raw.angle) || "",
    proofPoints: asStr(raw.proofPoints) || asStr(raw.proofs) || "",
  };
}

function finalizeRoster(
  parsed: Array<Record<string, unknown>>,
  talents: CrmTalent[]
): RosterFitItem[] {
  const expectedIds = new Set(talents.map((t) => t.id));
  const byId = new Map<string, RosterFitItem>();

  for (const row of parsed) {
    const item = normalizeItem(row, expectedIds);
    if (item) byId.set(item.talentId, item);
  }

  const out: RosterFitItem[] = [];
  for (const t of talents) {
    const existing = byId.get(t.id);
    if (existing) {
      out.push(existing);
    } else {
      out.push({
        talentId: t.id,
        recommended: false,
        fitScore: 0,
        whyFit: "Non évalué par le modèle — à revoir manuellement.",
        risks: "",
        suggestedAngle: "",
        proofPoints: "",
      });
    }
  }

  return out.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return b.fitScore - a.fitScore;
  });
}

export function normalizeBrandResearch(
  br: unknown
): BrandResearchInput {
  if (!br || typeof br !== "object") return {};
  const o = br as Record<string, unknown>;
  return {
    recentCampaigns:
      typeof o.recentCampaigns === "string" ? o.recentCampaigns : "",
    newProducts: typeof o.newProducts === "string" ? o.newProducts : "",
    availabilityFrEu:
      typeof o.availabilityFrEu === "string" ? o.availabilityFrEu : "",
    brandPositioning:
      typeof o.brandPositioning === "string" ? o.brandPositioning : "",
    influenceStrategy:
      typeof o.influenceStrategy === "string" ? o.influenceStrategy : "",
  };
}

export function hasBrandResearchBrief(research: BrandResearchInput): boolean {
  return Boolean(
    research.newProducts?.trim() ||
      research.brandPositioning?.trim() ||
      research.influenceStrategy?.trim() ||
      research.recentCampaigns?.trim() ||
      research.availabilityFrEu?.trim()
  );
}

/** Analyse 1 marque × roster talents (1 appel xAI). */
export async function runRosterFitForBrand(args: {
  brandName: string;
  brandResearch: BrandResearchInput;
  talentIds: string[];
}): Promise<RosterFitItem[]> {
  const talentIds = Array.from(
    new Set(args.talentIds.map((id) => String(id || "").trim()).filter(Boolean))
  ).slice(0, ROSTER_FIT_MAX_TALENTS);

  if (!args.brandName.trim() || talentIds.length === 0) {
    throw new Error("brandName et talentIds sont requis.");
  }
  if (!hasBrandResearchBrief(args.brandResearch)) {
    throw new Error("brandResearch (analyse marque) requis.");
  }

  const crmList: CrmTalent[] = [];
  for (const id of talentIds) {
    const t = await loadCrmTalent(id);
    if (t) crmList.push(t);
  }
  if (crmList.length === 0) {
    throw new Error("Aucun talent trouvé pour ces ids.");
  }

  const MAX_ATTEMPTS = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await xaiResponse(
        buildPrompt({
          brandName: args.brandName.trim(),
          brandResearch: args.brandResearch,
          talents: crmList,
        }),
        { timeoutMs: 180_000 }
      );
      const parsed = tryParseRosterFitJson(text);
      return finalizeRoster(parsed, crmList);
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `x.ai roster-fit (${args.brandName}) tentative ${attempt} échouée, relance :`,
          e instanceof Error ? e.message : e
        );
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Analyse casting impossible.");
}
