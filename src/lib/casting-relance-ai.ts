/**
 * Génération IA des relances casting / projets-outreach (R1 J+3, R2 J+10).
 * Profil + preuves chiffrées (CRM) + Apify captions hero (soft-fail).
 * Ton lettre humaine (réf. Maréva) — pas d’angles créa inventés.
 */
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { plainTextToEmailHtml } from "@/lib/email-body-html";
import { getCondensationRelanceContext } from "@/lib/brand-condensation";
import { fetchInstagramRecentCaptions } from "@/lib/instagram-import";
import {
  getInstagramProfileUrl,
  normalizeInstagramHandle,
} from "@/lib/social-links";

/** Style lien IG (surligné / gras) — même rendu que presskit. */
const INSTAGRAM_LINK_STYLE =
  "color: #E1306C; text-decoration: underline; font-weight: bold;";

export type CastingRelanceAiRound = 1 | 2;

export type CastingRelanceAiInput = {
  missionId: string;
  round: CastingRelanceAiRound;
  language: "fr" | "en";
  targetBrand: string;
  previousSubject: string;
  previousBodyHtml: string;
  firstSentAt: Date | null;
  creatorNames?: string[] | null;
};

export type CastingRelanceAiResult = {
  bodyHtml: string;
  subject?: string | null;
};

const MAX_BODY_CHARS = 4500;
const AI_MODEL = "gpt-4o";
const APIFY_TIMEOUT_MS = 40_000;
const APIFY_CAPTION_COUNT = 8;

const CTA_POOL_R1_FR = [
  "Ce projet te parlerait ?",
  "Est-ce que ce projet pourrait t’intéresser ?",
  "Le projet t’intéresserait ?",
  "On en discute ?",
] as const;

const CTA_POOL_R2_FR = [
  "Ce projet te parlerait ?",
  "Est-ce que ce projet pourrait t’intéresser ?",
  "Le projet t’intéresserait ?",
  "On en discute ?",
] as const;

const CTA_POOL_R1_EN = [
  "Would this project be of interest?",
  "Could this project be relevant for you?",
  "Would you be open to exploring this project?",
] as const;

const CTA_POOL_R2_EN = [
  "Would this project be of interest?",
  "Could this project be relevant for you?",
  "Would you be open to exploring this project?",
] as const;

function stripHtmlToText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function formatNum(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function pickCta(
  missionId: string,
  round: CastingRelanceAiRound,
  language: "fr" | "en"
): string {
  const pool =
    language === "en"
      ? round === 1
        ? CTA_POOL_R1_EN
        : CTA_POOL_R2_EN
      : round === 1
        ? CTA_POOL_R1_FR
        : CTA_POOL_R2_FR;
  let hash = 0;
  const key = `${missionId}:${round}`;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length]!;
}

type TalentSnap = {
  id: string | null;
  name: string;
  presentation: string | null;
  niche: string | null;
  instagram: string | null;
  igFollowers: number | null;
  ttFollowers: number | null;
  igEngagement: number | null;
  igMoyenneVuesReels: number | null;
  ttMoyenneVues: number | null;
  igMeilleurReelVues: number | null;
  ttMeilleurTiktokVues: number | null;
  storyViewsMax: number | null;
  perfNotes: string | null;
  score: number;
};

type RelanceContext = {
  talents: TalentSnap[];
  strategyReason: string | null;
  recommendedAngle: string | null;
  heroCaptions: string[];
  apifyUsed: boolean;
};

function talentScore(t: {
  igMeilleurReelVues: number | null;
  ttMeilleurTiktokVues: number | null;
  igMoyenneVuesReels: number | null;
  igFollowers: number | null;
}): number {
  return (
    (t.igMeilleurReelVues ?? 0) +
    (t.ttMeilleurTiktokVues ?? 0) / 2 +
    (t.igMoyenneVuesReels ?? 0) / 3 +
    (t.igFollowers ?? 0) / 10
  );
}

