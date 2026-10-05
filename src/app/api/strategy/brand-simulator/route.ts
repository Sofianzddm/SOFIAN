import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { xaiResponse } from "@/lib/xai";
import { normalizeInstagramHandle } from "@/lib/social-links";
import {
  TALENT_RESEARCH_TOOLS,
  asStr,
  formatTalentStatsBits,
  loadCrmTalent,
  loadIgBundle,
  nichesToSecteurs,
  uniqueCollabLabels,
  type CrmTalent,
  type IgBundle,
} from "@/lib/talent-research-core";

export const maxDuration = 300;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_SALES",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export type BrandSimulatorProfile = {
  whoTheyAre: string;
  whatTheyDo: string;
  profileAnalysis: string;
  contentThemes: string;
  proofPoints: string;
  sourcesUsed: string;
  brandUniverseHints: string;
};

export type BrandSimulatorBrand = {
  marqueId: string | null;
  nom: string;
  secteur: string | null;
  fitScore: number;
  whyFit: string;
  suggestedAngle: string;
  inCrm: boolean;
  alreadyContacted: boolean;
};

type CandidateMarque = {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  notes: string | null;
  contactCount: number;
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
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("parse");
}

function buildProfilePrompt(talent: CrmTalent, ig: IgBundle): string {
  const name = `${talent.prenom} ${talent.nom}`.trim();
  const handle = normalizeInstagramHandle(talent.instagram || "");
  const igUrl = handle ? `https://www.instagram.com/${handle}/` : "";
  const tt = String(talent.tiktok || "").trim();
  const yt = String(talent.youtube || "").trim();
  const uniqueCollabs = uniqueCollabLabels(talent);

  return `Tu es un expert casting / influence. Ta mission : ALLER CHERCHER qui est ce créateur et analyser son profil public — SANS marque cible. On utilisera ensuite cette analyse pour trouver des marques pertinentes.

═══ CRÉATEUR — FICHE CRM GLOW UP ═══
- Nom : ${name}
- Niches CRM : ${(talent.niches || []).join(", ") || "—"}
- Ville / pays : ${[talent.ville, talent.pays].filter(Boolean).join(", ") || "—"}
- Stats CRM : ${formatTalentStatsBits(talent, ig)}
- Instagram : ${handle ? `@${handle} — ${igUrl}` : "—"}
- TikTok : ${tt || "—"}
- YouTube : ${yt || "—"}
- Présentation CRM : ${talent.presentation?.trim() || "—"}
- Présentation EN : ${talent.presentationEn?.trim() || "—"}
- Bio CRM : ${talent.bio?.trim() || "—"}
- Collabs / clients connus : ${uniqueCollabs.length ? uniqueCollabs.join(", ") : "—"}

═══ INSTAGRAM RÉCUPÉRÉ (${ig.note}) ═══
- Nom affiché IG : ${ig.fullName || "—"}
- Bio Instagram : ${ig.biography || "—"}
Captions / posts récents :
${
  ig.captions.length
    ? ig.captions.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "(aucune caption — tu DOIS compenser via recherche web/X sur le profil)"
}

═══ RECHERCHE OBLIGATOIRE (outils web + X) ═══
Tu DOIS utiliser les outils de recherche pour investiguer le créateur. Cherche au minimum :
1) ${igUrl || `Instagram de ${name}`}
2) "${name}" influenceur / créateur / Instagram
${handle ? `3) @${handle} contenu / collabs` : ""}
${tt ? `4) TikTok ${tt}` : ""}
Objectif : comprendre son univers, positionnement, formats, ton, collabs visibles, audience probable.

═══ CE QUE TU DOIS PRODUIRE ═══
1) whoTheyAre — Qui c'est (identité, positionnement, vibe).
2) whatTheyDo — CE QU'IL FAIT concrètement (formats, sujets, ton).
3) profileAnalysis — Esthétique, audience probable, forces, angle distinctif.
4) contentThemes — Thèmes récurrents.
5) proofPoints — Preuves factuelles courtes (séparées par « ; »).
6) sourcesUsed — Ex. « CRM ; Instagram scrapé ; web ; X ».
7) brandUniverseHints — 1-2 phrases : quels UNIVERS de marques colleraient naturellement (secteurs + types de marques), sans lister 20 noms.

Règles : n'invente rien ; français ; concret ; 3-5 phrases max par champ narratif.

Réponds UNIQUEMENT en JSON strict :
{
  "whoTheyAre": "...",
  "whatTheyDo": "...",
  "profileAnalysis": "...",
  "contentThemes": "...",
  "proofPoints": "...",
  "sourcesUsed": "...",
  "brandUniverseHints": "..."
}
`;
}

