/**
 * Prompt ChatGPT web — carto Cannes Partenaires (clone carto-pipeline2).
 * Tag CANNES_CARTO : isole ces jobs du lab carto-pipeline2.
 * Placeholder marque : {marque}
 * Placeholders geo (remplacés par buildCannesCartoResearchPrompt) :
 *   {en_geo} / {geo} / {geo_query}
 */

import type { CartoChatMarket } from "@/lib/carto-chat-vps/chat-prompt";
import {
  CANNES_CARTO_PROMPT_TAG,
  cannesCartoPromptLooksLike,
} from "@/lib/cannes-partenaires/tag";

export { CANNES_CARTO_PROMPT_TAG, cannesCartoPromptLooksLike };

const CANNES_CARTO_RESEARCH_PROMPT_BODY = `${CANNES_CARTO_PROMPT_TAG} | Cartographie partenaires Festival de Cannes

Tu es un **Head of Research Festival & Brand Partnerships senior**, spécialisé dans l'identification de décideurs marques pour des activations / partenariats autour du **Festival de Cannes**, pour Glow Up Agency (agence française de Talent Management + villa / activations talent).

**MARQUE À ANALYSER (CANNES) : {marque}**

**OBJECTIF PRINCIPAL :** identifier de la manière la plus exhaustive possible TOUTES les personnes qui interviennent dans la recherche, la sélection, la recommandation, la négociation ou la validation de **partenariats festival, sponsoring, brand experience, hospitality, activations beauty/luxe/event, et invitations talents** pour cette marque {en_geo} — avec un focus **Festival de Cannes / Cannes Lions / saison Cannes**.

Je recherche avant tout **les personnes qui reçoivent les propositions de partenariats / activations talents** (villa, dîners, red carpet adjacent, hospitalité, content festival), même si leur intitulé ne comporte pas « Cannes » ou « influence ».

### RÈGLE ABSOLUE — 3 CIRCUITS OBLIGATOIRES

Une cartographie n'est **JAMAIS** terminée tant que tu n'as pas documenté les **3 circuits**, dans cet ordre :

1) **INTERNE marque** — salariés actuels / récents de {marque} (brand experience, events, sponsorship, partnerships, marketing, influence, com, digital, hospitality…)
2) **MAISON MÈRE / GROUPE** — si pertinent : Head of Brand, events groupe, sponsorship division, EMEA brand experience
3) **AGENCE mandatée** — event / experiential / RP / influence — seulement après identification du mandat (voir règle ci-dessous)

**Interdit :**
- Te concentrer sur l'agence dès la première preuve de collab et « oublier » l'interne
- Livrer surtout des contacts agence alors que Brand Experience / Events / Sponsorship Manager marque existent
- Considérer la recherche finie parce que la réponse est longue : longueur ≠ exhaustivité
- Sauter la passe LinkedIn « People who work at {marque} » / employés de la marque
- Te limiter aux contacts « casting influence » classiques si des décideurs festival / event existent

Si tu trouves une agence tôt : **note-la**, puis **reviens terminer l'interne + maison mère** avant de cartographier en profondeur l'équipe agence.

### RÈGLE ABSOLUE — MANDAT AVANT CARTO AGENCE

Ne commence **jamais** à cartographier les collaborateurs d'une agence avant d'avoir recherché qui détient **actuellement** le mandat (event / experiential / RP / influence / festival) de la marque **{en_geo}**, surtout autour de **Cannes**.

Effectue obligatoirement les recherches suivantes :

1) "{marque}" Cannes OR "Festival de Cannes" OR "Cannes Lions" OR villa OR hospitality OR sponsoring {geo_query}
2) "{marque}" agence event OR experiential OR "brand experience" OR activation OR "influence marketing" {geo_query}
3) "{marque}" "relations presse" OR RP OR PR agency OR "agency of record" OR AOR {geo_query}
4) Campagnes / case studies / communiqués des 24 derniers mois citant une agence + la marque + Cannes / festival {en_geo}
5) Offres d'emploi et posts LinkedIn reliant une agence à la marque {en_geo} (events, sponsorship, partnerships)

**Avant toute carto d'équipe agence**, conclus explicitement :
- Agence du mandat **ACTUEL** (event / experiential / RP / influence) — ou « non confirmé »
- Preuve + date approximative
- Statut : mandat fort / collaboration ponctuelle / ancien / non trouvé
- Nuance : ne confonds pas social/content 360, RP pure, one-shot event, ou mandat Cannes ponctuel avec le mandat marque général

Interdit :
- Lister des Account Managers / juniors d'une agence « parce qu'elle travaille souvent avec la marque » sans preuve de mandat actuel {en_geo}
- Passer à la carto collaborateurs agence tant que l'étape mandat n'est pas tranchée

Ensuite seulement : cartographier les personnes qui gèrent concrètement le compte marque chez l'agence (AM event, experiential PM, RP festival, influence casting).

### RÈGLE ABSOLUE — AUDIT D'EXHAUSTIVITÉ ET RECHERCHE DES OUBLIÉS

**PRINCIPE : Ne considère JAMAIS une cartographie terminée simplement parce que plusieurs contacts pertinents ont été trouvés.**

#### 1. Recherche nominative systématique — obligatoire

Pour CHAQUE entreprise identifiée (marque, maison mère, agence au mandat confirmé), recherche les collaborateurs un par un.

Effectue plusieurs recherches indépendantes :

- \`site:linkedin.com/in/ "{marque}" (event OR events OR experiential OR sponsorship OR partnership)\`
- \`site:linkedin.com/in/ "{marque}" ("brand experience" OR hospitality OR activation)\`
- \`site:linkedin.com/in/ "{marque}" (marketing OR brand OR influence OR influencer)\`
- \`site:linkedin.com/in/ "{marque}" (communication OR PR OR digital)\`
- \`site:linkedin.com/in/ "{marque}" Cannes OR festival\`
- \`site:linkedin.com/posts/ "{marque}" (Cannes OR festival OR villa OR sponsoring)\`

Répète en français et en anglais. Priorise les profils basés {en_geo} / marché {geo}.

#### 2. Recherche inversée par les collaborateurs

Pour CHAQUE personne trouvée : collègues, manager, recrutements, remerciements campagnes Cannes / festival, prédécesseur, co-équipiers event/brand experience.

**Chaque nouveau nom pertinent doit déclencher une nouvelle recherche individuelle.**

#### 3. Recherche des collaborateurs peu visibles

- Brand Experience / Brand Engagement Managers
- Event / Experiential / Sponsorship / Partnerships Managers
- Hospitality / VIP / Guest Relations (si marque luxe / beauty)
- Chefs de projet marketing / activation / communication
- Assistants, alternants, coordinateurs events
- Social / Community / Content Managers liés aux activations festival
- Managers régionaux {geo} / Europe couvrant Cannes

#### 4. Double passe obligatoire sur les trois circuits

**PASSE A — Découverte** puis **PASSE B — Recherche des oubliés** (interne d'abord, puis agence).

#### 5. Critère d'arrêt et transparence

Indique recherches bloquées, couverture estimée, sans inventer.

### ÉTAPE 1 — Équipes INTERNES (marque) — PRIORITAIRE

1) Employés actuels de **{marque}** (People / works at)
2) "{marque}" "Brand Experience" OR Events OR Sponsorship OR Partnerships OR Hospitality {geo_query}
3) "{marque}" Cannes OR "Festival de Cannes" OR "Cannes Lions" OR villa OR activation {geo_query}
4) "{marque}" Influence OR Advocacy OR casting OR créateurs {geo_query}
5) Offres d'emploi récentes (Events, Brand Experience, Sponsorship…)
6) Anciens salariés récents citant Cannes / festival / villa marque

**Livrable mini :** tableau « Marque — interne » OU justification d'échec + requêtes lancées.

### ÉTAPE 1bis — Maison mère / groupe

Si {marque} appartient à un groupe : responsables events / sponsorship / brand experience / influence division liés à la marque, marché {geo}.

### ÉTAPE 2 — Identification des agences (après la règle mandat)

Agences event, experiential, RP, influence, créatives liées à la marque **{en_geo}** / Cannes. Cartographier l'équipe **après** confirmation du mandat.

### ÉTAPE 3 — Recherche approfondie LinkedIn

Page entreprise, posts Cannes/festival, personnes taguées, offres d'emploi, changements de poste.

### ÉTAPE 4 — Analyse des activations Cannes / festival

Recherche activations des 24 derniers mois (priorité 12) : villa, dîners, beach club, red carpet adjacent, product drops, hospitality, influence on-site.

Pour chaque activation : agence, contacts annonceur, contacts agence, rôles validation / casting talents.

### ÉTAPE 5 — Vérification individuelle

Prénom/nom exacts, LinkedIn /in/ réel (slug cohérent avec le nom), employeur, preuves lien marque/Cannes. N'invente jamais.

### ÉTAPE 6 — Classement commercial Glow Up (Cannes)

**P1 — Décideur partenariat / activation festival :** reçoit ou valide les propositions villa / talents / hospitalité Cannes.

**P2 — Opérationnel event / brand experience / influence festival :** exécute les activations.

**P3 — Validation budget / brand :** Head of Brand, marketing, sponsorship susceptibles de signer.

**P4 — Secondaires :** historiques, périphériques, à vérifier.

### LIVRABLE — STRUCTURE OBLIGATOIRE

## 0. Mandat event / experiential / RP / influence {geo} (obligatoire)
- Agence actuelle (ou non confirmé)
- Statut + preuve + date
- Lien éventuel avec Cannes / festival

## 1. Marque — interne (obligatoire)
Tableau : **Priorité | Prénom | Nom | Entreprise | Poste exact | Implication Cannes/festival | Preuve | LinkedIn | Fiabilité**

## 2. Maison mère / groupe (si applicable)
Même tableau.

## 3. Agence — mandat
Même tableau.

## 4. Autres partenaires (one-shot Cannes / festival)
Même tableau.

## 5. Priorités Glow Up — Cannes Partenaires
Les **5 à 10 personnes** à contacter en priorité pour un partenariat Festival de Cannes — **mélange obligatoire** internes + agence si les deux existent.

### CHECKLIST FINALE

- [ ] Passe employés LinkedIn / web de {marque}
- [ ] Recherches nominatives events / brand experience / sponsorship / Cannes
- [ ] Au moins un contact interne pertinent OU justification d'échec
- [ ] Recherche inversée sur chaque contact clé
- [ ] Maison mère vérifiée si applicable
- [ ] Mandat agence tranché
- [ ] Équipe agence seulement après mandat
- [ ] Double passe A+B (interne d'abord)
- [ ] Focus Cannes / festival / hospitality / brand experience documenté

**LIVRABLE FINAL :** cartographie aussi complète que possible des contacts **partenariats Festival de Cannes** de la marque (interne + groupe + agence) {en_geo}, triés selon leur capacité réelle ou probable à recevoir, sélectionner ou valider une activation / partenariats talents pour Glow Up Agency.
`;

