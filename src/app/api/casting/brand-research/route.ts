import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { marqueSlug } from "@/lib/marque-resolver";
import { xaiResponse } from "@/lib/xai";
import {
  formatProjectBriefForPrompt,
  parseProjectBrief,
  parseProjectBriefs,
  type ProjectResearchBrief,
} from "@/lib/project-research-brief";

// Recherche web + X avec modèle de raisonnement : peut dépasser 2 min,
// surtout avec la relance automatique (2 tentatives × 110 s max par marque).
export const maxDuration = 300;

const ALLOWED_ROLES = ["CASTING_MANAGER", "STRATEGY_PLANNER", "ADMIN"] as const;

/** Recherche web + X (posts / buzz) — Agent Tools API x.ai */
const BRAND_RESEARCH_TOOLS = [{ type: "web_search" }, { type: "x_search" }] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export interface BrandResearchPayload {
  recentCampaigns: string;
  newProducts: string;
  /** Dispo France d'abord, sinon Europe — critique pour ne pas citer un lancement US-only. */
  availabilityFrEu: string;
  brandPositioning: string;
  influenceStrategy: string;
}

/** Contexte CRM pour ancrer l'identité de la marque (évite Wero ≠ Wuré). */
type BrandCrmContext = {
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
};

async function loadBrandCrmContext(brand: string): Promise<BrandCrmContext | null> {
  const slug = marqueSlug(brand);
  if (!slug) return null;
  const bySlug = await prisma.marque.findFirst({
    where: { slug },
    select: { nom: true, secteur: true, siteWeb: true },
  });
  if (bySlug) return bySlug;
  const byAlias = await prisma.marqueAlias.findFirst({
    where: { slug },
    select: {
      marque: { select: { nom: true, secteur: true, siteWeb: true } },
    },
  });
  return byAlias?.marque ?? null;
}

function formatBrandIdentityBlock(
  brand: string,
  crm: BrandCrmContext | null
): string {
  const secteur = crm?.secteur?.trim() || "";
  const siteWeb = crm?.siteWeb?.trim() || "";
  const crmNom = crm?.nom?.trim() || brand;
  return `═══ IDENTITÉ MARQUE (OBLIGATOIRE — LISEZ AVANT DE RECHERCHER) ═══
- Libellé exact demandé : "${brand}"
- Nom CRM Glow Up : "${crmNom}"
- Secteur CRM : ${secteur || "non renseigné"}
- Site web CRM : ${siteWeb || "non renseigné"}

CRITIQUE — DÉSAMBIGUÏSATION :
1) Identifie D'ABORD la bonne entité (orthographe exacte + secteur + site officiel) via recherche web.
2) Ne confonds JAMAIS avec une marque à sonorité proche mais orthographe / secteur différents
   (ex. "Wero" / "WERO" = paiement européen / banque ≠ "Wuré" cosmétique ; "Nike" ≠ "Nice" ; etc.).
3) Si plusieurs résultats existent, retiens UNIQUEMENT celui dont le nom officiel matche
   l'orthographe "${brand}"${secteur ? ` ET le secteur "${secteur}"` : ""}${siteWeb ? ` (site de référence : ${siteWeb})` : ""}.
4) Si tu tombes sur une autre marque (autre orthographe, autre secteur), REJETTE-LA et relance
   la recherche avec le nom exact + indices secteur (banque, paiement, fintech, beauté, etc.).
5) Dans ta réponse, ne cite que des faits de CETTE entité. Si le doute reste, dis-le clairement
   au lieu d'inventer ou de basculer sur un homonyme.`;
}

function formatProjectContextBlock(
  projectBrief: ProjectResearchBrief | null,
  projectBriefs: ProjectResearchBrief[]
): string {
  if (projectBriefs.length >= 2) {
    return projectBriefs
      .map((b, i) => formatProjectBriefForPrompt(b, i))
      .join("\n\n");
  }
  if (projectBrief) return formatProjectBriefForPrompt(projectBrief);
  return "";
}

