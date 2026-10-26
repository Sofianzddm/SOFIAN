import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { xaiResponse } from "@/lib/xai";
import { normalizeInstagramHandle } from "@/lib/social-links";
import {
  TALENT_RESEARCH_TOOLS,
  asStr,
  formatFullTalentFicheBlock,
  formatTalentLifestyleBlock,
  formatTalentStatsBits,
  loadCrmTalent,
  loadIgBundle,
  talentToSecteurs,
  uniqueCollabLabels,
  type CrmTalent,
  type IgBundle,
} from "@/lib/talent-research-core";

const MOMENT_CONTEXT_MAX = 500;

function normalizeMomentContext(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MOMENT_CONTEXT_MAX);
}

function formatOverrideMomentBlock(momentContext: string): string {
  if (!momentContext) return "";
  return `
═══ OVERRIDE STRATEGY (optionnel — priorité si fourni) ═══
Le planner a ajouté ce contexte en plus de la fiche :
« ${momentContext} »
Traite-le comme signal #1 SI cohérent avec la fiche / IG / web. Sinon ignore-le.
`;
}

function formatDetectedMomentsBlock(
  detectedMoments: string,
  ownedCategories: string[] = []
): string {
  if (!detectedMoments.trim()) return "";
  const ownedBlock =
    ownedCategories.length > 0
      ? `
═══ MARQUE(S) DU TALENT — CONCURRENCE INTERDITE ═══
Ce créateur EST fondateur / owner dans : ${ownedCategories.join(", ")}.
→ NE JAMAIS proposer de marques concurrentes dans ces catégories.
→ Ex. fondatrice swimwear / maillots → ZÉRO autre marque de maillots / bikini / swimwear / beachwear concurrent.
→ Cherche des ADJACENTS qui COMPLÈTENT sa marque : bijoux, skincare, travel, tech vlog, beauty prestige, hotels, lingerie soft, activewear pilates, nutrition glow…
`
      : "";
  return `
═══ MOMENTS DÉTECTÉS AUTO (PRIORITÉ ABSOLUE — #1) ═══
${detectedMoments}
${ownedBlock}
RÈGLE D'OR : ces moments pilotent TOUT le matching.
- Fondatrice d'une catégorie → ADJACENTS crédibles, pas concurrents.
- Ironman / Hyrox → endurance seulement si explicite.
- Sports fiche = secondaires.
- PRIVILÉGIE des marques CONNUES / actives en influence FR-EU (pas des micro-marques inconnues).
`;
}

/** Catégories où le talent est fondateur → on exclut les concurrents. */
function detectOwnedBrandCategories(
  moments: string,
  extras: string = ""
): string[] {
  const blob = `${moments} ${extras}`.toLowerCase();
  const cats: string[] = [];
  const isFounder =
    /fondatrice|fondateur|founder|sa marque|ma marque|crée (activement )?sa marque|d[eé]veloppe (activement )?sa marque|owner of|co-?fond/i.test(
      blob
    );
  if (!isFounder && !/girlstrip\.swim|@girlstrip/i.test(blob)) return cats;

  if (
    /swimwear|maillot|bikini|girlstrip|\.swim\b|beachwear|swim wear/i.test(blob)
  ) {
    cats.push("swimwear");
  }
  if (/skincare|cosm[eé]tique|beauty brand|marque de soin/i.test(blob) && isFounder) {
    cats.push("skincare");
  }
  if (/bijou|jewelry|jewellery/i.test(blob) && isFounder) {
    cats.push("bijoux");
  }
  return cats;
}

