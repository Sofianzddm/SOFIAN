/**
 * Prompt ChatGPT VPS — analyse roster : qui prioriser + pourquoi (1 marque).
 */

export const OUTREACH_ROSTER_VPS_MAX_TALENTS = 30;

export type OutreachRosterVpsTalent = {
  id: string;
  name: string;
  instagram?: string | null;
  niches?: string[];
  pays?: string | null;
  igFollowers?: number;
  ttFollowers?: number;
  igEngagement?: number;
  ttEngagement?: number;
  /** Fiche talent-research (Apify + web) — source de vérité si présente. */
  whoTheyAre?: string;
  whatTheyDo?: string;
  profileAnalysis?: string;
  contentThemes?: string;
  whyRelevant?: string;
  proofPoints?: string;
  suggestedAngle?: string;
};

export type OutreachRosterVpsPromptInput = {
  brandName: string;
  company?: string | null;
  coveredBrands?: string[];
  market?: "FR" | "BENELUX" | "BOTH";
  talents: OutreachRosterVpsTalent[];
  brandResearch?: {
    recentCampaigns?: string;
    newProducts?: string;
    availabilityFrEu?: string;
    brandPositioning?: string;
    influenceStrategy?: string;
  } | null;
};

function fmtFollowers(n?: number): string {
  const v = Number(n) || 0;
  if (v <= 0) return "";
  return new Intl.NumberFormat("fr-FR").format(v);
}

function fmtEng(n?: number): string {
  const v = Number(n) || 0;
  if (v <= 0) return "";
  return `${v.toFixed(1)}%`;
}

/** Trie abonnés desc + tronque à 30. */
export function pickRosterTalentsForVps(
  talents: OutreachRosterVpsTalent[]
): OutreachRosterVpsTalent[] {
  return [...talents]
    .sort((a, b) => {
      const fa = Math.max(Number(a.igFollowers) || 0, Number(a.ttFollowers) || 0);
      const fb = Math.max(Number(b.igFollowers) || 0, Number(b.ttFollowers) || 0);
      return fb - fa;
    })
    .slice(0, OUTREACH_ROSTER_VPS_MAX_TALENTS);
}