async function loadRelanceContext(
  missionId: string,
  creatorNamesHint: string[] | null | undefined
): Promise<RelanceContext> {
  const mission = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      talentId: true,
      creatorName: true,
      selectedTalentIds: true,
      strategyReason: true,
      recommendedAngle: true,
      campaign: {
        select: {
          talentId: true,
          talent: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              niches: true,
              presentation: true,
              instagram: true,
            },
          },
        },
      },
    },
  });
  if (!mission) {
    return {
      talents: [],
      strategyReason: null,
      recommendedAngle: null,
      heroCaptions: [],
      apifyUsed: false,
    };
  }

  const splitNames = (raw: string | null | undefined): string[] =>
    String(raw || "")
      .split(/\s*,\s*|\s+et\s+|\s+&\s+/i)
      .map((n) => n.trim())
      .filter((n) => n.length > 1 && n.length < 60);

  const nameHints = (creatorNamesHint || [])
    .flatMap((n) => splitNames(n))
    .filter(Boolean);
  const talentIds = new Set<string>();
  if (mission.talentId) talentIds.add(mission.talentId);
  if (mission.campaign?.talentId) talentIds.add(mission.campaign.talentId);
  for (const id of mission.selectedTalentIds || []) {
    if (id) talentIds.add(id);
  }

  let ctxCreators: string[] = nameHints;
  if (ctxCreators.length < 2) {
    try {
      const ctx = await getCondensationRelanceContext(missionId);
      if (ctx?.creators?.length) ctxCreators = ctx.creators.flatMap(splitNames);
    } catch {
      /* ignore */
    }
  }
  if (ctxCreators.length < 2) {
    ctxCreators = splitNames(mission.creatorName);
  }

  type TalentRow = {
    id: string;
    prenom: string;
    nom: string;
    niches: string[];
    presentation: string | null;
    instagram: string | null;
    igFollowers: number | null;
    ttFollowers: number | null;
    igEngagement: number | null;
  };

  const byId = new Map<string, TalentRow>();

  const mapTalentRow = (r: {
    id: string;
    prenom: string;
    nom: string;
    niches: string[];
    presentation: string | null;
    instagram: string | null;
    stats: {
      igFollowers: number | null;
      ttFollowers: number | null;
      igEngagement: number | null;
    } | null;
  }): TalentRow => ({
    id: r.id,
    prenom: r.prenom,
    nom: r.nom,
    niches: r.niches || [],
    presentation: r.presentation,
    instagram: r.instagram,
    igFollowers: r.stats?.igFollowers ?? null,
    ttFollowers: r.stats?.ttFollowers ?? null,
    igEngagement:
      r.stats?.igEngagement != null && Number.isFinite(Number(r.stats.igEngagement))
        ? Number(r.stats.igEngagement)
        : null,
  });

  const talentSelect = {
    id: true,
    prenom: true,
    nom: true,
    niches: true,
    presentation: true,
    instagram: true,
    stats: {
      select: { igFollowers: true, ttFollowers: true, igEngagement: true },
    },
  } as const;

  if (talentIds.size > 0) {
    const rows = await prisma.talent.findMany({
      where: { id: { in: [...talentIds] } },
      select: talentSelect,
    });
    for (const r of rows) byId.set(r.id, mapTalentRow(r));
  }

  // Compléter par nom les créateurs du brief (multi) manquants dans byId.
  // Ex. campaign.talentId = Laura seule → Mia doit quand même avoir son IG.
  // On ne match que les noms EXACTS du brief (pas de pollution Advent).
  const missingCreators = ctxCreators.filter((name) => {
    const lower = name.toLowerCase();
    return ![...byId.values()].some(
      (t) => `${t.prenom} ${t.nom}`.trim().toLowerCase() === lower
    );
  });
  if (missingCreators.length > 0) {
    const allActive = await prisma.talent.findMany({
      where: { isArchived: false },
      select: talentSelect,
      take: 800,
    });
    for (const name of missingCreators) {
      const lower = name.toLowerCase();
      const hit = allActive.find(
        (t) => `${t.prenom} ${t.nom}`.trim().toLowerCase() === lower
      );
      if (hit) byId.set(hit.id, mapTalentRow(hit));
    }
  }

  const ids = [...byId.keys()];
  type PerfRow = {
    talentId: string;
    igMoyenneVuesReels: number | null;
    igMeilleurReelVues: number | null;
    ttMoyenneVues: number | null;
    ttMeilleurTiktokVues: number | null;
    notes: string | null;
  };
  const latestPerf = new Map<string, PerfRow>();
  const storyMax = new Map<string, number | null>();

  if (ids.length > 0) {
    try {
      const [perfs, withStats] = await Promise.all([
        prisma.talentPerformanceMensuelle.findMany({
          where: { talentId: { in: ids } },
          orderBy: [{ annee: "desc" }, { mois: "desc" }],
          select: {
            talentId: true,
            igMoyenneVuesReels: true,
            igMeilleurReelVues: true,
            ttMoyenneVues: true,
            ttMeilleurTiktokVues: true,
            notes: true,
          },
        }),
        prisma.talent.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            stats: {
              select: { storyViews30d: true, storyViews7d: true },
            },
          },
        }),
      ]);
      for (const p of perfs) {
        if (!latestPerf.has(p.talentId)) latestPerf.set(p.talentId, p);
      }
      for (const t of withStats) {
        const peak = Math.max(
          t.stats?.storyViews30d ?? 0,
          t.stats?.storyViews7d ?? 0
        );
        storyMax.set(t.id, peak > 0 ? peak : null);
      }
    } catch (e) {
      console.warn("[casting-relance-ai] load perfs:", e);
    }
  }

  const toSnap = (row: TalentRow): TalentSnap => {
    const perf = latestPerf.get(row.id);
    const snap: TalentSnap = {
      id: row.id,
      name: `${row.prenom} ${row.nom}`.trim(),
      presentation: row.presentation?.trim() || null,
      niche: row.niches?.[0] || null,
      instagram: row.instagram,
      igFollowers: row.igFollowers,
      ttFollowers: row.ttFollowers,
      igEngagement: row.igEngagement,
      igMoyenneVuesReels: perf?.igMoyenneVuesReels ?? null,
      ttMoyenneVues: perf?.ttMoyenneVues ?? null,
      igMeilleurReelVues: perf?.igMeilleurReelVues ?? null,
      ttMeilleurTiktokVues: perf?.ttMeilleurTiktokVues ?? null,
      storyViewsMax: storyMax.get(row.id) ?? null,
      perfNotes: perf?.notes?.trim() || null,
      score: 0,
    };
    snap.score = talentScore(snap);
    return snap;
  };

  const orderedNames =
    ctxCreators.length > 0
      ? ctxCreators
      : mission.campaign?.talent
        ? [
            `${mission.campaign.talent.prenom} ${mission.campaign.talent.nom}`.trim(),
          ]
        : [];

  const snaps: TalentSnap[] = [];
  const usedIds = new Set<string>();

  // Priorité : talents résolus par ID (selectedTalentIds / campaign), puis noms.
  for (const row of byId.values()) {
    usedIds.add(row.id);
    snaps.push(toSnap(row));
  }
  for (const name of orderedNames) {
    const lower = name.toLowerCase();
    const already = snaps.some((s) => s.name.toLowerCase() === lower);
    if (already) continue;
    const row = [...byId.values()].find(
      (t) => `${t.prenom} ${t.nom}`.trim().toLowerCase() === lower
    );
    if (row) {
      if (usedIds.has(row.id)) continue;
      usedIds.add(row.id);
      snaps.push(toSnap(row));
    } else {
      snaps.push({
        id: null,
        name,
        presentation: null,
        niche: null,
        instagram: null,
        igFollowers: null,
        ttFollowers: null,
        igEngagement: null,
        igMoyenneVuesReels: null,
        ttMoyenneVues: null,
        igMeilleurReelVues: null,
        ttMeilleurTiktokVues: null,
        storyViewsMax: null,
        perfNotes: null,
        score: 0,
      });
    }
  }

  // Dédup par nom
  const seen = new Set<string>();
  let unique = snaps.filter((s) => {
    const k = s.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return Boolean(s.name.trim());
  });

  // Multi : hero (meilleur score) + 2 secondaires max
  if (unique.length > 3) {
    const ranked = [...unique].sort((a, b) => b.score - a.score);
    const hero = ranked[0]!;
    const rest = ranked.slice(1, 3);
    unique = [hero, ...rest];
  }

  // Apify soft-fail sur le hero
  let heroCaptions: string[] = [];
  let apifyUsed = false;
  const hero = unique[0];
  const handle = hero?.instagram
    ? normalizeInstagramHandle(hero.instagram)
    : null;
  const skipApify =
    process.env.CASTING_RELANCE_SKIP_APIFY === "1" ||
    process.env.CASTING_RELANCE_SKIP_APIFY === "true";
  if (handle && process.env.APIFY_TOKEN && !skipApify) {
    try {
      const caps = await fetchInstagramRecentCaptions(handle, APIFY_CAPTION_COUNT, {
        timeoutMs: APIFY_TIMEOUT_MS,
      });
      heroCaptions = caps
        .map((c) =>
          c.caption
            .trim()
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .slice(0, 220)
        )
        .filter(Boolean)
        .slice(0, 5);
      apifyUsed = heroCaptions.length > 0;
    } catch (e) {
      console.warn(
        "[casting-relance-ai] Apify soft-fail:",
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    talents: unique,
    strategyReason: mission.strategyReason?.trim() || null,
    recommendedAngle: mission.recommendedAngle?.trim() || null,
    heroCaptions,
    apifyUsed,
  };
}

function formatTalentBlock(t: TalentSnap, role: "hero" | "secondary"): string {
  const lines = [
    `- ${t.name}${t.niche ? ` (${t.niche})` : ""}${
      role === "hero"
        ? " (développer en premier — ne PAS écrire principal/HERO dans le mail)"
        : " (mentionner sans comparer)"
    }`,
  ];
  if (t.presentation) {
    lines.push(`  Presentation: ${t.presentation.slice(0, 280)}`);
  }
  const handle = normalizeInstagramHandle(t.instagram);
  const igUrl = getInstagramProfileUrl(t.instagram);
  if (handle && igUrl) {
    lines.push(
      `  Instagram OBLIGATOIRE dans le mail: @${handle} → ${igUrl} (lien HTML surligné/gras rose, jamais texte brut seul)`
    );
  }
  const ig = formatNum(t.igFollowers);
  const tt = formatNum(t.ttFollowers);
  if (ig) lines.push(`  IG followers: ${ig}`);
  if (tt) lines.push(`  TT followers: ${tt}`);
  if (t.igEngagement != null && t.igEngagement > 0) {
    lines.push(`  IG engagement: ~${t.igEngagement.toFixed(1)}%`);
  }
  const igAvg = formatNum(t.igMoyenneVuesReels);
  const ttAvg = formatNum(t.ttMoyenneVues);
  if (igAvg) lines.push(`  IG reels avg views: ${igAvg}`);
  if (ttAvg) lines.push(`  TT avg views: ${ttAvg}`);
  const igPeak = formatNum(t.igMeilleurReelVues);
  const ttPeak = formatNum(t.ttMeilleurTiktokVues);
  if (igPeak) lines.push(`  IG best reel: ${igPeak}`);
  if (ttPeak) lines.push(`  TT best: ${ttPeak}`);
  const stories = formatNum(t.storyViewsMax);
  if (stories) lines.push(`  Stories peak: ${stories}`);
  if (t.perfNotes) {
    // Ne jamais fournir d’autres marques au modèle (ex. « avec Respire »)
    const notes = t.perfNotes
      .replace(
        /\b(?:collab(?:oration)?|partenariat|campagne)\s+(?:avec|pour|chez)\s+[A-ZÀ-Ü0-9][\wÀ-ÿ&+.'-]{1,40}/gi,
        "collab (marque non citée)"
      )
      .replace(
        /\b(?:avec|pour|chez)\s+[A-ZÀ-Ü0-9][\wÀ-ÿ&+.'-]{1,40}/g,
        ""
      )
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 320);
    if (notes) {
      lines.push(
        `  Notes TM (chiffres OK — NE PAS citer d’autres marques): ${notes}`
      );
    }
  }
  return lines.join("\n");
}

function igAnchor(handle: string): string {
  const url = `https://instagram.com/${encodeURIComponent(handle)}`;
  return `<a href="${url}" style="${INSTAGRAM_LINK_STYLE}">@${handle}</a>`;
}

/** Force le lien IG surligné pour CHAQUE talent (solo ou multi). */
function ensureTalentIgLinks(body: string, talents: TalentSnap[]): string {
  let out = body;
  for (const t of talents) {
    const handle = normalizeInstagramHandle(t.instagram);
    if (!handle) continue;
    const anchor = igAnchor(handle);
    const handleEsc = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Restyle existing IG anchors for this handle
    out = out.replace(
      new RegExp(
        `<a\\s+[^>]*href=["']https?:\\/\\/(?:www\\.)?instagram\\.com\\/${handleEsc}\\/?["'][^>]*>\\s*@?${handleEsc}\\s*<\\/a>`,
        "gi"
      ),
      anchor
    );

    // Wrap bare @handle / instagram.com/handle (not already inside an <a>)
    let alreadyLinked = new RegExp(
      `<a\\s+[^>]*instagram\\.com\\/${handleEsc}`,
      "i"
    ).test(out);
    if (!alreadyLinked) {
      out = out.replace(
        new RegExp(
          `(?<!<a[^>]*>)\\s*(?:https?:\\/\\/(?:www\\.)?instagram\\.com\\/${handleEsc}\\/?|@${handleEsc})\\b`,
          "gi"
        ),
        ` ${anchor}`
      );
      alreadyLinked = new RegExp(
        `instagram\\.com\\/${handleEsc}`,
        "i"
      ).test(out);
    }

    if (alreadyLinked) continue;

    // Inject après le nom complet, sinon prénom, dans le paragraphe du talent
    const fullName = (t.name || "").trim();
    const firstName = fullName.split(/\s+/)[0] || "";
    const lastName = fullName.split(/\s+/).slice(1).join(" ");
    let injected = false;

    if (fullName.length >= 3) {
      const fullEsc = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(fullEsc, "i").test(out)) {
        out = out.replace(
          new RegExp(`(${fullEsc})`, "i"),
          `$1 (${anchor})`
        );
        injected = true;
      }
    }
    if (!injected && firstName.length >= 2) {
      const nameEsc = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Évite de retagger un prénom déjà suivi d’un lien IG
      const re = new RegExp(
        `\\b(${nameEsc})\\b(?![^<]*instagram\\.com\\/${handleEsc})`,
        "i"
      );
      if (re.test(out)) {
        out = out.replace(re, `$1 (${anchor})`);
        injected = true;
      }
    }
    // Dernier recours : coller le lien en fin du 1er paragraphe qui cite le talent
    if (!injected && firstName.length >= 2) {
      const nameEsc = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const lastEsc = lastName
        ? lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : "";
      const paraRe = new RegExp(
        `((?:^|[\\n>]|[.!]\\s)[^\\n<]{0,40}\\b${nameEsc}\\b[\\s\\S]*?)(?=(?:<br\\s*\\/?>\\s*){2}|$|Leyna)`,
        "i"
      );
      if (paraRe.test(out)) {
        out = out.replace(paraRe, `$1 (${anchor})`);
        injected = true;
      } else if (lastEsc && new RegExp(lastEsc, "i").test(out)) {
        out = out.replace(
          new RegExp(`(${lastEsc})`, "i"),
          `$1 (${anchor})`
        );
        injected = true;
      }
    }
  }
  return out;
}

function buildPrompt(opts: {
  language: "fr" | "en";
  round: CastingRelanceAiRound;
  brand: string;
  previousSubject: string;
  previousBodyText: string;
  firstSentLabel: string | null;
  ctx: RelanceContext;
  suggestedCta: string;
}): string {
  const isEn = opts.language === "en";
  const multi = opts.ctx.talents.length >= 2;
  const hero = opts.ctx.talents[0];
  const secondaries = opts.ctx.talents.slice(1);

  const structure = isEn
    ? multi
      ? `STRUCTURE (multi — FULL letter in ENGLISH only, NEVER telegraphic):
1. Hello {{contact.firstname}},
2. ALWAYS exactly: Hope you're well?
3. Follow-up paragraph on the previous email / project for ${opts.brand}
4. Develop the first talent in FULL English sentences (who + numbers + pink IG link) — NEVER "main/hero/lead"
5. The other 1–2: each their own FULL paragraph + numbers + THEIR own pink IG link — NEVER compare
6. Project reminder paragraph (from previous email)
7. LAST line = suggested CTA (English)
8. Closing only (NO name, NO agency): Have a great day,
MIN LENGTH: at least 4 developed paragraphs before CTA. ENTIRE email in English — no French sentences. NEVER sign Leyna / Glow Up Agence.`
      : `STRUCTURE (solo — FULL letter in ENGLISH only):
1. Hello {{contact.firstname}},
2. ALWAYS exactly: Hope you're well?
3. Follow-up on previous email / project (${opts.brand})
4. Who the talent is — 2–4 full English sentences + IG link in the flow
5. Audience / performance numbers — full sentences
6. Project reminder paragraph (what we proposed for ${opts.brand})
7. LAST line = suggested CTA (English)
8. Closing only (NO name, NO agency): Have a great day,
MIN LENGTH: at least 4 developed paragraphs before CTA. ENTIRE email in English — no French. NEVER sign Leyna / Glow Up Agence.`
    : multi
      ? `STRUCTURE (multi — LETTRE COMPLÈTE, jamais télégraphique) :
1. Hello {{contact.firstname}}, (tutoiement)
2. TOUJOURS exactement : J'espère que tu vas bien ?
3. Paragraphe suite au mail / projet pour ${opts.brand}
4. Premier talent en phrases complètes (qui + chiffres + lien IG rose) — SANS principal/HERO
5. Les 1–2 autres : chacun son paragraphe complet + chiffres + SON propre lien IG rose — SANS comparer
6. Paragraphe rappel du projet (depuis le mail précédent)
7. DERNIÈRE phrase = CTA suggéré
8. Formule de fin UNIQUEMENT (pas de nom, pas d'agence) : Belle journée,
LONGUEUR MIN : au moins 4 paragraphes développés avant le CTA. Pas de stats en tirets. INTERDIT : signer Leyna / Glow Up Agence.`
      : `STRUCTURE (solo — LETTRE COMPLÈTE, modèle Zalando/Jasmine) :
1. Hello {{contact.firstname}}, (tutoiement)
2. TOUJOURS exactement : J'espère que tu vas bien ?
3. Suite au mail / projet ${opts.brand} — 1 paragraphe
4. Qui est le talent — 2–4 phrases + lien IG dans le flux
5. Chiffres audience / perfs — phrases complètes (INTERDIT : « 274k IG — eng. 9.7% — reels 731k »)
6. Rappel projet pour ${opts.brand} — 1 paragraphe développé
7. DERNIÈRE phrase = CTA suggéré
8. Formule de fin UNIQUEMENT (pas de nom, pas d'agence) : Belle journée,
LONGUEUR MIN : au moins 4 paragraphes développés avant le CTA. INTERDIT : signer Leyna / Glow Up Agence.`;

  const roundBrief = isEn
    ? opts.round === 1
      ? "ROUND 1: complete human follow-up letter after silence — NOT a short blurb."
      : "ROUND 2: complete letter, slightly firmer — not a clone of round 1, no 'still/always', NOT telegraphic."
    : opts.round === 1
      ? "ROUND 1 : relance LETTRE COMPLÈTE après silence — jamais un mini-mail de 5 lignes."
      : "ROUND 2 : lettre complète, un cran plus ferme — pas un clone du R1, jamais « toujours », jamais télégraphique.";

  const talentBlocks = [
    hero ? formatTalentBlock(hero, "hero") : "",
    ...secondaries.map((t) => formatTalentBlock(t, "secondary")),
  ]
    .filter(Boolean)
    .join("\n");

  const captionsBlock =
    opts.ctx.heroCaptions.length > 0
      ? opts.ctx.heroCaptions
          .map((c, i) => `${i + 1}. ${c.slice(0, 180)}`)
          .join("\n")
      : "(none — do not invent live posts)";

  return `Tu es Leyna (Glow Up Agence). Tu écris une RELANCE comme une vraie personne — lettre Gmail, pas une IA, pas une fiche CRM.

Language: ${isEn ? "English ONLY — every sentence in English. Never write French (no « Suite à mon mail », no « je voulais », no « J'espère »)." : "French — TUTOIEMENT UNIQUEMENT (tu / te / t’ / ton). JAMAIS vous / votre / vos."}.
Brand: ${opts.brand}
${roundBrief}

${structure}

RÈGLES MÉTIER :
- La personne N’A PAS RÉPONDU → jamais « toujours », « encore », « still », « as you may still be interested ».
- Objectif : QUI est le talent + PREUVES chiffrées + rappel projet + CTA intérêt projet.
- FR : tutoiement partout. TOUJOURS « Hello {{contact.firstname}}, » puis « J'espère que tu vas bien ? » — JAMAIS Salut, JAMAIS Bonjour. Jamais « vous », « votre », « vos », « seriez-vous ».
- FR : TOUT le mail en français, y compris le CTA. INTERDIT de finir en anglais (« Could this project be relevant for you? »).
- EN : TOUT le mail in English, including CTA. NEVER mix French. Closing: « Have a great day, » — NEVER « Belle journée » in EN mails.
- FR : Formule de fin « Belle journée, » — JAMAIS « Leyna » ni « Glow Up Agence » à la fin.
- Mise en page : VRAIS paragraphes séparés (lignes vides / <br/><br/>). INTERDIT un seul pavé collé.
- INTERDIT ABSOLU : citer une autre marque / concurrent / collab passée (ex. « avec Respire », « collab Coca-Cola », « pour Sephora »). Seule marque autorisée dans le mail = « ${opts.brand} ». Si une note CRM cite une autre marque, garde le chiffre et DROP le nom de marque.
- INTERDIT style télégraphique / fiche CRM : pas de phrases coupées par des tirets de stats, pas de mail ultra-court. Écrire comme une vraie lettre BD longue (modèle Zalando × Jasmine).
- INTERDIT : inventer des angles créa / unboxing / « angle recommandé » / shot list / idées de contenus à filmer.
- INTERDIT : catalogue à puces de talents, « casting prêt », « profils qui performent », « volumes collab très solides » sans chiffre.
- INTERDIT ABSOLU — ne JAMAIS comparer les talents entre eux ni hiérarchiser :
  « talent principal », « talent HERO », « notre héroïne », « en tête », « le plus pertinent »,
  « se distingue particulièrement », « à ses côtés », « de son côté », « complète ce trio »,
  « mieux que », « plus fort que », « parmi eux », « quant à elle », « également ».
  En multi : chaque personne = son propre paragraphe, phrases indépendantes, zéro classement.
- INTERDIT : style « l’une / l’autre », formules télégraphiques.
- Chaque affirmation de perf = un chiffre issu de TALENT PROFILES ou NOTES (sinon ne pas inventer).
- Captions Instagram live = contexte « en ce moment » uniquement — ne PAS inventer un concept à partir d’elles, ne pas citer de titres de vidéos virales comme pitch.
- Multi : max 3 talents (1 développé en premier + 2). Jamais la liste complète du mail 1. Le tag [HERO] est INTERNE uniquement — ne jamais l’écrire dans le mail.
- CTA dramatiques INTERDITS : passe mon chemin, last chance, je n’insiste pas.
- INTERDIT ABSOLU — ne JAMAIS se projeter sans retour client : « Tu veux qu’on avance », « On avance sur ce projet/sujet », « on peut avancer », « next steps », « on lance ». Pas de projection / closing. CTA = intérêt seulement : « Ce projet te parlerait ? », « Est-ce que ce projet pourrait t’intéresser ? », « On en discute ? ».
- INTERDIT ABSOLU écriture inclusive / IA : jamais « intéressé(e) », « ouvert(e) », « prêt(e) », « motivé(e) », ni AUCUNE parenthèse de genre « (e) », « (ne) », « (se) ».
- Pour CHAQUE talent (1, 2 ou 3) avec Instagram : OBLIGATOIRE d’inclure SON lien @handle dans SON paragraphe, HTML rose surligné/gras : <a href="https://instagram.com/HANDLE" style="color:#E1306C;text-decoration:underline;font-weight:bold">@HANDLE</a>. Jamais un talent sans lien si le handle est fourni. Pas de @ brut sans balise <a>.
- Garder EXACTEMENT {{contact.firstname}} dans le salut.
- Écrire le nom de marque en clair (« ${opts.brand} ») — JAMAIS {{contact.company}} ni un trou « avec , » / « pour  ».
- INTERDIT : « pour lequel nous n’avons pas encore eu de retour », « je souhaitais partager quelques détails sur les talents », « talents que nous avons identifiés », « se démarque », « engagement impressionnant », « influence notable », « potentiel viral ».
- Ouverture type : « Suite à mon mail sur … » — pas « Je t’écris à nouveau suite à », pas « Je reviens vers toi », pas « je voulais revenir vers toi ».
- Ne PAS republier le mail d’origine.
- Sortie UNIQUEMENT JSON : {"body":"..."} — HTML <p>/<br/> ou texte avec lignes vides. Pas de fences.

CTA SUGGÉRÉ (utilise-le ou une variante TRÈS proche, même sens — sans « toujours ») :
${opts.suggestedCta}

PREVIOUS EMAIL SUBJECT:
${opts.previousSubject || "(none)"}

PREVIOUS EMAIL BODY (text, truncated):
${opts.previousBodyText.slice(0, 3200) || "(none)"}

${opts.firstSentLabel ? `FIRST SENT DATE: ${opts.firstSentLabel}` : ""}

${opts.ctx.strategyReason ? `STRATEGY REASON (internal, rephrase humanely if useful):\n${opts.ctx.strategyReason.slice(0, 400)}` : ""}

TALENT PROFILES (facts only):
${talentBlocks || "- (no CRM stats — do not invent numbers)"}

RECENT INSTAGRAM CAPTIONS (hero, live — optional context):
${captionsBlock}
`;
}

function extractJsonBody(raw: string): string | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate) as { body?: unknown };
    if (typeof parsed.body === "string" && parsed.body.trim()) return parsed.body.trim();
  } catch {
    /* try loose extract */
  }
  const m = candidate.match(/"body"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  if (/^(?:<p>|Bonjour|Hi |Hello)/i.test(candidate) && candidate.length > 80) {
    return candidate;
  }
  return null;
}

