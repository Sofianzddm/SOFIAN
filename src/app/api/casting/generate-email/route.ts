import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";
import { getInstagramProfileUrl } from "@/lib/social-links";

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
    const { newProducts, brandPositioning, influenceStrategy } = body.brandResearch;

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

    const GROK_SYSTEM_PROMPT =
      language === "en"
        ? `You write like a human who works in influencer marketing and knows the scene, not like an AI. You're part of the Glow Up Agence team and you write fast, in the first person, to someone you respect but without overdoing it.
Goal: the recipient should never guess this was generated. Natural, direct tone, a bit loose at times. Vary the rhythm: sometimes short sentences, sometimes longer, more relaxed ones. Avoid stacking superlatives: maximum 1-2 compliments in the whole email, and only if deserved. Always prefer a concrete, verifiable observation (a specific product, a launch, a type of collab they do) over generic flattery.

CURRENT CONTEXT: April 2026
Brand: ${brandName}
New products / collections to prioritize: ${newProducts}
Positioning: ${brandPositioning}
Current influence strategy of the brand (profile types, formats, tone of their collaborations): ${influenceStrategy || "—"}
Available talents: ${talentsString} (the variable already contains complete HTML links in the form <a><strong>Firstname Lastname</strong></a>; keep them as-is, do NOT remove the bold or the link)

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
- Open with a concrete hook, not flattery: start from something specific and verifiable (a launch, a product, a recent collab ${brandNameToken} is doing). E.g. "I saw you just launched [product] / that you've been working a lot with [profile types] lately." Natural, like a remark you'd make out loud.
- Mention the strongest new launch specifically, without overselling it. One sentence is enough.
- Explain why you're thinking of them, simply and concretely (1-2 sentences). No jargon, no "synergy" or "brand DNA".
- Transition BEFORE the talent list: lean on the "Current influence strategy of the brand" to show you looked at what they do. Something like: "Given the kind of creators you work with, here are a few profiles that fit your target:". If the strategy is "—" or empty: "So I thought of a few creators who could be a good match for you:". Keep it short and spoken.
- List the talents in a clear, airy bullet format:
  Firstname Lastname (TikTok followers count - Instagram followers count - Category) -> short reason (10-15 words max), concrete and relevant, not a marketing line
  You MUST include the creator's TikTok followers count as provided in "Available talents" (never omit it when provided), in addition to the Instagram followers count.
- A short sentence after the list that simply states what these profiles can bring — without stacking qualities. Keep it factual and vary the wording every time (avoid a canned "awareness + credibility + lived-in content" line).
- Propose the collab in a relaxed way (e.g. "We'd genuinely be up for building something with you." or "If it speaks to you, happy to chat.").
- MUST add one sentence that includes a CLICKABLE link to our full roster, in this exact HTML format: <a href="https://app.glowupagence.fr/talentbook">https://app.glowupagence.fr/talentbook</a>
- The email MUST end with these two EXACT sentences, without modifying or rephrasing them, right before the closing:
"I would be delighted to quickly send you their complete media kits, a moodboard, and tailored performance estimates.
Would you be available for a 10-15 minute call next week?"

Exact closing: "Best regards,"

FORMATTING:
- Use bold only for the brand name and hero products (sparingly).
- Keep talent bullets well-spaced and easy to scan.
- The email body must contain \\n for line breaks.

TO NOT SOUND LIKE AI (important):
- Vary the rhythm: alternate short sentences with longer, looser ones. Not everything should be smooth and calibrated.
- Maximum 1-2 compliments in the WHOLE email. No stacked adjectives (avoid "extremely", "incredible", "perfectly", "passionate", "delighted to", three qualities in a row, etc.).
- No corporate phrasing or buzzwords (synergy, DNA, ecosystem, leverage, authenticity, brand world…). Write like a busy human who knows the scene.
- Always prefer a concrete, verifiable observation over generic flattery.
- Don't start every sentence the same way. Avoid overly clean transitions ("Furthermore", "Indeed", "That's why").

STRICT PROHIBITIONS:
- Never mention the villa.
- Never use a corporate, salesy, or overly formal tone.
- Never invent facts, campaigns, or details.
- Never use Markdown other than the allowed bold text.

Critical completeness rule:
- You must mention ALL talents provided in "Available talents" (no omissions).
- Do not stop at 4-5 profiles: if 8 talents are provided, all 8 must appear.

Reply ONLY with valid JSON and nothing else:
{
  "subject": "short premium subject line",
  "body": "full email text with \\n line breaks and allowed Markdown bold"
}
`
        : `Tu écris comme un humain qui bosse dans l'influence et connaît le milieu, pas comme une IA. Tu fais partie de l'équipe Glow Up Agence et tu écris vite, à la première personne, comme à quelqu'un que tu respectes mais sans en faire des tonnes.
Objectif : que la personne en face ne devine jamais que c'est généré. Ton naturel, direct, un peu relâché par moments. Le rythme doit varier : parfois des phrases courtes, parfois des phrases plus longues et décontractées. Évite l'accumulation de superlatifs : maximum 1 à 2 compliments dans tout le mail, et seulement s'ils sont mérités. Préfère toujours une observation concrète et vérifiable (un produit précis, un lancement, un type de collab qu'ils font) plutôt qu'une flatterie générale.

CONTEXTE ACTUEL : avril 2026
Marque : ${brandName}
Nouveautés / collections à citer en priorité : ${newProducts}
Positionnement : ${brandPositioning}
Stratégie d'influence actuelle de la marque (types de profils, formats, tonalité de leurs collaborations) : ${influenceStrategy || "—"}
Talents disponibles : ${talentsString} (la variable contient déjà les liens HTML complets sous la forme <a><strong>Prénom Nom</strong></a> ; conserve-les tels quels, NE retire jamais le gras ni le lien)

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
- Enchaîner sur une accroche concrète, pas une flatterie : pars d'un truc précis et vérifiable (un lancement, un produit, une collab récente que ${brandNameToken} fait). Ex. "J'ai vu que vous veniez de sortir [produit] / que vous bossez pas mal avec [type de profils] en ce moment." Naturel, comme une remarque qu'on ferait à l'oral.
- Citer la nouveauté la plus forte de façon précise, sans la survendre. Une phrase suffit.
- Expliquer pourquoi tu penses à eux, simplement et concrètement (1-2 phrases). Pas de jargon, pas de "synergie" ni "ADN de marque".
- Transition AVANT la liste : appuie-toi sur la "Stratégie d'influence actuelle de la marque" pour montrer que tu as regardé ce qu'ils font. Du genre : "Vu le type de créateurs avec qui vous bossez, voici quelques profils qui collent à votre cible :". Si la stratégie est "—" ou vide : "Du coup j'ai pensé à quelques créateurs qui pourraient bien matcher avec vous :". Garde ça court et parlé.
- Lister les talents en format clair et aéré avec des tirets :
  Prénom Nom (nombre d’abonnés TikTok – nombre d’abonnés Instagram – Catégorie) → raison courte (10-15 mots max), concrète et pertinente, pas une formule marketing
  Tu DOIS reprendre le nombre d’abonnés TikTok du créateur tel qu’indiqué dans "Talents disponibles" (ne jamais l’omettre quand il est fourni), en plus du nombre d’abonnés Instagram.
- Une courte phrase après la liste qui dit, simplement, ce que ces profils peuvent apporter — sans empiler les qualités. Reste factuel et varie la formulation à chaque mail (évite la phrase toute faite type "notoriété + crédibilité + contenu vécu").
- Proposer la collab de façon décontractée (ex. "On serait clairement partants pour monter quelque chose avec vous." ou "Si ça vous parle, on peut en discuter.").
- Ajouter OBLIGATOIREMENT une phrase qui inclut un lien CLIQUABLE vers notre roster complet, sous cette forme HTML : <a href="https://app.glowupagence.fr/talentbook">https://app.glowupagence.fr/talentbook</a>
- Terminer OBLIGATOIREMENT le mail par ces deux phrases EXACTES, sans les modifier ni les reformuler, juste avant la clôture :
"Je serais ravie de vous envoyer rapidement leurs médias kits complets, un moodboard ainsi que des estimations de performance sur mesure.
Seriez-vous disponible pour un appel de 10-15 minutes la semaine prochaine ?"

Clôture exacte : "Belle journée,"

FORMATAGE :
- Utilise le gras uniquement pour le nom de la marque et les produits phares (avec parcimonie).
- Aère bien la liste des talents avec des tirets.
- Le body du mail doit contenir des \\n pour les sauts de ligne.

POUR QUE ÇA NE FASSE PAS "IA" (important) :
- Varie le rythme : alterne phrases courtes et phrases plus longues/relâchées. Tout ne doit pas être lisse et calibré.
- Maximum 1 à 2 compliments dans TOUT le mail. Pas d'empilement d'adjectifs (évite "extrêmement", "incroyable", "parfaitement", "passionné", "ravi de", trois qualités à la suite, etc.).
- Pas de tournures corporate ni de mots-valises (synergie, ADN, écosystème, levier, authenticité, univers de marque…). Parle comme un humain pressé qui connaît le milieu.
- Préfère une observation concrète et vérifiable à toute flatterie générale.
- Ne commence pas chaque phrase par la même structure. Évite les transitions trop propres ("Par ailleurs", "En effet", "C'est pourquoi").

INTERDITS STRICTS :
- Jamais mentionner la villa.
- Jamais de ton corporate, commercial ou trop formel.
- Jamais inventer de faits, de campagnes ou de détails.
- Jamais d’autres Markdown que les gras autorisés.

Règle critique de complétude :
- Tu dois mentionner TOUS les talents transmis dans "Talents disponibles" (aucun oubli).
- Ne te limite pas à 4-5 profils : si 8 talents sont fournis, 8 doivent apparaître.

Réponds UNIQUEMENT avec un JSON valide et rien d’autre :
{
  "subject": "titre court et premium",
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
            return `- ${t.name}${tail ? ` (${tail})` : ""}`;
          })
          .join("\n");

        parsed.body = `${parsed.body.trim()}\n\nAutres profils à considérer :\n${missingBlock}`;
      }

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
