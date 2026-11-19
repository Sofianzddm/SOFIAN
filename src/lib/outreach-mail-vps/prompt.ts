/**
 * Prompt ChatGPT VPS outreach — 1 marque = 2 tours High.
 * Tour 1 : Gmail Leyna (alertes + tu/vous). Tour 2 : web marque + mail 10/10.
 */

export type OutreachMailVpsTalent = {
  name: string;
  instagram?: string | null;
  niches?: string[];
  igFollowers?: number;
  ttFollowers?: number;
  igEngagement?: number;
  ttEngagement?: number;
  pays?: string | null;
  /** Présentation CRM (source de vérité identité / métier). */
  presentation?: string;
  whoTheyAre?: string;
  whatTheyDo?: string;
  profileAnalysis?: string;
  contentThemes?: string;
  whyRelevant?: string;
  proofPoints?: string;
  suggestedAngle?: string;
  castingWhyFit?: string;
};

export type OutreachMailVpsContact = {
  firstname: string;
  lastname?: string | null;
  email: string;
  language?: string | null;
};

export type OutreachMailVpsRosterAnalysis = {
  brandAnalysis?: string;
  selectionLogic?: string;
  talentFits?: Array<{
    name: string;
    priority?: string;
    why?: string;
  }>;
};

export type OutreachMailVpsPromptInput = {
  brandName: string;
  company?: string | null;
  coveredBrands?: string[];
  market?: "FR" | "BENELUX" | "BOTH";
  contacts: OutreachMailVpsContact[];
  talents: OutreachMailVpsTalent[];
  fromEmail?: string | null;
  outreachStatus?: string | null;
  brandResearch?: {
    recentCampaigns?: string;
    newProducts?: string;
    availabilityFrEu?: string;
    brandPositioning?: string;
    influenceStrategy?: string;
  } | null;
  rosterAnalysis?: OutreachMailVpsRosterAnalysis | null;
  draftContext?: string | null;
  language?: "fr" | "en";
  /** Marker pré-claim (anti-doublon) — sinon généré à l’envoi. */
  endMarker?: string | null;
};

export function isJoeySender(fromEmail?: string | null): boolean {
  const e = String(fromEmail || "")
    .trim()
    .toLowerCase();
  return e.startsWith("joey@") || e.includes("joey@");
}

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

