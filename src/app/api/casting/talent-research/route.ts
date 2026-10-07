import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { xaiResponse } from "@/lib/xai";
import { normalizeInstagramHandle } from "@/lib/social-links";
import {
  formatProjectBriefForPrompt,
  parseProjectBrief,
  parseProjectBriefs,
  pickBriefForTalent,
  type ProjectResearchBrief,
} from "@/lib/project-research-brief";
import {
  TALENT_RESEARCH_TOOLS,
  asStr,
  formatTalentStatsBits,
  loadCrmTalent,
  loadIgBundle,
  uniqueCollabLabels,
  type CrmTalent,
  type IgBundle,
} from "@/lib/talent-research-core";

export const maxDuration = 300;

const ALLOWED_ROLES = ["CASTING_MANAGER", "STRATEGY_PLANNER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export interface TalentResearchItem {
  talentId: string;
  name: string;
  /** Qui est cette personne (identité, positionnement). */
  whoTheyAre: string;
  /** Ce qu'elle fait concrètement (contenu, métier, angle). */
  whatTheyDo: string;
  /** Analyse du profil (ton, esthétique, audience, formats). */
  profileAnalysis: string;
  contentThemes: string;
  whyRelevant: string;
  proofPoints: string;
  sourcesUsed: string;
}

function tryParseTalentJson(
  raw: string
): Omit<TalentResearchItem, "talentId" | "name"> {
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
        "whoTheyAre" in parsed &&
        "whyRelevant" in parsed
      ) {
        const o = parsed as Record<string, unknown>;
        const whoTheyAre = asStr(o.whoTheyAre);
        const whatTheyDo = asStr(o.whatTheyDo) || asStr(o.contentThemes);
        const profileAnalysis =
          asStr(o.profileAnalysis) || asStr(o.audienceTone) || asStr(o.contentThemes);
        const contentThemes = asStr(o.contentThemes) || whatTheyDo;
        return {
          whoTheyAre,
          whatTheyDo,
          profileAnalysis,
          contentThemes,
          whyRelevant: asStr(o.whyRelevant),
          proofPoints: asStr(o.proofPoints),
          sourcesUsed: asStr(o.sourcesUsed),
        };
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("parse");
}

function talentCrmBlock(args: {
  talent: CrmTalent;
  ig: IgBundle;
  name: string;
  handle: string;
  igUrl: string;
  tt: string;
  yt: string;
  uniqueCollabs: string[];
}): string {
  return `═══ CRÉATEUR — FICHE CRM GLOW UP ═══
- Nom : ${args.name}
- Niches CRM : ${(args.talent.niches || []).join(", ") || "—"}
- Ville / pays : ${[args.talent.ville, args.talent.pays].filter(Boolean).join(", ") || "—"}
- Stats CRM : ${formatTalentStatsBits(args.talent, args.ig)}
- Instagram : ${args.handle ? `@${args.handle} — ${args.igUrl}` : "—"}
- TikTok : ${args.tt || "—"}
- YouTube : ${args.yt || "—"}
- Présentation CRM : ${args.talent.presentation?.trim() || "—"}
- Présentation EN : ${args.talent.presentationEn?.trim() || "—"}
- Bio CRM : ${args.talent.bio?.trim() || "—"}
- Collabs / clients connus : ${args.uniqueCollabs.length ? args.uniqueCollabs.join(", ") : "—"}

═══ INSTAGRAM RÉCUPÉRÉ (${args.ig.note}) ═══
- Nom affiché IG : ${args.ig.fullName || "—"}
- Bio Instagram : ${args.ig.biography || "—"}
Captions / posts récents :
${
  args.ig.captions.length
    ? args.ig.captions.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "(aucune caption — tu DOIS compenser via recherche web/X sur le profil)"
}`;
}