async function researchProfile(
  talent: CrmTalent
): Promise<{ profile: BrandSimulatorProfile; ig: IgBundle }> {
  const ig = await loadIgBundle(talent.instagram);
  const name = `${talent.prenom} ${talent.nom}`.trim();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await xaiResponse(buildProfilePrompt(talent, ig), {
        tools: [...TALENT_RESEARCH_TOOLS],
        timeoutMs: 120_000,
      });
      const o = tryParseJsonObject(text);
      return {
        ig,
        profile: {
          whoTheyAre: asStr(o.whoTheyAre),
          whatTheyDo: asStr(o.whatTheyDo) || asStr(o.contentThemes),
          profileAnalysis:
            asStr(o.profileAnalysis) || asStr(o.contentThemes),
          contentThemes: asStr(o.contentThemes),
          proofPoints: asStr(o.proofPoints),
          sourcesUsed: asStr(o.sourcesUsed) || ig.note,
          brandUniverseHints: asStr(o.brandUniverseHints),
        },
      };
    } catch (e) {
      lastError = e;
      console.warn(
        `brand-simulator profile (${name}) tentative ${attempt}:`,
        e instanceof Error ? e.message : e
      );
    }
  }
  throw lastError;
}

async function loadCandidateMarques(
  talent: CrmTalent,
  contactedKeys: Set<string>
): Promise<CandidateMarque[]> {
  const secteurs = nichesToSecteurs(talent.niches);
  const bySecteur = await prisma.marque.findMany({
    where: {
      parentMarqueId: null,
      OR: secteurs.map((s) => ({
        secteur: { equals: s, mode: "insensitive" as const },
      })),
    },
    select: {
      id: true,
      nom: true,
      secteur: true,
      siteWeb: true,
      notes: true,
      _count: { select: { contacts: true } },
    },
    orderBy: { nom: "asc" },
    take: 80,
  });

  const active = await prisma.marque.findMany({
    where: { parentMarqueId: null },
    select: {
      id: true,
      nom: true,
      secteur: true,
      siteWeb: true,
      notes: true,
      _count: { select: { contacts: true } },
    },
    orderBy: { contacts: { _count: "desc" } },
    take: 60,
  });

  const map = new Map<string, CandidateMarque>();
  for (const m of [...bySecteur, ...active]) {
    if (map.has(m.id)) continue;
    map.set(m.id, {
      id: m.id,
      nom: m.nom,
      secteur: m.secteur,
      siteWeb: m.siteWeb,
      notes: m.notes ? String(m.notes).slice(0, 120) : null,
      contactCount: m._count.contacts,
    });
  }

  // Prioriser : secteur match + pas déjà contacté + contacts CRM.
  const list = Array.from(map.values()).sort((a, b) => {
    const aSect = a.secteur && secteurs.some((s) => s.toLowerCase() === a.secteur!.toLowerCase()) ? 1 : 0;
    const bSect = b.secteur && secteurs.some((s) => s.toLowerCase() === b.secteur!.toLowerCase()) ? 1 : 0;
    if (aSect !== bSect) return bSect - aSect;
    const aHit = contactedKeys.has(a.nom.toLowerCase()) ? 0 : 1;
    const bHit = contactedKeys.has(b.nom.toLowerCase()) ? 0 : 1;
    if (aHit !== bHit) return bHit - aHit;
    return b.contactCount - a.contactCount;
  });

  return list.slice(0, 100);
}