function tryParseBrandJson(raw: string): BrandResearchPayload {
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
        "recentCampaigns" in parsed &&
        "newProducts" in parsed &&
        "brandPositioning" in parsed &&
        "influenceStrategy" in parsed
      ) {
        const o = parsed as Record<string, unknown>;
        return {
          recentCampaigns: String(o.recentCampaigns ?? ""),
          newProducts: String(o.newProducts ?? ""),
          availabilityFrEu: String(o.availabilityFrEu ?? ""),
          brandPositioning: String(o.brandPositioning ?? ""),
          influenceStrategy: String(o.influenceStrategy ?? ""),
        };
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("parse");
}

const FR_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** Mois en cours + mois précédent (libellés FR), pour borner la recherche d'actus. */
function getResearchMonthWindow(now = new Date()): {
  currentLabel: string;
  previousLabel: string;
  contextLabel: string;
} {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prev = new Date(currentYear, currentMonth - 1, 1);
  const currentLabel = `${FR_MONTHS[currentMonth]} ${currentYear}`;
  const previousLabel = `${FR_MONTHS[prev.getMonth()]} ${prev.getFullYear()}`;
  return {
    currentLabel,
    previousLabel,
    contextLabel: `${previousLabel}–${currentLabel}`,
  };
}

/** Prompt d'analyse pour UNE marque (casting générique). */
function buildBrandPrompt(brand: string, crm: BrandCrmContext | null): string {
  const { currentLabel, previousLabel, contextLabel } = getResearchMonthWindow();
  return `Tu es un expert en marketing d'influence et en analyse de marques, spécialisé marché France / Europe.

${formatBrandIdentityBlock(brand, crm)}

Utilise les outils de recherche (web + X) pour identifier **la toute dernière nouveauté** de la marque "${brand}" UNIQUEMENT (contexte actuel : ${currentLabel}).
Requêtes à privilégier : nom exact entre guillemets + secteur (ex. "${brand}" paiement OR banque OR wallet ; jamais un homonyme beauté/cosmétique si le secteur est finance).

Objectif prioritaire : Trouver et décrire précisément **le lancement le plus récent du mois en cours ou du mois précédent uniquement** (${contextLabel}). Rien d'antérieur à ${previousLabel}.

CRITIQUE — DISPONIBILITÉ RÉGIONALE (à vérifier systématiquement via recherche web) :
Beaucoup de lancements sont annoncés / sortis aux US (ou UK / Asie) mais **pas encore en France ni en Europe**. Tu DOIS vérifier si le produit / la collection / le service est :
1) disponible / en vente / lancé en **France** (sites .fr, Sephora FR, retailers FR, banques FR, communiqués FR) ;
2) sinon disponible / lancé en **Europe** (UE, UK, DE, ES, IT, Benelux, etc.) ;
3) sinon clairement **US-only / hors Europe** (ou date de sortie Europe encore inconnue).
Cherche explicitement des indices du type "available in Europe", "coming to France", "sortie Europe", "disponible en France", "US exclusive", "US only", "not available in Europe".

Pour chaque champ JSON, rédige 2 à 4 phrases en français, concrètes et vivantes :

- recentCampaigns : les activations et campagnes de ${contextLabel} uniquement, en mettant l'accent sur ce qui est en cours ou très frais.
- newProducts : **la toute dernière nouveauté / feature / offre** dans cette fenêtre (nom exact, date de lancement, notes clés, vibe). Si plusieurs, **priorise une nouveauté disponible en France** ; à défaut en Europe ; ne retiens un lancement US-only que si aucune alternative FR/EU n'existe dans la fenêtre, et dis-le clairement.
- availabilityFrEu : verdict clair sur la dispo de cette nouveauté : France oui/non (+ preuve courte), sinon Europe oui/non (+ preuve courte), sinon "US / hors Europe uniquement" ou "dispo Europe non confirmée". Indique aussi une date de sortie FR/EU si trouvée.
- brandPositioning : le positionnement actuel, ce qui les distingue vraiment aujourd'hui.
- influenceStrategy : comment ils travaillent avec les créateurs en ce moment (type de profils, formats, tonalité).

Règles strictes :
- Identité d'abord : si le contenu trouvé parle d'une autre marque (orthographe différente), ignore-le.
- Fenêtre temporelle MAXIMALE : ${previousLabel} et ${currentLabel} seulement. Ignore tout lancement / campagne antérieur.
- Priorise toujours la nouveauté la plus récente **et pertinente pour le marché FR/EU** dans cette fenêtre (idéalement ${currentLabel}).
- Sois concret : nom du produit/service, date approximative, notes ou caractéristiques clés, et statut de dispo FR puis EU.
- Si tu ne trouves rien dans ${contextLabel}, dis-le clairement au lieu d'inventer ou de remonter plus loin.
- Ne présente JAMAIS un lancement US comme s'il était sorti en France/Europe sans preuve.
- Parle comme quelqu'un qui suit vraiment la marque, pas comme un communiqué.

Réponds UNIQUEMENT en JSON strict :

{
  "recentCampaigns": "...",
  "newProducts": "...",
  "availabilityFrEu": "...",
  "brandPositioning": "...",
  "influenceStrategy": "..."
}
`;
}