function buildPrompt(args: {
  brandName: string;
  strategyReason?: string;
  recommendedAngle?: string;
  projectBrief?: ProjectResearchBrief | null;
  talent: CrmTalent;
  ig: IgBundle;
}): string {
  const name = `${args.talent.prenom} ${args.talent.nom}`.trim();
  const handle = normalizeInstagramHandle(args.talent.instagram || "");
  const igUrl = handle ? `https://www.instagram.com/${handle}/` : "";
  const tt = String(args.talent.tiktok || "").trim();
  const yt = String(args.talent.youtube || "").trim();
  const uniqueCollabs = uniqueCollabLabels(args.talent);
  const crm = talentCrmBlock({
    talent: args.talent,
    ig: args.ig,
    name,
    handle,
    igUrl,
    tt,
    yt,
    uniqueCollabs,
  });

  const projectBrief = args.projectBrief;
  const isProject = Boolean(projectBrief);

  if (isProject && projectBrief) {
    return `Tu es un expert casting / influence. Ta mission : ALLER CHERCHER qui est ce créateur, analyser son profil public, et expliquer concrètement CE QU'IL FAIT — puis le fit avec **CE PROJET** auprès de la marque (pas un casting roster ouvert).

MARQUE CIBLE : ${args.brandName}
(Respecte l'orthographe exacte de cette marque — ne la confonds pas avec un homonyme à sonorité proche.)

═══ BRIEF PROJET (source de vérité pour le pitch) ═══
${formatProjectBriefForPrompt(projectBrief)}

${crm}

═══ RECHERCHE OBLIGATOIRE (outils web + X) ═══
Tu DOIS utiliser les outils de recherche pour investiguer le créateur. Cherche au minimum :
1) ${igUrl || `Instagram de ${name}`}
2) "${name}" influenceur / créateur / Instagram
${handle ? `3) @${handle} contenu / collabs` : ""}
${tt ? `4) TikTok ${tt}` : ""}
Objectif : comprendre son univers et ce qui justifie de le pitcher sur CE brief projet à ${args.brandName}.

═══ CE QUE TU DOIS PRODUIRE ═══
1) whoTheyAre — Qui c'est (identité, positionnement, vibe). Pas une bio marketing creuse.
2) whatTheyDo — CE QU'IL FAIT concrètement : types de posts, sujets, formats, ton.
3) profileAnalysis — Analyse du profil : esthétique, audience, forces, angle distinctif.
4) contentThemes — Thèmes récurrents, listés clairement.
5) whyRelevant — Pourquoi CE créateur + CE projet collent à ${args.brandName} maintenant (contenu × brief × marque). Appuie-toi sur raison strategy / angle / livrables.
6) proofPoints — Preuves factuelles courtes (séparées par « ; »).
7) sourcesUsed — Ex. « CRM ; Instagram scrapé ; web ; X ; brief projet ».

Règles strictes :
- N'invente RIEN. Si une info manque, dis-le.
- Priorise les faits observables + le brief projet sur les niches CRM génériques.
- Écris en français, concret, utile pour rédiger un mail de pitch PROJET.
- 3 à 5 phrases max par champ narratif (whoTheyAre / whatTheyDo / profileAnalysis / whyRelevant).

Réponds UNIQUEMENT en JSON strict :
{
  "whoTheyAre": "...",
  "whatTheyDo": "...",
  "profileAnalysis": "...",
  "contentThemes": "...",
  "whyRelevant": "...",
  "proofPoints": "...",
  "sourcesUsed": "..."
}
`;
  }

  return `Tu es un expert casting / influence. Ta mission : ALLER CHERCHER qui est ce créateur, analyser son profil public, et expliquer concrètement CE QU'IL FAIT — puis le fit avec la marque.

MARQUE CIBLE : ${args.brandName}
(Respecte l'orthographe exacte de cette marque — ne la confonds pas avec un homonyme à sonorité proche.)
${args.strategyReason?.trim() ? `Raison strategy (interne) : ${args.strategyReason.trim()}` : ""}
${args.recommendedAngle?.trim() ? `Angle recommandé (interne) : ${args.recommendedAngle.trim()}` : ""}

${crm}

═══ RECHERCHE OBLIGATOIRE (outils web + X) ═══
Tu DOIS utiliser les outils de recherche pour investiguer le créateur. Cherche au minimum :
1) ${igUrl || `Instagram de ${name}`}
2) "${name}" influenceur / créateur / Instagram
${handle ? `3) @${handle} contenu / collabs` : ""}
${tt ? `4) TikTok ${tt}` : ""}
Objectif de la recherche : comprendre son univers, son positionnement public, le type de contenu qu'il publie, son ton, ses collabs visibles, ce qui le caractérise AUJOURD'HUI.

═══ CE QUE TU DOIS PRODUIRE ═══
1) whoTheyAre — Qui c'est (identité, positionnement, vibe). Pas une bio marketing creuse.
2) whatTheyDo — CE QU'IL FAIT concrètement : types de posts, sujets récurrents, formats (Reels, UGC, grwm, haul, maman, beauté, etc.), ton de parole.
3) profileAnalysis — Analyse du profil : esthétique, audience probable, forces, angle distinctif. Appuie-toi sur bio IG + captions + web.
4) contentThemes — Thèmes récurrents, listés clairement.
5) whyRelevant — Pourquoi ce créateur colle à ${args.brandName} maintenant (contenu × marque).
6) proofPoints — Preuves factuelles courtes (séparées par « ; »).
7) sourcesUsed — Ex. « CRM ; Instagram scrapé ; web ; X ».

Règles strictes :
- N'invente RIEN. Si une info manque, dis-le.
- Priorise les faits observables (posts, bio, collabs, presse) sur les niches CRM génériques.
- Écris en français, concret, utile pour rédiger un mail de casting.
- 3 à 5 phrases max par champ narratif (whoTheyAre / whatTheyDo / profileAnalysis / whyRelevant).

Réponds UNIQUEMENT en JSON strict :
{
  "whoTheyAre": "...",
  "whatTheyDo": "...",
  "profileAnalysis": "...",
  "contentThemes": "...",
  "whyRelevant": "...",
  "proofPoints": "...",
  "sourcesUsed": "..."
}
`;
}

