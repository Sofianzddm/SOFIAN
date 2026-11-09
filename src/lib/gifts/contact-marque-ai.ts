import { xaiResponse } from "@/lib/xai";
import {
  buildGiftContactDraft,
  giftTypeLabel,
  contrepartieLabels,
  type GiftDraftSource,
} from "@/lib/gifts/contact-marque-draft";
import {
  ensureGiftParagraphs,
  giftBodyLooksComplete,
  scrubCringeCtas,
  scrubFalseFollowUpOpeners,
  scrubHeyOpeners,
  scrubInventedContentPromises,
  scrubMarketingFluff,
  scrubVouvoiementLeaks,
  stripGiftAiSignOff,
} from "@/lib/gifts/contact-marque-ai-scrub";
import { normalizeContactLanguage } from "@/lib/gifts/contact-language";

const BRAND_RESEARCH_TOOLS = [{ type: "web_search" }, { type: "x_search" }] as const;

export type GiftBrandResearch = {
  recentCampaigns: string;
  newProducts: string;
  brandPositioning: string;
  influenceStrategy: string;
  giftFitAngle: string;
  /**
   * Ce que la marque vend vraiment / périmètre catalogue pertinent
   * (ex. "enseigne déco & sapins + accessoires" vs "marque spécialisée sapins naturels").
   */
  catalogScope: string;
  /**
   * Demande gift à formuler pour CETTE marque (adaptée au catalogue),
   * pas le copier-coller du brief talent.
   */
  adaptedAsk: string;
};

export type GiftContactAiMarque = {
  id: string;
  nom: string;
  secteur?: string | null;
  siteWeb?: string | null;
  notes?: string | null;
};

export type GiftTalentContext = {
  prenom?: string | null;
  nom?: string | null;
  bio?: string | null;
  presentation?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  niches?: string[];
  selectedClients?: string[];
  ville?: string | null;
};

export type GiftContactAiInput = {
  gift: GiftDraftSource & {
    justification?: string | null;
    destination?: string | null;
    demandesSpeciales?: string | null;
    typeHebergement?: string | null;
    nombrePersonnes?: number | null;
  };
  marque: GiftContactAiMarque;
  brandResearch: GiftBrandResearch;
  talent: GiftTalentContext;
  contactPrenom?: string | null;
  /** Langue fiche contact (MarqueContact.language). */
  language?: "fr" | "en" | null;
};

function tryParseJsonObject(raw: string): Record<string, unknown> {
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
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* next */
    }
  }
  throw new Error("Réponse IA non parseable");
}

function strField(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return typeof v === "string" ? v.trim() : "";
}

function monthWindow() {
  const now = new Date();
  const current = now.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = prev.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return { current, previous, window: `${previous}–${current}` };
}

/**
 * Recherche web + X orientée gift (comme brand-research casting),
 * ancrée sur le concept de la demande.
 */
