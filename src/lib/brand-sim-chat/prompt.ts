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
Ta valeur = **veille marché en temps réel**, pas une liste générique de marques « qui collent au vibe ».

**TALENT À ANALYSER : ${name}**

${momentBlock}

### FICHE CRM (source de vérité interne)
${fiche}

### COLLABS / CLIENTS DÉJÀ CONNUS EN CRM (ne pas re-proposer en priorité)
${past}

### MÉTHODE OBLIGATOIRE — VEILLE COLLABS (3 DERNIERS MOIS)
Avant de lister les 50 marques, **recherche web en profondeur** (Instagram / TikTok / YouTube / articles / communiqués / sites agences) :

1) **Collabs récentes DU talent** — posts / stories / partenariats / #ad / #partenariat des ~90 derniers jours. Note les marques déjà en cours.
2) **Créateurs comparables** — 5 à 10 profils FR/EU du **même segment** (taille, ton, niches proches). Pour chacun, liste les marques avec qui ils ont collab’ **ces 3 derniers mois** (ou récemment si peu de preuves).
3) **Marques actives maintenant** — qui caste / active de l’influence **en ce moment** dans cet univers (campagnes en cours, callouts casting, bilans « collab influenceurs », agences influence qui postent des cases).
4) **Institutions / causes / éco-organismes / retail / médias** qui activent des créateurs du même ADN (ex. Citeo, ADEME, enseignes, apps, services publics… si le profil matche) — **ne les ignore pas** sous prétexte que ce n’est « pas une marque lifestyle classique ».
5) Croise : marques vues chez les peers + marques actives + fit profil talent → priorise celles où le pitch est **crédible aujourd’hui**.

Si une marque collab’ déjà des créateurs très proches de ${name} en ce moment → elle doit être **haut dans la liste** avec la preuve (ex. « collab X avec [créateur comparable] en [mois] »).

### OBJECTIF
Réponds en **français**, en prose claire et actionnable :
1) **Analyse profil** — qui c’est, univers, audience, preuves, moments détectés.
2) **Veille 3 mois** — résumé court : marques vues chez le talent + chez les peers + marques actives maintenant (avec 1 preuve concrète chacune quand possible).
3) **Univers marques** — sous-univers **ultra adjacents** (pas de listes génériques).
4) **Marques à viser** — liste de **exactement 50 marques** concrètes (FR / EU de préférence), classées du **meilleur fit / timing au plus faible**.

Pour **chaque marque** (1 → 50), indique sur une ligne claire :
- Nom exact de la marque
- Secteur (Mode, Beauté, Sport, Food, Tech, Luxe, Retail, Maison, Voyage, Institution/Cause, Autre…)
- Fit /10 (sois strict : 9–10 = match + timing évident, 7–8 = très bon, 5–6 = opportuniste crédible)
- Pourquoi ça matche (1–2 phrases **spécifiques à CE talent**, idéalement avec preuve collab récente / peer)
- Angle / pitch suggéré (1 phrase actionnable)

### PERTINENCE (NON NÉGOCIABLE)
- Chaque marque doit être **justifiable** par le profil **ET** idéalement par une activité influence récente (talent, peer, ou casting en cours).
- **Zéro filler** : interdiction de bourrer avec des mastodontes hors-sujet.
- Au moins **~15 marques** doivent venir clairement de la **veille 3 mois** (peers / campagnes actives), pas seulement du « fit théorique ».
- Varie les **paliers** : ~15 must-have (fit ≥8), ~20 strong (fit 6–8), ~15 opportunistes crédibles (fit 5–6).
- Couvre plusieurs **sous-univers** adjacents sans sortir de l’ADN du talent.
- PRIVILÉGIE marques **actives en influence** FR-EU sur le segment du talent.
- Si le talent est **fondateur** d’une catégorie → propose des **adjacents / partenaires**, pas des concurrents directs.
- Évite de re-pitcher les collabs CRM déjà listées sauf angle vraiment nouveau.
- Pas de JSON. Liste numérotée 1–50 claire.
- Termine par le CODE DE FIN exact (ligne seule).
`;

  const endMarker = createEndMarker();
  const { prompt } = appendEndMarkerInstruction(body, endMarker);
  return { prompt, endMarker, talentName: name };
}
