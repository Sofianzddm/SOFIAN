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

Tu es un **Head of Brand Strategy + Veille Influence France** chez Glow Up Agency.
**80% de ton job = cartographier qui collabore EN CE MOMENT en influence FR** sur le segment du talent.
**20% = fit profil.** Une liste « marques qui matchent le vibe » sans preuves collabs récentes = ÉCHEC.

**TALENT À ANALYSER : ${name}**

${momentBlock}

### FICHE CRM (source de vérité interne)
${fiche}

### COLLABS / CLIENTS DÉJÀ CONNUS EN CRM (ne pas re-proposer en priorité)
${past}

### RÈGLE ABSOLUE — VEILLE INFLUENCE FRANCE D’ABORD
Tu n’as **PAS le droit** de commencer la liste des marques tant que tu n’as pas fait une **veille collabs FR poussée** (focus **3 derniers mois**, élargi à 6 mois si peu de preuves).

**Sources à fouiller (plusieurs recherches, pas une seule) :**
- Instagram / TikTok / YouTube / Shorts du talent + des peers (posts #ad #partenariat #sponsored #collab, stories highlight marques)
- Google / actualités : « collaboration influenceur », « campagne influence », « casting créateurs », case studies agences
- Sites / LinkedIn d’agences influence FR (WOO, Reech, Ambission, Kolsquare cases, Hivency, Influence4You, Traackr FR, etc.) + blogs marques
- Communiqués, bilans campagnes, « X créateurs activés », « défi », « ambassadeur »
- Institutions / causes actives en influence FR (Citeo, ADEME, enseignes, apps, médias, sport…)

**Requêtes types à lancer (adapte au segment du talent) :**
- "${name}" collaboration OR partenariat OR campagne OR #ad
- "[peer comparable]" collaboration marque OR partenariat influence 2025 OR 2026
- "[niche du talent]" "campagne influence" OR "créateurs" OR casting France
- "[secteur]" influenceurs France collab OR activation OR ambassadeur
- marque + "influence" + mois récents / "2025" / "2026"

### ÉTAPES OBLIGATOIRES (dans cet ordre)

**A — Collabs récentes DU talent (~90j)**  
Liste concrète des marques vues sur ses contenus / presse. Si rien de récent : dis-le clairement.

**B — Peers FR du même segment (minimum 8 créateurs)**  
Pour chaque peer : nom + 2–5 marques collab’ **récentes** (idéalement datées : mois / campagne).  
Choisis des profils **vraiment comparables** (audience, ton, niches, formats) — pas des mega stars hors segment.

**C — Marques / institutions ACTIVES maintenant en influence FR**  
Qui caste / active **en ce moment** dans cet univers (campagnes en cours, castings ouverts, bilans « collab influenceurs », séries de posts créateurs). Inclus institutions/causes/retail/apps si le profil matche (ex. Citeo pour un profil lifestyle/pédagogue/éco).

**D — Synthèse timing**  
Quelles marques reviennent le plus chez les peers + sont actives maintenant → **priorité #1** pour ${name}.

**Interdit :**
- Inventer des collabs / dates
- Remplir avec Nike / Sephora / Amazon « parce que tout le monde » sans preuve d’activité récente sur CE segment
- Sauter l’étape peers parce que « trop long »
- Ignorer les marques institutionnelles / cause / retail qui activent massivement des créateurs FR

### OBJECTIF DE RÉPONSE
Réponds en **français** :

1) **Analyse profil** (court) — univers, audience, ADN, moments.
2) **VEILLE INFLUENCE FR — 3 mois** (**section longue et détaillée**, c’est le cœur) :
   - Collabs récentes du talent
   - Tableau / liste peers → marques récentes (preuves)
   - Marques / castings actifs maintenant
   - Insights : « qui achète de l’influence sur ce segment en ce moment »
3) **Univers marques** — sous-univers adjacents dérivés de la veille (pas génériques).
4) **Marques à viser — MINIMUM 50** (idéal 50–60, **jamais moins de 50**) — classées du **meilleur fit + timing marché** au plus faible.
   Si tu n’as pas 50 noms crédibles : creuse encore peers / castings / institutions FR jusqu’à atteindre 50. Ne coupe pas à 20–30.

Pour **chaque marque** (1 → N, N ≥ 50) :
- Nom exact
- Secteur (Mode, Beauté, Sport, Food, Tech, Luxe, Retail, Maison, Voyage, Institution/Cause, Autre…)
- Fit /10 (9–10 = match + preuve collab récente peers/marché ; 7–8 = très bon ; 5–6 = opportuniste crédible)
- Pourquoi (1–2 phrases) — **cite la preuve** quand possible (« collab [peer] [mois] », « campagne FR en cours »)
- Angle / pitch (1 phrase)

### QUOTA PERTINENCE
- **MINIMUM 50 marques** dans la liste numérotée — obligation dure.
- **≥ 30** doivent venir de la **veille collabs FR récente** (peers / campagnes actives / castings), pas du seul fit théorique.
- Top 15 = presque uniquement des marques **prouvées actives** sur le segment.
- Zéro filler hors-ADN (mais 50 lignes quand même — élargis les sous-univers adjacents crédibles).
- Si fondateur d’une catégorie → adjacents / partenaires, pas concurrents directs.
- Ne re-pitch pas les collabs CRM sauf angle vraiment nouveau.
- Pas de JSON. Liste numérotée claire (1…≥50).
- Termine par le CODE DE FIN exact (ligne seule).
`;

  const endMarker = createEndMarker();
  const { prompt } = appendEndMarkerInstruction(body, endMarker);
  return { prompt, endMarker, talentName: name };
}