export function buildOutreachRosterVpsPrompt(
  input: OutreachRosterVpsPromptInput
): string {
  const brand = String(input.brandName || "").trim() || "Marque";
  const company = String(input.company || "").trim();
  const market = input.market || "FR";
  const covered =
    (input.coveredBrands || []).filter(Boolean).join(", ") || brand;

  const roster = pickRosterTalentsForVps(input.talents || []);
  const rosterBlock =
    roster.length > 0
      ? roster
          .map((t, i) => {
            const ig = fmtFollowers(t.igFollowers);
            const tt = fmtFollowers(t.ttFollowers);
            const igE = fmtEng(t.igEngagement);
            const ttE = fmtEng(t.ttEngagement);
            const stats = [
              ig ? `IG ${ig}` : null,
              igE ? `eng.IG ${igE}` : null,
              tt ? `TT ${tt}` : null,
              ttE ? `eng.TT ${ttE}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const researchBits = [
              t.whoTheyAre ? `   Qui: ${t.whoTheyAre}` : null,
              t.whatTheyDo ? `   Fait: ${t.whatTheyDo}` : null,
              t.profileAnalysis ? `   Profil: ${t.profileAnalysis}` : null,
              t.contentThemes ? `   Thèmes: ${t.contentThemes}` : null,
              t.whyRelevant ? `   Why-fit ${brand}: ${t.whyRelevant}` : null,
              t.proofPoints ? `   Preuves: ${t.proofPoints}` : null,
              t.suggestedAngle ? `   Angle casting: ${t.suggestedAngle}` : null,
            ].filter(Boolean);
            return [
              `${i + 1}. talentId=${t.id} | ${t.name}`,
              t.instagram ? `   IG: ${t.instagram}` : null,
              t.pays ? `   Pays: ${t.pays}` : null,
              t.niches?.length ? `   Niches: ${t.niches.join(", ")}` : null,
              stats ? `   Stats CRM: ${stats}` : null,
              researchBits.length
                ? `   --- Recherche Glow Up (Apify/web) ---`
                : null,
              ...researchBits,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n")
      : "(roster vide)";

  const br = input.brandResearch;
  const brandResearchBlock = br
    ? [
        br.brandPositioning
          ? `- Positionnement: ${br.brandPositioning}`
          : null,
        br.influenceStrategy
          ? `- Stratégie influence: ${br.influenceStrategy}`
          : null,
        br.newProducts ? `- Nouveautés: ${br.newProducts}` : null,
        br.recentCampaigns
          ? `- Campagnes récentes: ${br.recentCampaigns}`
          : null,
        br.availabilityFrEu ? `- Dispo marché: ${br.availabilityFrEu}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(pas de brief marque préchargé — enrichis via le web)";

  return `MARQUE À ANALYSER : ${brand}
Tu es head of casting / business developer chez **Glow Up Agence**. Tu analyses le **roster Glow Up** pour savoir **qui pitcher en priorité** à **${brand}**.

## MISSION
1. Comprends **${brand}** (brief CRM + **web obligatoire**) : positionnement, influence (types de profils, formats, ton).
2. Lis **tout le roster** ci-dessous (data Glow Up CRM = base stats / niches / géo / handles).
3. **Pour CHAQUE talent — compréhension d’univers OBLIGATOIRE** (data Glow Up + **web / Instagram**) :
   - Qui c’est vraiment (vie / posture / communauté), pas un label niche (« lifestyle », « mode », « beauty » seuls = interdit).
   - **Univers** : thèmes récurrents, ton, esthétique, formats qui marchent chez iel.
   - **Angle ultra précis** pour ${brand} : 1 accroche actionnable (activation / format / preuve de vie / moment) — du genre qu’un BD pourrait pitcher en 10 secondes. Vague = refusé.
   - Avant tout \`priority=high\` : tu as **vu** le profil (IG/web). N’invente rien (pas de chiffres / collabs non trouvés).
4. Classe qui prendre **en priorité** : le ranking doit découler de cet univers + angle précis × l’influence réelle de ${brand}.
5. Sois actionnable : on doit pouvoir cocher 4–6 talents tout de suite.

## CLIENT
- Marque pitchée: **${brand}**
${company && company.toLowerCase() !== brand.toLowerCase() ? `- Société / agence: ${company}` : ""}
- Marques couvertes: ${covered}
- Marché: ${market}

### Brief marque (CRM Glow Up)
${brandResearchBlock}

## ROSTER GLOW UP (max ${OUTREACH_ROSTER_VPS_MAX_TALENTS})
Utilise **uniquement** les talentId listés. N'invente aucun id.

${rosterBlock}

## RÈGLES
- Priorise le **fit** : influence réelle de ${brand} × **univers compris** × **angle précis**, pas la taille d'audience seule.
- priority=high = pitcher en premier (idéalement 3–6) — **high sans web/IG + sans angle précis = interdit**. medium = réserve. skip = pas maintenant (1 clause courte).
- **why** (OBLIGATOIRE, 1–2 phrases max) = (1) univers concret du talent + (2) **angle ultra précis** pour ${brand} (quoi pitcher / quel format / pourquoi ça colle). Ex. interdit : « lifestyle qui match la marque ». Ex. OK : « routines matin + road-trips famille → angle essai week-end / daily driver premium pour ${brand} ».
- Si le brief marque est maigre, enrichis-le via le web. Ranking toujours ancré sur les talentId du roster.
- INTERDIT: inventer des talents / ids / preuves ; niches génériques seules ; **INTERDIT de recopier ce brief / ce template** ; n’écris PAS les consignes FORMAT / CODE DE FIN dans la réponse.

## FORMAT DE RÉPONSE (STRICT)
Ta réponse commence **immédiatement** par la ligne \`PRIORITY:\` puis des lignes **remplies** avec les **vrais talentId** du roster ci-dessus (ids alphanumériques tels quels). Aucune intro, aucun rappel des règles.

Exemple de forme (remplace par de vrais ids/noms/why riches) :
PRIORITY:
1. talentId=clxxxxxxxx | name=Prénom Nom | priority=high | why=Univers … → angle précis pour ${brand} : …
2. talentId=clxxxxxxxx | name=Prénom Nom | priority=medium | why=…
3. talentId=clxxxxxxxx | name=Prénom Nom | priority=skip | why=…

Classe **tous** les talents du roster (high puis medium puis skip).

NOTES:
- Analyse marque ${brand}: …
- Logique de sélection: …
- Angles clés (2–4 lignes) : les meilleurs angles retenus
ALERTES: aucune

(Si alerte réelle : une ligne sous ALERTES, sinon exactement le mot aucune.)

Ensuite uniquement le CODE DE FIN sur une ligne seule.`;
}
