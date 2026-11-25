/**
 * Prompt analyse — Simulateur marque / brands à viser pour un talent.
 * Préfixe BRAND_SIM : isole ces jobs du lab carto-pipeline2.
 */

import {
  appendEndMarkerInstruction,
  createEndMarker,
} from "@/lib/carto-chat-vps/end-marker";
import {
  formatFullTalentFicheBlock,
  type CrmTalent,
} from "@/lib/talent-research-core";
import {
  BRAND_SIM_PROMPT_TAG,
  brandSimPromptLooksLike,
} from "@/lib/brand-sim-chat/tag";

export { BRAND_SIM_PROMPT_TAG, brandSimPromptLooksLike };

const MOMENT_CONTEXT_MAX = 500;

export function normalizeMomentContext(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MOMENT_CONTEXT_MAX);
}

export function buildBrandSimChatPrompt(opts: {
  talent: CrmTalent;
  pastBrands: string[];
  momentContext?: string | null;
}): { prompt: string; endMarker: string; talentName: string } {
  const name = `${opts.talent.prenom} ${opts.talent.nom}`.trim();
  const moment = normalizeMomentContext(opts.momentContext);
  const fiche = formatFullTalentFicheBlock(opts.talent);
  const past =
    opts.pastBrands.length > 0
      ? opts.pastBrands.slice(0, 40).join(", ")
      : "(aucune collab connue en CRM)";

  const momentBlock = moment
    ? `
### CONTEXTE FORCÉ (PRIORITÉ #1 — fourni par le planner)
« ${moment} »
→ Oriente TOUTE la recherche de marques autour de ce contexte s’il est cohérent avec le profil.
→ Ne l’ignore que s’il contredit clairement la fiche.
`
    : `
### CONTEXTE
Aucun contexte forcé. **Détecte automatiquement** les moments de vie, projets, angles
(grossesse, sport, fondation de marque, déménagement, lancement, etc.) depuis la fiche
ci-dessous et via tes recherches web / LinkedIn / Instagram publics.
Ne invente PAS de moments absents des sources.
`;

  const body = `${BRAND_SIM_PROMPT_TAG} | Quelles marques viser pour ${name} ?

Tu es un **Head of Brand Strategy Influence** senior chez Glow Up Agency (talent management FR / EU).

**TALENT À ANALYSER : ${name}**

${momentBlock}

### FICHE CRM (source de vérité interne)
${fiche}

### COLLABS / CLIENTS DÉJÀ CONNUS (ne pas re-proposer en priorité)
${past}

### OBJECTIF
Réponds en **français**, en prose claire et actionnable :
1) **Analyse profil** — qui c’est, ce qu’il/elle fait, univers, audience, preuves, moments détectés.
2) **Univers marques** — catégories **ultra adjacentes** au profil (pas de listes génériques).
3) **Marques à viser** — liste de **exactement 50 marques** concrètes (FR / EU de préférence, OK international si fit évident), classées du **meilleur fit au plus faible**.

Pour **chaque marque** (1 → 50), indique sur une ligne claire :
- Nom exact de la marque
- Secteur (Mode, Beauté, Sport, Food, Tech, Luxe, Retail, Maison, Voyage, Autre…)
- Fit /10 (sois strict : 9–10 = match évident, 7–8 = très bon, 5–6 = opportuniste crédible)
- Pourquoi ça matche (1–2 phrases **spécifiques à CE talent**, pas génériques)
- Angle / pitch suggéré (1 phrase actionnable)

### PERTINENCE (NON NÉGOCIABLE)
- Chaque marque doit être **justifiable** par le profil, l’audience, le contenu, le moment de vie ou l’historique collab.
- **Zéro filler** : interdiction de bourrer avec des mastodontes hors-sujet (ex. banque / assurance / B2B si le talent est lifestyle/beauté).
- Varie les **paliers** : ~15 must-have (fit ≥8), ~20 strong (fit 6–8), ~15 opportunistes crédibles (fit 5–6) — toujours pertinents.
- Couvre plusieurs **sous-univers** adjacents au talent (ex. core + lifestyle + retail + travel + tech lifestyle), sans sortir de son ADN.
- PRIVILÉGIE des marques **connues / actives en influence** FR-EU, qui collab’ déjà des créateurs du même segment.
- Si le talent est **fondateur** d’une catégorie (ex. swimwear) → propose des **adjacents / partenaires**, pas des concurrents directs.
- Évite de re-pitcher les collabs déjà listées sauf angle vraiment nouveau.
- Utilise la recherche web pour valider existence + activité influence des marques.
- Pas de JSON. Liste numérotée 1–50 claire.
- Termine par le CODE DE FIN exact (ligne seule).
`;

  const endMarker = createEndMarker();
  const { prompt } = appendEndMarkerInstruction(body, endMarker);
  return { prompt, endMarker, talentName: name };
}