/** Retire les mentions d’autres marques / concurrents (sauf la marque cible). */
function stripOtherBrandMentions(body: string, keepBrand: string): string {
  const keep = (keepBrand || "").trim();
  const keepEsc = keep
    ? keep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : "";
  let out = body;

  // « collab / collaboration / partenariat avec X »
  out = out.replace(
    /\b((?:sa |son |leur |une |la |leur )?collab(?:oration)?s?|partenariats?|campagnes?)\s+(?:avec|pour|chez)\s+([A-ZÀ-Ü0-9][\wÀ-ÿ&+.'-]{1,40}(?:\s+[A-ZÀ-Ü0-9][\wÀ-ÿ&+.'-]{1,40})?)/gi,
    (full, kind, brand) => {
      if (keep && new RegExp(`^${keepEsc}$`, "i").test(String(brand).trim())) {
        return full;
      }
      return String(kind || "collab");
    }
  );

  // « pic / record / vidéo … avec X » / « pour X »
  out = out.replace(
    /\b(avec|pour|chez)\s+([A-ZÀ-Ü0-9][\wÀ-ÿ&+.'-]{1,40}(?:\s+[A-ZÀ-Ü0-9][\wÀ-ÿ&+.'-]{0,40})?)/g,
    (full, prep, brand) => {
      const b = String(brand).trim();
      if (keep && new RegExp(`^${keepEsc}$`, "i").test(b)) return full;
      // garder prépositions génériques non-marques (toi, elle, Instagram…)
      if (
        /^(toi|elle|lui|eux|nous|Instagram|TikTok|YouTube|IG|TT)$/i.test(b)
      ) {
        return full;
      }
      // Si ça ressemble à une marque (capitale), drop
      if (/^[A-ZÀ-Ü0-9]/.test(b)) return "";
      return full;
    }
  );

  // Ne PAS collapser les sauts de ligne (sinon mail = un pavé)
  out = out.replace(/[^\S\n]{2,}/g, " ");
  out = out.replace(/[^\S\n]+([.,;!?])/g, "$1");
  return out;
}