function talentsBlock(talents: OutreachMailVpsTalent[], brand: string): string {
  if (!talents.length) return "(aucun talent)";
  return talents
    .map((t, i) => {
      const ig = fmtFollowers(t.igFollowers);
      const tt = fmtFollowers(t.ttFollowers);
      const igE = fmtEng(t.igEngagement);
      const ttE = fmtEng(t.ttEngagement);
      const stats = [
        ig ? `IG ${ig} abonnés` : null,
        igE ? `eng. IG ${igE}` : null,
        tt ? `TikTok ${tt} abonnés` : null,
        ttE ? `eng. TT ${ttE}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const presentation = String(t.presentation || "").trim();
      const who = String(t.whoTheyAre || "").trim();
      const what = String(t.whatTheyDo || "").trim();
      return [
        `### Talent ${i + 1} — ${t.name}`,
        t.instagram ? `- Instagram: ${t.instagram}` : null,
        t.pays ? `- Pays / marché: ${t.pays}` : null,
        presentation
          ? `- Présentation CRM (SOURCE DE VÉRITÉ — métier / ce qu'iel est): ${presentation}`
          : null,
        who && who !== presentation
          ? `- Qui (data Glow Up): ${who}`
          : null,
        what ? `- Ce qu'iel fait (data Glow Up): ${what}` : null,
        t.niches?.length
          ? `- Niches CRM (tags secondaires SEULEMENT — ne remplacent PAS la présentation): ${t.niches.join(", ")}`
          : null,
        stats ? `- Stats Glow Up (CRM): ${stats}` : null,
        t.profileAnalysis
          ? `- Analyse profil (data Glow Up): ${t.profileAnalysis}`
          : null,
        t.contentThemes
          ? `- Thèmes contenu (data Glow Up): ${t.contentThemes}`
          : null,
        t.whyRelevant
          ? `- Pourquoi pertinent pour ${brand} (data Glow Up): ${t.whyRelevant}`
          : null,
        t.castingWhyFit
          ? `- Why-fit casting (data Glow Up): ${t.castingWhyFit}`
          : null,
        t.proofPoints
          ? `- Preuves / pics (data Glow Up): ${t.proofPoints}`
          : null,
        t.suggestedAngle
          ? `- Angle casting (fil conducteur — data Glow Up): ${t.suggestedAngle}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function talentbookUrlFor(input: OutreachMailVpsPromptInput): string {
  return input.market === "BENELUX"
    ? "https://app.glowupagence.fr/talentbook/be"
    : "https://app.glowupagence.fr/talentbook";
}

/** Objet mail — format Glow Up obligatoire (Joey + Leyna). */
function subjectRulesBlock(brand: string): string {
  return `## OBJET (SUBJECT) — FORMAT OBLIGATOIRE (NON NÉGOCIABLE)
- **TOUJOURS** exactement : \`${brand} x Glow Up — …\`
  (le nom de la marque + \` x Glow Up — \` + une accroche courte et belle).
- Accroche après le tiret : humaine, concrète (produit / event / angle), ≤ ~40 car. après le préfixe.
- Exemples d’esprit (NE PAS recopier) :
  « ${brand} x Glow Up — Mondial 2026, idée créateurs »
  « ${brand} x Glow Up — ID. Polo & angle quotidien »
  « ${brand} x Glow Up — après FinalSlam »
- **INTERDIT** :
  - objet SANS \`${brand} x Glow Up —\`
  - « Glow Up x ${brand} » (ordre inversé)
  - accroche usine : « quelques profils pour vos prochaines campagnes », « idées côté influence », « collaboration », « casting », « proposition de talents »
  - jetons \`{{ contact.company }}\` / \`{{ contact.firstname }}\` dans l’objet`;
}

/** Checklist noms — obligation explicite (sinon Chat en saute 2–3). */
function talentMustAppearChecklist(input: OutreachMailVpsPromptInput): string {
  const names = input.talents
    .map((t) => String(t.name || "").trim())
    .filter(Boolean);
  if (names.length === 0) return "";
  const n = names.length;
  return `## CHECKLIST OBLIGATOIRE — ${n} TALENT${n > 1 ? "S" : ""} DANS LE BODY
Avant d'écrire NOTES / CODE DE FIN, vérifie que **chaque** nom ci-dessous apparaît **en clair** dans une puce du BODY (lien IG + prénom/nom) :
${names.map((name, i) => `${i + 1}. **${name}** — OBLIGATOIRE (1 \`<p>• …</p>\` dédié)`).join("\n")}
- Total puces talents attendu = **exactement ${n}** (ni ${Math.max(0, n - 1)}, ni un « etc. »).
- Si tu oublies **un seul** nom → le mail est **REJETÉ** côté app (TALENTS_MISSING). Relis la checklist.`;
}

/** Règles pitch talents + talentbook (Joey + Leyna). */
function talentPitchRulesBlock(input: OutreachMailVpsPromptInput): string {
  const url = talentbookUrlFor(input);
  const n = input.talents.filter((t) => String(t.name || "").trim()).length;
  return `## TALENTS + TALENTBOOK (NON NÉGOCIABLE — REJET SI MANQUANT)
- **OBLIGATION ABSOLUE** : pitcher **TOUS les ${n || "N"} talents** listés dans la data — **1 puce HTML / talent**, aucun oubli.
- INTERDIT : en omettre, fusionner 2 talents dans 1 puce, « sélectionner les plus pertinents », « quelques profils », « etc. », renvoyer vers le talentbook à la place d'une puce.
- Même si le mail est long : **garde les ${n || "N"} puces**. Tu peux raccourcir chaque phrase à ~1 ligne, **jamais supprimer une puce**.
- Pour chaque talent : 1 phrase orale = **ce qu'iel fait vraiment** (présentation CRM / métier / niches) + pourquoi pour la marque.
- **Présentation CRM = source de vérité.** Les niches sont des tags secondaires.
- INTERDIT d'inventer un angle « humour / drôle / comedy » juste parce qu'une niche Comedy / Humour figure si la présentation dit cinéma, réalisateur, acteur, storytelling filmique, etc. Pitch le vrai métier.
- Utilise les niches seulement si elles collent à la présentation (ex. Tech, Sport, Travel) — jamais comme excuse pour déformer le profil.
- **INTERDIT absolu — biographie inventée / télé-réalité :**
  - Ne **jamais** mentionner Secret Story, Koh-Lanta, Loft Story, Pékin Express, The Voice, Star Academy, ni aucun passage TV / télé-réalité / émission.
  - INTERDIT les formules « passé par… », « connu pour… », « vu dans… » si ce n'est **pas** écrit noir sur blanc dans la data Glow Up fournie.
  - Si la présentation CRM est vide : pitch uniquement avec les **niches** + angle marque — **sans** bio web, sans Wikipedia, sans actualité people.
- **Talentbook OBLIGATOIRE** (avant le pont / CTA), formulation type :
  FR : « Vous pouvez également retrouver l'ensemble de nos profils dans notre <a href="${url}">talentbook</a>. »
  EN : « You can also browse all our profiles in our <a href="${url}">talentbook</a>. »
- INTERDIT d'oublier le talentbook. INTERDIT de le mettre après la clôture.
${talentMustAppearChecklist(input)}`;
}

function contactsBlock(input: OutreachMailVpsPromptInput): string {
  if (!input.contacts.length) return "- (aucun email contact fourni)";
  return input.contacts
    .map((c) => {
      const name = [c.firstname, c.lastname].filter(Boolean).join(" ");
      return `- ${name || "?"} <${c.email}>${
        c.language ? ` · lang=${c.language}` : ""
      }`;
    })
    .join("\n");
}

function brandResearchBlock(input: OutreachMailVpsPromptInput): string {
  const br = input.brandResearch;
  if (!br) return "(pas de brief marque préchargé — à construire via le web)";
  const lines = [
    br.brandPositioning ? `- Positionnement: ${br.brandPositioning}` : null,
    br.influenceStrategy
      ? `- Stratégie influence: ${br.influenceStrategy}`
      : null,
    br.newProducts ? `- Nouveautés: ${br.newProducts}` : null,
    br.recentCampaigns ? `- Campagnes récentes: ${br.recentCampaigns}` : null,
    br.availabilityFrEu ? `- Dispo marché: ${br.availabilityFrEu}` : null,
  ].filter(Boolean);
  return lines.length
    ? lines.join("\n")
    : "(pas de brief marque préchargé — à construire via le web)";
}

function rosterAnalysisBlock(input: OutreachMailVpsPromptInput): string {
  const ra = input.rosterAnalysis;
  if (!ra) return "";
  const rosterFitsBlock =
    ra.talentFits && ra.talentFits.length > 0
      ? ra.talentFits
          .map((f, i) => {
            const bits = [
              f.priority ? `priority=${f.priority}` : null,
              f.why ? f.why : null,
            ]
              .filter(Boolean)
              .join(" — ");
            return `${i + 1}. ${f.name}${bits ? `: ${bits}` : ""}`;
          })
          .join("\n")
      : "";
  return [
    ra.brandAnalysis ? `- Analyse marque (casting): ${ra.brandAnalysis}` : null,
    ra.selectionLogic ? `- Logique de sélection: ${ra.selectionLogic}` : null,
    rosterFitsBlock ? `- Fits talents:\n${rosterFitsBlock}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function clientHeader(input: OutreachMailVpsPromptInput): string {
  const brand = String(input.brandName || "").trim() || "Marque";
  const company = String(input.company || "").trim();
  const covered =
    (input.coveredBrands || []).filter(Boolean).join(", ") || brand;
  const market = input.market || "FR";
  return `## CLIENT
- Marque pitchée: **${brand}**
${company && company.toLowerCase() !== brand.toLowerCase() ? `- Société / agence destinataire: ${company}` : ""}
- Marques couvertes: ${covered}
- Marché: ${market}
- Statut cycle: ${input.outreachStatus || "TO_CONTACT"}
- Expéditeur prévu: ${input.fromEmail || "leyna@glowupagence.fr"}

### Contacts destinataires
${contactsBlock(input)}

${input.draftContext ? `### Contexte ops app\n${input.draftContext}\n` : ""}`;
}

/** Branches mail — définitions non négociables (tour 1 choisit, tour 2 applique). */
function branchesAbcBlock(): string {
  return `## BRANCHES MAIL A / B / C (choisis UNE seule, jamais un mélange)
### A — Cold / aucun fil Leyna pertinent
- Aucun échange Gmail pertinent avec la marque ni avec ces contacts.
- Cold propre : courte présentation Glow Up + **pourquoi tu les contactes maintenant** (angle marque / influence).
- Montre que tu as compris **comment la marque active l’influence**.
- Talents = **pistes** pour ouvrir la discussion, pas une offre fermée.
- CTA OBLIGATOIRE = **appel ~15 min** pour comprendre leurs besoins / façon de bosser avec les créateurs.
- INTERDIT : « suite à notre échange », « comme convenu », ancrage historique inventé.

### B — Déjà échangé avec CE(S) contact(s) (fil / réponses / propositions)
- Ancre le **1er paragraphe** sur le vrai historique (sujet, personne, statut : en cours, pause, refus budget, gifting, « on revient en 2027 », etc.).
- Continue la conversation : **jamais** de cold reset ni re-présentation complète de l’agence.
- Respecte les ALERTES (budget, timing, refus, tutoiement, autre contact en négociation).
- Talents = suite naturelle du fil — pas un reset.
- CTA OBLIGATOIRE = **appel ~15 min** pour mieux comprendre où ils en sont / priorités à venir (même en relance — pas de CTA « dis-moi si ça t’intéresse » seul).

### C — Marque connue / agences partenaires, mais pas avec CE contact
- Échange Leyna avec la marque ou ses agences (Fojow, BBDO…), **sans** fil perso avec le destinataire.
- Mentionne avec tact le contexte marque si utile, **sans inventer** un lien perso (« suite à notre échange » avec IEL).
- Ton semi-warm : tu connais la marque, tu te présentes proprement à cette personne.
- Talents = pistes cohérentes avec l’historique marque + l’influence actuelle.
- CTA OBLIGATOIRE = **appel ~15 min** pour comprendre leurs priorités influence / castings (et le rôle des agences partenaires si utile).`;
}

/** Anti-IA : écrire comme une vraie BD, pas comme un LLM. */
function humanToneBlock(): string {
  return `## TON HUMAIN (NON NÉGOCIABLE — anti « mail IA »)
Écris comme une business developer qui envoie un vrai mail, **pas** comme ChatGPT.
- Phrases courtes / mixtes. Une idée par phrase. Tutoiement/vouvoiement naturel.
- Ancres **concrètes** (lancement, date, format, nom d’activation) — pas de blabla.
- Talents : 1 phrase simple « ce qu’iel fait + pourquoi pour la marque » — oral, pas fiche CRM.
- CTA call : simple et direct (priorités / façon de fonctionner).

### INTERDIT (sonne IA / corporate)
- « C'est justement… », « En réfléchissant à… », « Ce qui m'intéresse : », « Dans la continuité de… »
- « plusieurs talents que nous accompagnons m'ont semblé particulièrement… »
- « Ce sont évidemment quelques pistes… », « prolonger votre approche actuelle »
- Jargon : synergie, ADN, storytelling, immersive, authentique×3, « univers qui résonne »
- Paragraphe thesis en gras au milieu ; listes trop symétriques / calquées
- Emojis (🏡💛🌿✨) ; points médians décoratifs excessifs
- Recopier la structure mot à mot de l’exemple gold

### INTERDIT ABSOLU — vieux template casting (REJET AUTO)
- media kit(s), moodboard, estimations de performance / reach
- « plusieurs créateurs qui peuvent correspondre », « Dans notre agence nous avons plusieurs créateurs »
- « Nous serions ravis d'envisager une collaboration »
- Dump d’abonnés / « X millions de vues » dans les puces talents
- CTA « Seriez-vous intéressé… prochaines campagnes » / « Je peux vous transmettre rapidement leurs media kits »
→ Ces formulations = ANCIEN générateur. Utilise UNIQUEMENT la structure gold (Joey ou Leyna) de ce prompt.`;
}

/**
 * Exemple gold Leyna (Volkswagen, branche C) — structure à viser, ton humain.
 * Ne pas recopier marque, talents, faits ni phrases telles quelles.
 */
function goldMailExampleBlock(): string {
  return `## EXEMPLE GOLD LEYNA (référence de structure — Volkswagen, branche C)
**INTERDIT de recopier** les phrases. Reprends l’idée : court, concret, humain.

SUBJECT: Volkswagen x Glow Up — ID. Polo, angle quotidien
BODY:
<p>Bonjour {{ contact.firstname }},</p>
<p>J'espère que vous allez bien ?</p>
<p>Je suis Leyna, chez Glow Up. On a déjà travaillé avec des équipes / agences côté Volkswagen (Rock en Seine, activations créateurs) — je me permets de vous écrire directement.</p>
<p>J'ai vu vos collabs autour de l'ID. Polo : vous sortez vraiment la voiture du discours « essai auto » pour la mettre dans le quotidien des créateurs. Ça colle bien à ce qu'on pitch.</p>
<p>Trois pistes rapides de notre côté :</p>
<p>• <a href="https://www.instagram.com/melissaallbb/"><strong>Mélissa Alleb</strong></a> — sport, voyages, famille au quotidien. Elle pourrait montrer le véhicule dans ses vrais trajets, sans force le produit.</p>
<p>• <a href="https://www.instagram.com/run.cyrille/"><strong>Cyrille Fournand</strong></a> — sport + humour. Bon pour des formats un peu décalés sur la mobilité du quotidien.</p>
<p>• <a href="https://www.instagram.com/manondelsolll/"><strong>Manon Delsol</strong></a> — mode / escapades. Une expérience ID. Polo racontée comme un week-end, pas une pub.</p>
<p>Vous pouvez également retrouver l'ensemble de nos profils dans notre <a href="https://app.glowupagence.fr/talentbook">talentbook</a>.</p>
<p>Au-delà de cette première sélection, j'aimerais surtout prendre le temps de faire votre connaissance, comprendre comment vous travaillez vos campagnes d'influence et quels types de profils vous recherchez.</p>
<p><strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong></p>
<p>Au plaisir d'échanger avec vous,</p>

Ce que tu dois reproduire : **ton fluide + concret**, HTML propre, jeton prénom, **talentbook**, CTA 15 min en \`<strong>\` — **pas** le phrasé IA.`;
}

/**
 * Gold Joey cold — structure validée (intro BD + angle marque + talents + talentbook + CTA 15 min).
 * Ne pas recopier la marque / les faits ; adapter à ${brand}.
 */
function goldJoeyMailExampleBlock(brand: string): string {
  const url = "https://app.glowupagence.fr/talentbook";
  return `## EXEMPLE GOLD JOEY (structure à viser — adapter à ${brand}, NE PAS recopier les faits)
**INTERDIT de recopier** marques / talents / phrases telles quelles. Reprends le **fil** et le **ton**.

SUBJECT: ${brand} x Glow Up — une idée créateurs
BODY:
<p>Bonjour {{ contact.firstname }},</p>
<p>J'espère que vous allez bien !</p>
<p>Je suis Joey, je viens de rejoindre le pôle Business Development de Glow Up et je serai ravie d'échanger avec vous autour de vos prochaines campagnes d'influence.</p>
<p>J'ai notamment suivi [1–2 faits concrets ${brand} : partenariat / activation / novelty app]. Je trouve intéressant votre façon de [angle marque accessible / jeunes / usages concrets].</p>
<p>Dans cette dynamique, je voulais vous partager quelques talents que nous accompagnons et que j'imagine bien collaborer avec ${brand} :</p>
<p>• <a href="https://www.instagram.com/HANDLE/"><strong>Prénom Nom</strong></a> — univers + pourquoi pour ${brand} (fidèle présentation CRM).</p>
<p>• …</p>
<p>Vous pouvez également retrouver l'ensemble de nos profils dans notre <a href="${url}">talentbook</a>.</p>
<p>Au-delà de cette première sélection, j'aimerais surtout prendre le temps de faire votre connaissance, comprendre comment vous travaillez vos campagnes d'influence et quels types de profils vous recherchez.</p>
<p><strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong></p>
<p>Au plaisir d'échanger avec vous,</p>

Ce que tu dois reproduire : intro Joey « je viens de rejoindre le pôle BD », angle marque fluide, puces talents, talentbook, pont « Au-delà… », **CTA 15 min entier en strong**, clôture « Au plaisir… » — **sans** signer Joey dans le BODY.`;
}

/**
 * Tour 1 — UNIQUEMENT boîte Gmail Leyna (alertes + tu/vous + brief ops).
 * Pas de rédaction mail ici.
 */
export function buildOutreachLeynaStepPrompt(
  input: OutreachMailVpsPromptInput
): string {
  const brand = String(input.brandName || "").trim() || "Marque";
  const talentNames = input.talents
    .map((t) => t.name)
    .filter(Boolean)
    .join(", ");

  return `TOUR 1/2 · HISTORIQUE LEYNA — ${brand}
Tu es business developer chez **Glow Up Agence**. Ce tour = **analyse Gmail Leyna UNIQUEMENT**. Ne rédige PAS le mail client.

## AUDIT HISTORIQUE MARQUE 360° — OBLIGATOIRE

**OBJECTIF :** reconstruire l'intégralité de la relation entre Glow Up et **${brand}** avant de rédiger un nouveau mail de prospection (tour 2).

**Ne limite JAMAIS la recherche aux talents du casting actuel, aux destinataires CRM ou aux échanges directs de Leyna avec ces seuls contacts.**

Recherche dans toute la boîte Gmail accessible :

- Tous les échanges avec la marque, ses collaborateurs et ses agences partenaires.
- Tous les talents Glow Up mentionnés dans les échanges avec cette marque, même absents du casting actuel.
- Tous les échanges internes Glow Up concernant la marque : commerciaux, account managers, talent managers, production, logistique.
- Les conversations dont l'objet ne mentionne pas la marque, mais dont le corps contient son nom.
- Les échanges avec des agences ou intermédiaires qui ne mentionnent pas explicitement la marque dans l'objet.
- Les propositions, réponses, négociations, invitations, événements, gifting, prêts de produits, tournages, publications, facturations, refus et annulations.
- Les messages antérieurs ET postérieurs à chaque opération, pour reconstituer son évolution réelle.

### MÉTHODE DE RECHERCHE
1. **Recherche marque :** nom, variantes, modèles, campagnes, événements et domaines e-mail.
2. **Recherche contacts :** tous les interlocuteurs identifiés, y compris agences et collaborateurs internes.
3. **Recherche talents :** identifier TOUS les talents ayant été associés à la marque, puis rechercher chacun individuellement.
4. **Recherche opérations :** retrouver les fils liés aux invitations, validations, événements, prêts, livraisons, contenus et bilans.
5. **Recherche croisée :** explorer les fils internes et externes qui permettent de confirmer ou de contredire les informations précédentes.

Ne considère pas l'audit terminé après les premières réponses pertinentes. Poursuis les recherches jusqu'à avoir vérifié les suites des opérations identifiées.

### STATUTS À DISTINGUER
Pour chaque talent ou opération, identifie le statut le plus avancé **prouvé par les e-mails** :
1. Proposition envoyée
2. Intérêt exprimé
3. Invitation ou offre reçue
4. Talent intéressé / disponible
5. Accord ou validation définitive
6. Activation réalisée
7. Contenu publié / prestation terminée
8. Refus, annulation ou mise en pause

**Ne confonds jamais intérêt, accord de principe, validation et réalisation effective.**

### RESTITUTION OBLIGATOIRE (dans RESUME ci-dessous)
- **HISTORIQUE MARQUE :** chronologie de tous les échanges significatifs.
- **TALENTS HISTORIQUES :** tous les talents identifiés, même hors casting actuel, avec leur statut.
- **ACTIVATIONS :** opérations proposées, acceptées, réalisées, annulées ou non confirmées.
- **CONTACTS ET AGENCES :** interlocuteurs, rôles et nature des relations.
- **CONDITIONS COMMERCIALES :** rémunération, gifting, invitations, budgets, exclusivités ou refus réellement établis.
- **OPPORTUNITÉS :** relations existantes et faits concrets réutilisables pour la prochaine prise de contact.
- **ALERTES (détail) :** refus, engagements en cours, relances répétées et sujets à ne pas reproposer.

Pour chaque fait important : date + nom de l'interlocuteur + preuve Gmail (sujet / fil).

### CONTRÔLE FINAL ANTI-OUBLI
Avant de conclure, vérifie :
- Ai-je recherché au-delà des talents du casting actuel ?
- Ai-je identifié les échanges internes Glow Up ?
- Ai-je vérifié les suites de chaque proposition ou invitation ?
- Ai-je recherché les collaborations passées, même avec d'autres talents ?
- Ai-je distingué ce qui était prévu de ce qui a réellement été réalisé ?
- Ai-je identifié les éléments positifs qui changent la manière d'aborder la marque ?

**RÈGLE ABSOLUE :** une relation déjà avancée ne doit jamais être résumée à « talent simplement pitché » si les e-mails montrent une invitation, une validation ou une opération plus avancée.

Si une information reste introuvable, indique « non confirmé dans les e-mails consultés » plutôt que de conclure qu'elle n'a pas eu lieu.

## MISSION OPS (après l’audit)
1. Distingue clairement : échange avec **ces destinataires CRM** vs échange avec la **marque / agences** seulement.
2. Choisis **UNE branche A / B / C** (définitions ci-dessous) d’après Gmail réel.
3. Détecte le **ton** réel (tutoiement vs vouvoiement).
4. Remplis EXCLUSIONS / INTERDITS / ALERTES / CONSIGNES pour le tour 2. **N’invente rien** hors boîte mail.

${branchesAbcBlock()}

${clientHeader(input)}
### Casting actuel (croisement SECONDAIRE seulement — NE PAS limiter l’audit à cette liste)
${talentNames || "(aucun)"}

## FORMAT DE RÉPONSE (STRICT) — rien avant STATUT
STATUT: 1–3 phrases sur la relation (froid / chaud / marque connue contacts neufs / etc.) — reflète le statut le plus avancé prouvé
BRANCHE: A ou B ou C (une seule lettre, selon les définitions)
A_FAIRE: action recommandée pour le prochain mail
ANGLE: angle de suite (1–3 phrases) ancré sur faits Gmail
ECHANGE: oui ou non (échange pertinent trouvé dans Gmail)
TONE: tu ou vous (d’après l’historique réel ; si aucun échange → vous)
RESUME:
(si aucun fil pertinent : le mot aucun — sinon TOUTES les rubriques ci-dessous, datées)
HISTORIQUE MARQUE:
…
TALENTS HISTORIQUES:
…
ACTIVATIONS:
…
CONTACTS ET AGENCES:
…
CONDITIONS COMMERCIALES:
…
OPPORTUNITÉS:
…
EXCLUSIONS:
talents à ne pas (re)pitcher d’après Gmail (y compris hors casting actuel), ou aucune
INTERDITS:
lignes bloquantes (une par ligne), ou aucune
CONSIGNES:
mode d’emploi rédaction pour le tour 2 (ton, branche A/B/C, ce qu’il faut ancrer / éviter — s’appuyer sur OPPORTUNITÉS + ALERTES)
ALERTES:
aucune
(Si alerte réelle Gmail : une ligne par alerte urgente. Sinon exactement le mot aucune. INTERDIT d’inventer hors boîte.)

Ensuite uniquement le CODE DE FIN sur une ligne seule.`;
}

/**
 * Tour 2 — web marque + talents + mail 10/10, en s’appuyant sur le brief Leyna du tour 1.
 */
export function buildOutreachMailStepPrompt(
  input: OutreachMailVpsPromptInput
): string {
  const brand = String(input.brandName || "").trim() || "Marque";
  // Contabo / brouillon = FR ; EN à l’envoi (ignore input.language).
  void input.language;
  const joey = isJoeySender(input.fromEmail);
  const roster = rosterAnalysisBlock(input);
  const talents = talentsBlock(input.talents, brand);
  const talentRules = talentPitchRulesBlock(input);

  if (joey) {
    const tbUrl = talentbookUrlFor(input);
    return `MAIL JOEY · COLD 10/10 — ${brand}
Tu es **Joey**, nouvelle business developer chez **Glow Up** (pôle Business Development). Tu écris depuis **joey@…**.

## LANGUE (NON NÉGOCIABLE)
- Rédige **TOUJOURS en FRANÇAIS** (salut « Bonjour », « J'espère que vous allez bien ! », corps, CTA, clôture).
- Même si les contacts sont EN / NL / autre : **pas d’anglais** dans SUBJECT / BODY.
- La traduction anglaise se fait **à l’envoi**, pas ici.

## RÈGLE JOEY (NON NÉGOCIABLE)
- Joey **n’a jamais échangé** avec ces contacts / cette marque.
- **N’ouvre PAS** la boîte Gmail Leyna. N’utilise PAS l’historique Leyna / Kindai / Fojow comme si c’était **ton** échange.
- Branche **A (cold)** uniquement. TONE **vous**.
- Après le salut + « J'espère que vous allez bien ! », **OBLIGATOIRE** une intro dans **cet esprit** :
  « Je suis Joey, je viens de rejoindre le pôle Business Development de Glow Up et je serai ravie d'échanger avec vous autour de vos prochaines campagnes d'influence. »
- Puis 1 paragraphe **angle marque** (1–2 faits concrets ${brand} + ce que tu trouves intéressant — fluide, pas bullet corporate).
- Transition talents type : « Dans cette dynamique, je voulais vous partager quelques talents… » puis puces.
- Talentbook OBLIGATOIRE, formulation type : « Vous pouvez également retrouver l'ensemble de nos profils dans notre <a href="${tbUrl}">talentbook</a>. »
- Pont avant CTA : « Au-delà de cette première sélection, j'aimerais surtout prendre le temps de faire votre connaissance, comprendre comment vous travaillez vos campagnes d'influence et quels types de profils vous recherchez. »
- **CTA OBLIGATOIRE** (paragraphe dédié, **toute la question en gras**) :
  \`<p><strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong></p>\`
- Clôture : « Au plaisir d'échanger avec vous, » — **INTERDIT** de signer « Joey » / « Glow Up Agence » dans le BODY (signature Gmail).
- INTERDIT : « Je me présente », « interlocutrice principale », « suite à notre échange », tutoiement, Secret Story / télé-réalité, signer Joey.
- **INTERDIT ABSOLU — vieux template casting** (si tu le sors, le mail est REJETÉ) :
  media kit(s), moodboard, estimations de performance, « plusieurs créateurs qui peuvent correspondre », « Nous serions ravis d'envisager une collaboration », dump « X millions de vues », CTA « quelles seraient vos prochaines campagnes », « Je peux vous transmettre rapidement leurs media kits ».
- **NOTES / ALERTES = hors mail** : jamais dans le BODY.

${humanToneBlock()}

${talentRules}

## MISSION
1. **Web ${brand}** (sources) : positionnement, nouveautés, influence réelle.
2. **Talents** : présentation + niches = source de vérité ; **1 puce POURQUOI / talent — TOUS obligatoires**.
3. **Rédige le mail** cold dans le **ton gold Joey** ci-dessous (fluide, posé), **avec talentbook** + CTA 15 min en strong.

${goldJoeyMailExampleBlock(brand)}

## SÉLECTION CASTING (FIGÉE)
### Brief marque (Glow Up)
${brandResearchBlock(input)}

${roster ? `### Contexte casting / fits\n${roster}\n` : ""}
### Talents (ne pas en ajouter / retirer — lire présentation + niches)
${talents}

${clientHeader(input)}

## BARRE QUALITÉ
- Fil : salut → espoir → intro Joey (pôle BD) → angle ${brand} → **puces = TOUS les talents (checklist)** → talentbook → pont « Au-delà… » → **CTA 15 min strong** → « Au plaisir d'échanger avec vous, »
- Pas de dump d’abonnés. Pas de NOTES dans le BODY. Pas d’omission de talent.
- Lien IG : \`<a href="https://www.instagram.com/HANDLE/"><strong>Prénom Nom</strong></a>\`
- HTML \`<p>\` / \`<strong>\` / \`<a>\` — PAS de \`<html>\`, PAS de \`\\\`, PAS de \`<br>\` avant le salut.
- Jeton : \`{{ contact.firstname }}\`

${subjectRulesBlock(brand)}

## FORMAT (STRICT) — rien avant SUBJECT
SUBJECT: ${brand} x Glow Up — <accroche courte>
BODY:
(écris ICI le vrai mail HTML — salut → espoir → intro Joey → angle → puces → talentbook → pont → CTA → Au plaisir)
INTERDIT de recopier ce prompt / « FIN DE BODY » / « structure gold » dans le BODY.

## ANTI-TRONCATURE
- BODY 100 % terminé AVANT NOTES / CODE DE FIN.
- Fin obligatoire : puces talents → talentbook → pont « Au-delà… » → CTA 15 min strong → « Au plaisir d'échanger avec vous, »
- Si long : raccourcis chaque puce, **garde TOUTES les puces**.

NOTES:
(dossier interne — PAS dans le mail client)
- Échange Leyna/Joey: non (Joey cold)
- Branche: A
- Ton utilisé: vous
- Analyse marque ${brand}: 2–8 lignes + sources
- Influence ${brand}: profils / formats / campagnes + sources
- Pourquoi chaque talent: priorité + univers + angle
- Cohérence 10/10: 1–2 phrases
ALERTES:
aucune

Ensuite uniquement le CODE DE FIN sur une ligne seule.

Langue du mail: **français uniquement** (traduction EN à l’envoi — jamais d’anglais ici).`;
  }

  return `TOUR 2/2 · MAIL 10/10 — ${brand}
Tu es business developer chez **Glow Up Agence**. Le **tour 1** vient de livrer l’analyse Gmail Leyna (STATUT / BRANCHE / TONE / RESUME / ALERTES / CONSIGNES). **Respecte-le à la lettre** : branche A/B/C, tutoiement/vouvoiement, alertes.

## MISSION
1. **Web ${brand}** (sources) : positionnement, nouveautés, influence réelle.
2. **Talents** : présentation + ce qu'iels font + niches (secondaires) = source de vérité ; **1 puce POURQUOI / talent — TOUS obligatoires** (voir checklist).
3. **Rédige le mail** prêt à envoyer, cohérent avec le brief Leyna du tour 1 — **humain**, pas IA (voir TON HUMAIN + gold) **avec talentbook**.
4. NOTES = dossier (marque + influence + pourquoi talents). **Ne réinvente pas** d’ALERTES hors Gmail pour le bandeau UI — les alertes Gmail sont déjà au tour 1.

${branchesAbcBlock()}

${humanToneBlock()}

${talentRules}

${goldMailExampleBlock()}

## SÉLECTION CASTING (FIGÉE)
### Brief marque (Glow Up)
${brandResearchBlock(input)}

${roster ? `### Contexte casting / fits\n${roster}\n` : ""}
### Talents (ne pas en ajouter / retirer — lire présentation + niches)
${talents}

${clientHeader(input)}

## BARRE QUALITÉ
- Fil simple : historique/cold (tour 1) → 1 ancrage concret ${brand} → talents → **talentbook** → pont « Au-delà… » → **CTA 15 min strong**.
- **BRANCHE** du tour 1 = loi (A, B ou C). Jamais de mélange cold + « suite à notre échange ».
- Si le contexte ops dit **ÉCHANGE DIRECT = NON** (ou branche C / A) :
  **INTERDIT ABSOLU** « On avait échangé », « suite à notre/nos échanges », « Je reviens vers toi/vous », « certains profils t'avaient plu », tutoiement inventé.
  Semi-warm marque OK ; pas de fil perso inventé avec le destinataire.
- Si **ÉCHANGE DIRECT = OUI** (branche B) : ancrage perso autorisé, faits du dossier seulement.
- **TONE** du tour 1 = loi : si \`TONE: tu\` **et** échange direct → tutoiement ; sinon vouvoiement.
- Pas d’intro Joey inventée (ce flux = Leyna / compte non-Joey).
- **TOUS les talents de la checklist** : 1 phrase orale chacun = ce qu’iel fait vraiment (présentation) + **pourquoi pour ${brand}**. Pas de dump d’abonnés / % eng. 0 omission = sinon REJET.
- Lien IG obligatoire : \`<a href="https://www.instagram.com/HANDLE/"><strong>Prénom Nom</strong></a>\`
- HTML propre : \`<p>\`, \`<strong>\`, \`<a>\` — PAS de \`<html>\`, PAS de \`\\\` d’échappement, PAS de \`<br>\` avant le salut.
- Jeton obligatoire : \`{{ contact.firstname }}\` (jamais de prénom en dur).
- **CTA OBLIGATOIRE** : paragraphe dédié, **toute la question en gras** :
  \`<p><strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong></p>\`
  (EN : \`<p><strong>Would you have 15 minutes in the coming days to discuss?</strong></p>\`)
  Avant le CTA : pont « Au-delà de cette première sélection… » (faire connaissance / campagnes / profils recherchés).
  INTERDIT : « Ça vous parlerait ? » seul / CTA sans \`<strong>\`.
- Clôture FR « Au plaisir d'échanger avec vous, » / EN « Looking forward to speaking with you, » — pas de signature nominative.
- INTERDIT : jargon, prix inventés, recopier l’exemple gold, phrases types IA listées dans TON HUMAIN.
- **INTERDIT ABSOLU vieux template casting** (rejet auto) : media kits, moodboard, dump de vues, « plusieurs créateurs qui peuvent correspondre », CTA « prochaines campagnes » / media kits.

${subjectRulesBlock(brand)}

## FORMAT (STRICT) — rien avant SUBJECT
SUBJECT: ${brand} x Glow Up — <accroche courte>
BODY:
(écris ICI le vrai mail HTML — salut → espoir → ancrage → angle → puces → talentbook → pont → CTA → clôture)
INTERDIT de recopier ce prompt / « FIN DE BODY » / « structure gold » dans le BODY.

## ANTI-TRONCATURE
- BODY 100 % terminé AVANT NOTES / CODE DE FIN (puces → talentbook → pont → CTA 15 min strong → clôture).
- Si long : raccourcis chaque puce, **garde TOUTES les puces**.

NOTES:
- Échange Leyna: oui/non (aligné tour 1)
- Branche: A / B / C (alignée tour 1)
- Ton utilisé: tu ou vous
- Analyse marque ${brand}: 2–8 lignes + sources
- Influence ${brand}: profils / formats / campagnes + sources
- Pourquoi chaque talent: priorité + univers + angle (+ histo Leyna si dispo)
- Cohérence 10/10: 1–2 phrases
- Autres infos client utiles
ALERTES:
reprendre UNIQUEMENT les alertes Gmail du tour 1 (ou aucune) — pas d’alertes inventées hors boîte

Ensuite uniquement le CODE DE FIN sur une ligne seule.

Langue du mail: **français uniquement** (traduction EN à l’envoi — jamais d’anglais ici).`;
}

/** Alias : prompt mail (tour 2). */
export function buildOutreachMailVpsPrompt(
  input: OutreachMailVpsPromptInput
): string {
  return buildOutreachMailStepPrompt(input);
}

/** @deprecated */
export function buildOutreachBrandStepPrompt(
  input: OutreachMailVpsPromptInput
): string {
  return buildOutreachMailStepPrompt(input);
}

/** @deprecated */
export function buildOutreachTalentsStepPrompt(
  input: OutreachMailVpsPromptInput
): string {
  return buildOutreachMailStepPrompt(input);
}

export function buildOutreachMailVpsSteps(input: OutreachMailVpsPromptInput): {
  brand: string;
  talents: string;
  leyna: string;
  mail: string;
} {
  const leyna = buildOutreachLeynaStepPrompt(input);
  const mail = buildOutreachMailStepPrompt(input);
  return { brand: mail, talents: mail, leyna, mail };
}

/**
 * Prompt gold Joey/Leyna pour `/api/casting/generate-email` (xAI).
 * Même barre qualité que Contabo VPS — réponse JSON { subject, body }.
 */
export function buildGrokCastingOutreachGoldPrompt(args: {
  brandName: string;
  language: "fr" | "en";
  fromEmail?: string | null;
  talentbookUrl: string;
  firstNameToken: string;
  brandNameToken: string;
  /** HTML talents déjà formatés (liens + présentation). */
  talentsBlock: string;
  /** Produits / positionnement / stratégie influence. */
  brandContext: string;
  /** promptBlockFr / En + ops (peut être vide). */
  leynaHistoryBlock: string;
  useTutoiement: boolean;
  /**
   * true = au moins un vrai fil / réponse avec LES destinataires CRM du mail.
   * false/undefined = pas de fil perso → branche A ou C, INTERDIT d’inventer « on avait échangé ».
   */
  hasDirectRecipientExchange?: boolean | null;
}): string {
  const brand = String(args.brandName || "").trim() || "Marque";
  const joey = isJoeySender(args.fromEmail);
  // Brouillon = FR uniquement ; EN à l’envoi (ignore args.language).
  void args.language;
  const direct =
    args.hasDirectRecipientExchange === true
      ? "yes"
      : args.hasDirectRecipientExchange === false
        ? "no"
        : "unknown";
  // Tutoiement seulement si échange DIRECT avec ces destinataires.
  const mayTutoye = Boolean(args.useTutoiement) && direct === "yes";
  const hope = mayTutoye
    ? "J'espère que tu vas bien ?"
    : "J'espère que vous allez bien !";
  const hello = mayTutoye
    ? `Hello ${args.firstNameToken},`
    : `Bonjour ${args.firstNameToken},`;

  if (joey) {
    return `Tu écris le mail casting outreach GOLD pour Glow Up via JSON.
Tu es **Joey**, nouvelle business developer (joey@…). Cold A uniquement.
LANGUE: FRANÇAIS uniquement (même si contacts EN — traduction à l’envoi).

${humanToneBlock()}

${subjectRulesBlock(brand)}

## RÈGLES JOEY (NON NÉGOCIABLE)
- Après salut + espoir, intro OBLIGATOIRE :
  « Je suis Joey, je viens de rejoindre le pôle Business Development de Glow Up et je serai ravie d'échanger avec vous autour de vos prochaines campagnes d'influence. »
- Puis angle marque concret (1–2 faits) → puces TOUS les talents → talentbook → pont « Au-delà… » → CTA 15 min ENTIER en gras → « Au plaisir d'échanger avec vous, »
- INTERDIT : « suite à notre/nos échanges », tutoiement inventé, signer Joey, Secret Story / télé-réalité, media kits / moodboard / CTA prochaines campagnes.
- Talentbook HTML : <a href="${args.talentbookUrl}">${args.talentbookUrl}</a>
- CTA exact esprit : <strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong>
- Prénom destinataire : utilise EXACTEMENT ${args.firstNameToken}
- Marque : ${args.brandNameToken}

${goldJoeyMailExampleBlock(brand)}

## CONTEXTE MARQUE
${args.brandContext || "—"}

## TALENTS (tous obligatoires dans le BODY)
${args.talentsBlock}

## HISTORIQUE
Joey cold — ignore tout historique Leyna comme s’il était le tien. Pas d’ancrage « suite à ».

Langue : **français uniquement** (traduction EN à l’envoi).

Réponds UNIQUEMENT en JSON valide :
{
  "subject": "${brand} x Glow Up — <accroche courte>",
  "body": "HTML <p>…</p> complet (structure gold Joey). Salut: ${hello} puis ${hope}"
}`;
  }

  return `Tu écris le mail casting outreach GOLD pour Glow Up via JSON.
Tu es **Leyna** (leyna@…), business developer.

${humanToneBlock()}

${subjectRulesBlock(brand)}

${branchesAbcBlock()}

## RÈGLES LEYNA GOLD (NON NÉGOCIABLE)
- Structure : salut → espoir → ancrage (selon branche A/B/C + historique) → angle marque → TOUS les talents en puces → talentbook → pont « Au-delà… » → CTA 15 min ENTIER en <strong> → clôture Au plaisir…
- Talentbook : <a href="${args.talentbookUrl}">${args.talentbookUrl}</a>
- CTA : <strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong>
- INTERDIT ABSOLU legacy : media kits, moodboard, estimations de performance, « quelles seraient vos prochaines campagnes », « plusieurs créateurs qui peuvent correspondre »
- INTERDIT de nommer un contact (prénom/email) dans le BODY
- Prénom destinataire : ${args.firstNameToken} · Marque : ${args.brandNameToken}

### ANCRAGE — ÉCHANGE DIRECT AVEC CES DESTINATAIRES = **${direct === "yes" ? "OUI" : direct === "no" ? "NON" : "À DÉDUIRE DU DOSSIER"}**
${
  direct === "yes"
    ? `- Branche **B** : tu PEUX ancrer un vrai fil avec IEL (« suite à notre échange », statut, etc.) — faits du dossier seulement.
- ${mayTutoye ? "TUTOIEMENT obligatoire." : "Vouvoiement (sauf si le dossier impose clairement le tu avec CES destinataires)."}`
    : direct === "no"
      ? `- Branche **A ou C** uniquement. L’historique marque/agence (autres contacts) N’EST PAS un fil perso avec le destinataire.
- **INTERDIT ABSOLU** (rejet) :
  « On avait échangé », « On en avait parlé », « suite à notre/nos échanges », « Je reviens vers toi/vous », « comme convenu », « certains profils t'avaient plu », tutoiement.
- Tu peux mentionner avec tact un contexte **marque** (activation, saison) SANS prétendre que VOUS deux avez déjà échangé.
- Vouvoiement obligatoire. Présente-toi proprement si besoin (Leyna / Glow Up), puis angle + talents.`
      : `- Si le dossier dit clairement un fil DIRECT avec ces emails CRM → branche B.
- Sinon (histo marque/agence seulement, autres interlocuteurs, ou doute) → branche C / A : **INTERDIT** « On avait échangé », « suite à nos échanges », « Je reviens vers toi », tutoiement inventé.`
}

${goldMailExampleBlock()}

## HISTORIQUE LEYNA (PRIORITAIRE — chronologie marque + fils)
${args.leynaHistoryBlock || "(aucun historique — branche A cold)"}

## CONTEXTE MARQUE
${args.brandContext || "—"}

## TALENTS (tous obligatoires dans le BODY)
${args.talentsBlock}

Langue : **français uniquement** (traduction EN à l’envoi).

Réponds UNIQUEMENT en JSON valide :
{
  "subject": "${brand} x Glow Up — <accroche courte>",
  "body": "HTML <p>…</p> complet (structure gold Leyna). Salut: ${hello} puis ${hope}"
}`;
}