export async function researchGiftBrand(opts: {
  marque: GiftContactAiMarque;
  concept: string;
  talentName: string;
  typeGiftLabel: string;
}): Promise<GiftBrandResearch> {
  const { current, previous, window } = monthWindow();
  const crmBits = [
    opts.marque.secteur ? `Secteur CRM: ${opts.marque.secteur}` : null,
    opts.marque.siteWeb ? `Site: ${opts.marque.siteWeb}` : null,
    opts.marque.notes ? `Notes: ${opts.marque.notes.slice(0, 300)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Tu es expert marketing d'influence (marché France / Europe). Tu analyses la marque "${opts.marque.nom}" pour un mail de PROPOSITION DE GIFT.

Identité marque (CRM) :
${crmBits || "(peu d'infos CRM — vérifie bien l'entité via le web)"}

═══ CONCEPT GIFT À SERVIR (ESSENTIEL) ═══
Talent: ${opts.talentName}
Type: ${opts.typeGiftLabel}
Besoin / concept:
${opts.concept || "(non précisé)"}

Utilise les outils web + X. Fenêtre d'actus : ${window} (rien avant ${previous}). Contexte actuel : ${current}.

Objectif : trouver des accroches CONCRÈTES et surtout ADAPTER LA DEMANDE au catalogue réel de la marque.

CRITIQUE — ADAPTATION DU ASK (ne pas coller le brief tel quel) :
Le talent exprime un besoin (ex. « sapin de Noël pour une boutique »). Toi tu dois regarder CE QUE LA MARQUE VEND :
- Enseigne déco large (ex. Maison du Monde) → pitch un UNIVERS (sapin statement + déco / collections thématiques), pas « juste un sapin ».
- Marque spécialisée sapins → pitch le sapin (qualité, format, livraison), pas toute une déco qu'elle ne vend pas.
- Beauté / mode / food / hôtel → reformule le gift dans LEUR offre (jamais forcer un sapin à une marque beauté).
Le champ adaptedAsk doit être la demande concrète à formuler DANS le mail pour CETTE marque.

Réponds UNIQUEMENT en JSON :
{
  "recentCampaigns": "2-4 phrases — activations / collabs créateurs récentes utiles pour le pitch",
  "newProducts": "2-4 phrases — nouveauté / collection / offre pertinente pour CE concept (sinon dis-le)",
  "brandPositioning": "2-4 phrases — positionnement actuel et ce qui les distingue",
  "influenceStrategy": "2-4 phrases — comment ils travaillent avec les créateurs",
  "catalogScope": "1-3 phrases — périmètre catalogue réel (ce qu'ils vendent / ne vendent pas) lié au concept",
  "giftFitAngle": "2-4 phrases — pourquoi CE concept × CETTE marque a du sens",
  "adaptedAsk": "1-3 phrases — LA demande gift à formuler pour cette marque (produits / univers précis, adaptés au catalogue)"
}

Règles :
- Identité d'abord : ignore les homonymes / mauvais secteurs.
- N'invente pas de KPI, hashtags ou deals. Si manquant → « non confirmé ».
- Oriente TOUT vers le fit gift × marque (giftFitAngle + adaptedAsk + catalogScope sont critiques).`;

  const MAX_ATTEMPTS = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await xaiResponse(prompt, {
        tools: [...BRAND_RESEARCH_TOOLS],
        timeoutMs: 110_000,
      });
      const o = tryParseJsonObject(text);
      return {
        recentCampaigns: strField(o, "recentCampaigns") || "non confirmé",
        newProducts: strField(o, "newProducts") || "non confirmé",
        brandPositioning: strField(o, "brandPositioning") || "non confirmé",
        influenceStrategy: strField(o, "influenceStrategy") || "non confirmé",
        giftFitAngle: strField(o, "giftFitAngle") || "non confirmé",
        catalogScope: strField(o, "catalogScope") || "non confirmé",
        adaptedAsk: strField(o, "adaptedAsk") || "non confirmé",
      };
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[gift-brand-research] ${opts.marque.nom} tentative ${attempt} échouée:`,
          e instanceof Error ? e.message : e
        );
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Recherche marque gift échouée");
}

/**
 * Rédige UN mail personnalisé pour UNE marque (après research),
 * tutoiement, sans Leyna.
 */
export async function generateGiftContactEmailForMarque(
  input: GiftContactAiInput
): Promise<{ subject: string; bodyText: string }> {
  if (!process.env.XAI_API_KEY?.trim()) {
    throw new Error("Clé XAI_API_KEY non configurée");
  }

  const fallback = buildGiftContactDraft(input.gift);
  const typeLabel = giftTypeLabel(input.gift.typeGift);
  const contrepartie = contrepartieLabels(input.gift.contreparties);
  const prenom = (input.contactPrenom || "").trim() || null;
  const language = normalizeContactLanguage(input.language);
  const isEn = language === "en";
  const isHotel = input.gift.typeGift === "HOTEL";

  const conceptParts = [
    input.gift.description?.trim(),
    input.gift.justification?.trim()
      ? `Justification TM: ${input.gift.justification.trim()}`
      : null,
    isHotel && input.gift.destination
      ? `Destination: ${input.gift.destination}`
      : null,
    isHotel && input.gift.demandesSpeciales
      ? `Demandes spéciales: ${input.gift.demandesSpeciales}`
      : null,
    isHotel && input.gift.typeHebergement
      ? `Type hébergement: ${input.gift.typeHebergement}`
      : null,
    isHotel && input.gift.nombrePersonnes
      ? `Nb personnes: ${input.gift.nombrePersonnes}`
      : null,
  ].filter(Boolean);

  const talentBits = [
    `Nom: ${fallback.talentName}`,
    input.talent.instagram ? `IG: @${input.talent.instagram.replace(/^@/, "")}` : null,
    input.talent.tiktok ? `TikTok: @${input.talent.tiktok.replace(/^@/, "")}` : null,
    input.talent.ville ? `Ville: ${input.talent.ville}` : null,
    input.talent.niches?.length
      ? `Niches: ${input.talent.niches.slice(0, 8).join(", ")}`
      : null,
    input.talent.selectedClients?.length
      ? `Clients passés (sélection): ${input.talent.selectedClients.slice(0, 8).join(", ")}`
      : null,
    input.talent.presentation?.trim()
      ? `Présentation: ${input.talent.presentation.trim().slice(0, 500)}`
      : input.talent.bio?.trim()
        ? `Bio: ${input.talent.bio.trim().slice(0, 500)}`
        : null,
  ]
    .filter(Boolean)
    .join("\n");

  const br = input.brandResearch;

  const langRules = isEn
    ? `- ENGLISH ONLY — every sentence in English. NEVER French (no Bonjour, no « je te », no « Est-ce que »).
- Warm, natural, human tone — not stiff corporate, no emoji spam.
- Use natural "you / your" (friendly BD). Never mix French.
- Opening: Hello ${prenom || "…"}, ONLY — NEVER "Hey". Talent is the SUBJECT, never the sender.
- FORBIDDEN CTAs: "does this ring a bell?", "thoughts?", "let me know if you're down". Prefer a clean pro ask (e.g. "Would you be open to discussing this?" / "Happy to send more details if useful.").
- Closing: NO sign-off name, NO "Best regards,", NO talent name (${fallback.talentName}), NO "Glow Up" / "Account Manager" in the body — Gmail signature + template handle that.
- COLD FIRST CONTACT: never invent a prior thread. FORBIDDEN: "following up", "as discussed", "per our last email", "circling back".`
    : `- Français, TUTOIEMENT STRICT partout (tu / te / ton / ta / tes / toi). JAMAIS « vous », « votre », « vos », « voudriez », « seriez », « incarnez », etc. Si tu parles à la marque : « ton expertise », « tu incarnes », « ta collection » — PAS un mélange tu/vous dans la même phrase.
- Ton pro, naturel, humain — pas corporate, pas commercial agressif, pas emoji.
- CTA INTERDITS (trop vs / ado) : « ça te parle », « dis-moi si ça te parle », « tu kiffes », « hésite pas », « on en parle quand tu veux ». Termine proprement : une question pro simple (ex. « Est-ce que tu serais dispo pour en discuter ? » / « Je peux t'envoyer plus de détails si tu veux. ») — sans formule de signature après.
- SIGNATURE INTERDITE dans le body : pas de « Bien à toi », pas de prénom, PAS le nom du talent (${fallback.talentName}), pas « Glow Up », pas « Account Manager ». Le mail part de ${fallback.amName} (AM) — la signature Gmail + template s'ajoutent à l'envoi.
- PREMIER CONTACT À FROID : n'invente AUCUN échange passé. INTERDIT : « je reviens vers toi », « suite à notre échange », « comme convenu », « suite à mon précédent mail », « on s'était dit », ou toute formulation de relance / fil existant.
- Accroche : Bonjour ${prenom || "…"}, UNIQUEMENT — JAMAIS « Hey », JAMAIS « Salut », JAMAIS « Coucou ». Puis pitch direct. Le talent est le SUJET du mail, jamais l'expéditeur.`;

  const prompt = `Tu es Account Manager chez Glow Up Agence. Tu rédiges UN mail de proposition de gift à la marque "${input.marque.nom}".

LANGUE OBLIGATOIRE : ${isEn ? "ENGLISH ONLY" : "FRANÇAIS (tutoiement)"}.

RÈGLES DURES (comme le pipeline casting, mais SANS historique Leyna) :
${langRules}
- PERSONNALISATION FORTE : parle clairement de "${input.marque.nom}" et croise CONCEPT × recherche.
- ADAPTER LA DEMANDE AU CATALOGUE (critique) :
  • Le brief talent est l'INTENTION (ex. ambiance Noël boutique), PAS le wording exact à coller partout.
  • Suis en priorité "adaptedAsk" + "catalogScope" : demande ce que LA marque peut réellement offrir.
  • Ex. Maison du Monde / enseigne déco → univers déco Noël (collections, sapin + déco, ambiances), pas un pitch "sapin only".
  • Ex. marque spécialisée sapins → focus sapin (qualité / format), sans inventer une gamme déco qu'elle n'a pas.
  • Ne demande JAMAIS un produit hors catalogue de la marque.
- Cite 1 élément concret de la recherche (collection / produit) SANS inventer de KPI / deal passé.
- MISE EN PAGE OBLIGATOIRE : corps texte brut avec paragraphes séparés par UNE LIGNE VIDE (\\n\\n dans le JSON). INTERDIT un seul pavé collé. Pas de HTML.
- TON : humain, simple, conversationnel. INTERDIT jargon marketing / anglicismes :
  « scénographie », « showcase », « statement », « immersif », « univers fort », « refuge joyeux », « duo ultra attachant », « parentalité moderne et inspirante », « véritable showcase de ta collection », « scénographie totale ».
  Dis plutôt : on aimerait décorer / habiller la boutique avec ta collection, un sapin + déco, etc.
- CONTENU / CONTREPARTIE — NE PAS PROMETTRE :
  • N'invente JAMAIS de formats (stories, reels, TikTok long, post feed, unboxing, haul, etc.) si ce n'est pas explicitement dans « Contrepartie proposée ».
  • Si une contrepartie est listée, reste vague et prudent — ne détaille pas un plan éditorial.
  • Si contrepartie = « à discuter » / vide : dis juste qu'on est ouverts sur la contrepartie, SANS lister de formats.
- LONGUEUR / STRUCTURE OBLIGATOIRES (chaque point = son propre paragraphe, séparés par \\n\\n) :
  1) Accroche seule (${isEn ? "Hello" : "Bonjour"} ${prenom || "…"},) — JAMAIS Hey
  2) Qui / contexte talent + intention boutique — 2-4 phrases max, naturel
  3) Pourquoi "${input.marque.nom}" (1 accroche collection concrète)
  4) Demande concrète = adaptedAsk (sapin + déco / produits catalogue) — SANS « scénographie / showcase »
  5) Valeur simple pour la marque (ex. déco réelle en boutique) — une phrase claire, pas marketing
  6) Ouverture pro (disponibilité / détails)
  Minimum ~450 caractères hors salut. PAS un mail de 2 lignes. PAS un mur de texte.
- Le template ajoutera un bloc détails technique : concentre-toi sur le pitch.

═══ TALENT ═══
${talentBits}

═══ CONCEPT GIFT (intention talent — à reformuler selon la marque) ═══
Réf: ${input.gift.reference}
Type: ${typeLabel}
Contrepartie proposée: ${contrepartie || "à discuter"}
${fallback.isHotel && fallback.hotelDates ? `Dates: ${fallback.hotelDates}` : ""}
${fallback.isHotel && fallback.hotelVille ? `Lieu: ${fallback.hotelVille}` : ""}
Besoin brut :
${conceptParts.map((p) => `- ${p}`).join("\n") || "- (non précisé)"}

═══ RECHERCHE MARQUE (${input.marque.nom}) ═══
Catalogue / périmètre: ${br.catalogScope}
DEMANDE ADAPTÉE (à formuler dans le mail): ${br.adaptedAsk}
Positionnement: ${br.brandPositioning}
Nouveautés / offre: ${br.newProducts}
Campagnes récentes: ${br.recentCampaigns}
Influence: ${br.influenceStrategy}
ANGLE GIFT FIT: ${br.giftFitAngle}

Destinataire prénom: ${prenom || "(inconnu — pas de prénom forcé)"}
AM: ${fallback.amName}

Réponds UNIQUEMENT en JSON (dans "body", utilise \\n\\n entre chaque paragraphe) :
{"subject":"...","body":"${isEn ? "Hello" : "Bonjour"} …,\\n\\nParagraphe 2…\\n\\nParagraphe 3…"}`;

  let subject = "";
  let body = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryHint = isEn
      ? `\n\n⚠ PREVIOUS DRAFT INVALID (too short, glued into one block, and/or mixed French / marketing fluff). Rewrite COMPLETE email with blank lines (\\n\\n) between paragraphs 1→6, ENGLISH ONLY, no "showcase/scenography" jargon.`
      : `\n\n⚠ TENTATIVE PRÉCÉDENTE INVALIDE (trop courte, TOUT COLLÉ en un pavé, et/ou vous/tu, et/ou jargon « scénographie/showcase »). Réécris un mail COMPLET avec lignes vides (\\n\\n) entre les paragraphes 1→6, TUTOIEMENT STRICT, ton simple humain.`;
    const raw = await xaiResponse(attempt === 1 ? prompt : `${prompt}${retryHint}`, {
      model: "grok-4.20-0309-non-reasoning",
      timeoutMs: 90_000,
    });
    const o = tryParseJsonObject(raw);
    subject = strField(o, "subject");
    body = strField(o, "body");
    if (!subject || !body) continue;

    body = stripGiftAiSignOff(body, {
      talentName: fallback.talentName,
      amName: fallback.amName,
    });
    body = scrubFalseFollowUpOpeners(body);
    body = scrubHeyOpeners(body, language);
    body = scrubCringeCtas(body);
    body = scrubMarketingFluff(body);
    if (!isEn) body = scrubVouvoiementLeaks(body);
    body = scrubInventedContentPromises(body, contrepartie);
    body = ensureGiftParagraphs(body);

    const hasVous = !isEn && /\b(vous|votre|vos|vôtre)\b/i.test(body);
    const hasFrLeak =
      isEn &&
      /\b(bonjour|salut|je\s+te|est-ce\s+que|j'esp[eè]re|disponible)\b/i.test(body);
    const hasFluff =
      /\b(showcase|sc[ée]nographie|statement\b|immersi)/i.test(body);
    if (giftBodyLooksComplete(body) && !hasVous && !hasFrLeak && !hasFluff) {
      break;
    }
    if (attempt === 2) {
      console.warn("[gift-contact-ai] body court / langue / fluff après retry", {
        marque: input.marque.nom,
        lang: language,
        len: body.length,
        hasVous,
        hasFrLeak,
        hasFluff,
      });
    }
  }

  if (!subject || !body) throw new Error("Sujet ou corps vide");
  if (!isEn) body = scrubVouvoiementLeaks(body);
  body = scrubHeyOpeners(body, language);
  body = scrubMarketingFluff(body);
  body = ensureGiftParagraphs(body);

  return { subject, bodyText: body };
}

/** Orchestration : research + draft pour une marque. */
export async function researchAndDraftGiftMarque(opts: {
  gift: GiftContactAiInput["gift"];
  marque: GiftContactAiMarque;
  talent: GiftTalentContext;
  contactPrenom?: string | null;
  language?: "fr" | "en" | null;
}): Promise<{
  marqueId: string;
  marqueNom: string;
  subject: string;
  bodyText: string;
  language: "fr" | "en";
  brandResearch: GiftBrandResearch;
}> {
  const fallback = buildGiftContactDraft(opts.gift);
  const typeLabel = giftTypeLabel(opts.gift.typeGift);
  const concept = [
    opts.gift.description?.trim(),
    opts.gift.justification?.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  let brandResearch: GiftBrandResearch;
  try {
    brandResearch = await researchGiftBrand({
      marque: opts.marque,
      concept,
      talentName: fallback.talentName,
      typeGiftLabel: typeLabel,
    });
  } catch (e) {
    console.warn(
      "[gift-contact-ai] research fallback vide:",
      e instanceof Error ? e.message : e
    );
    brandResearch = {
      recentCampaigns: "Recherche indisponible",
      newProducts: "Recherche indisponible",
      brandPositioning: opts.marque.secteur
        ? `Secteur CRM: ${opts.marque.secteur}`
        : "non confirmé",
      influenceStrategy: "non confirmé",
      giftFitAngle: concept
        ? `Ancrer le pitch sur: ${concept.slice(0, 280)}`
        : "Ancrer sur le besoin talent sans overclaim",
      catalogScope: opts.marque.secteur
        ? `Secteur CRM: ${opts.marque.secteur} — vérifier le catalogue avant de formuler la demande`
        : "Catalogue non confirmé — reformuler prudemment selon l'offre réelle",
      adaptedAsk: concept
        ? `Reformuler selon le catalogue de ${opts.marque.nom}, intention: ${concept.slice(0, 220)}`
        : `Proposer un gift pertinent pour ${opts.marque.nom} sans overclaim`,
    };
  }

  const language = normalizeContactLanguage(opts.language);
  const draft = await generateGiftContactEmailForMarque({
    gift: opts.gift,
    marque: opts.marque,
    brandResearch,
    talent: opts.talent,
    contactPrenom: opts.contactPrenom,
    language,
  });

  return {
    marqueId: opts.marque.id,
    marqueNom: opts.marque.nom,
    subject: draft.subject,
    bodyText: draft.bodyText,
    language,
    brandResearch,
  };
}
