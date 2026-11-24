/**
 * Prompt ChatGPT web (VPS carto) — Simulateur marque / brands à viser pour un talent.
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
1) **Analyse profil** — qui c’est, ce qu’il/elle fait, univers, preuves, moments détectés.
2) **Univers marques** — catégories adjacentes crédibles (pas des micro-marques inconnues).
3) **Marques à viser** — liste de **12 à 25 marques** concrètes (FR / EU de préférence), classées du meilleur fit au plus faible.

Pour **chaque marque** de la liste, indique sur une ligne claire :
- Nom exact de la marque
- Secteur (Mode, Beauté, Sport, Food, Tech, Luxe, Retail, Autre…)
- Fit /10 ou score 0–100
- Pourquoi ça matche (1–2 phrases)
- Angle / pitch suggéré (1 phrase)

### RÈGLES
- PRIVILÉGIE des marques **connues / actives en influence** FR-EU.
- Si le talent est **fondateur** d’une catégorie (ex. swimwear) → propose des **adjacents**, pas des concurrents directs.
- Évite de re-pitcher les collabs déjà listées sauf angle vraiment nouveau.
- Utilise la recherche web pour valider que les marques existent et collab’ influenceurs.
- Pas de JSON. Pas de tableau markdown obligatoire — une liste numérotée claire suffit.
- Termine par le CODE DE FIN exact (ligne seule).
`;

  const endMarker = createEndMarker();
  const { prompt } = appendEndMarkerInstruction(body, endMarker);
  return { prompt, endMarker, talentName: name };
}