function cleanSocialHandle(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, "")
    .replace(/\/+$/, "")
    .replace(/[?#].*$/, "")
    .trim();
}

type SearchSeedMode = "endurance" | "fashion_beauty" | "wellness" | "general";

/**
 * Seeds de recherche dérivés d'abord des MOMENTS, pas de toute la fiche sports.
 * Évite Lola Fayada (Girlstrip Swim / skincare) → Zone3 / Van Rysel.
 */
function extractSearchSeeds(
  moments: string,
  sports: string[],
  themes: string,
  niches: string[] = [],
  ownedCategories: string[] = []
): { seeds: string[]; mode: SearchSeedMode } {
  const momentBlob = moments.toLowerCase();
  const themeBlob = `${themes} ${niches.join(" ")}`.toLowerCase();
  const ownsSwim = ownedCategories.includes("swimwear");
  const seeds: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !seeds.some((x) => x.toLowerCase() === t.toLowerCase())) {
      seeds.push(t);
    }
  };

  // ── Endurance / compétition : UNIQUEMENT si explicite dans les moments ──
  const enduranceInMoments =
    /iron\s*-?\s*man|ironman|triathlon|hyrox|marathon|semi[- ]?marathon|ultra[- ]?trail|compétition (running|vélo)/i.test(
      momentBlob
    );

  if (enduranceInMoments) {
    if (/iron\s*-?\s*man|ironman|triathlon/.test(momentBlob)) {
      push("Ironman");
      push("triathlon");
    }
    if (/hyrox/.test(momentBlob)) push("Hyrox");
    if (/marathon|semi[- ]?marathon/.test(momentBlob)) push("marathon");
    if (/trail|ultra/.test(momentBlob)) push("trail running");
    return { seeds: seeds.slice(0, 8), mode: "endurance" };
  }

  // ── Fashion / beauté / modeling (priorité moments) ──
  const fashionBeauty =
    /swimwear|maillot|girlstrip|\bswim\b(?!\s*bike)|fondatrice|marque (de )?(mode|swim|maillot)|modeling|mannequin|shooting|fashion|skincare|psoriasis|peau sensible|beauté|beauty|luxe|cartier|grwm|glow ?up/i.test(
      momentBlob
    ) ||
    /fashion|beauty|beauté|mode|swimwear|skincare/i.test(themeBlob);

  if (fashionBeauty) {
    // Fondatrice swimwear → ADJACENTS uniquement (jamais d'autres maillots)
    if (ownsSwim) {
      push("bijoux fashion collab influence");
      push("skincare prestige peau sensible");
      push("hotels resorts girls trips");
      push("beauty makeup prestige influence FR");
      push("tech vlog travel créateur");
      push("activewear pilates premium");
      push("nutrition glow healthy lifestyle");
    } else if (/swimwear|maillot|girlstrip|\bswim\b/i.test(momentBlob)) {
      // Contenu swim mais PAS fondatrice → swim OK en appoint
      push("resortwear premium");
      push("bijoux beach fashion");
    }
    if (/skincare|psoriasis|peau|beauté|beauty/i.test(momentBlob)) {
      push("skincare peau sensible connue");
      push("dermocosmétique France influence");
    }
    if (/modeling|mannequin|shooting|millanova|como/i.test(momentBlob)) {
      push("marques mode mid-luxe connues");
      push("fashion collab influence France");
    }
    if (/youtube|vlog|dji|osmo|content creator/i.test(momentBlob)) {
      push("tech créateur contenu connue");
      push("caméras vlog DJI Insta360");
    }
    if (/pilates|healthy|nutrition|protéine/i.test(momentBlob)) {
      push("activewear pilates Lululemon Varley");
      push("nutrition healthy connue");
    }
    if (/luxe|cartier|manifestation|girls trip|bali|villa/i.test(momentBlob)) {
      push("travel luxury hotels resorts");
      push("marques luxe lifestyle influence");
    }
    if (/pilates/i.test(momentBlob)) push("Pilates");
    return {
      seeds: seeds.slice(0, 8),
      mode: "fashion_beauty",
    };
  }

  // ── Wellness soft ──
  if (/pilates|yoga|wellness|healthy/i.test(momentBlob)) {
    push("wellness");
    if (/pilates/i.test(momentBlob)) push("Pilates");
    if (/yoga/i.test(momentBlob)) push("yoga");
    return { seeds: seeds.slice(0, 6), mode: "wellness" };
  }

  for (const n of niches.slice(0, 4)) push(n);
  if (/beauté|beauty|skincare|mode|fashion/i.test(themeBlob)) {
    push("beauté influence France");
    push("mode lifestyle niches");
    return { seeds: seeds.slice(0, 8), mode: "fashion_beauty" };
  }
  for (const s of sports.slice(0, 2)) push(s);
  return { seeds: seeds.slice(0, 8), mode: "general" };
}

/** @deprecated alias — utilise extractSearchSeeds */
function extractEventSearchSeeds(
  moments: string,
  sports: string[],
  themes: string
): string[] {
  return extractSearchSeeds(moments, sports, themes).seeds;
}

function nicheExampleQueries(
  mode: SearchSeedMode,
  seeds: string[],
  ownedCategories: string[] = []
): string[] {
  if (mode === "endurance") {
    return [
      "Van Rysel OR Kiprun OR Zone3 OR Maurten",
      "Biotherm Hyrox partnership",
      ...seeds.slice(0, 3).map((s) => `"${s}" partenaires officiels`),
    ];
  }
  if (mode === "fashion_beauty") {
    if (ownedCategories.includes("swimwear")) {
      return [
        "bijoux fashion Zag Gas Bijoux Atelier influence collab",
        "skincare prestige La Roche-Posay Avène Caudalie peau sensible",
        "beauty YSL Rare Beauty Gisou Charlotte Tilbury influence FR",
        "travel hotels resorts Mr Mrs Smith Accor girls trips",
        "tech vlog DJI Insta360 créateur",
        "activewear pilates Lululemon Alo Varley",
        "INTERDIT autres marques maillots / swimwear concurrents",
      ];
    }
    return [
      ...seeds.slice(0, 4).map((s) => `marques connues ${s} influence France`),
      "skincare prestige OR dermocosmétique influence",
      "mode mid-luxe OR beauty prestige collab créatrices FR",
    ];
  }
  if (mode === "wellness") {
    return [
      "marques pilates yoga wellness connues influence France",
      "nutrition healthy lifestyle",
      ...seeds.slice(0, 2).map((s) => `marques ${s} collab créateur`),
    ];
  }
  return seeds.slice(0, 4).map((s) => `marques connues ${s} France Europe`);
}

export const maxDuration = 300;

const ALLOWED_ROLES = ["ADMIN"] as const;

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
  /** Moments de vie / projets détectés auto (fiche + IG + web). */
  detectedMoments: string;
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
  alreadyWorkedWith: boolean;
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