/**
 * Prompt projet : mêmes champs JSON, mais orienté pitch d'un brief concret
 * (pas un casting roster ouvert).
 */
function buildProjectBrandPrompt(
  brand: string,
  projectContext: string,
  crm: BrandCrmContext | null
): string {
  const { currentLabel, previousLabel, contextLabel } = getResearchMonthWindow();
  return `Tu es un expert en marketing d'influence et en pitch de projets marques, spécialisé marché France / Europe.

${formatBrandIdentityBlock(brand, crm)}

Tu analyses la marque "${brand}" dans le cadre d'un **PITCH PROJET** (pas un casting générique multi-talents).
Contexte actuel : ${currentLabel}. Fenêtre d'actus : ${contextLabel} uniquement (rien avant ${previousLabel}).

═══ BRIEF(S) PROJET À SERVIR ═══
${projectContext}

Utilise les outils de recherche (web + X) pour trouver des accroches concrètes qui aident à pitcher CE(S) projet(s) à "${brand}" (la bonne entité, pas un homonyme).
Requêtes à privilégier : nom exact entre guillemets + secteur / vertical du brief.

CRITIQUE — DISPONIBILITÉ RÉGIONALE (à vérifier systématiquement via recherche web) :
Beaucoup de lancements sont annoncés / sortis aux US (ou UK / Asie) mais **pas encore en France ni en Europe**. Tu DOIS vérifier si le produit / la collection / le service est :
1) disponible / en vente / lancé en **France** ;
2) sinon en **Europe** ;
3) sinon clairement **US-only / hors Europe**.

Pour chaque champ JSON, rédige 2 à 4 phrases en français, concrètes et utiles pour rédiger le mail projet :

- recentCampaigns : activations / campagnes de ${contextLabel} utiles pour ancrer le pitch du projet (event, collab, placement, contenu).
- newProducts : nouveauté récente **pertinente pour ce brief** (ou dis clairement s'il n'y a rien de pertinent dans ${contextLabel}). Priorise FR puis EU.
- availabilityFrEu : verdict clair FR / EU / US-only sur la nouveauté retenue.
- brandPositioning : comment le positionnement actuel de la marque **résonne avec ce projet** (raison strategy / angle / livrables).
- influenceStrategy : comment ils travaillent avec les créateurs / events / placements — ce qui aide à vendre CE type de projet (pas un roster casting).

Règles strictes :
- Identité d'abord : rejette tout résultat sur une marque à orthographe / secteur différents.
- Fenêtre temporelle MAXIMALE : ${previousLabel}–${currentLabel}.
- Oriente TOUT vers le fit avec le brief projet (pas une fiche marque générique).
- N'invente rien. Si une info manque, dis-le.
- Ne présente JAMAIS un lancement US comme s'il était sorti en France/Europe sans preuve.

Réponds UNIQUEMENT en JSON strict :

{
  "recentCampaigns": "...",
  "newProducts": "...",
  "availabilityFrEu": "...",
  "brandPositioning": "...",
  "influenceStrategy": "..."
}
`;
}