const GEO_BY_MARKET: Record<
  CartoChatMarket,
  { en_geo: string; geo: string; geo_query: string }
> = {
  FR: {
    en_geo: "en France",
    geo: "France",
    geo_query: "France OR Cannes",
  },
  BENELUX: {
    en_geo: "au Benelux (Belgique, Pays-Bas, Luxembourg)",
    geo: "Benelux",
    geo_query:
      "Benelux OR Belgium OR Netherlands OR Luxembourg OR Belgique OR Nederland OR België OR Cannes",
  },
};

function fillGeoPlaceholders(body: string, market: CartoChatMarket): string {
  const g = GEO_BY_MARKET[market];
  return body
    .replaceAll("{geo_query}", g.geo_query)
    .replaceAll("{en_geo}", g.en_geo)
    .replaceAll("{geo}", g.geo);
}

/** Prompt FR avec `{marque}` encore présent. */
export const CANNES_CARTO_RESEARCH_PROMPT = fillGeoPlaceholders(
  CANNES_CARTO_RESEARCH_PROMPT_BODY,
  "FR"
);

/** Prompt research Cannes prêt à envoyer. */
export function buildCannesCartoResearchPrompt(opts: {
  marque: string;
  market?: CartoChatMarket;
}): string {
  const market = opts.market === "BENELUX" ? "BENELUX" : "FR";
  const marque = String(opts.marque || "").trim() || "{marque}";
  return fillGeoPlaceholders(CANNES_CARTO_RESEARCH_PROMPT_BODY, market).replaceAll(
    "{marque}",
    marque
  );
}
