import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";
import { getInstagramProfileUrl } from "@/lib/social-links";
import { upgradeTalentLinksInHtml } from "@/lib/talent-email-links";
import { plainTextToEmailHtml } from "@/lib/email-body-html";
import { ensureBrandInSubject } from "@/lib/email-subject";

export const maxDuration = 120;

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export interface TalentPayload {
  name: string;
  niche: string;
  followers: number;
  igFollowers?: number;
  ttFollowers?: number;
  engagementRate?: number;
  instagram: string | null;
}

export interface GenerateEmailBody {
  language?: "fr" | "en";
  /**
   * Marché ciblé. Sur "BENELUX", l'IA doit préciser que Glow Up Agence est une
   * agence française qui développe le Benelux avec des créateurs benelux.
   */
  market?: "FR" | "BENELUX";
  brandName: string;
  brandResearch: {
    recentCampaigns: string;
    newProducts: string;
    brandPositioning: string;
    influenceStrategy: string;
  };
  talents: TalentPayload[];
  /**
   * Quand fourni, l'IA utilise directement ces valeurs à la place des jetons
   * HubSpot {{ contact.firstname }} / {{ contact.company }}. Utile pour les
   * envois Gmail directs (inbound, demandes-entrantes) où les jetons HubSpot
   * ne sont pas remplacés.
   */
  recipient?: {
    firstName?: string;
    brandName?: string;
  };
  /**
   * Brief projet outreach (parcours /projets-outreach). Absent sur Outreach Clients
   * → le prompt casting générique reste inchangé.
   */
  projectBrief?: {
    projectTitle?: string | null;
    projectDescription?: string | null;
    creatorName?: string | null;
    targetBrand?: string | null;
    strategyReason?: string | null;
    recommendedAngle?: string | null;
    objective?: string | null;
    deliverables?: string | null;
    angles?: string | null;
    timeline?: string | null;
    budgetRange?: string | null;
    dos?: string | null;
    donts?: string | null;
  } | null;
}