function buildProfilePrompt(
  talent: CrmTalent,
  ig: IgBundle,
  momentOverride: string
): string {
  const name = `${talent.prenom} ${talent.nom}`.trim();
  const handle = normalizeInstagramHandle(talent.instagram || "");
  const igUrl = handle ? `https://www.instagram.com/${handle}/` : "";
  const tt = String(talent.tiktok || "").trim();
  const yt = String(talent.youtube || "").trim();
  const fiche = formatFullTalentFicheBlock(talent);
  const overrideBlock = formatOverrideMomentBlock(momentOverride);
  const hashtagLine = ig.topHashtags.length
    ? ig.topHashtags.slice(0, 20).join(" ")
    : "—";
  const mentionLine = ig.topMentions.length
    ? ig.topMentions.slice(0, 20).join(" ")
    : "—";

  return `Tu es un expert casting / influence ULTRA poussé. Ta mission : analyser CE créateur AU COMPLET (fiche CRM + scrape Apify IG/TikTok + web) pour ensuite matcher des marques niches ultra-pertinentes.

Tu ne te contentes PAS des niches génériques. Tu DOIS miner les captions scrapées (Apify), hashtags, @mentions (souvent des marques), notes internes, et le web pour extraire les moments de vie / projets en cours.

═══ FICHE TALENT CRM COMPLÈTE (source #1 — LIS TOUT) ═══
${fiche}

═══ STATS / PERF CRM ═══
${formatTalentStatsBits(talent, ig)}
${overrideBlock}
═══ INSTAGRAM SCRAPÉ APIFY (${ig.note}) — SOURCE #2, LIS TOUTES LES CAPTIONS ═══
- Nom affiché IG : ${ig.fullName || "—"}
- Bio Instagram : ${ig.biography || "—"}
- Lien bio : ${ig.externalUrl || "—"}
- Followers scrapés : ${ig.followersCount ?? "—"}
- Hashtags fréquents : ${hashtagLine}
- @mentions fréquents (marques / collabs potentielles) : ${mentionLine}
Captions / posts récents (${ig.captions.length}) — mine-les pour moments, sports, produits, collabs :
${
  ig.captions.length
    ? ig.captions.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "(aucune caption Apify — tu DOIS compenser via recherche web/X sur le profil)"
}

═══ TIKTOK SCRAPÉ APIFY ═══
${
  ig.tiktokCaptions.length
    ? ig.tiktokCaptions.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "(pas de captions TikTok scrapées)"
}

═══ RECHERCHE OBLIGATOIRE (outils web + X) — VA LOIN ═══
Tu DOIS utiliser les outils. Cherche au minimum :
1) ${igUrl || `Instagram de ${name}`}
2) "${name}" influenceur / créateur / Instagram / collab / sponsored
${handle ? `3) @${handle} contenu / projets / training / Iron Man / course / grossesse / etc.` : ""}
${tt ? `4) TikTok ${tt}` : ""}
${yt ? `5) YouTube ${yt}` : ""}
${
  talent.sports.length
    ? `6) "${name}" ${talent.sports.join(" ")} / compétition / course / training`
    : ""
}
7) articles / interviews / podcasts récents sur ${name}
8) pour chaque @mention / marque récurrente dans les captions : vérifier si collab réelle
9) X : "${name}" OR @${handle || "handle"} marque OR collab OR partenaire

Objectif : qui c'est, ce qu'il/elle fait, ET les moments de vie ACTUELS (compétition, grossesse, déménagement, lancement, parentalité, voyage, rehab, etc.) visibles dans notes internes, bio, captions Apify, web.

═══ CE QUE TU DOIS PRODUIRE ═══
1) whoTheyAre — Qui c'est.
2) whatTheyDo — Ce qu'il/elle fait concrètement + projets en cours.
3) profileAnalysis — Esthétique, audience, forces, angle distinctif.
4) contentThemes — Thèmes récurrents.
5) detectedMoments — OBLIGATOIRE. Liste les moments / projets ACTUELS détectés (séparés par « ; »). Ex. « Prépare Iron Man Nice 2026 ; training triathlon intensif ; collab running récente ». Si rien de clair : moments lifestyle durables issus de la fiche (ex. « Maman 2 enfants ; chien ; peau sensible »). N'invente rien.
6) proofPoints — Preuves factuelles courtes (séparées par « ; »).
7) sourcesUsed — Ex. « fiche CRM ; notes internes ; Instagram ; web ».
8) brandUniverseHints — Univers marques ULTRA précis. Si le talent EST fondateur d'une marque (ex. Girlstrip Swim), propose des ADJACENTS (bijoux, skincare, travel, tech, beauty) — JAMAIS des concurrents de sa catégorie. Privilégie des marques connues / actives en influence.

Règles : n'invente rien ; français ; concret ; 3-5 phrases max par champ narratif (sauf detectedMoments = liste courte).

Réponds UNIQUEMENT en JSON strict :
{
  "whoTheyAre": "...",
  "whatTheyDo": "...",
  "profileAnalysis": "...",
  "contentThemes": "...",
  "detectedMoments": "...",
  "proofPoints": "...",
  "sourcesUsed": "...",
  "brandUniverseHints": "..."
}
`;
}

