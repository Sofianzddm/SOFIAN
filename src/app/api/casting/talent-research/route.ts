import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { xaiResponse } from "@/lib/xai";
import { fetchInstagramProfileSnapshot } from "@/lib/instagram-import";
import { normalizeInstagramHandle } from "@/lib/social-links";

export const maxDuration = 300;

const ALLOWED_ROLES = ["CASTING_MANAGER", "STRATEGY_PLANNER", "ADMIN"] as const;

const RESEARCH_TOOLS = [{ type: "web_search" }, { type: "x_search" }] as const;

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

function asStr(v: unknown): string {
  return String(v ?? "").trim();
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

type CrmTalent = {
  id: string;
  prenom: string;
  nom: string;
  bio: string | null;
  presentation: string | null;
  presentationEn: string | null;
  niches: string[];
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  pays: string | null;
  ville: string | null;
  selectedClients: string[];
  collaborations: Array<{ marqueNom: string }>;
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

async function loadCrmTalent(talentId: string): Promise<CrmTalent | null> {
  const t = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      bio: true,
      presentation: true,
      presentationEn: true,
      niches: true,
      instagram: true,
      tiktok: true,
      youtube: true,
      pays: true,
      ville: true,
      selectedClients: true,
      stats: {
        select: {
          igFollowers: true,
          igEngagement: true,
          ttFollowers: true,
          ttEngagement: true,
        },
      },
      collaborations: {
        take: 12,
        orderBy: { createdAt: "desc" },
        select: { marque: { select: { nom: true } } },
      },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    prenom: t.prenom,
    nom: t.nom,
    bio: t.bio,
    presentation: t.presentation,
    presentationEn: t.presentationEn,
    niches: t.niches || [],
    instagram: t.instagram,
    tiktok: t.tiktok,
    youtube: t.youtube,
    pays: t.pays,
    ville: t.ville,
    selectedClients: t.selectedClients || [],
    collaborations: (t.collaborations || [])
      .map((c) => ({ marqueNom: String(c.marque?.nom || "").trim() }))
      .filter((c) => c.marqueNom),
    igFollowers: Number(t.stats?.igFollowers || 0),
    igEngagement: Number(t.stats?.igEngagement || 0),
    ttFollowers: Number(t.stats?.ttFollowers || 0),
    ttEngagement: Number(t.stats?.ttEngagement || 0),
  };
}

type IgBundle = {
  biography: string;
  fullName: string;
  followersCount?: number;
  captions: string[];
  note: string;
};

async function loadIgBundle(instagram: string | null): Promise<IgBundle> {
  const handle = normalizeInstagramHandle(instagram || "");
  if (!handle) {
    return {
      biography: "",
      fullName: "",
      captions: [],
      note: "pas de handle Instagram",
    };
  }
  if (!process.env.APIFY_TOKEN?.trim()) {
    return {
      biography: "",
      fullName: "",
      captions: [],
      note: "APIFY_TOKEN absente — IG non scrapé (web/X + CRM seulement)",
    };
  }
  try {
    const snap = await fetchInstagramProfileSnapshot(handle, 16, {
      timeoutMs: 50_000,
    });
    const captions = snap.captions.map((i) => i.caption).filter(Boolean);
    const parts = [
      captions.length ? `${captions.length} captions` : "0 caption",
      snap.biography ? "bio IG" : null,
      snap.followersCount ? `${snap.followersCount} followers scrapés` : null,
    ].filter(Boolean);
    return {
      biography: snap.biography || "",
      fullName: snap.fullName || "",
      followersCount: snap.followersCount,
      captions,
      note: parts.join(" · "),
    };
  } catch (e) {
    return {
      biography: "",
      fullName: "",
      captions: [],
      note: `Instagram indisponible (${e instanceof Error ? e.message : "erreur"})`,
    };
  }
}

function buildPrompt(args: {
  brandName: string;
  strategyReason?: string;
  recommendedAngle?: string;
  talent: CrmTalent;
  ig: IgBundle;
}): string {
  const name = `${args.talent.prenom} ${args.talent.nom}`.trim();
  const handle = normalizeInstagramHandle(args.talent.instagram || "");
  const igUrl = handle ? `https://www.instagram.com/${handle}/` : "";
  const tt = String(args.talent.tiktok || "").trim();
  const yt = String(args.talent.youtube || "").trim();
  const collabs = [
    ...args.talent.collaborations.map((c) => c.marqueNom),
    ...args.talent.selectedClients,
  ]
    .filter(Boolean)
    .slice(0, 14);
  const uniqueCollabs = Array.from(new Set(collabs));

  const statsBits = [
    args.talent.igFollowers > 0
      ? `IG ${args.talent.igFollowers.toLocaleString("fr-FR")} abonnés`
      : null,
    args.talent.igEngagement > 0
      ? `eng. IG ${args.talent.igEngagement}%`
      : null,
    args.talent.ttFollowers > 0
      ? `TT ${args.talent.ttFollowers.toLocaleString("fr-FR")} abonnés`
      : null,
    args.talent.ttEngagement > 0
      ? `eng. TT ${args.talent.ttEngagement}%`
      : null,
    args.ig.followersCount
      ? `followers IG scrapés ${args.ig.followersCount.toLocaleString("fr-FR")}`
      : null,
  ].filter(Boolean);

  return `Tu es un expert casting / influence. Ta mission : ALLER CHERCHER qui est ce créateur, analyser son profil public, et expliquer concrètement CE QU'IL FAIT — puis le fit avec la marque.

MARQUE CIBLE : ${args.brandName}
${args.strategyReason?.trim() ? `Raison strategy (interne) : ${args.strategyReason.trim()}` : ""}
${args.recommendedAngle?.trim() ? `Angle recommandé (interne) : ${args.recommendedAngle.trim()}` : ""}

═══ CRÉATEUR — FICHE CRM GLOW UP ═══
- Nom : ${name}
- Niches CRM : ${(args.talent.niches || []).join(", ") || "—"}
- Ville / pays : ${[args.talent.ville, args.talent.pays].filter(Boolean).join(", ") || "—"}
- Stats CRM : ${statsBits.length ? statsBits.join(" · ") : "—"}
- Instagram : ${handle ? `@${handle} — ${igUrl}` : "—"}
- TikTok : ${tt || "—"}
- YouTube : ${yt || "—"}
- Présentation CRM : ${args.talent.presentation?.trim() || "—"}
- Présentation EN : ${args.talent.presentationEn?.trim() || "—"}
- Bio CRM : ${args.talent.bio?.trim() || "—"}
- Collabs / clients connus : ${uniqueCollabs.length ? uniqueCollabs.join(", ") : "—"}

═══ INSTAGRAM RÉCUPÉRÉ (${args.ig.note}) ═══
- Nom affiché IG : ${args.ig.fullName || "—"}
- Bio Instagram : ${args.ig.biography || "—"}
Captions / posts récents :
${
  args.ig.captions.length
    ? args.ig.captions.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "(aucune caption — tu DOIS compenser via recherche web/X sur le profil)"
}

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
          talent: args.talent,
          ig,
        }),
        {
          tools: [...RESEARCH_TOOLS],
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
    const rawIds = Array.isArray(body?.talentIds) ? body.talentIds : [];
    const talentIds = rawIds
      .map((id: unknown) => String(id || "").trim())
      .filter(Boolean)
      // Roster casting : on accepte jusqu'à 8 analyses en parallèle (test).
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
      crmList.map((talent) =>
        researchOneTalent({
          brandName,
          strategyReason: strategyReason || undefined,
          recommendedAngle: recommendedAngle || undefined,
          talent,
        })
      )
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