async function researchOneTalent(args: {
  brandName: string;
  strategyReason?: string;
  recommendedAngle?: string;
  projectBrief?: ProjectResearchBrief | null;
  talent: CrmTalent;
}): Promise<TalentResearchItem> {
  const name = `${args.talent.prenom} ${args.talent.nom}`.trim();
  const ig = await loadIgBundle(args.talent.instagram);

  const MAX_ATTEMPTS = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await xaiResponse(
        buildPrompt({
          brandName: args.brandName,
          strategyReason: args.strategyReason,
          recommendedAngle: args.recommendedAngle,
          projectBrief: args.projectBrief,
          talent: args.talent,
          ig,
        }),
        {
          tools: [...TALENT_RESEARCH_TOOLS],
          timeoutMs: 120_000,
        }
      );
      const parsed = tryParseTalentJson(text);
      return {
        talentId: args.talent.id,
        name,
        ...parsed,
        sourcesUsed: parsed.sourcesUsed || ig.note,
      };
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `x.ai talent-research (${name}) tentative ${attempt} échouée, relance :`,
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
        { error: "Accès réservé aux rôles Casting, Strategy ou Administrateur." },
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
    const strategyReason =
      typeof body?.strategyReason === "string" ? body.strategyReason.trim() : "";
    const recommendedAngle =
      typeof body?.recommendedAngle === "string"
        ? body.recommendedAngle.trim()
        : "";
    const projectBriefs = parseProjectBriefs(body?.projectBriefs);
    const projectBrief =
      projectBriefs.length >= 2 ? null : parseProjectBrief(body?.projectBrief);
    const rawIds = Array.isArray(body?.talentIds) ? body.talentIds : [];
    const talentIds = rawIds
      .map((id: unknown) => String(id || "").trim())
      .filter(Boolean)
      .slice(0, 8);

    if (!brandName || talentIds.length === 0) {
      return NextResponse.json(
        { error: "brandName et talentIds (1 à 8) sont requis." },
        { status: 400 }
      );
    }

    const crmList: CrmTalent[] = [];
    for (const id of talentIds) {
      const t = await loadCrmTalent(id);
      if (t) crmList.push(t);
    }
    if (crmList.length === 0) {
      return NextResponse.json(
        { error: "Aucun talent trouvé pour ces ids." },
        { status: 404 }
      );
    }

    const settled = await Promise.allSettled(
      crmList.map((talent) => {
        const briefForTalent = pickBriefForTalent(talent.id, {
          projectBrief,
          projectBriefs,
        });
        // Solo sans projectBrief structuré : on reconstruit depuis strategyReason.
        const fallbackBrief: ProjectResearchBrief | null =
          !briefForTalent && (strategyReason || recommendedAngle)
            ? {
                strategyReason: strategyReason || null,
                recommendedAngle: recommendedAngle || null,
                targetBrand: brandName,
              }
            : null;
        // Ne bascule en mode projet que si un vrai brief projet a été fourni.
        const useProjectMode = Boolean(projectBrief || projectBriefs.length > 0);
        return researchOneTalent({
          brandName,
          strategyReason: strategyReason || undefined,
          recommendedAngle: recommendedAngle || undefined,
          projectBrief: useProjectMode
            ? briefForTalent || fallbackBrief
            : null,
          talent,
        });
      })
    );

    const talents: TalentResearchItem[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") talents.push(r.value);
      else {
        console.error(
          `talent-research (${crmList[i]?.prenom} ${crmList[i]?.nom}):`,
          r.reason
        );
      }
    }

    if (talents.length === 0) {
      return NextResponse.json(
        {
          error:
            "L'analyse créateur n'a pas abouti (délai ou parse). Réessaie.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ talents });
  } catch (e) {
    console.error("POST /api/casting/talent-research:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de la recherche créateur." },
      { status: 500 }
    );
  }
}