async function researchProfile(
  talent: CrmTalent,
  momentContext: string
): Promise<{ profile: BrandSimulatorProfile; ig: IgBundle }> {
  // Apify deep : ~36 posts IG + hashtags/@mentions + captions TikTok en parallèle.
  const ig = await loadIgBundle(talent.instagram, {
    deep: true,
    tiktok: talent.tiktok,
  });
  const name = `${talent.prenom} ${talent.nom}`.trim();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await xaiResponse(
        buildProfilePrompt(talent, ig, momentContext),
        {
          tools: [...TALENT_RESEARCH_TOOLS],
          timeoutMs: 150_000,
        }
      );
      const o = tryParseJsonObject(text);
      const detectedMoments =
        asStr(o.detectedMoments) ||
        asStr(o.moments) ||
        asStr(o.lifeMoments) ||
        "";
      return {
        ig,
        profile: {
          whoTheyAre: asStr(o.whoTheyAre),
          whatTheyDo: asStr(o.whatTheyDo) || asStr(o.contentThemes),
          profileAnalysis:
            asStr(o.profileAnalysis) || asStr(o.contentThemes),
          contentThemes: asStr(o.contentThemes),
          detectedMoments,
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
  const secteurs = talentToSecteurs(talent);
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
  pastBrands: string[];
  limit: number;
  momentContext: string;
  excludeNames?: string[];
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
  const remaining = args.limit;
  const excludeBlock =
    args.excludeNames && args.excludeNames.length > 0
      ? `\n═══ DÉJÀ LISTÉES (NE PAS LES RÉPÉTER) ═══\n${args.excludeNames.join(", ")}\n`
      : "";
  const lifestyle = formatTalentLifestyleBlock(args.talent);
  const effectiveMoments =
    args.momentContext.trim() ||
    args.profile.detectedMoments.trim() ||
    "";
  const ownedCategories = detectOwnedBrandCategories(
    effectiveMoments,
    `${args.profile.whoTheyAre} ${args.profile.whatTheyDo} ${args.profile.proofPoints}`
  );
  const momentsBlock = formatDetectedMomentsBlock(
    args.profile.detectedMoments || args.momentContext,
    ownedCategories
  );
  const overrideBlock = formatOverrideMomentBlock(args.momentContext);
  const { seeds: eventSeeds, mode } = extractSearchSeeds(
    effectiveMoments,
    args.talent.sports,
    `${args.profile.contentThemes} ${args.profile.brandUniverseHints}`,
    args.talent.niches,
    ownedCategories
  );
  const nicheSearchHints = [
    effectiveMoments || null,
    eventSeeds.length ? eventSeeds.join(", ") : null,
    args.profile.brandUniverseHints || null,
    args.profile.contentThemes || args.talent.niches.join(", ") || null,
  ].filter(Boolean);

  const enduranceBlock =
    mode === "endurance"
      ? `5) partenaires officiels events endurance (Ironman / Hyrox / marathon)
6) marques maison sport pertinentes (Van Rysel, Kiprun…) UNIQUEMENT si vélo/triathlon/running compétition
7) cross-catégorie (ex. Biotherm × Hyrox) si event sport détecté`
      : `5) marques niches alignées sur les MOMENTS (pas sur tous les sports de la fiche)
6) concurrents / adjacents des projets du talent (ex. fondatrice swimwear → autres swimwear / resortwear / beachwear)
7) skincare / tech / luxe / wellness selon les moments — PAS de Zone3 / Van Rysel / Maurten sauf Ironman/triathlon explicite`;

  const ownsSwim = ownedCategories.includes("swimwear");
  const levelExamples =
    mode === "endurance"
      ? `- Triathlon / Ironman → Van Rysel, Zone3, Roka, Maurten…
- Hyrox → partenaires officiels (ex. Biotherm) + matériel/recovery
- Running compétition → Kiprun, Hoka, On, Compressport…`
      : mode === "fashion_beauty"
        ? `${
            ownsSwim
              ? `- FONDATRICE SWIMWEAR → ZÉRO concurrent maillot/bikini/swimwear (pas Vendredi, Ilios, ERES, Frankies, Pain de Sucre, Matteau…)
- ADJACENTS : bijoux (Zag, Gas Bijoux…), skincare prestige/peau sensible (Caudalie, Avène, La Roche-Posay, Augustinus Bader…), beauty (YSL, Rare Beauty, Gisou, Rhode re-pitch…), travel/hotels girls trips, tech vlog (DJI, Insta360), activewear pilates (Lululemon, Varley, Alo)
`
              : `- Contenu swim/mode → resort/fashion/beauty crédibles
`
          }- Skincare / psoriasis → dermocosmétique CONNUE (pas des labos micro inconnus)
- Modeling → mode mid-luxe connue
- Vlog → DJI / Insta360 / gear créateur connu
- ~70%+ des marques doivent être RECONNAISSABLES par un casting FR (présence influence réelle)
- INTERDIT Zone3 / Van Rysel / Maurten sans compétition endurance`
        : `- Ancre-toi sur les moments détectés
- PRIVILÉGIE marques connues actives en influence
- INTERDIT d'imposer triathlon sans signal moment`;

  return `Tu es un strategy planner influence FR/EU ULTRA exigeant — niveau "scout casting". Ta mission : marques ULTRA pertinentes ET CRÉDIBLES (pas des obscures Google).

═══ MODE MATCHING : ${mode} ═══
${ownedCategories.length ? `═══ OWNER CATEGORIES (concurrence INTERDITE) : ${ownedCategories.join(", ")} ═══` : ""}
(endurance = compétition sport ; fashion_beauty = mode/beauté/créa ; wellness = soft ; general = mix)

═══ CRÉATEUR ═══
- Nom : ${name}
- Niches CRM : ${(args.talent.niches || []).join(", ") || "—"}
- Âge : ${args.talent.age != null ? `${args.talent.age} ans` : "—"}
- Notes internes : ${args.talent.notesInternes || "—"}
- Sports fiche (SECONDAIRE — ne pas sur-pondérer) : ${(args.talent.sports || []).join(", ") || "—"}

═══ LIFESTYLE / BEAUTÉ FICHE ═══
${lifestyle}
${momentsBlock}${overrideBlock}
═══ MARQUES AVEC QUI IL/ELLE A DÉJÀ BOSSÉ (signal FORT — à analyser) ═══
${args.pastBrands.length ? args.pastBrands.join(", ") : "(aucune collab connue en CRM)"}
Ces marques révèlent son univers commercial réel. Tu DOIS :
1) les prendre comme preuve de fit (même catégorie / positionnement / adjacent),
2) chercher des marques SIMILAIRES ou COMPLÉMENTAIRES (même étage, concurrents, adjacents),
3) chercher aussi sur le web/X d'autres collabs passées non listées ici,
4) tu PEUX inclure certaines de ces marques déjà bossées UNIQUEMENT s'il y a un angle de re-pitch clair.

═══ ANALYSE PROFIL (source de vérité) ═══
- Qui : ${args.profile.whoTheyAre}
- Ce qu'il/elle fait : ${args.profile.whatTheyDo}
- Analyse : ${args.profile.profileAnalysis}
- Thèmes : ${args.profile.contentThemes}
- Moments détectés (#1) : ${args.profile.detectedMoments || "—"}
- Seeds recherche (dérivés des moments) : ${eventSeeds.join(", ") || "—"}
- Preuves : ${args.profile.proofPoints}
- Univers marques suggéré : ${args.profile.brandUniverseHints || "—"}

═══ DÉJÀ CONTACTÉ(S) CASTING RÉCEMMENT (à éviter sauf fit exceptionnel) ═══
${args.contactedLabels.length ? args.contactedLabels.join(", ") : "(aucun)"}
${excludeBlock}
═══ RECHERCHE OBLIGATOIRE (outils web + X) ═══
Tu DOIS lancer ces recherches (pas optionnel) :
1) "${name}" collab OR partnership OR sponsored OR "en collab avec" marque
2) marques / brands ultra-spécialisées pour : ${nicheSearchHints.join(" | ") || "profil créateur"}
3) concurrents / adjacents des marques déjà bossées : ${args.pastBrands.slice(0, 8).join(", ") || "—"}
4) X : collabs / partenariats liés aux moments détectés
${enduranceBlock}
${
  effectiveMoments
    ? `8) marques liées à : ${effectiveMoments.slice(0, 280)}`
    : ""
}
${eventSeeds
  .slice(0, 5)
  .map(
    (ev, i) =>
      `${12 + i}) marques niche OR collab influence « ${ev} » France Europe 2025 2026`
  )
  .join("\n")}

═══ NIVEAU ATTENDU ═══
${levelExamples}
- INTERDIT de filler géants évidents. ~60%+ = niches ultra-pertinentes aux MOMENTS.

═══ CATALOGUE CRM (aide secondaire UNIQUEMENT) ═══
Pas une liste à laquelle te limiter — juste pour rattacher un id si la marque y figure.
${catalogue || "(vide)"}

═══ MISSION ═══
Renvoie EXACTEMENT ${remaining} marques TRIÉES du MEILLEUR fit au moins bon.
${args.excludeNames?.length ? `Ce sont des marques EN PLUS (complément), sans doublon.` : ""}

Règles STRICTES :
1) Priorité ABSOLUE : MOMENTS détectés (pas le dump sports fiche).
2) Si le talent EST fondateur d'une catégorie (${ownedCategories.join(", ") || "—"}) → INTERDIT de proposer des concurrents de cette catégorie.
3) Si mode ≠ endurance : INTERDIT Zone3 / Van Rysel / Maurten / Kiprun / Compressport sauf compétition explicite.
4) CRÉDIBILITÉ : au moins ~70% de marques qu'un casting FR connaît (programmes influence, mid/premium connus). Max ~30% de pépites moins connues, et seulement si fit exceptionnel documenté.
5) ÉVITE les micro-marques inconnues / startups sans trace influence réelle.
6) Les 15 premières = adjacents moments (bijoux, skincare, travel, tech, beauty…) — pas Nike Adidas génériques sauf fit fort.
7) whyFit cite le moment (ex. « complète Girlstrip, pas une concurrente », « psoriasis / skincare », « girls trips Bali »).
8) suggestedAngle actionnable.
9) marqueId CRM si match, sinon null. fitScore 0–100.
10) INTERDIT de filler juste pour atteindre ${remaining}.

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
      "inCrm": false,
      "alreadyWorkedWith": false
    }
  ]
}
`;
}