function normalizeForIncludes(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tryParseEmailJson(raw: string): { subject: string; body: string } {
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
      if (
        parsed &&
        typeof parsed === "object" &&
        "subject" in parsed &&
        "body" in parsed
      ) {
        const o = parsed as Record<string, unknown>;
        return {
          subject: String(o.subject ?? ""),
          body: String(o.body ?? ""),
        };
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("parse");
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    if (!process.env.XAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Clé XAI_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Partial<GenerateEmailBody>
      | null;
    if (!body?.brandName?.trim() || !body.brandResearch || !Array.isArray(body.talents)) {
      return NextResponse.json(
        { error: "Requête invalide : brandName, brandResearch et talents requis." },
        { status: 400 }
      );
    }

    const brandName = body.brandName.trim();
    const language: "fr" | "en" = body.language === "en" ? "en" : "fr";
    const isBenelux = body.market === "BENELUX";
    const { newProducts, brandPositioning, influenceStrategy } = body.brandResearch;

    const rawProject = body.projectBrief;
    const hasProjectBrief = Boolean(
      rawProject &&
        (String(rawProject.strategyReason || "").trim() ||
          String(rawProject.objective || "").trim() ||
          String(rawProject.projectTitle || "").trim() ||
          String(rawProject.deliverables || "").trim())
    );
    const projectBrief = hasProjectBrief && rawProject ? rawProject : null;

    function briefLine(label: string, value: unknown): string {
      const v = String(value || "").trim();
      return v ? `- ${label} : ${v}` : "";
    }
    const projectBriefBlockFr = projectBrief
      ? `
BRIEF PROJET (OBLIGATOIRE — priorité absolue sur le pitch générique casting) :
Ce mail n'est PAS un outreach casting générique multi-talents. Tu pitches UN projet précis autour du/des talent(s) fourni(s).
${[
  briefLine("Titre du projet", projectBrief.projectTitle),
  briefLine("Description", projectBrief.projectDescription),
  briefLine("Talent", projectBrief.creatorName),
  briefLine("Marque ciblée", projectBrief.targetBrand),
  briefLine("Raison strategy", projectBrief.strategyReason),
  briefLine("Angle recommandé", projectBrief.recommendedAngle),
  briefLine("Objectif", projectBrief.objective),
  briefLine("Livrables", projectBrief.deliverables),
  briefLine("Angles", projectBrief.angles),
  briefLine("Timeline", projectBrief.timeline),
  briefLine("Budget", projectBrief.budgetRange),
  briefLine("Do's", projectBrief.dos),
  briefLine("Don'ts", projectBrief.donts),
]
  .filter(Boolean)
  .join("\n")}

Règles projet :
- Le mail doit vendre CE projet (opportunité / placement / collab) à la marque, pas un roster générique.
- Appuie-toi sur la raison strategy, l'objectif, les livrables et l'angle pour construire le pitch.
- Respecte strictement les Don'ts ; mets en avant les Do's si utiles.
- Les talents listés dans "Talents disponibles" sont le cœur du projet : présente-les dans ce cadre.
- Tu peux citer 1 élément concret issu de la recherche marque si ça renforce le fit avec le projet.
- Ne dilue pas le message avec une proposition de roster complet hors projet : le talentbook peut être mentionné en bonus, mais le cœur du mail = le projet.

INTERDITS PROJET (absolus) :
- Ne JAMAIS écrire « Dans notre agence nous avons plusieurs créateurs qui peuvent correspondre » ni aucune variante du type « plusieurs créateurs / plusieurs talents à vous proposer / une sélection de profils ».
- Si un seul talent est fourni, parle au SINGULIER de cette créatrice et de SON projet (pas d'une liste casting).
- Si le brief mentionne des créatrices qui l'accompagnent (ex. Pauline, Lorine, Karla), présente-les comme ACCOMPAGNATRICES du projet, pas comme un casting alternatif.
- Pour chaque accompagnatrice : prénom + lien Instagram CLIQUABLE propre au format <a href="https://www.instagram.com/HANDLE">@HANDLE</a> (ou le handle fourni dans le brief).
- INTERDIT de coller une URL Instagram longue avec tokens (?sttn=, ?stkn=, igsh, etc.) : nettoie toujours vers https://www.instagram.com/handle/
- Formule naturelle du type : « Elle sera accompagnée de Pauline (@…), Lorine (@…) et Karla (@…). »
- N'invente pas de handles Instagram : utilise uniquement ceux présents dans le brief / objectif.
`
      : "";
    const projectBriefBlockEn = projectBrief
      ? `
PROJECT BRIEF (MANDATORY — overrides the generic casting pitch) :
This email is NOT a generic multi-talent casting outreach. You are pitching ONE specific project around the provided talent(s).
${[
  briefLine("Project title", projectBrief.projectTitle),
  briefLine("Description", projectBrief.projectDescription),
  briefLine("Talent", projectBrief.creatorName),
  briefLine("Target brand", projectBrief.targetBrand),
  briefLine("Strategy reason", projectBrief.strategyReason),
  briefLine("Recommended angle", projectBrief.recommendedAngle),
  briefLine("Objective", projectBrief.objective),
  briefLine("Deliverables", projectBrief.deliverables),
  briefLine("Angles", projectBrief.angles),
  briefLine("Timeline", projectBrief.timeline),
  briefLine("Budget", projectBrief.budgetRange),
  briefLine("Do's", projectBrief.dos),
  briefLine("Don'ts", projectBrief.donts),
]
  .filter(Boolean)
  .join("\n")}

Project rules:
- Sell THIS project (opportunity / placement / collab) to the brand, not a generic roster.
- Build the pitch from the strategy reason, objective, deliverables and angle.
- Strictly respect Don'ts; use Do's when helpful.
- Talents in "Available talents" are the core of the project — present them in that frame.
- You may cite 1 concrete brand-research detail if it strengthens the project fit.
- Don't dilute with an off-project roster pitch: talentbook can be a bonus, but the core is the project.

PROJECT PROHIBITIONS (absolute):
- NEVER write "Looking at the market… we have several creators who could be a fit" nor any "several creators / a selection of profiles" casting transition.
- If only one talent is provided, write in the SINGULAR about that creator and HER project.
- If the brief mentions accompanying creators (e.g. Pauline, Lorine, Karla), present them as PROJECT COMPANIONS, not as an alternate casting list.
- For each companion: first name + clean clickable Instagram link as <a href="https://www.instagram.com/HANDLE">@HANDLE</a>.
- FORBIDDEN to paste long Instagram URLs with tokens (?sttn=, ?stkn=, igsh, etc.): always clean to https://www.instagram.com/handle/
- Natural phrasing e.g. "She will be accompanied by Pauline (@…), Lorine (@…) and Karla (@…)."
- Do not invent Instagram handles: only use those present in the brief / objective.
`
      : "";

    // Quand plusieurs marques filles sont fournies (ex. « Dove, Axe, Rexona »),
    // on précise à l'IA qu'il s'agit de plusieurs marques d'un même groupe gérées
    // par le contact, pour que le mail parle de ces marques (pas de la maison mère).
    const brandCount = brandName
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length;
    const firstBrand = brandName.split(",")[0]?.trim() || "";

    const recipientFirstName =
      typeof body.recipient?.firstName === "string"
        ? body.recipient.firstName.trim()
        : "";
    const recipientBrandName =
      typeof body.recipient?.brandName === "string"
        ? body.recipient.brandName.trim()
        : "";
    const useDirectRecipient = Boolean(recipientFirstName || recipientBrandName);
    const firstNameToken = recipientFirstName || "{{ contact.firstname }}";
    const brandNameToken = recipientBrandName || "{{ contact.company }}";

    // Quand plusieurs marques filles sont fournies (ex. « Dove, Axe, Rexona »),
    // on précise à l'IA qu'il s'agit de plusieurs marques d'un même groupe gérées
    // par le contact, pour équilibrer les mentions (pas une seule marque partout).
    const multiBrandNoteFr =
      brandCount > 1
        ? `\nIMPORTANT — PLUSIEURS MARQUES : « ${brandName} » sont PLUSIEURS marques (marques filles d'un même groupe) gérées par ce contact.
- NE MARTÈLE PAS une seule marque (ne répète pas ${firstBrand || "la première"} partout). C'est l'erreur à éviter absolument.
- Reconnais d'entrée que la personne gère un portefeuille de marques (tu peux les nommer brièvement, ex. « ${brandName} »).
- Cite AU MAXIMUM 2 nouveautés concrètes, issues de 2 marques DIFFÉRENTES (pas deux nouveautés de la même marque).
- Le reste du mail parle du portefeuille en général et des créateurs, sans re-citer une marque en boucle.
- N'utilise ${brandNameToken} (la maison mère) que si c'est naturel ; sinon parle des marques filles.`
        : "";
    const multiBrandNoteEn =
      brandCount > 1
        ? `\nIMPORTANT — MULTIPLE BRANDS: "${brandName}" are SEVERAL brands (sister brands of the same group) managed by this contact.
- DO NOT hammer a single brand (do not repeat ${firstBrand || "the first one"} everywhere). This is the key mistake to avoid.
- Acknowledge upfront that this person manages a portfolio of brands (you may briefly name them, e.g. "${brandName}").
- Mention AT MOST 2 concrete launches, from 2 DIFFERENT brands (not two launches from the same brand).
- The rest of the email talks about the portfolio in general and the creators, without repeating one brand over and over.
- Only use ${brandNameToken} (the parent company) if natural; otherwise talk about the sister brands.`
        : "";

    function formatFollowersCompact(n: number): string {
      if (!Number.isFinite(n) || n <= 0) return "0";
      if (n >= 1_000_000) {
        const v = (n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
        return `${v}M`;
      }
      if (n >= 100_000) {
        return `${Math.round(n / 1_000)}k`;
      }
      if (n >= 1_000) {
        const v = (n / 1_000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
        return `${v}k`;
      }
      return String(Math.round(n));
    }

    const talentsString = body.talents
      .map((t) => {
        const instagramUrl = getInstagramProfileUrl(t.instagram);
        const ig = typeof t.igFollowers === "number" ? t.igFollowers : 0;
        const tt = typeof t.ttFollowers === "number" ? t.ttFollowers : 0;
        const statsParts: string[] = [];
        if (tt > 0) statsParts.push(`${formatFollowersCompact(tt)} TikTok`);
        if (ig > 0) statsParts.push(`${formatFollowersCompact(ig)} Insta`);
        if (statsParts.length === 0 && typeof t.followers === "number" && t.followers > 0) {
          statsParts.push(`${t.followers.toLocaleString("fr-FR")} abonnés`);
        }
        const stats = statsParts.join(", ");
        const eng =
          typeof t.engagementRate === "number" && !Number.isNaN(t.engagementRate)
            ? `, ${t.engagementRate}% engagement`
            : "";
        if (instagramUrl) {
          return `- <a href='${instagramUrl}'><strong>${t.name}</strong></a> (${stats} – ${t.niche}${eng})`;
        }
        return `- <strong>${t.name}</strong> (${stats} – ${t.niche}${eng})`;
      })
      .join("\n\n");

    const beneluxContextEn = isBenelux
      ? `\nBENELUX MARKET CONTEXT (MANDATORY): You are writing to a brand based in the Benelux. You MUST state naturally, early in the email (right after the opening hook), that Glow Up Agence is a French agency now expanding into the Benelux, working with Benelux creators. Phrase it simply and vary it every time (e.g. "We are a French agency expanding across the Benelux, with Benelux creators."). Keep it to one sentence, do not turn it into a heavy sales argument.\n`
      : "";
    const beneluxContextFr = isBenelux
      ? `\nCONTEXTE MARCHÉ BENELUX (OBLIGATOIRE) : Tu écris à une marque basée au Benelux. Tu DOIS indiquer naturellement, tôt dans le mail (juste après l'accroche), que Glow Up Agence est une agence française qui se développe sur le Benelux, avec des créateurs benelux. Formule-le simplement et varie à chaque mail (ex. « Nous sommes une agence française qui développe le marché Benelux, avec des créateurs benelux. »). Une seule phrase, sans en faire un argument commercial lourd.\n`
      : "";

    const GROK_SYSTEM_PROMPT =
      language === "en"
        ? `You write like a human who works in influencer marketing and knows the field well, not like an AI. You're part of the Glow Up Agence team and you're writing to a professional (a brand, a marketing/influence team) you respect.
Expected tone: professional, composed and polished, yet natural and genuine — never corporate, never casual. The goal is that the recipient does not guess this was generated: it should read like a real, well-written email from a human, not like a calibrated sales pitch nor a chatty message between friends.
Avoid stacking superlatives: maximum 1-2 compliments in the whole email, and only if deserved. Always prefer a concrete, verifiable observation (a specific product, a launch, a type of collaboration they run) over generic flattery. No slang or loose casual phrasing.

CURRENT CONTEXT: April 2026
Brand: ${brandName}${multiBrandNoteEn}
New products / collections to prioritize: ${newProducts}
Positioning: ${brandPositioning}
Current influence strategy of the brand (profile types, formats, tone of their collaborations): ${influenceStrategy || "—"}
Available talents: ${talentsString} (the variable already contains complete HTML links in the form <a><strong>Firstname Lastname</strong></a>; keep them as-is, do NOT remove the bold or the link)
${beneluxContextEn}
${projectBriefBlockEn}
${
          useDirectRecipient
            ? `RECIPIENT (use these EXACT values, do NOT use any HubSpot tokens like {{ contact.firstname }} or {{ contact.company }}):
- First name: ${firstNameToken}
- Brand: ${brandNameToken} (only bold it when you use it)`
            : `MANDATORY HUBSPOT VARIABLES:
{{ contact.firstname }}
{{ contact.company }} (only bold it when you use it)`
        }

STRUCTURE (a logical flow, not a rigid template — vary the wording on every email):
- MUST start with: "Hi ${firstNameToken},"
- MUST add right after, on a new line, this EXACT sentence without modifying it: "I hope you are doing well?"
- Open with a concrete, professional hook, not flattery: start from something specific and verifiable (a launch, a product, a recent direction ${brandNameToken} is taking). E.g. "I noticed you recently launched [product] / that you've been expanding your collaborations around [profile types]." A composed observation, not a casual remark.
- Mention the strongest new launch ONCE ONLY, in a SHORT, spoken form, never the full commercial name. A human writing fast says "your Baby Rose lip serum" or "the SPF plumper", not "Plumping Lip Serum SPF30 + Peptides tinted 'Baby Rose'". Keep just enough to identify it (1 to 3 words, the line/shade name).
  FORBIDDEN: re-describing features already contained in the product's name ("X with its peptides and sun protection" when "Peptides" and "SPF" are already in X). If an info is in the name, do not repeat it.
  Cite the product to SAY something useful (it's performing well, it fits the kind of content our creators make…), not to prove you know the product. Avoid hollow observations like "is still well promoted" (promoted where? by whom?). A single sentence that flows into what comes next.
- Explain why you're thinking of them, simply and concretely (1-2 sentences). No jargon, no "synergy" or "brand DNA".
- Transition BEFORE the talent list — MANDATORY: always include an observation showing you analyzed the market and their current collaborations, based on the "Current influence strategy of the brand". Something like: "Looking at the market, I noticed you currently work mostly with [profile types from the analysis, e.g. mom / lifestyle / beauty] creators" then continue with "at our agency we have several creators who could be a fit:". Use the REAL profile types inferred from the provided strategy (do not invent them). If the strategy is "—" or empty, use instead: "Looking at the market and your positioning, at our agency we have several creators who could be a fit:". Keep it measured and natural, 1-2 sentences max.
- List the talents in a clear, airy bullet format:
  Firstname Lastname (TikTok followers count - Instagram followers count - Category) -> short reason (10-15 words max), concrete and relevant, not a marketing line
  You MUST include the creator's TikTok followers count as provided in "Available talents" (never omit it when provided), in addition to the Instagram followers count.
- A short sentence after the list that simply states what these profiles can bring — without stacking qualities. Keep it factual and vary the wording every time (avoid a canned "awareness + credibility + lived-in content" line).
- Propose the collaboration in a professional, composed way (e.g. "We would be glad to explore a collaboration with you." or "If this is of interest, we would be happy to discuss it.").
- MUST add one sentence that includes a CLICKABLE link to our full roster, in this exact HTML format: <a href="https://app.glowupagence.fr/talentbook">https://app.glowupagence.fr/talentbook</a>
- The email MUST end, right before the closing, with two sentences that convey these two ideas (rephrase them naturally, vary the wording every time, do NOT copy them verbatim):
  1) an offer to quickly send their complete media kits, a moodboard and tailored performance estimates;
  2) a proposal for a short 10-15 minute call next week to introduce our agency and our creators.
For reference (do NOT reuse as-is): "I would be delighted to quickly send you their complete media kits, a moodboard, and tailored performance estimates. Would you be available for a 10-15 minute call next week to introduce our agency and our creators?"

${
  projectBrief
    ? `PROJECT STRUCTURE OVERRIDE (takes priority over the STRUCTURE section above):
- FORBIDDEN to use the "several creators who could be a fit" transition (or variants).
- Present the main talent in the singular + the project.
- The main talent's full name MUST always appear as a clickable Instagram HTML link: <a href="https://www.instagram.com/HANDLE"><strong>Firstname Lastname</strong></a> (keep bold + link, never plain text).
- If the brief cites companions, one sentence "She will be accompanied by…" with clean Instagram links (<a href="https://www.instagram.com/handle">@handle</a>), never tokenized Instagram URLs.
- No multi-profile casting list outside the project.`
    : ""
}

Exact closing: "Best regards,"

FORMATTING:
- Use bold only for the brand name and hero products (sparingly).
- Keep talent bullets well-spaced and easy to scan.
- The email body must contain \\n for line breaks.

TONE: PROFESSIONAL YET HUMAN (essential balance):
- The email must stay professional, polished and credible: it's a business email sent to a brand, not a casual message.
- Natural does NOT mean casual. Avoid slang and loose phrasing ("hang out", "no fluff", "let's build something", "up for it", "take a peek", "honestly", etc.).
- Still vary the rhythm (sentences shouldn't all be the same length), but without breaking the professional register.
- Maximum 1-2 compliments in the WHOLE email. No stacked adjectives or superlatives ("extremely", "incredible", "perfectly", "passionate"…).
- No corporate phrasing or buzzwords (synergy, DNA, ecosystem, leverage, authenticity, brand world…).
- Always prefer a concrete, verifiable observation over generic flattery.
- Never cite a product, campaign or detail JUST to prove you did your research. Every mention must move the point forward. If a sentence only exists to show "I know your brand", cut it or shorten it.
- Never paraphrase info you just gave (no filler that restates the previous sentence).
- Avoid mechanical, repetitive transitions ("Furthermore", "Indeed", "That's why").

STRICT PROHIBITIONS:
- Never mention the villa.
- Never use a calibrated corporate/salesy tone NOR a casual or slangy one.
- Never invent facts, campaigns, or details.
- Never use Markdown other than the allowed bold text.
- Never use a disparaging comparison like "rather than mega influencers", "instead of big accounts", "unlike macro-influencers". Never compare our talents to other profiles.

Critical completeness rule:
- You must mention ALL talents provided in "Available talents" (no omissions).
- Do not stop at 4-5 profiles: if 8 talents are provided, all 8 must appear.

Reply ONLY with valid JSON and nothing else:
{
  "subject": "short premium subject that ALWAYS includes ${brandNameToken} (mandatory)",
  "body": "full email text with \\n line breaks and allowed Markdown bold"
}
`
        : `Tu écris comme un humain qui travaille dans l'influence et connaît bien le milieu, pas comme une IA. Tu fais partie de l'équipe Glow Up Agence et tu t'adresses à un·e professionnel·le (marque, équipe marketing/influence) que tu respectes.
Ton attendu : professionnel, posé et soigné, mais naturel et incarné — jamais corporate, jamais familier. Le vouvoiement est de rigueur. L'objectif est que la personne en face ne devine pas que c'est généré : ça doit ressembler à un vrai mail bien écrit par un humain, pas à un mail commercial calibré ni à un message décontracté entre potes.
Évite l'accumulation de superlatifs : maximum 1 à 2 compliments dans tout le mail, et seulement s'ils sont mérités. Préfère toujours une observation concrète et vérifiable (un produit précis, un lancement, un type de collaboration qu'ils mènent) plutôt qu'une flatterie générale. Pas d'argot ni d'anglicismes relâchés.

CONTEXTE ACTUEL : avril 2026
Marque : ${brandName}${multiBrandNoteFr}
Nouveautés / collections à citer en priorité : ${newProducts}
Positionnement : ${brandPositioning}
Stratégie d'influence actuelle de la marque (types de profils, formats, tonalité de leurs collaborations) : ${influenceStrategy || "—"}
Talents disponibles : ${talentsString} (la variable contient déjà les liens HTML complets sous la forme <a><strong>Prénom Nom</strong></a> ; conserve-les tels quels, NE retire jamais le gras ni le lien)
${beneluxContextFr}
${projectBriefBlockFr}
${
          useDirectRecipient
            ? `DESTINATAIRE (utilise EXACTEMENT ces valeurs, n'utilise AUCUN jeton HubSpot du type {{ contact.firstname }} ou {{ contact.company }}) :
- Prénom : ${firstNameToken}
- Marque : ${brandNameToken} (mettre en gras uniquement quand tu l'utilises)`
            : `VARIABLES HUBSPOT OBLIGATOIRES :
{{ contact.firstname }}
{{ contact.company }} (mettre en gras uniquement quand tu l'utilises)`
        }

STRUCTURE (un fil logique, pas un gabarit rigide — varie les formulations à chaque mail) :
- Commencer OBLIGATOIREMENT par : "Bonjour ${firstNameToken},"
- Ajouter OBLIGATOIREMENT juste après, sur une nouvelle ligne, cette phrase EXACTE sans la modifier : "J'espère que vous allez bien ?"
- Enchaîner sur une accroche concrète et professionnelle, pas une flatterie : pars d'un élément précis et vérifiable (un lancement, un produit, une orientation récente de ${brandNameToken}). Ex. "J'ai vu que vous aviez lancé [produit] récemment / que vous développiez vos collaborations autour de [type de profils]." Une observation posée, pas une remarque familière.
- Citer la nouveauté la plus forte UNE SEULE FOIS, en VERSION COURTE et parlée, jamais le nom commercial complet. Un humain qui écrit vite dit "votre sérum lèvres Baby Rose" ou "le repulpant SPF", pas "Sérum Lèvres Repulpant SPF30 + Peptides teinté 'Baby Rose'". Garde juste ce qui permet de l'identifier (1 à 3 mots, le nom de gamme/coloris).
  INTERDIT : re-décrire des caractéristiques déjà contenues dans le nom du produit ("X avec ses peptides et sa protection solaire" alors que "Peptides" et "SPF" sont déjà dans X). Si une info est dans le nom, ne la répète pas.
  Cite le produit pour DIRE quelque chose d'utile (il marche bien, il colle au type de contenu de nos créatrices…), pas pour prouver que tu connais le produit. Évite les constats creux du type "reste bien mis en avant" (mis en avant où ? par qui ?). Une seule phrase qui enchaîne vers la suite.
- Expliquer pourquoi vous pensez à eux, simplement et concrètement (1-2 phrases). Pas de jargon, pas de "synergie" ni "ADN de marque".
- Transition AVANT la liste — OBLIGATOIRE : inclure systématiquement une observation qui montre que vous avez analysé le marché et leurs collaborations actuelles, en vous appuyant sur la "Stratégie d'influence actuelle de la marque". Formule du type : "En regardant le marché, j'ai vu qu'en ce moment vous travaillez surtout avec des profils [type de profils issus de l'analyse, ex. mamans / lifestyle / beauté]" puis enchaîne sur "dans notre agence nous avons plusieurs créateurs qui peuvent correspondre :". Reprends le type de profils RÉEL déduit de la stratégie fournie (ne l'invente pas). Si la stratégie est "—" ou vide, formule plutôt : "En regardant le marché et votre positionnement, dans notre agence nous avons plusieurs créateurs qui peuvent correspondre :". Reste sobre et naturel, 1 à 2 phrases max.
- Lister les talents en format clair et aéré avec des tirets :
  Prénom Nom (nombre d’abonnés TikTok – nombre d’abonnés Instagram – Catégorie) → raison courte (10-15 mots max), concrète et pertinente, pas une formule marketing
  Tu DOIS reprendre le nombre d’abonnés TikTok du créateur tel qu’indiqué dans "Talents disponibles" (ne jamais l’omettre quand il est fourni), en plus du nombre d’abonnés Instagram.
- Une courte phrase après la liste qui dit, simplement, ce que ces profils peuvent apporter — sans empiler les qualités. Reste factuel et varie la formulation à chaque mail (évite la phrase toute faite type "notoriété + crédibilité + contenu vécu").
- Proposer la collaboration de façon professionnelle et posée (ex. "Nous serions ravis d'envisager une collaboration avec vous." ou "Si cela vous intéresse, nous serions heureux d'en échanger.").
- Ajouter OBLIGATOIREMENT une phrase qui inclut un lien CLIQUABLE vers notre roster complet, sous cette forme HTML : <a href="https://app.glowupagence.fr/talentbook">https://app.glowupagence.fr/talentbook</a>
- Terminer OBLIGATOIREMENT le mail, juste avant la clôture, par deux phrases qui portent ces deux idées (reformule-les naturellement, varie la tournure à chaque mail, ne les recopie PAS à l'identique) :
  1) proposer d'envoyer rapidement leurs médias kits complets, un moodboard et des estimations de performance sur mesure ;
  2) proposer un court appel de 10-15 minutes la semaine prochaine pour présenter notre agence et nos talents.
Pour référence (à NE PAS reprendre tel quel) : « Je serais ravie de vous envoyer rapidement leurs médias kits complets, un moodboard ainsi que des estimations de performance sur mesure. Seriez-vous disponible pour un appel de 10-15 minutes la semaine prochaine pour vous présenter notre agence et nos talents ? »

${
  projectBrief
    ? `OVERRIDE STRUCTURE PROJET (prioritaire sur le paragraphe STRUCTURE ci-dessus) :
- INTERDIT d'utiliser la transition « plusieurs créateurs qui peuvent correspondre » (ou variante).
- Présente le talent principal au singulier + le projet.
- Le nom complet du talent principal DOIT toujours apparaître en lien Instagram HTML cliquable : <a href="https://www.instagram.com/HANDLE"><strong>Prénom Nom</strong></a> (garder gras + lien, jamais en texte brut).
- Si le brief cite des accompagnatrices, une phrase « Elle sera accompagnée de … » avec liens Instagram propres (<a href="https://www.instagram.com/handle">@handle</a>), jamais d'URL Instagram avec tokens.
- Pas de liste casting multi-profils hors projet.`
    : ""
}

Clôture exacte : "Belle journée,"

FORMATAGE :
- Utilise le gras uniquement pour le nom de la marque et les produits phares (avec parcimonie).
- Aère bien la liste des talents avec des tirets.
- Le body du mail doit contenir des \\n pour les sauts de ligne.

TON : PROFESSIONNEL MAIS HUMAIN (équilibre essentiel) :
- Le mail doit rester professionnel, soigné et crédible : c'est un mail d'affaires envoyé à une marque, pas un message décontracté.
- Naturel ne veut PAS dire familier. Vouvoiement obligatoire. Bannis l'argot et les anglicismes relâchés ("bossez", "sans blabla", "matcher", "clairement partants", "monter un truc", "jeter un œil", "du coup", "carrément"…).
- Varie tout de même le rythme (toutes les phrases ne doivent pas être de la même longueur), mais sans casser le registre professionnel.
- Maximum 1 à 2 compliments dans TOUT le mail. Pas d'empilement d'adjectifs ni de superlatifs ("extrêmement", "incroyable", "parfaitement", "passionné"…).
- Pas de tournures corporate ni de mots-valises (synergie, ADN, écosystème, levier, authenticité, univers de marque…).
- Préfère une observation concrète et vérifiable à toute flatterie générale.
- Ne cite jamais un produit, une campagne ou un détail JUSTE pour prouver que tu as fait tes recherches. Chaque mention doit faire avancer le propos. Si une phrase ne sert qu'à montrer "je connais ta marque", supprime-la ou raccourcis.
- Ne paraphrase jamais une info que tu viens de donner (pas de remplissage qui reformule la phrase précédente).
- Évite les transitions mécaniques et répétitives ("Par ailleurs", "En effet", "C'est pourquoi").

INTERDITS STRICTS :
- Jamais mentionner la villa.
- Jamais de ton corporate/commercial calibré NI de ton familier ou argotique.
- Jamais inventer de faits, de campagnes ou de détails.
- Jamais d’autres Markdown que les gras autorisés.
- Jamais d'opposition/comparaison dévalorisante du type "plutôt que des méga influenceuses", "au lieu des gros comptes", "à l'inverse des macro-influenceurs". Ne compare jamais nos talents à d'autres profils.

Règle critique de complétude :
- Tu dois mentionner TOUS les talents transmis dans "Talents disponibles" (aucun oubli).
- Ne te limite pas à 4-5 profils : si 8 talents sont fournis, 8 doivent apparaître.

Réponds UNIQUEMENT avec un JSON valide et rien d’autre :
{
  "subject": "titre court et premium qui contient TOUJOURS ${brandNameToken} (obligatoire)",
  "body": "le texte complet du mail avec \\n pour les sauts de ligne et gras Markdown"
}
`;

    let text: string;
    try {
      text = await xaiResponse(GROK_SYSTEM_PROMPT);
    } catch (e: unknown) {
      console.error("x.ai generate-email:", e);
      const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    try {
      const parsed = tryParseEmailJson(text);
      if (!parsed.subject.trim() || !parsed.body.trim()) {
        return NextResponse.json(
          { error: "Erreur de parsing Grok" },
          { status: 500 }
        );
      }
      const normalizedBody = normalizeForIncludes(parsed.body);
      const missingTalents = body.talents.filter((t) => {
        const name = normalizeForIncludes(t.name || "");
        return name.length > 0 && !normalizedBody.includes(name);
      });

      if (missingTalents.length > 0) {
        const missingBlock = missingTalents
          .map((t) => {
            const ig = typeof t.igFollowers === "number" ? t.igFollowers : 0;
            const tt = typeof t.ttFollowers === "number" ? t.ttFollowers : 0;
            const statsParts: string[] = [];
            if (tt > 0) statsParts.push(`${formatFollowersCompact(tt)} TikTok`);
            if (ig > 0) statsParts.push(`${formatFollowersCompact(ig)} Insta`);
            if (statsParts.length === 0 && typeof t.followers === "number" && t.followers > 0) {
              statsParts.push(`${formatFollowersCompact(t.followers)} audience`);
            }
            const stats = statsParts.join(", ");
            const niche = t.niche || "créateur";
            const tail = [stats, niche].filter(Boolean).join(" - ");
            const igUrl = getInstagramProfileUrl(t.instagram);
            const nameHtml = igUrl
              ? `<a href="${igUrl}"><strong>${t.name}</strong></a>`
              : `<strong>${t.name}</strong>`;
            return `- ${nameHtml}${tail ? ` (${tail})` : ""}`;
          })
          .join("\n");

        parsed.body = `${parsed.body.trim()}\n\nAutres profils à considérer :\n${missingBlock}`;
      }

      // Garantit lien Instagram sur chaque nom de talent (solo inclus).
      const asHtml = parsed.body.trim().startsWith("<")
        ? parsed.body
        : plainTextToEmailHtml(parsed.body) || parsed.body;
      parsed.body = upgradeTalentLinksInHtml(
        asHtml,
        body.talents.map((t) => {
          const parts = String(t.name || "").trim().split(/\s+/);
          const prenom = parts[0] || "";
          const nom = parts.slice(1).join(" ") || "";
          return { prenom, nom, instagram: t.instagram };
        })
      );

      parsed.subject = ensureBrandInSubject(parsed.subject, brandNameToken);

      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(
        { error: "Erreur de parsing Grok" },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error("POST /api/casting/generate-email:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération d’email." },
      { status: 500 }
    );
  }
}