function buildMatchPrompt(args: {
  talent: CrmTalent;
  profile: BrandSimulatorProfile;
  candidates: CandidateMarque[];
  contactedLabels: string[];
  limit: number;
}): string {
  const name = `${args.talent.prenom} ${args.talent.nom}`.trim();
  const catalogue = args.candidates
    .map(
      (m, i) =>
        `${i + 1}. [${m.id}] ${m.nom} | secteur=${m.secteur || "?"} | contacts=${m.contactCount}${
          m.siteWeb ? ` | ${m.siteWeb}` : ""
        }`
    )
    .join("\n");

  return `Tu es un strategy planner influence FR/EU ultra exigeant. Ta mission : TROUVER LES MEILLEURES MARQUES AU MONDE qui fitent GRAVE avec ce créateur — pas te limiter à un catalogue interne.

═══ CRÉATEUR ═══
- Nom : ${name}
- Niches CRM : ${(args.talent.niches || []).join(", ") || "—"}
- Collabs connues : ${uniqueCollabLabels(args.talent).join(", ") || "—"}

═══ ANALYSE PROFIL (source de vérité) ═══
- Qui : ${args.profile.whoTheyAre}
- Ce qu'il/elle fait : ${args.profile.whatTheyDo}
- Analyse : ${args.profile.profileAnalysis}
- Thèmes : ${args.profile.contentThemes}
- Preuves : ${args.profile.proofPoints}
- Univers marques suggéré : ${args.profile.brandUniverseHints || "—"}

═══ DÉJÀ CONTACTÉ(S) RÉCEMMENT (à éviter sauf fit exceptionnel) ═══
${args.contactedLabels.length ? args.contactedLabels.join(", ") : "(aucun)"}

═══ RECHERCHE OBLIGATOIRE (outils web + X) ═══
Tu DOIS chercher activement des marques pertinentes. Exemples de recherches à lancer :
1) marques / brands qui collabent avec des créateurs "${args.profile.contentThemes || args.talent.niches.join(", ") || "similaires"}"
2) "${name}" collab marque OR partnership OR sponsored
3) best brand fits for [thèmes du créateur] influencers France / Europe 2024 2025
4) marques actives en influence sur les thèmes du créateur (pas seulement les géants évidents)
Utilise aussi X pour voir quelles marques recrutent ce type de profils.

═══ CATALOGUE CRM (aide secondaire UNIQUEMENT) ═══
Ce n'est PAS une liste à laquelle tu dois te limiter. C'est juste pour rattacher un id si une marque que TU as choisie y figure déjà.
${catalogue || "(vide)"}

═══ MISSION ═══
Renvoie exactement ${args.limit} marques TRIÉES du MEILLEUR fit au moins bon.

Règles STRICTES :
1) Priorité ABSOLUE : pertinence réelle contenu × univers marque. Fit "grave" seulement.
2) NE TE LIMITE PAS au catalogue CRM. La majorité des suggestions PEUT (et DOIT souvent) venir de ta recherche web/X.
3) Inclus un mix : marques premium / mid / challengers FR-EU qui font vraiment de l'influence — pas 12 géants génériques.
4) Si une marque choisie est dans le catalogue CRM → marqueId = id entre crochets, inCrm = true. Sinon marqueId = null, inCrm = false.
5) Évite les collabs déjà connues du créateur (sauf angle clairement nouveau).
6) Évite les déjà contactés (sauf fit exceptionnel : score ≤ 65 + le dire dans whyFit).
7) whyFit : 1-2 phrases concrètes (quoi dans le contenu × quoi dans la marque).
8) suggestedAngle : angle pitch court et actionnable.
9) fitScore 0–100, exigeant : 90+ = excellent match, 75–89 = très fort, <70 = seulement si vraiment utile.
10) INTERDIT de remplir avec des marques CRM "parce qu'elles sont là" si le fit est moyen.

Réponds UNIQUEMENT en JSON strict :
{
  "brands": [
    {
      "marqueId": "id_crm_ou_null",
      "nom": "Nom marque",
      "secteur": "Beauté|Mode|Food|Tech|Sport|Lifestyle|Luxe|Automobile|Finance|Santé|Voyage|Entertainment",
      "fitScore": 88,
      "whyFit": "...",
      "suggestedAngle": "...",
      "inCrm": false
    }
  ]
}
`;
}

async function resolveBrandsAgainstCrm(
  brands: BrandSimulatorBrand[]
): Promise<BrandSimulatorBrand[]> {
  if (brands.length === 0) return brands;
  const names = brands.map((b) => b.nom).filter(Boolean);
  const crmRows = await prisma.marque.findMany({
    where: {
      OR: [
        ...names.map((n) => ({
          nom: { equals: n, mode: "insensitive" as const },
        })),
        {
          aliases: {
            some: {
              OR: names.map((n) => ({
                label: { equals: n, mode: "insensitive" as const },
              })),
            },
          },
        },
      ],
    },
    select: {
      id: true,
      nom: true,
      secteur: true,
      aliases: { select: { label: true }, take: 8 },
    },
    take: 80,
  });

  const byKey = new Map<string, { id: string; nom: string; secteur: string | null }>();
  for (const m of crmRows) {
    byKey.set(m.nom.trim().toLowerCase(), {
      id: m.id,
      nom: m.nom,
      secteur: m.secteur,
    });
    for (const a of m.aliases || []) {
      const lab = String(a.label || "").trim().toLowerCase();
      if (lab) {
        byKey.set(lab, { id: m.id, nom: m.nom, secteur: m.secteur });
      }
    }
  }

  return brands.map((b) => {
    if (b.marqueId) return b;
    const hit = byKey.get(b.nom.trim().toLowerCase());
    if (!hit) return b;
    return {
      ...b,
      marqueId: hit.id,
      nom: hit.nom,
      secteur: hit.secteur || b.secteur,
      inCrm: true,
    };
  });
}

