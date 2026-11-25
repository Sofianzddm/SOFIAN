/**
 * Prompt Chat VPS — quelles marques contacter pour Festival de Cannes.
 * Tag CANNES_BRANDS : isole ces jobs du lab carto-pipeline2 et de la carto contacts.
 */

import {
  appendEndMarkerInstruction,
  createEndMarker,
} from "@/lib/carto-chat-vps/end-marker";
import {
  CANNES_BRANDS_PROMPT_TAG,
  cannesBrandsPromptLooksLike,
} from "@/lib/cannes-partenaires/tag";

export { CANNES_BRANDS_PROMPT_TAG, cannesBrandsPromptLooksLike };

const FOCUS_MAX = 500;

export function normalizeCannesBrandsFocus(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, FOCUS_MAX);
}

export function buildCannesBrandsResearchPrompt(opts: {
  focus?: string | null;
  alreadyInPipeline?: string[];
}): { prompt: string; endMarker: string } {
  const focus = normalizeCannesBrandsFocus(opts.focus);
  const already =
    opts.alreadyInPipeline && opts.alreadyInPipeline.length > 0
      ? opts.alreadyInPipeline.slice(0, 60).join(", ")
      : "(aucune encore dans le pipeline Cannes Partenaires)";

  const focusBlock = focus
    ? `
### FOCUS FORCÉ (PRIORITÉ #1 — fourni par le planner)
« ${focus} »
→ Oriente la shortlist autour de ce focus (secteur, angle, typologie marques).
→ Ne l’ignore que s’il est absurde pour un partenariat Festival de Cannes.
`
    : `
### FOCUS
Aucun focus forcé. Couvre un mix pertinent pour Glow Up × Festival de Cannes :
beauty / luxe / mode / champagne & spirits / auto premium / tech hospitality /
joaillerie / skincare / lifestyle premium / hotels & travel premium.
`;

  const body = `${CANNES_BRANDS_PROMPT_TAG} | MARQUES À CONTACTER (CANNES) pour Glow Up Agency

Tu es un **Head of Festival Partnerships Strategy** senior chez Glow Up Agency
(agence française de Talent Management + villa / activations talents autour du
**Festival de Cannes**).

**OBJECTIF :** shortlist de marques à contacter pour Glow Up × Cannes, en
**deux blocs obligatoires** :
1) marques **déjà présentes** les années précédentes (activations, villas,
   beaches, parties, hospitality, Lions, sponsoring)
2) marques qui **pourraient y être** cette saison (crédibles, budget event /
   brand experience / influence premium, pas encore ou peu vues à Cannes)

Pas une carto de contacts.

${focusBlock}

### CONTEXTE GLOW UP
- Villa talents + activations marques pendant Cannes
- Objectif commercial : partenariats (hospitalité, contenus, invites talents,
  brand experience, sponsoring soft)
- Marché prioritaire : **France** (sièges / teams FR)

### DÉJÀ DANS LE PIPELINE CANNES (ne pas re-proposer en priorité)
${already}

### RECHERCHES OBLIGATOIRES
Veille réelle (web / presse / LinkedIn / case studies), focus **années
précédentes + saison à venir** :

**A — Historique Cannes (années précédentes)**
- Marques déjà actives à Cannes (villa, beach, yacht, party, hospitality, Lions)
- Qui est revenu plusieurs éditions ? Qui a fait une activation remarquée ?
- Cite l’année / le type d’activation quand c’est connu

**B — Potentielles (qui pourraient y être)**
- Marques beauty / luxe / mode / champagne & spirits / auto / tech / travel
  qui investissent déjà events / influence premium FR mais pas (encore) Cannes
- First-timers crédibles avec budget brand experience / hospitality
- Marques qui collab’ talents lifestyle premium et pourraient activer à Cannes

### LIVRABLE (STRICT)
1) Intro courte (5–8 lignes) : angles Glow Up × Cannes cette saison
2) **Deux listes distinctes**, total **25 à 40 marques** :

#### A. Déjà présentes les années précédentes (minimum ~12)
#### B. Pourraient y être (minimum ~12)

Chaque marque, un bloc :

**N. Nom marque exact**
- Typologie : HISTORIQUE | POTENTIEL
- Secteur : …
- Priorité : P1 | P2 | P3
- Pourquoi les contacter (preuves années passées OU signaux « pourrait y être ») : …
- Angle / pitch Glow Up (1–2 phrases) : …
- Signaux : villa / beach / Lions / hospitality / collab talents / event FR / autre
- Année(s) / édition(s) si HISTORIQUE (sinon « — »)

Règles :
- Noms de marques RÉELS et précis
- Équilibre ~50/50 entre HISTORIQUE et POTENTIEL
- Pour HISTORIQUE : preuves d’activation Cannes passées obligatoires
- Pour POTENTIEL : expliquer pourquoi Cannes est crédible maintenant
- Évite les marques déjà listées dans le pipeline (ci-dessus) sauf angle vraiment nouveau
- Pas de cartographie de contacts personnes ici
`;

  const endMarker = createEndMarker();
  const { prompt } = appendEndMarkerInstruction(body, endMarker);
  return { prompt, endMarker };
}