/** Injecte la formule politesse juste après Hello si absente. */
function ensureHopeYoureWell(body: string, language: "fr" | "en"): string {
  const hope =
    language === "en" ? "Hope you're well?" : "J'espère que tu vas bien ?";
  const already =
    language === "en"
      ? /hope you(?:'re| are) well/i.test(body)
      : /j['’]espère\s+que\s+tu\s+vas\s+bien/i.test(body);
  if (already) return body;

  // Après Hello {{contact.firstname}},
  if (/Hello\s+\{\{\s*contact\.firstname\s*\}\}[,!]?\s*/i.test(body)) {
    return body.replace(
      /(Hello\s+\{\{\s*contact\.firstname\s*\}\}[,!]?\s*(?:<br\s*\/?>|\n)*)/i,
      `$1${hope}<br /><br />`
    );
  }
  // Après Hello Name,
  if (/^[\s\S]{0,80}?Hello\s+[^,<{\n]+[,!]/i.test(body)) {
    return body.replace(
      /(Hello\s+[^,<{\n]+[,!]\s*(?:<br\s*\/?>|\n)*)/i,
      `$1${hope}<br /><br />`
    );
  }
  return `${hope}<br /><br />${body}`;
}

function closingLine(language: "fr" | "en"): string {
  return language === "en" ? "Have a great day," : "Belle journée,";
}

function stripAgencySignature(body: string): string {
  return body
    .replace(
      /(?:<br\s*\/?>|\n|\s)*Leyna\s*(?:<br\s*\/?>|\n)+\s*Glow\s*Up\s*Agence\s*(?:<br\s*\/?>|\n|\s)*$/i,
      ""
    )
    .replace(/\bLeyna\s*\/\s*Glow\s*Up\s*Agence\s*$/i, "")
    .replace(
      /(?:<br\s*\/?>|\n|\s)*(?:Best regards|Cordialement|Bien à toi)[,.]?\s*(?:<br\s*\/?>|\n)*$/i,
      ""
    )
    .trim();
}

function ensureClosing(body: string, language: "fr" | "en"): string {
  const cleaned = stripAgencySignature(body);
  const plain = stripHtmlToText(cleaned);
  const closing = closingLine(language);
  if (
    language === "en"
      ? /have a great day\s*,?\s*$/i.test(plain)
      : /belle journ[eé]e\s*,?\s*$/i.test(plain)
  ) {
    return cleaned;
  }
  return `${cleaned}<br /><br />${closing}`;
}

function ensureCta(
  body: string,
  suggestedCta: string,
  language: "fr" | "en"
): string {
  let cleaned = stripAgencySignature(
    body
      .replace(
        /\n*\s*À\s+(?:bientôt|très\s+bientôt|très\s+vite)\s*,?\s*(?:<br\s*\/?>)?\s*/gi,
        "\n"
      )
      .replace(/\n*\s*Talk\s+soon\s*,?\s*(?:<br\s*\/?>)?\s*/gi, "\n")
  );
  const plain = stripHtmlToText(cleaned);
  const beforeClose = plain
    .replace(/\n*\s*(?:Belle journ[eé]e|Have a great day)\s*,?\s*$/i, "")
    .trim();
  const hasProjectCta =
    language === "fr"
      ? /(projet|intéress|parlerait|on en discute)[^?\n]{0,60}\?/i.test(
          beforeClose
        ) &&
        !/\bcould this project\b|\bwould this project\b|\brelevant for you\b/i.test(
          beforeClose
        )
      : /(project|interest|relevant|open to)[^?\n]{0,60}\?/i.test(beforeClose);
  if (
    hasProjectCta &&
    !/\btoujours\b|\bstill\b|\bencore intéress/i.test(beforeClose) &&
    !/\bon\s+avance|qu['’]on\s+avance|next\s+steps/i.test(beforeClose)
  ) {
    return ensureClosing(cleaned, language);
  }

  const cta = suggestedCta.replace(/\btoujours\b/gi, "").trim();
  const closing = closingLine(language);
  if (/(?:Belle journ[eé]e|Have a great day)\s*,?\s*$/i.test(plain)) {
    return cleaned.replace(
      /((?:Belle journ[eé]e|Have a great day)\s*,?\s*)$/i,
      `${cta}<br /><br />$1`
    );
  }
  return `${cleaned.trim()}<br /><br />${cta}<br /><br />${closing}`;
}

function postProcessBody(
  body: string,
  suggestedCta: string,
  language: "fr" | "en",
  brand: string,
  talents: TalentSnap[] = []
): string | null {
  let out = body.trim();
  if (!out) return null;
  const brandSafe = (brand || "").trim();
  if (brandSafe) {
    out = out.replace(/\{\{\s*contact\.company\s*\}\}/gi, brandSafe);
    out = out.replace(/\{\{\s*company\s*\}\}/gi, brandSafe);
  }
  out = out.replace(/\{\{\s*(?!contact\.firstname)[^}]+\}\}/gi, brandSafe || "");
  if (brandSafe) {
    out = out.replace(/\b(avec|pour|chez)\s+,/gi, `$1 ${brandSafe}`);
    out = out.replace(/\b(avec|pour|chez)\s{2,}/gi, `$1 ${brandSafe} `);
    out = out.replace(/\bcollaboration avec\s*\./gi, `collaboration avec ${brandSafe}.`);
  }
  out = out.replace(/\(projet\s+[^)]+\)/gi, "");
  out = out.replace(/\(project\s+[^)]+\)/gi, "");
  out = out.replace(/^[ \t]*[•→\-–]\s+/gm, "");
  out = out.replace(/<li[^>]*>/gi, "");
  out = out.replace(/<\/li>/gi, "<br />");
  out = out.replace(/<\/?ul[^>]*>/gi, "");
  out = out.replace(/<\/?ol[^>]*>/gi, "");

  // Silence ≠ intérêt
  out = out.replace(/\b(parle|intéresse|convient)\s+(toujours|encore)(\s+un\s+peu)?\b/gi, "$1");
  out = out.replace(/\b(toujours|encore)\s+(intéressé|ouverte?|partant|prêtes?)\b/gi, "");
  out = out.replace(/\bvous\s+parlait\s+encore(\s+un\s+peu)?\b/gi, "te parlerait");
  out = out.replace(/\bça\s+peut\s+encore\s+vous\s+parler\b/gi, "ça peut te parler");
  out = out.replace(/\bstill\s+interested\b/gi, "interested");
  out = out.replace(/\bif\s+you(?:'re| are)\s+still\s+interested\b/gi, "if this could be relevant");
  out = out.replace(/\bce projet vous intéresse-t-il toujours\s*\?/gi, "Ce projet te parlerait ?");
  out = out.replace(/\bce projet vous parlerait-il\s*\?/gi, "Ce projet te parlerait ?");
  out = out.replace(/\best-ce que ce projet pourrait vous intéresser\s*\?/gi, "Est-ce que ce projet pourrait t’intéresser ?");
  out = out.replace(/\ble projet vous intéresserait-il\s*\?/gi, "Le projet t’intéresserait ?");
  out = out.replace(/\bsouhaitez[-\s]?vous qu[’']on avance\b/gi, "Ce projet te parlerait");
  // Zéro écriture inclusive type IA : intéressé(e), ouvert(e), etc.
  out = out.replace(
    /\bseriez[-\s]?vous\s+intéressé\s*\(\s*e\s*\)\s+(?:par\s+le\s+projet|pour\s+en\s+parler)\s*\?/gi,
    "Ce projet te parlerait ?"
  );
  out = out.replace(/\bintéressé\s*\(\s*e\s*\)\b/gi, "intéressé");
  out = out.replace(/\bouvert\s*\(\s*e\s*\)\b/gi, "ouvert");
  out = out.replace(/\bprêt\s*\(\s*e\s*\)\b/gi, "prêt");
  out = out.replace(/\bmotivé\s*\(\s*e\s*\)\b/gi, "motivé");
  out = out.replace(/\bconcerné\s*\(\s*e\s*\)\b/gi, "concerné");
  out = out.replace(/\b([A-Za-zÀ-ÿ]{2,})\s*\(\s*e\s*\)/gi, "$1");
  out = out.replace(/\b([A-Za-zÀ-ÿ]{2,})\s*\(\s*ne\s*\)/gi, "$1");
  out = out.replace(/\b([A-Za-zÀ-ÿ]{2,})\s*\(\s*se\s*\)/gi, "$1");
  out = out.replace(/,\s*pour lequel nous n['’]avons pas encore eu de retour\.?/gi, ".");
  out = out.replace(/\bpour lequel nous n['’]avons pas encore eu de retour\.?\s*/gi, "");

  // FR : Hello + tutoiement (jamais Salut / Bonjour)
  if (language === "fr") {
    out = out.replace(/\b(?:Salut|Bonjour)\b/g, "Hello");
    out = out.replace(/\bJe\s+vous\s+écris\b/gi, "Je t’écris");
    out = out.replace(/\bje\s+souhaitais\s+vous\b/gi, "je voulais te");
    out = out.replace(/\bje\s+voulais\s+vous\b/gi, "je voulais te");
    out = out.replace(/\bvous\s+donner\b/gi, "te donner");
    out = out.replace(/\bvous\s+partager\b/gi, "te partager");
    out = out.replace(/\bvous\s+présenter\b/gi, "te présenter");
    out = out.replace(/\bvous\s+proposer\b/gi, "te proposer");
    out = out.replace(/\bà\s+votre\s+disposition\b/gi, "dispo");
    out = out.replace(/\bvotre\s+retour\b/gi, "ton retour");
    out = out.replace(/\bvotre\s+attention\b/gi, "ton attention");
    out = out.replace(/\bvotre\s+avis\b/gi, "ton avis");
    out = out.replace(/\bvotre\s+côté\b/gi, "ton côté");
    out = out.replace(/\bSeriez[-\s]?vous\b/gi, "Tu serais");
    out = out.replace(/\bPouvez[-\s]?vous\b/gi, "Tu peux");
    out = out.replace(/\bAimeriez[-\s]?vous\b/gi, "Tu aimerais");
    out = out.replace(/\bSouhaitez[-\s]?vous\b/gi, "Tu veux");
    out = out.replace(/\bEst[-\s]?ce\s+que\s+vous\b/gi, "Est-ce que tu");
    out = out.replace(/\bque\s+vous\s+/gi, "que tu ");
    out = out.replace(/\bsi\s+vous\s+/gi, "si tu ");
    out = out.replace(/\bpour\s+vous\b/gi, "pour toi");
    out = out.replace(/\bavec\s+vous\b/gi, "avec toi");
    out = out.replace(/\bchez\s+vous\b/gi, "chez toi");
    out = out.replace(/\bvers\s+vous\b/gi, "vers toi");
    out = out.replace(/\bvous\s+êtes\b/gi, "tu es");
    out = out.replace(/\bvous\s+avez\b/gi, "tu as");
    out = out.replace(/\bvous\s+pouvez\b/gi, "tu peux");
    out = out.replace(/\bvous\s+voulez\b/gi, "tu veux");
    out = out.replace(/\bvous\s+souhaitez\b/gi, "tu veux");
    out = out.replace(/\bvous\s+/gi, "tu ");
    out = out.replace(/\btu\s+êtes\b/gi, "tu es");
    out = out.replace(/\btu\s+avez\b/gi, "tu as");
    out = out.replace(/\btu\s+pouvez\b/gi, "tu peux");
    out = out.replace(/\btu\s+voulez\b/gi, "tu veux");
    out = out.replace(/\btu\s+souhaitez\b/gi, "tu veux");
  }

  // Anti softener / drama CTA
  out = out.replace(
    /\s*(?:,|\bou)?\s*(?:sinon\s+)?je\s+(?:passe\s+mon\s+(?:chemin|tour)|n['’]insiste\s+pas|vous\s+laisse(?:\s+tranquille)?)(?:\s*[?.!]*)/gi,
    "?"
  );
  out = out.replace(/\bsans\s+forcer\b/gi, "");
  out = out.replace(/\bcette\s+fois[-\s]?ci\b/gi, "");
  out = out.replace(/\bune\s+dernière\s+fois\b/gi, "à nouveau");

  // Anti angle créa
  out = out.replace(/\bAngle recommandé\b[^.<\n]*/gi, "");
  out = out.replace(/\bDeux idées\b[^.<\n]*/gi, "");
  out = out.replace(/\bunboxing\b/gi, "événement");

  // Corporate
  out = out.replace(/\bDans\s+l['’]attente\s+de\s+votre\s+retour[^.<\n]*[.!]?\s*/gi, "");
  out = out.replace(/\b(?:Bien\s+à\s+vous|Cordialement|Best\s+regards)\s*,?\s*/gi, "");
  out = out.replace(/\bune\s+belle\s+synergie\b/gi, "un beau fit");
  out = out.replace(/\bsynergies?\b/gi, "fit");
  out = out.replace(/\bvolumes?\s+collab\s+très\s+solides?\b/gi, "volumes collab");
  out = out.replace(/\batouts?\s+indéniables?\b/gi, "points forts");
  out = out.replace(/\batout\s+majeur\b/gi, "bon fit");
  out = out.replace(/\bJe\s+reviens\s+vers\s+vous\s+(?:au\s+sujet\s+de|concernant|suite\s+à)\b/gi, "Suite à mon mail sur");
  out = out.replace(/\bje\s+voulais\s+revenir\s+vers\s+toi\b/gi, "je voulais te reparler");
  out = out.replace(/\brevenir\s+vers\s+toi\b/gi, "te reparler");
  out = out.replace(/\bJe\s+vous\s+écris\s+à\s+nouveau\s+suite\s+à\b/gi, "Suite à");
  out = out.replace(/\bJe\s+vous\s+écris\s+suite\s+à\b/gi, "Suite à");
  // Normaliser la formule politesse (tutoiement)
  out = out.replace(
    /\bJ['’]espère\s+que\s+vous\s+allez\s+bien\s*[?!.,]?\s*/gi,
    "J'espère que tu vas bien ? "
  );
  out = out.replace(
    /\bJ['’]espère\s+que\s+tu\s+vas\s+bien\s*[?!.,]?\s*/gi,
    "J'espère que tu vas bien ? "
  );
  out = out.replace(/\bvos\s+produits\b/gi, "tes produits");
  out = out.replace(/\bvotre\s+marque\b/gi, "ta marque");
  out = out.replace(/\bsait\s+toujours\b/gi, "sait");
  out = out.replace(/\bqui\s+sait\s+toujours\b/gi, "qui sait");
  // Jamais se projeter sans retour client
  out = out.replace(
    /\s*Tu\s+veux\s+qu['’]on\s+avance\s+sur\s+(?:ce\s+)?projet\s*\?/gi,
    ""
  );
  out = out.replace(/\s*On\s+avance\s+sur\s+(?:ce\s+)?(?:projet|sujet)\s*\?/gi, "");
  out = out.replace(
    /\s*(?:Souhaitez[-\s]?vous|Tu\s+veux)\s+qu['’]on\s+avance[^?]*\?/gi,
    ""
  );
  out = out.replace(/\s*on\s+peut\s+avancer[^?]*\?/gi, "");
  out = out.replace(/\s*next\s+steps\s*\?/gi, "");
  out = out.replace(
    /\bje souhaitais (?:partager|vous reparler)[^.<\n]*(?:talents?|identifiés?)[^.<\n]*[.!]?\s*/gi,
    ""
  );
  out = out.replace(/\bles talents que nous avons identifiés\b/gi, "les créatrices du brief");
  out = out.replace(/\bse démarque\b/gi, "est connue");
  out = out.replace(/\bengagement impressionnant\b/gi, "engagement");
  out = out.replace(/\binfluence notable\b/gi, "présence");
  out = out.replace(/\bpotentiel viral\b/gi, "portée");
  out = out.replace(/\bLeyna\s*\/\s*Glow\s*Up\s*Agence\b/gi, "");
  out = out.replace(
    /Leyna\s*(?:<br\s*\/?>|\n)+\s*Glow\s*Up\s*Agence/gi,
    ""
  );
  // Anti hiérarchie / comparaison talents
  out = out.replace(/\bnotre\s+talent\s+(?:principal|héro(?:ïne)?|hero)\b/gi, "le talent");
  out = out.replace(/\btalent\s+(?:principal|HERO|héro(?:ïne)?)\b/gi, "talent");
  out = out.replace(/\b(?:le\s+)?talent\s+HERO\b/gi, "le talent");
  out = out.replace(/\bnotre\s+héro(?:ïne)?\b/gi, "elle");
  out = out.replace(/\bà\s+ses\s+côtés\s*,\s*/gi, "");
  out = out.replace(/\bDe\s+son\s+côté\s*,\s*/gi, "");
  out = out.replace(/\b,\s*quant\s+à\s+elle\s*,/gi, "");
  out = out.replace(/\bquant\s+à\s+elle\s*,\s*/gi, "");
  out = out.replace(/\bcomplète\s+ce\s+trio\b/gi, "fait partie du brief");
  out = out.replace(/\bse\s+distingue\s+particulièrement\b/gi, "est une créatrice");
  out = out.replace(/\batouts?\s+majeurs?\b/gi, "points forts");
  out = out.replace(/\?\s*\?+/g, "?");
  out = out.replace(/\.\s*\./g, ".");
  out = out.replace(/[ \t]{2,}/g, " ");

  // FR/EN : toujours Hello {{contact.firstname}}
  if (language === "fr") {
    out = out.replace(
      /\b(?:Salut|Bonjour|Hi)\s+(\{\{\s*contact\.firstname\s*\}\})/gi,
      "Hello $1"
    );
  }
  if (!/\{\{\s*contact\.firstname\s*\}\}/i.test(out)) {
    out = out.replace(
      /^(<(?:p|div)[^>]*>)?\s*(Bonjour|Hi|Hello|Salut)(\s+[^,<{]+)?([,!]?)(\s*<\/(?:p|div)>)?/i,
      (_m, open, _hi, _name, punct, close) => {
        return (
          `${open || ""}` +
          `Hello {{contact.firstname}}${punct || ","}` +
          `${close || ""}`
        );
      }
    );
  }

  // Strip mentions d’autres marques (garder uniquement la marque cible)
  out = stripOtherBrandMentions(out, brandSafe);

  // Toujours « J'espère que tu vas bien ? » juste après Hello
  out = ensureHopeYoureWell(out, language);

  // FR : jamais de CTA anglais collé en fin de mail
  if (language === "fr") {
    out = out.replace(
      /\bCould this project be relevant for you\s*\?/gi,
      "Ce projet te parlerait ?"
    );
    out = out.replace(
      /\bWould this project be of interest\s*\?/gi,
      "Ce projet te parlerait ?"
    );
    out = out.replace(
      /\bWould you be open to exploring this project\s*\?/gi,
      "Est-ce que ce projet pourrait t’intéresser ?"
    );
    out = out.replace(
      /\bCould this project be relevant for you\b/gi,
      "Ce projet te parlerait"
    );
  }

  // Jamais « Leyna / Glow Up Agence » — uniquement une formule de fin.
  out = stripAgencySignature(out);

  out = ensureCta(out, suggestedCta, language);
  out = ensureTalentIgLinks(out, talents);

  // Structure lettre OBLIGATOIRE (sinon Gmail = un pavé illisible)
  let html = forceLetterHtmlStructure(out, language);
  // Re-force les liens IG après reformatage (multi : 1 lien par talent)
  html = ensureTalentIgLinks(html, talents);
  if (!html || html.length < 40) return null;
  if (html.length > MAX_BODY_CHARS) return null;
  // Rejette les mini-mails télégraphiques (force retry / fallback plutôt qu’envoyer un blurb)
  const plainLen = stripHtmlToText(html).length;
  if (plainLen < 520) {
    console.warn(
      `[casting-relance-ai] body trop court (${plainLen} chars) — rejeté`
    );
    return null;
  }
  // Garde-fou format : au moins 4 séparations de paragraphe
  const breaks = (html.match(/(?:<br\s*\/?>\s*){2}/gi) || []).length;
  if (breaks < 4) {
    console.warn(
      `[casting-relance-ai] format pavé (breaks=${breaks}) — rejeté`
    );
    return null;
  }
  return html;
}

/**
 * Force une vraie mise en page lettre Gmail :
 * Hello / j'espère / corps en paragraphes / CTA / signature.
 * Ne laisse JAMAIS partir un pavé d'une seule ligne.
 */
function forceLetterHtmlStructure(
  raw: string,
  language: "fr" | "en"
): string {
  // 1) Préserver les liens <a>…</a> pendant le découpage
  const links: string[] = [];
  let s = String(raw || "").replace(/\r\n/g, "\n");
  // Corps clairement FR → forcer traitement FR (même si fiche contact = en)
  const looksFr =
    language === "fr" ||
    /\b(Suite à mon mail|je voulais|J['’]espère que tu|pourrait t['’]intéresser|te parlerait|Est-ce que ce projet)\b/i.test(
      s
    );
  const lang: "fr" | "en" = looksFr ? "fr" : language;
  s = s.replace(/<a\s+[^>]*>[\s\S]*?<\/a>/gi, (m) => {
    links.push(m);
    return `__LINK_${links.length - 1}__`;
  });

  // 2) HTML → texte avec vrais sauts
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/?strong>/gi, "")
    .replace(/<\/?b>/gi, "")
    .replace(/<\/?em>/gi, "")
    .replace(/<\/?i>/gi, "");

  // 3) Ancrages structurants — TOUJOURS leur propre paragraphe
  s = s.replace(
    /(Hello\s+\{\{\s*contact\.firstname\s*\}\}[,!]?)\s*/i,
    "$1\n\n"
  );
  s = s.replace(/(Hello\s+[A-Za-zÀ-ÿ][^,\n<{]{0,40}[,!])\s*/i, "$1\n\n");
  if (lang === "fr") {
    // Coupe net même si collé à la phrase suivante
    s = s.replace(
      /(J['’]espère\s+que\s+tu\s+vas\s+bien\s*\?)\s*(?=\S)/gi,
      "$1\n\n"
    );
    s = s.replace(
      /(J['’]espère\s+que\s+tu\s+vas\s+bien\s*\?)\s*/gi,
      "$1\n\n"
    );
  } else {
    s = s.replace(
      /(Hope you(?:'re| are) well\s*\?)\s*(?=\S)/gi,
      "$1\n\n"
    );
    s = s.replace(/(Hope you(?:'re| are) well\s*\?)\s*/gi, "$1\n\n");
  }
  s = s.replace(
    /\s*((?:Ce projet te parlerait|Est-ce que ce projet pourrait t['’]intéresser|Le projet t['’]intéresserait|On en discute|Would this project|Could this project|Would you be open)[^?\n]*\?)\s*/gi,
    "\n\n$1\n\n"
  );
  // FR : balancer les CTA anglais
  if (lang === "fr") {
    s = s.replace(
      /\s*Could this project be relevant for you\s*\?/gi,
      "\n\nCe projet te parlerait ?\n\n"
    );
    s = s.replace(/\s*Would this project be of interest\s*\?/gi, "\n\n");
    s = s.replace(
      /\s*Would you be open to exploring this project\s*\?/gi,
      "\n\n"
    );
  }
  s = s.replace(/\s*(Leyna)\s*\n*\s*(Glow\s*Up\s*Agence)\s*$/i, "");
  s = s.replace(
    /\s*((?:Belle journ[eé]e|Have a great day)\s*,?)\s*$/i,
    "\n\n$1"
  );

  // 4) Si toujours un pavé : découper le corps en paragraphes (~2 phrases)
  let parts = s
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  if (parts.length < 4) {
    const rebuilt: string[] = [];
    for (const part of parts) {
      const isHeader =
        /^Hello\b/i.test(part) ||
        /^J['’]espère\s+que\s+tu\s+vas\s+bien/i.test(part) ||
        /^Hope you(?:'re| are) well/i.test(part) ||
        /^(?:Belle journ[eé]e|Have a great day)\s*,?$/i.test(part) ||
        (/\?\s*$/.test(part) &&
          /(projet|project|intéress|parlerait|discute|relevant)/i.test(part));
      if (isHeader || part.length < 220) {
        rebuilt.push(part);
        continue;
      }
      const sentences = part.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [
        part,
      ];
      let buf = "";
      let count = 0;
      for (const sent of sentences) {
        const t = sent.trim();
        if (!t) continue;
        buf = buf ? `${buf} ${t}` : t;
        count++;
        if (count >= 2 || buf.length > 280) {
          rebuilt.push(buf);
          buf = "";
          count = 0;
        }
      }
      if (buf) rebuilt.push(buf);
    }
    parts = rebuilt.filter(Boolean);
  }

  // 5) FR : zéro CTA anglais ; dédup si double CTA
  if (lang === "fr") {
    parts = parts
      .map((p) =>
        p
          .replace(/\bCould this project be relevant for you\s*\?/gi, "")
          .replace(/\bWould this project be of interest\s*\?/gi, "")
          .replace(/\bWould you be open to exploring this project\s*\?/gi, "")
          .trim()
      )
      .filter(Boolean);
    const ctaIdx = parts.findIndex((p) =>
      /(projet te parlerait|pourrait t['’]intéresser|t['’]intéresserait|on en discute)\s*\?$/i.test(
        p
      )
    );
    if (ctaIdx >= 0) {
      parts = parts.filter(
        (p, i) =>
          i === ctaIdx ||
          !/(projet te parlerait|pourrait t['’]intéresser|t['’]intéresserait|on en discute)\s*\?$/i.test(
            p
          )
      );
    }
  }

  // 5b) Si « J'espère… » encore collé à la suite → split
  {
    const fixed: string[] = [];
    for (const p of parts) {
      const m = p.match(
        /^(J['’]espère\s+que\s+tu\s+vas\s+bien\s*\?)\s+(.+)$/i
      );
      if (m) {
        fixed.push(m[1]!);
        fixed.push(m[2]!);
      } else {
        fixed.push(p);
      }
    }
    parts = fixed;
  }

  // 6) HTML final — paragraphes séparés par ligne vide
  let html = parts
    .map((p) => p.replace(/\n+/g, "<br />"))
    .join("<br /><br />");

  // Restaurer les liens
  html = html.replace(/__LINK_(\d+)__/g, (_, i) => links[Number(i)] || "");

  // Sécurité : plainTextToEmailHtml si jamais on a perdu les br
  if (!(/(?:<br\s*\/?>\s*){2}/i.test(html))) {
    html = plainTextToEmailHtml(parts.join("\n\n"));
  }

  // Anti « trimmed content » Gmail : empêche de replier CTA + formule de fin
  html = preventGmailTrimmedSignature(html, lang);

  return html;
}

/**
 * Marqueur unique avant la formule de fin pour limiter le « … » Gmail
 * (contenu répété d’un mail à l’autre dans le thread).
 */
function preventGmailTrimmedSignature(
  html: string,
  language: "fr" | "en" = "fr"
): string {
  const marker = `<!-- gu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)} -->`;
  // Strip toute signature agence résiduelle (cause historique du trim)
  let out = stripAgencySignature(html);
  const closing = closingLine(language);
  if (/(?:Belle journ[eé]e|Have a great day)\s*,?\s*$/i.test(stripHtmlToText(out))) {
    return out.replace(
      /((?:Belle journ[eé]e|Have a great day)\s*,?\s*)$/i,
      `${marker}$1`
    );
  }
  return `${out}<br /><br />${marker}${closing}`;
}

/**
 * Génère le corps d'une relance casting via ChatGPT (gpt-4o).
 * Retourne null si échec → l'appelant utilise le template fallback.
 */
export async function generateCastingRelanceBody(
  input: CastingRelanceAiInput
): Promise<CastingRelanceAiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[casting-relance-ai] OPENAI_API_KEY manquant — skip IA");
    return null;
  }

  try {
    const ctx = await loadRelanceContext(input.missionId, input.creatorNames);
    const brandName = (input.targetBrand || "").trim();
    const previousBodyText = stripHtmlToText(input.previousBodyHtml)
      .replace(/\{\{\s*contact\.company\s*\}\}/gi, brandName || "la marque")
      .replace(/\{\{\s*company\s*\}\}/gi, brandName || "la marque");
    const firstSentLabel = input.firstSentAt
      ? input.firstSentAt.toLocaleDateString(
          input.language === "en" ? "en-GB" : "fr-FR",
          { day: "numeric", month: "long", year: "numeric" }
        )
      : null;
    const suggestedCta = pickCta(input.missionId, input.round, input.language);

    const prompt = buildPrompt({
      language: input.language,
      round: input.round,
      brand: input.targetBrand,
      previousSubject: input.previousSubject,
      previousBodyText,
      firstSentLabel,
      ctx,
      suggestedCta,
    });

    const openai = new OpenAI({ apiKey });
    // Sanitize prompt for OpenAI JSON transport (rare control chars from CRM/Apify).
    const safePrompt = prompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.55,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            input.language === "en"
              ? 'You write COMPLETE BD follow-ups in ENGLISH ONLY: Hello + "Hope you\'re well?" + talent profile + proof points + project reminder + CTA. Never French. Never Salut/Bonjour. Never competitor brands. Never telegraphic style. Pink bold underlined IG link required. Close with "Have a great day," ONLY — NEVER sign Leyna / Glow Up Agence. JSON {"body":"..."}.'
              : 'Tu rédiges des relances BD COMPLÈTES en FRANÇAIS : Hello + « J\'espère que tu vas bien ? » + tutoiement, profil + preuves, rappel projet, CTA. Jamais Salut/Bonjour, jamais autre marque/concurrent, jamais vouvoiement, jamais « (e) », jamais style télégraphique. Lien IG rose souligné gras obligatoire. Termine UNIQUEMENT par « Belle journée, » — JAMAIS signer Leyna / Glow Up Agence. JSON {"body":"..."}.',
        },
        { role: "user", content: safePrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";
    const extracted = extractJsonBody(raw);
    if (!extracted) {
      console.warn("[casting-relance-ai] JSON body manquant");
      return null;
    }
    const bodyHtml = postProcessBody(
      extracted,
      suggestedCta,
      input.language,
      brandName,
      ctx.talents
    );
    if (!bodyHtml) {
      console.warn("[casting-relance-ai] body post-process rejeté");
      return null;
    }
    // Garde-fou langue : EN demandé → rejeter si corps encore FR (et inverse)
    const plainCheck = stripHtmlToText(bodyHtml);
    if (input.language === "en") {
      const frHits = (
        plainCheck.match(
          /\b(Suite à mon mail|je voulais|J['’]espère que tu|pourrait t['’]intéresser|te parlerait|Est-ce que ce projet|Belle journée)\b/gi
        ) || []
      ).length;
      if (frHits >= 2) {
        console.warn(
          `[casting-relance-ai] body FR alors que EN demandé (hits=${frHits}) — rejeté`
        );
        return null;
      }
    } else {
      const enHits = (
        plainCheck.match(
          /\b(Hope you(?:'re| are) well|Would this project|Could this project|Have a great day)\b/gi
        ) || []
      ).length;
      if (enHits >= 2) {
        console.warn(
          `[casting-relance-ai] body EN alors que FR demandé (hits=${enHits}) — rejeté`
        );
        return null;
      }
    }
    console.log(
      `[casting-relance-ai] mission=${input.missionId} round=${input.round} lang=${input.language} talents=${ctx.talents.length} apify=${ctx.apifyUsed ? 1 : 0}`
    );
    return { bodyHtml };
  } catch (e) {
    console.warn(
      "[casting-relance-ai] échec:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