/** Pass dédié niches — adapté au mode (endurance vs fashion/beauté). */
function buildSponsorDiscoveryPrompt(args: {
  talent: CrmTalent;
  profile: BrandSimulatorProfile;
  candidates: CandidateMarque[];
  pastBrands: string[];
  limit: number;
  momentContext: string;
  excludeNames: string[];
}): string {
  const name = `${args.talent.prenom} ${args.talent.nom}`.trim();
  const effectiveMoments =
    args.momentContext.trim() ||
    args.profile.detectedMoments.trim() ||
    args.profile.contentThemes ||
    "";
  const ownedCategories = detectOwnedBrandCategories(
    effectiveMoments,
    `${args.profile.whoTheyAre} ${args.profile.whatTheyDo} ${args.profile.proofPoints}`
  );
  const { seeds, mode } = extractSearchSeeds(
    effectiveMoments,
    args.talent.sports,
    `${args.profile.contentThemes} ${args.profile.brandUniverseHints}`,
    args.talent.niches,
    ownedCategories
  );
  const catalogue = args.candidates
    .slice(0, 40)
    .map((m) => `[${m.id}] ${m.nom}`)
    .join(", ");
  const ownsSwim = ownedCategories.includes("swimwear");

  const researchBlock =
    mode === "endurance"
      ? `${seeds
          .map(
            (ev) =>
              `- "${ev}" official partners OR sponsors OR "partenaire officiel" 2024 2025 2026`
          )
          .join("\n")}
- Van Rysel / Zone3 / Maurten / Kiprun si triathlon/running/vélo
- Biotherm Hyrox si Hyrox détecté`
      : `${seeds
          .map(
            (ev) =>
              `- marques CONNUES collab influence « ${ev} » France Europe 2025 2026`
          )
          .join("\n") || "- marques connues alignées moments fashion / beauté"}
${
  ownsSwim
    ? `- ADJACENTS seulement : bijoux, skincare prestige, beauty, hotels/resorts, DJI/Insta360, activewear pilates
- INTERDIT ABSOLU : toute autre marque de maillots / bikini / swimwear / beachwear (concurrents de sa marque)`
    : `- skincare / beauty / mode mid-luxe connues si pertinent`
}
- PRIVILÉGIE marques avec programmes influence visibles (pas startups obscures)
- INTERDIT Zone3 Van Rysel Maurten Kiprun Compressport`;

  const exampleNom = ownsSwim
    ? "Gas Bijoux"
    : mode === "endurance"
      ? "Van Rysel"
      : "Caudalie";

  return `Tu es un scout partenariats influence FR/EU. Mission : marques CRÉDIBLES + alignées moments (mode=${mode}).
${ownedCategories.length ? `OWNER — concurrence interdite : ${ownedCategories.join(", ")}` : ""}

Créateur : ${name}
Moments (#1) : ${effectiveMoments || "—"}
Sports fiche (secondaire) : ${args.talent.sports.join(", ") || "—"}
Seeds : ${seeds.join(", ") || "(déduire des moments)"}
Déjà listées (NE PAS répéter) : ${args.excludeNames.join(", ") || "(aucune)"}
Collabs passées : ${args.pastBrands.slice(0, 12).join(", ") || "—"}

RECHERCHE OBLIGATOIRE web/X :
${researchBlock}

Renvoie EXACTEMENT ${args.limit} marques TRIÉES.
~70%+ doivent être des marques qu'un casting FR connaît.
INTERDIT filler géants vides : Nike, Adidas, Puma, Sephora, L'Oréal (sauf fit documenté).
${mode !== "endurance" ? "INTERDIT triathlon : Zone3, Van Rysel, Maurten, Kiprun, Compressport." : ""}
${ownsSwim ? "INTERDIT swimwear concurrents (Vendredi, Ilios, ERES, Frankies, Pain de Sucre, Matteau, Aquarel, etc.)." : ""}

CRM (ids si match) : ${catalogue || "(vide)"}

JSON strict :
{
  "brands": [
    {
      "marqueId": null,
      "nom": "${exampleNom}",
      "secteur": "Mode",
      "fitScore": 92,
      "whyFit": "Adjacent crédible aux moments — pas concurrent de sa propre marque.",
      "suggestedAngle": "...",
      "inCrm": false,
      "alreadyWorkedWith": false
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
  pastBrandKeys: Set<string>,
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

    const alreadyWorkedWith =
      r.alreadyWorkedWith === true || pastBrandKeys.has(key);

    out.push({
      marqueId,
      nom,
      secteur,
      fitScore,
      whyFit: asStr(r.whyFit) || "Fit non précisé.",
      suggestedAngle: asStr(r.suggestedAngle),
      inCrm,
      alreadyContacted: contactedKeys.has(key),
      alreadyWorkedWith,
    });
    if (out.length >= limit) break;
  }

  return out.sort((a, b) => b.fitScore - a.fitScore);
}

async function enrichTalentPastBrands(talent: CrmTalent): Promise<string[]> {
  const fromCrm = uniqueCollabLabels(talent, 40);
  const moreCollabs = await prisma.collaboration.findMany({
    where: { talentId: talent.id },
    select: { marque: { select: { nom: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const names = [
    ...fromCrm,
    ...moreCollabs.map((c) => String(c.marque?.nom || "").trim()),
  ].filter(Boolean);
  return Array.from(new Set(names));
}

async function runBrandMatchPass(args: {
  talent: CrmTalent;
  profile: BrandSimulatorProfile;
  candidates: CandidateMarque[];
  contactedLabels: string[];
  contactedKeys: Set<string>;
  pastBrands: string[];
  pastBrandKeys: Set<string>;
  limit: number;
  momentContext: string;
  excludeNames?: string[];
}): Promise<BrandSimulatorBrand[]> {
  const text = await xaiResponse(
    buildMatchPrompt({
      talent: args.talent,
      profile: args.profile,
      candidates: args.candidates,
      contactedLabels: args.contactedLabels,
      pastBrands: args.pastBrands,
      limit: args.limit,
      momentContext: args.momentContext,
      excludeNames: args.excludeNames,
    }),
    {
      tools: [...TALENT_RESEARCH_TOOLS],
      timeoutMs: 150_000,
    }
  );
  return parseBrands(
    text,
    args.candidates,
    args.contactedKeys,
    args.pastBrandKeys,
    args.limit
  );
}

async function runSponsorDiscoveryPass(args: {
  talent: CrmTalent;
  profile: BrandSimulatorProfile;
  candidates: CandidateMarque[];
  contactedKeys: Set<string>;
  pastBrands: string[];
  pastBrandKeys: Set<string>;
  momentContext: string;
  excludeNames: string[];
  limit?: number;
}): Promise<BrandSimulatorBrand[]> {
  const limit = args.limit ?? 20;
  try {
    const text = await xaiResponse(
      buildSponsorDiscoveryPrompt({
        talent: args.talent,
        profile: args.profile,
        candidates: args.candidates,
        pastBrands: args.pastBrands,
        limit,
        momentContext: args.momentContext,
        excludeNames: args.excludeNames,
      }),
      {
        tools: [...TALENT_RESEARCH_TOOLS],
        timeoutMs: 120_000,
      }
    );
    return parseBrands(
      text,
      args.candidates,
      args.contactedKeys,
      args.pastBrandKeys,
      limit
    );
  } catch (e) {
    console.warn(
      "brand-simulator sponsor discovery:",
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

function mergeBrandsPreferringNiche(
  primary: BrandSimulatorBrand[],
  nicheExtra: BrandSimulatorBrand[],
  limit: number
): BrandSimulatorBrand[] {
  const seen = new Set<string>();
  const out: BrandSimulatorBrand[] = [];
  // Niches / sponsors d'abord (Van Rysel, Biotherm×Hyrox…), puis le reste.
  for (const b of [...nicheExtra, ...primary]) {
    const key = b.nom.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => b.fitScore - a.fitScore).slice(0, limit);
}

export type BrandSimulatorProgressEvent = {
  type: "progress";
  step: string;
  label: string;
  detail?: string;
  queries?: string[];
};

type BrandSimulatorResultPayload = {
  talent: {
    id: string;
    name: string;
    niches: string[];
    sports: string[];
    photo: string | null;
    instagram: string | null;
    igNote: string;
  };
  momentContext: string | null;
  profile: BrandSimulatorProfile;
  pastBrands: string[];
  brands: BrandSimulatorBrand[];
  meta: Record<string, unknown>;
};

async function runBrandSimulator(args: {
  talentId: string;
  momentContext: string;
  limit: number;
  onProgress?: (e: BrandSimulatorProgressEvent) => void;
}): Promise<BrandSimulatorResultPayload> {
  const emit = (e: Omit<BrandSimulatorProgressEvent, "type">) => {
    args.onProgress?.({ type: "progress", ...e });
  };

  emit({
    step: "crm",
    label: "Lecture fiche talent CRM",
    detail: "Bio, notes internes, sports, lifestyle, collabs…",
  });

  const talent = await loadCrmTalent(args.talentId);
  if (!talent) {
    throw Object.assign(new Error("Talent introuvable."), { status: 404 });
  }

  const name = `${talent.prenom} ${talent.nom}`.trim();
  const handle = normalizeInstagramHandle(talent.instagram || "");
  const pastBrands = await enrichTalentPastBrands(talent);
  const pastBrandKeys = new Set(pastBrands.map((n) => n.toLowerCase()));
  talent.collaborations = [
    ...pastBrands.map((marqueNom) => ({ marqueNom })),
    ...talent.collaborations,
  ];

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const history = await prisma.contactMission.findMany({
    where: {
      talentId: args.talentId,
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
  const contactedKeys = new Set(contactedLabels.map((n) => n.toLowerCase()));

  const ttHandle = cleanSocialHandle(talent.tiktok);
  emit({
    step: "apify",
    label: "Scrape Apify — Instagram + TikTok",
    detail: "Captions, bio, hashtags, @mentions…",
    queries: [
      handle ? `instagram.com/${handle}` : null,
      ttHandle ? `tiktok @${ttHandle}` : null,
      `${name} profil public`,
    ].filter(Boolean) as string[],
  });

  // researchProfile fait le scrape Apify + analyse web/X
  emit({
    step: "profile",
    label: "Analyse créateur (web + X + fiche)",
    detail: "Qui c’est, ce qu’il/elle fait, moments de vie…",
    queries: [
      `"${name}" influenceur Instagram`,
      handle ? `@${handle} collab OR sponsored` : null,
      talent.niches.length
        ? `"${name}" ${talent.niches.slice(0, 3).join(" ")}`
        : null,
      args.momentContext
        ? `"${name}" ${args.momentContext}`
        : null,
    ].filter(Boolean) as string[],
  });

  const { profile, ig } = await researchProfile(talent, args.momentContext);

  const ownedCategories = detectOwnedBrandCategories(
    args.momentContext || profile.detectedMoments,
    `${profile.whoTheyAre} ${profile.whatTheyDo} ${profile.proofPoints}`
  );
  const { seeds: eventSeeds, mode: searchMode } = extractSearchSeeds(
    args.momentContext || profile.detectedMoments,
    talent.sports,
    `${profile.contentThemes} ${profile.brandUniverseHints}`,
    talent.niches,
    ownedCategories
  );

  emit({
    step: "moments",
    label: "Moments détectés",
    detail: profile.detectedMoments || "Aucun moment clair — lifestyle fiche",
    queries: [
      `mode matching : ${searchMode}`,
      ...(ownedCategories.length
        ? [`marque du talent → concurrence interdite : ${ownedCategories.join(", ")}`]
        : []),
      ...eventSeeds.map((ev) => `recherche « ${ev} »`),
    ],
  });

  const candidates = await loadCandidateMarques(talent, contactedKeys);

  emit({
    step: "match",
    label: "Matching marques niches (web + X)",
    detail: `~${args.limit} marques · mode ${searchMode}${
      ownedCategories.length
        ? ` · sans concurrents (${ownedCategories.join(", ")})`
        : ""
    }`,
    queries: [
      `"${name}" collab OR partnership marque`,
      ...nicheExampleQueries(searchMode, eventSeeds, ownedCategories),
    ],
  });

  let brands: BrandSimulatorBrand[] = [];
  let lastError: unknown;

  try {
    brands = await runBrandMatchPass({
      talent,
      profile,
      candidates,
      contactedLabels,
      contactedKeys,
      pastBrands,
      pastBrandKeys,
      limit: args.limit,
      momentContext: args.momentContext,
    });
  } catch (e) {
    lastError = e;
    console.warn(
      "brand-simulator match pass 1:",
      e instanceof Error ? e.message : e
    );
  }

  if (brands.length > 0 && brands.length < args.limit) {
    emit({
      step: "match_more",
      label: "Complément matching (2e vague)",
      detail: `${brands.length}/${args.limit} — on continue`,
    });
    try {
      const more = await runBrandMatchPass({
        talent,
        profile,
        candidates,
        contactedLabels,
        contactedKeys,
        pastBrands,
        pastBrandKeys,
        limit: args.limit - brands.length,
        momentContext: args.momentContext,
        excludeNames: brands.map((b) => b.nom),
      });
      const seen = new Set(brands.map((b) => b.nom.toLowerCase()));
      for (const b of more) {
        if (seen.has(b.nom.toLowerCase())) continue;
        brands.push(b);
        seen.add(b.nom.toLowerCase());
        if (brands.length >= args.limit) break;
      }
    } catch (e) {
      console.warn(
        "brand-simulator match pass 2:",
        e instanceof Error ? e.message : e
      );
    }
  }

  if (brands.length === 0) {
    try {
      brands = await runBrandMatchPass({
        talent,
        profile,
        candidates,
        contactedLabels,
        contactedKeys,
        pastBrands,
        pastBrandKeys,
        limit: args.limit,
        momentContext: args.momentContext,
      });
    } catch (e) {
      lastError = e;
    }
  }

  emit({
    step: "sponsors",
    label:
      searchMode === "endurance"
        ? "Pass sponsors events + niches sport"
        : "Pass niches alignées moments",
    detail:
      searchMode === "endurance"
        ? "Hyrox / Ironman / Van Rysel…"
        : `Mode ${searchMode} — pas de forçage triathlon`,
    queries: nicheExampleQueries(searchMode, eventSeeds, ownedCategories),
  });

  const sponsorBrands = await runSponsorDiscoveryPass({
    talent,
    profile,
    candidates,
    contactedKeys,
    pastBrands,
    pastBrandKeys,
    momentContext: args.momentContext,
    excludeNames: brands.map((b) => b.nom),
    limit: 22,
  });
  if (sponsorBrands.length > 0) {
    brands = mergeBrandsPreferringNiche(brands, sponsorBrands, args.limit);
  }

  if (brands.length === 0) {
    console.error("brand-simulator match failed:", lastError);
    throw Object.assign(
      new Error(
        "Le matching marques n'a pas abouti. Réessaie dans un instant."
      ),
      { status: 502, profile, pastBrands, talent }
    );
  }

  emit({
    step: "resolve",
    label: "Rattachement CRM + ranking",
    detail: `${brands.length} marques · ${sponsorBrands.length} du pass sponsors`,
  });

  brands = await resolveBrandsAgainstCrm(brands);
  brands = brands
    .map((b) => ({
      ...b,
      alreadyWorkedWith:
        b.alreadyWorkedWith || pastBrandKeys.has(b.nom.toLowerCase()),
    }))
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, args.limit);

  const photoRow = await prisma.talent.findUnique({
    where: { id: talent.id },
    select: { photo: true },
  });

  return {
    talent: {
      id: talent.id,
      name,
      niches: talent.niches,
      sports: talent.sports,
      photo: photoRow?.photo || null,
      instagram: talent.instagram,
      igNote: ig.note,
    },
    momentContext: args.momentContext || null,
    profile,
    pastBrands,
    brands,
    meta: {
      candidateCount: candidates.length,
      secteurs: talentToSecteurs(talent),
      contactedCount: contactedLabels.length,
      pastBrandCount: pastBrands.length,
      brandCount: brands.length,
      hasMomentContext: Boolean(args.momentContext),
      lifestyleSignals: {
        sports: talent.sports,
        animaux: talent.animaux,
        enfants: talent.nombreEnfants,
        enceinte: talent.enceinte,
      },
      apify: {
        note: ig.note,
        igCaptions: ig.captions.length,
        tiktokCaptions: ig.tiktokCaptions.length,
        hashtags: ig.topHashtags.slice(0, 12),
        mentions: ig.topMentions.slice(0, 12),
      },
        sponsorPassCount: sponsorBrands.length,
        eventSeeds,
        searchMode,
        ownedCategories,
      },
    };
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
    const momentContext = normalizeMomentContext(body?.momentContext);
    const stream = body?.stream === true;
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(50, Math.min(60, Math.round(limitRaw)))
      : 50;

    if (!talentId) {
      return NextResponse.json({ error: "talentId requis." }, { status: 400 });
    }

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const write = (obj: unknown) => {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          };
          try {
            const result = await runBrandSimulator({
              talentId,
              momentContext,
              limit,
              onProgress: (e) => write(e),
            });
            write({ type: "result", ...result });
          } catch (e) {
            console.error("POST /api/strategy/brand-simulator (stream):", e);
            const status =
              e && typeof e === "object" && "status" in e
                ? Number((e as { status: number }).status)
                : 500;
            write({
              type: "error",
              error:
                e instanceof Error
                  ? e.message
                  : "Erreur serveur lors du simulateur marque.",
              status,
            });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    try {
      const result = await runBrandSimulator({
        talentId,
        momentContext,
        limit,
      });
      return NextResponse.json(result);
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status: number }).status)
          : 500;
      if (status === 404) {
        return NextResponse.json({ error: "Talent introuvable." }, { status: 404 });
      }
      if (status === 502) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Le matching marques n'a pas abouti.",
          },
          { status: 502 }
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("POST /api/strategy/brand-simulator:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors du simulateur marque." },
      { status: 500 }
    );
  }
}