/**
 * Analyse une seule marque via x.ai (recherche web + X).
 * Le modèle de raisonnement + recherche peut être lent : on laisse jusqu'à
 * 110 s par tentative et on relance une fois en cas de timeout / parse raté.
 */
async function researchOneBrand(
  brand: string,
  projectContext?: string,
  crm?: BrandCrmContext | null
): Promise<BrandResearchPayload> {
  const MAX_ATTEMPTS = 2;
  let lastError: unknown;
  const crmCtx = crm === undefined ? await loadBrandCrmContext(brand) : crm;
  const prompt =
    projectContext && projectContext.trim()
      ? buildProjectBrandPrompt(brand, projectContext.trim(), crmCtx)
      : buildBrandPrompt(brand, crmCtx);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await xaiResponse(prompt, {
        tools: [...BRAND_RESEARCH_TOOLS],
        timeoutMs: 110_000,
      });
      return tryParseBrandJson(text);
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `x.ai brand-research (${brand}) tentative ${attempt} échouée, relance :`,
          e instanceof Error ? e.message : e
        );
      }
    }
  }
  throw lastError;
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

    const body = await request.json().catch(() => null);
    const brandName =
      typeof body?.brandName === "string" ? body.brandName.trim() : "";
    if (!brandName) {
      return NextResponse.json(
        { error: "Le champ brandName est requis." },
        { status: 400 }
      );
    }

    const projectBriefs = parseProjectBriefs(body?.projectBriefs);
    const projectBrief =
      projectBriefs.length >= 2 ? null : parseProjectBrief(body?.projectBrief);
    const projectContext = formatProjectContextBlock(projectBrief, projectBriefs);

    // Plusieurs marques (marques filles) → on analyse CHAQUE marque dans un
    // appel dédié, en PARALLÈLE. Un seul appel couvrant 5 marques avec recherche
    // web + X dépasse la limite de temps ; en parallèle, le temps total ≈ l'appel
    // le plus lent. Les résultats sont ensuite fusionnés par champ (par marque).
    const brands = brandName
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      // Garde-fou : on borne le nombre de marques analysées en parallèle.
      .slice(0, 6);

    if (brands.length <= 1) {
      const only = brands[0] || brandName;
      try {
        const parsed = await researchOneBrand(only, projectContext || undefined);
        return NextResponse.json(parsed);
      } catch (e: unknown) {
        console.error("x.ai brand-research:", e);
        const msg = e instanceof Error ? e.message : "Erreur API x.ai.";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }

    const settled = await Promise.allSettled(
      brands.map((b: string) => researchOneBrand(b, projectContext || undefined))
    );
    const ok: { brand: string; data: BrandResearchPayload }[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") ok.push({ brand: brands[i], data: r.value });
      else console.error(`x.ai brand-research (${brands[i]}):`, r.reason);
    }

    if (ok.length === 0) {
      return NextResponse.json(
        {
          error:
            "L'analyse des marques n'a pas abouti (délai dépassé). Réessaie, ou avec moins de marques.",
        },
        { status: 502 }
      );
    }

    // Fusion : chaque champ agrège les infos marque par marque (libellé en gras).
    const mergeField = (key: keyof BrandResearchPayload) =>
      ok
        .map(({ brand, data }) => `${brand} : ${data[key]}`)
        .join("\n\n");

    return NextResponse.json({
      recentCampaigns: mergeField("recentCampaigns"),
      newProducts: mergeField("newProducts"),
      availabilityFrEu: mergeField("availabilityFrEu"),
      brandPositioning: mergeField("brandPositioning"),
      influenceStrategy: mergeField("influenceStrategy"),
    });
  } catch (e) {
    console.error("POST /api/casting/brand-research:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la recherche marque." },
      { status: 500 }
    );
  }
}
