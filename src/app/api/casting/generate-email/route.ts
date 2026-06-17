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
        ? `You are a senior copywriter at Glow Up Agence, specialized in premium outreach emails.
You must write emails that are extremely fluid, elegant, punchy, and warm, with a premium tone but never corporate. The tone must feel natural, almost friendly while remaining elegant.

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

STYLE TO REPLICATE (recommended structure but stay fluid):
- MUST start with: "Hi ${firstNameToken},"
- MUST add right after, on a new line, this EXACT sentence without modifying it: "I hope you are doing well?"
- First sentence: a natural, elegant variation around "We immediately thought of ${brandNameToken} while reviewing our talents." OR a more direct product-led opener if the brand is very lifestyle/organic (example for VEJA: "When we saw Jitsu launching...").
- Mention the strongest new launch very specifically, ideally starting with "Your" for a personal and direct tone. Keep it short, elegant, and impactful.
- Explain the fit in a natural, precise, and compelling way (2-3 sentences max).
- Transition BEFORE the talent list: lean on the "Current influence strategy of the brand" to show we studied their collaborations. Use a wording like: "We noticed you currently collaborate with [profile types / formats summarized in a few words], so here are creators who perfectly match your target:". Stay natural and concise (1-2 sentences max), do not copy the whole strategy. If the strategy is "—" or empty, simply use: "It made us think of a few creators who could be a perfect match for your world:".
- List the talents in a clear, airy bullet format:
  Firstname Lastname (TikTok followers count - Instagram followers count - Category) -> short reason (10-15 words max), very relevant and smart
  You MUST include the creator's TikTok followers count as provided in "Available talents" (never omit it when provided), in addition to the Instagram followers count.
- Adaptive transition sentence: "These profiles bring both strong awareness, real [category] credibility, and the ability to create lived-in content that matches your current direction." -> Replace [category] with the most relevant term (lifestyle, responsible fashion, sport & movement, etc.).
- Collaboration sentence: warm, premium version (example: "We would love to explore a collaboration with you and our talents." or "This could genuinely create great outcomes together.").
- MUST add one sentence that includes a CLICKABLE link to our full roster, in this exact HTML format: <a href="https://app.glowupagence.fr/talentbook">https://app.glowupagence.fr/talentbook</a>
- The email MUST end with these two EXACT sentences, without modifying or rephrasing them, right before the closing:
"I would be delighted to quickly send you their complete media kits, a moodboard, and tailored performance estimates.
Would you be available for a 10-15 minute call next week?"

Exact closing: "Best regards,"

MANDATORY FORMATTING:
- Use bold only for the brand name and hero products.
- Keep talent bullets well-spaced and easy to scan.
- Short, rhythmic, elegant sentences. Warm but premium tone.
- The email body must contain \\n for line breaks.

STRICT PROHIBITIONS:
- Never mention the villa.
- Never use an overly corporate or overly formal tone.
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
        : `Tu es un copywriter senior chez Glow Up Agence, spécialisé dans les mails de prospection haut de gamme.
Tu dois rédiger des mails extrêmement fluides, élégants, percutants et chaleureux, avec un ton premium mais jamais corporate. Le ton doit être naturel, presque amical tout en restant élégant.

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

STYLE À REPRODUIRE (structure recommandée mais fluide) :
- Commencer OBLIGATOIREMENT par : "Bonjour ${firstNameToken},"
- Ajouter OBLIGATOIREMENT juste après, sur une nouvelle ligne, cette phrase EXACTE sans la modifier : "J'espère que vous allez bien ?"
- Première phrase : une variation naturelle et élégante autour de "On a immédiatement pensé à ${brandNameToken} en regardant nos talents." OU une accroche plus directe sur le produit si la marque est très lifestyle/organique (ex. pour VEJA : "En voyant le Jitsu sortir…").
- Citer précisément la nouveauté la plus forte en commençant idéalement par "Votre" pour un ton personnel et direct. Phrase courte, élégante et impactante.
- Expliquer le fit de façon naturelle, précise et séduisante (2-3 phrases max).
- Transition AVANT la liste des talents : appuie-toi sur la "Stratégie d'influence actuelle de la marque" pour montrer qu'on a étudié leurs collaborations. Formule du type : "On a vu que vous collaborez en ce moment avec [type de profils / formats résumés en quelques mots], voici donc des créateurs qui correspondent parfaitement à votre cible :". Reste naturel et synthétique (1-2 phrases max), ne recopie pas toute la stratégie. Si la stratégie est "—" ou vide, utilise simplement : "Ça nous a fait penser à quelques créateurs qui pourraient parfaitement correspondre à votre univers :".
- Lister les talents en format clair et aéré avec des tirets :
  Prénom Nom (nombre d’abonnés TikTok – nombre d’abonnés Instagram – Catégorie) → raison courte (10-15 mots max), très pertinente et intelligente
  Tu DOIS reprendre le nombre d’abonnés TikTok du créateur tel qu’indiqué dans "Talents disponibles" (ne jamais l’omettre quand il est fourni), en plus du nombre d’abonnés Instagram.
- Phrase de transition adaptative : "Ces profils apportent à la fois une belle notoriété, une vraie crédibilité [catégorie] et une capacité à créer du contenu vécu qui colle à votre direction actuelle." → Remplace [catégorie] par le terme le plus pertinent (lifestyle, mode responsable, sport & mouvement, etc.).
- Phrase collaboration : version chaleureuse et premium (ex. "On serait ravis d’explorer une collaboration avec vous et nos talents." ou "Ça pourrait vraiment donner de belles choses ensemble.").
- Ajouter OBLIGATOIREMENT une phrase qui inclut un lien CLIQUABLE vers notre roster complet, sous cette forme HTML : <a href="https://app.glowupagence.fr/talentbook">https://app.glowupagence.fr/talentbook</a>
- Terminer OBLIGATOIREMENT le mail par ces deux phrases EXACTES, sans les modifier ni les reformuler, juste avant la clôture :
"Je serais ravie de vous envoyer rapidement leurs médias kits complets, un moodboard ainsi que des estimations de performance sur mesure.
Seriez-vous disponible pour un appel de 10-15 minutes la semaine prochaine ?"

Clôture exacte : "Belle journée,"

FORMATAGE OBLIGATOIRE :
- Utilise le gras uniquement pour le nom de la marque et les produits phares.
- Aère bien la liste des talents avec des tirets.
- Phrases courtes, rythmées et élégantes. Ton chaleureux mais premium.
- Le body du mail doit contenir des \\n pour les sauts de ligne.

INTERDITS STRICTS :
- Jamais mentionner la villa.
- Jamais de ton trop corporate ou formel.
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