function parseBrands(
  raw: string,
  candidates: CandidateMarque[],
  contactedKeys: Set<string>,
  limit: number
): BrandSimulatorBrand[] {
  const o = tryParseJsonObject(raw);
  const arr = Array.isArray(o.brands) ? o.brands : [];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const byNom = new Map(
    candidates.map((c) => [c.nom.trim().toLowerCase(), c])
  );

  const out: BrandSimulatorBrand[] = [];
  const seen = new Set<string>();

  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    let nom = asStr(r.nom);
    if (!nom) continue;
    let marqueId =
      r.marqueId === null || r.marqueId === "null"
        ? null
        : asStr(r.marqueId) || null;
    let secteur = asStr(r.secteur) || null;
    let inCrm = false;

    if (marqueId && byId.has(marqueId)) {
      const c = byId.get(marqueId)!;
      nom = c.nom;
      secteur = c.secteur || secteur;
      inCrm = true;
    } else {
      const hit = byNom.get(nom.toLowerCase());
      if (hit) {
        marqueId = hit.id;
        nom = hit.nom;
        secteur = hit.secteur || secteur;
        inCrm = true;
      } else {
        // Hors candidats préfiltrés : on laissera resolveBrandsAgainstCrm rattacher.
        marqueId = null;
        inCrm = false;
      }
    }

    const key = nom.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let fitScore = Number(r.fitScore);
    if (!Number.isFinite(fitScore)) fitScore = 50;
    fitScore = Math.max(0, Math.min(100, Math.round(fitScore)));

    out.push({
      marqueId,
      nom,
      secteur,
      fitScore,
      whyFit: asStr(r.whyFit) || "Fit non précisé.",
      suggestedAngle: asStr(r.suggestedAngle),
      inCrm,
      alreadyContacted: contactedKeys.has(key),
    });
    if (out.length >= limit) break;
  }

  return out.sort((a, b) => b.fitScore - a.fitScore);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé Strategy / Casting / Admin." },
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
    const talentId =
      typeof body?.talentId === "string" ? body.talentId.trim() : "";
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(5, Math.min(20, Math.round(limitRaw)))
      : 12;

    if (!talentId) {
      return NextResponse.json({ error: "talentId requis." }, { status: 400 });
    }

    const talent = await loadCrmTalent(talentId);
    if (!talent) {
      return NextResponse.json({ error: "Talent introuvable." }, { status: 404 });
    }

    // Historique contacts casting indiv (90 j) pour flagger.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const history = await prisma.contactMission.findMany({
      where: {
        talentId,
        sentAt: { gte: since },
      },
      select: {
        targetBrand: true,
        marque: { select: { nom: true } },
      },
      take: 80,
    });
    const contactedLabels = Array.from(
      new Set(
        history
          .map((h) => String(h.marque?.nom || h.targetBrand || "").trim())
          .filter(Boolean)
      )
    );
    const contactedKeys = new Set(
      contactedLabels.map((n) => n.toLowerCase())
    );

    const { profile, ig } = await researchProfile(talent);
    const candidates = await loadCandidateMarques(talent, contactedKeys);

    let brands: BrandSimulatorBrand[] = [];
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await xaiResponse(
          buildMatchPrompt({
            talent,
            profile,
            candidates,
            contactedLabels,
            limit,
          }),
          {
            tools: [...TALENT_RESEARCH_TOOLS],
            timeoutMs: 120_000,
          }
        );
        brands = parseBrands(text, candidates, contactedKeys, limit);
        if (brands.length > 0) {
          brands = await resolveBrandsAgainstCrm(brands);
          break;
        }
        throw new Error("empty brands");
      } catch (e) {
        lastError = e;
        console.warn(
          `brand-simulator match tentative ${attempt}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    if (brands.length === 0) {
      console.error("brand-simulator match failed:", lastError);
      return NextResponse.json(
        {
          error:
            "Le matching marques n'a pas abouti. Réessaie dans un instant.",
          profile,
          talent: {
            id: talent.id,
            name: `${talent.prenom} ${talent.nom}`.trim(),
            niches: talent.niches,
            photo: null,
          },
          brands: [],
        },
        { status: 502 }
      );
    }

    const photoRow = await prisma.talent.findUnique({
      where: { id: talent.id },
      select: { photo: true },
    });

    return NextResponse.json({
      talent: {
        id: talent.id,
        name: `${talent.prenom} ${talent.nom}`.trim(),
        niches: talent.niches,
        photo: photoRow?.photo || null,
        instagram: talent.instagram,
        igNote: ig.note,
      },
      profile,
      brands,
      meta: {
        candidateCount: candidates.length,
        secteurs: nichesToSecteurs(talent.niches),
        contactedCount: contactedLabels.length,
      },
    });
  } catch (e) {
    console.error("POST /api/strategy/brand-simulator:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors du simulateur marque." },
      { status: 500 }
    );
  }
}
