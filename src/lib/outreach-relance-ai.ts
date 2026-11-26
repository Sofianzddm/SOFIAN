/**
 * Relance IA Outreach Clients / BENELUX — même niveau « lettre BD » que
 * casting / projet indiv (gpt-4o) : 1 paragraphe développé par créateur
 * (chiffres CRM + lien IG), pas de mini-mail générique.
 * Soft-fail → null → template `buildOutreachRelanceTemplate`.
 */
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { plainTextToEmailHtml } from "@/lib/email-body-html";
import { ensureTalentExtralinksInHtml } from "@/lib/talent-email-links";
import {
  getInstagramProfileUrl,
  normalizeInstagramHandle,
} from "@/lib/social-links";
import {
  IDENTITY_LABEL_BAN_EN,
  IDENTITY_LABEL_BAN_FR,
  scrubIdentityLabels,
} from "@/lib/identity-label-ban";

const AI_MODEL = "gpt-4o";
const MAX_BODY_CHARS = 4500;
const MIN_PLAIN_CHARS = 520;
const MAX_TALENTS = 3;

const INSTAGRAM_LINK_STYLE =
  "color: #E1306C; text-decoration: underline; font-weight: bold;";

export type OutreachRelanceAiRound = 1 | 2;

export type OutreachRelanceAiInput = {
  touchId: string;
  /** 1 = J+3 après le mail ; 2 = J+10 après la relance 1. */
  round?: OutreachRelanceAiRound;
  language: "fr" | "en";
  company: string;
  previousSubject: string;
  previousBodyHtml: string;
  firstSentAt: Date | null;
};

export type OutreachRelanceAiResult = {
  bodyHtml: string;
};

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
  score: number;
};

const CTA_R1_FR = [
  "Ces créatrices te parleraient ?",
  "On en discute ?",
  "Je t’envoie les media kits ?",
] as const;
const CTA_R2_FR = [
  "Ces créatrices te parleraient ?",
  "Je t’envoie les media kits ?",
  "On en discute ?",
] as const;
const CTA_R1_EN = [
  "Would these creators be of interest?",
  "Would you like me to send over their media kits?",
  "Could you share what your next campaigns would be?",
] as const;
const CTA_R2_EN = [
  "Would these creators be of interest?",
  "Shall I send over the media kits?",
  "What would your next campaigns be — we could build around that?",
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
  touchId: string,
  round: OutreachRelanceAiRound,
  language: "fr" | "en"
): string {
  const pool =
    language === "en"
      ? round === 2
        ? CTA_R2_EN
        : CTA_R1_EN
      : round === 2
        ? CTA_R2_FR
        : CTA_R1_FR;
  let hash = 0;
  const key = `${touchId}:r${round}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length]!;
}

function formatSentDate(d: Date | null, language: "fr" | "en"): string | null {
  if (!d) return null;
  return d.toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function extractJsonBody(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { body?: unknown };
    if (typeof parsed.body === "string" && parsed.body.trim()) {
      return parsed.body.trim();
    }
  } catch {
    /* try fence */
  }
  const m = raw.match(/\{[\s\S]*"body"\s*:\s*"([\s\S]*?)"\s*\}/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  return null;
}

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

/** Noms cités dans le mail initial (liens IG / strong). */
function extractNamesFromPreviousHtml(html: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const n = raw.replace(/\s+/g, " ").trim();
    if (n.length < 3 || n.length > 60) return;
    if (/^(hello|bonjour|salut|hi)\b/i.test(n)) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    names.push(n);
  };
  const reAnchor =
    /<a\b[^>]*href=["'][^"']*instagram\.com[^"']*["'][^>]*>\s*(?:<strong>)?\s*([^<]+?)\s*(?:<\/strong>)?\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = reAnchor.exec(html)) !== null) {
    const label = (m[1] || "").replace(/^@/, "").trim();
    if (/\s/.test(label) || /^[A-ZÀ-Ü]/.test(label)) push(label);
  }
  const reStrong = /<strong>\s*([A-ZÀ-Ü][\wÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ü][\wÀ-ÿ'’-]+)+)\s*<\/strong>/g;
  while ((m = reStrong.exec(html)) !== null) {
    push(m[1] || "");
  }
  return names;
}

function snapshotTalentIds(snap: unknown): string[] {
  const s = (snap || {}) as {
    talentResearch?: Array<{ talentId?: string; name?: string }>;
  };
  return (s.talentResearch || [])
    .map((t) => String(t.talentId || "").trim())
    .filter(Boolean);
}

function snapshotTalentNames(snap: unknown): string[] {
  const s = (snap || {}) as {
    talentResearch?: Array<{ talentId?: string; name?: string }>;
  };
  return (s.talentResearch || [])
    .map((t) => String(t.name || "").trim())
    .filter((n) => n.length > 1);
}

async function resolveSnapshot(
  touchId: string
): Promise<{ company: string; snapshot: unknown } | null> {
  const fr = await prisma.outreachTouch.findUnique({
    where: { id: touchId },
    select: {
      target: {
        select: { company: true, castingResearchSnapshot: true },
      },
    },
  });
  if (fr?.target) {
    return {
      company: fr.target.company,
      snapshot: fr.target.castingResearchSnapshot,
    };
  }
  try {
    const bx = await prisma.beneluxOutreachTouch.findUnique({
      where: { id: touchId },
      select: {
        target: {
          select: { companyName: true, castingResearchSnapshot: true },
        },
      },
    });
    if (bx?.target) {
      return {
        company: bx.target.companyName,
        snapshot: bx.target.castingResearchSnapshot,
      };
    }
  } catch {
    /* schéma / client sans benelux */
  }
  return null;
}

async function loadTalentSnaps(
  touchId: string,
  previousBodyHtml: string
): Promise<TalentSnap[]> {
  const resolved = await resolveSnapshot(touchId);
  const snap = resolved?.snapshot;
  const ids = new Set(snapshotTalentIds(snap));
  const nameHints = [
    ...snapshotTalentNames(snap),
    ...extractNamesFromPreviousHtml(previousBodyHtml),
  ];

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

  type Row = {
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

  const byId = new Map<string, Row>();
  const mapRow = (r: {
    id: string;
    prenom: string;
    nom: string;
    niches: string[];
    presentation: string | null;
    instagram: string | null;
    stats: {
      igFollowers: number | null;
      ttFollowers: number | null;
      igEngagement: unknown;
    } | null;
  }): Row => ({
    id: r.id,
    prenom: r.prenom,
    nom: r.nom,
    niches: r.niches || [],
    presentation: r.presentation,
    instagram: r.instagram,
    igFollowers: r.stats?.igFollowers ?? null,
    ttFollowers: r.stats?.ttFollowers ?? null,
    igEngagement:
      r.stats?.igEngagement != null &&
      Number.isFinite(Number(r.stats.igEngagement))
        ? Number(r.stats.igEngagement)
        : null,
  });

  if (ids.size > 0) {
    const rows = await prisma.talent.findMany({
      where: { id: { in: [...ids] } },
      select: talentSelect,
    });
    for (const r of rows) byId.set(r.id, mapRow(r));
  }

  const missingNames = nameHints.filter((name) => {
    const lower = name.toLowerCase();
    return ![...byId.values()].some(
      (t) => `${t.prenom} ${t.nom}`.trim().toLowerCase() === lower
    );
  });
  if (missingNames.length > 0) {
    const allActive = await prisma.talent.findMany({
      where: { isArchived: false },
      select: talentSelect,
      take: 800,
    });
    for (const name of missingNames) {
      const lower = name.toLowerCase();
      const hit = allActive.find(
        (t) => `${t.prenom} ${t.nom}`.trim().toLowerCase() === lower
      );
      if (hit) byId.set(hit.id, mapRow(hit));
    }
  }

  const idList = [...byId.keys()];
  const latestPerf = new Map<
    string,
    {
      igMoyenneVuesReels: number | null;
      igMeilleurReelVues: number | null;
      ttMoyenneVues: number | null;
      ttMeilleurTiktokVues: number | null;
    }
  >();
  if (idList.length > 0) {
    try {
      const perfs = await prisma.talentPerformanceMensuelle.findMany({
        where: { talentId: { in: idList } },
        orderBy: [{ annee: "desc" }, { mois: "desc" }],
        select: {
          talentId: true,
          igMoyenneVuesReels: true,
          igMeilleurReelVues: true,
          ttMoyenneVues: true,
          ttMeilleurTiktokVues: true,
        },
      });
      for (const p of perfs) {
        if (!latestPerf.has(p.talentId)) latestPerf.set(p.talentId, p);
      }
    } catch (e) {
      console.warn("[outreach-relance-ai] load perfs:", e);
    }
  }

  const snaps: TalentSnap[] = [];
  const used = new Set<string>();

  // Ordre hint (mail / snapshot) d’abord, puis reste CRM
  for (const name of nameHints) {
    const lower = name.toLowerCase();
    const row = [...byId.values()].find(
      (t) => `${t.prenom} ${t.nom}`.trim().toLowerCase() === lower
    );
    if (row) {
      if (used.has(row.id)) continue;
      used.add(row.id);
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
        score: 0,
      };
      snap.score = talentScore(snap);
      snaps.push(snap);
    } else if (!snaps.some((s) => s.name.toLowerCase() === lower)) {
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
        score: 0,
      });
    }
  }

  for (const row of byId.values()) {
    if (used.has(row.id)) continue;
    used.add(row.id);
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
      score: 0,
    };
    snap.score = talentScore(snap);
    snaps.push(snap);
  }

  if (snaps.length <= MAX_TALENTS) return snaps;
  // Garder l’ordre du mail si possible, sinon top score
  const fromMail = snaps.filter((s) =>
    nameHints.some((n) => n.toLowerCase() === s.name.toLowerCase())
  );
  if (fromMail.length >= 2) return fromMail.slice(0, MAX_TALENTS);
  return [...snaps].sort((a, b) => b.score - a.score).slice(0, MAX_TALENTS);
}

function formatTalentBlock(t: TalentSnap, index: number): string {
  const lines = [
    `- ${t.name}${t.niche ? ` (${t.niche})` : ""}${
      index === 0
        ? " (développer en premier — ne PAS écrire principal/HERO)"
        : " (paragraphe propre, sans comparer)"
    }`,
  ];
  if (t.presentation) {
    lines.push(
      `  Presentation: ${scrubIdentityLabels(t.presentation.slice(0, 280))}`
    );
  }
  const handle = normalizeInstagramHandle(t.instagram);
  const igUrl = getInstagramProfileUrl(t.instagram);
  if (handle && igUrl) {
    lines.push(
      `  Instagram OBLIGATOIRE: @${handle} → ${igUrl} (lien HTML rose gras souligné)`
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
  return lines.join("\n");
}

function igAnchor(handle: string): string {
  const url = `https://instagram.com/${encodeURIComponent(handle)}`;
  return `<a href="${url}" style="${INSTAGRAM_LINK_STYLE}">@${handle}</a>`;
}

function ensureTalentIgLinks(body: string, talents: TalentSnap[]): string {
  let out = body;
  for (const t of talents) {
    const handle = normalizeInstagramHandle(t.instagram);
    if (!handle) continue;
    const anchor = igAnchor(handle);
    const handleEsc = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(
        `<a\\s+[^>]*href=["']https?:\\/\\/(?:www\\.)?instagram\\.com\\/${handleEsc}\\/?["'][^>]*>\\s*@?${handleEsc}\\s*<\\/a>`,
        "gi"
      ),
      anchor
    );
    if (new RegExp(`instagram\\.com\\/${handleEsc}`, "i").test(out)) continue;
    const nameEsc = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(nameEsc, "i").test(out)) {
      out = out.replace(new RegExp(`(${nameEsc})`, "i"), `$1 (${anchor})`);
    }
  }
  return out;
}

function stripAgencySignature(html: string): string {
  return html
    .replace(/\bLeyna\s*\/\s*Glow\s*Up\s*Agence\b/gi, "")
    .replace(/Leyna\s*(?:<br\s*\/?>|\n)+\s*Glow\s*Up\s*Agence/gi, "")
    .replace(
      /(?:<br\s*\/?>|\n)+\s*(?:Leyna|Leyna Khaled)\s*(?:<br\s*\/?>|\n)*\s*(?:Glow Up Agence)?\s*$/i,
      ""
    )
    .trim();
}

/** Retire les invites « va voir son profil » (trop IA). */
function scrubAiProfileInvites(html: string): string {
  return String(html || "")
    .replace(
      /(?:<br\s*\/?>|\s)*[^.?<]*\b(?:rends?-toi|rendez[- ]vous|va|allez|n['’]hésite(?:z)?\s+pas\s+à)\s+(?:sur|voir|checker|consulter|jeter\s+un\s+[œoe]il\s+(?:à|sur))\s+(?:son|leur|ses|vos)?\s*(?:profil|instagram|compte)[^.?<]*[!.?]?(?:\s*<br\s*\/?>)*/gi,
      " "
    )
    .replace(
      /(?:<br\s*\/?>|\s)*[^.?<]*\b(?:check(?:\s+out)?|have\s+a\s+look\s+at|take\s+a\s+look\s+at|go\s+(?:to|check)|visit)\s+(?:his|her|their|the)\s+(?:profile|instagram|page)[^.?<]*[!.?]?(?:\s*<br\s*\/?>)*/gi,
      " "
    )
    .replace(
      /\bTu as pu regarder (?:son|leur|leurs) profils?\s*\?/gi,
      "Ces créatrices te parleraient ?"
    )
    .replace(
      /\bDid you get a chance to look at (?:his|her|their) profiles?\s*\?/gi,
      "Would these creators be of interest?"
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}


function ensureGreeting(html: string): string {
  if (/\{\{\s*contact\.firstname\s*\}\}/i.test(html)) {
    return html.replace(
      /\b(?:Salut|Bonjour|Hi)\s+(\{\{\s*contact\.firstname\s*\}\})/gi,
      "Hello $1"
    );
  }
  return `Hello {{contact.firstname}},<br /><br />${html}`;
}

function ensureHope(html: string, language: "fr" | "en"): string {
  const hope =
    language === "en" ? "Hope you're well?" : "J'espère que tu vas bien ?";
  if (/j['']espère que tu|hope you/i.test(html)) return html;
  return html.replace(
    /(Hello \{\{\s*contact\.firstname\s*\}\}[,!]?\s*(?:<br\s*\/?>)*)/i,
    `$1<br /><br />${hope}<br /><br />`
  );
}

function ensureCta(html: string, cta: string): string {
  if (html.includes(cta.slice(0, 18))) return html;
  const closing = /((?:Belle journ[eé]e|Have a great day)\s*,?\s*)/i;
  if (closing.test(html)) {
    return html.replace(closing, `${cta}<br /><br />$1`);
  }
  return `${html}<br /><br />${cta}`;
}

function ensureClosing(html: string, language: "fr" | "en"): string {
  if (/belle journ[eé]e|have a great day/i.test(html)) return html;
  const close = language === "en" ? "Have a great day," : "Belle journée,";
  return `${html}<br /><br />${close}`;
}

/**
 * Force une vraie mise en page lettre Gmail (Hello / j'espère / paragraphes / CTA).
 * L’IA renvoie souvent des <p> ou du texte sans <br/><br/> — sans ça le mail
 * est rejeté ou part en pavé.
 */
function forceLetterHtmlStructure(raw: string, language: "fr" | "en"): string {
  const links: string[] = [];
  let s = String(raw || "").replace(/\r\n/g, "\n");
  s = s.replace(/<a\s+[^>]*>[\s\S]*?<\/a>/gi, (m) => {
    links.push(m);
    return `__LINK_${links.length - 1}__`;
  });

  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/?strong>/gi, "**")
    .replace(/<\/?b>/gi, "**")
    .replace(/<\/?em>/gi, "")
    .replace(/<\/?i>/gi, "")
    .replace(/<[^>]+>/g, "");

  s = s.replace(
    /(Hello\s+\{\{\s*contact\.firstname\s*\}\}[,!]?)\s*/i,
    "$1\n\n"
  );
  if (language === "fr") {
    s = s.replace(
      /(J['’]espère\s+que\s+tu\s+vas\s+bien\s*\?)\s*/gi,
      "$1\n\n"
    );
  } else {
    s = s.replace(/(Hope you(?:'re| are) well\s*\?)\s*/gi, "$1\n\n");
  }
  s = s    .replace(
      /\s*((?:Ces créatrices|Ces créateurs|On en discute|Je t['’]envoie|Would these|Shall I|Could you share)[^?\n]{0,80}\?)\s*/gi,
      "\n\n$1\n\n"
    );
  s = s.replace(
    /\s*((?:Belle journ[eé]e|Have a great day)\s*,?)\s*$/i,
    "\n\n$1"
  );

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
          /(créat|media kit|discute|interest|campaign)/i.test(part));
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

  let html = parts
    .map((p) =>
      p
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />")
    )
    .join("<br /><br />");

  html = html.replace(/__LINK_(\d+)__/g, (_, i) => links[Number(i)] || "");
  return html;
}

function postProcess(
  rawBody: string,
  language: "fr" | "en",
  cta: string,
  talents: TalentSnap[],
  previousBodyHtml: string
): string | null {
  let out = rawBody.trim();
  if (!out) return null;
  if (!/<[a-z][\s\S]*>/i.test(out)) {
    out = plainTextToEmailHtml(out);
  }
  out = stripAgencySignature(out);
  out = scrubAiProfileInvites(out);
  out = scrubIdentityLabels(out);
  out = ensureGreeting(out);
  out = ensureHope(out, language);
  out = ensureCta(out, cta);
  out = ensureClosing(out, language);
  out = stripAgencySignature(out);
  out = forceLetterHtmlStructure(out, language);
  out = ensureTalentIgLinks(out, talents);
  out = ensureTalentExtralinksInHtml(out, null, previousBodyHtml);

  if (out.length > MAX_BODY_CHARS) return null;
  const plainLen = stripHtmlToText(out).length;
  if (plainLen < MIN_PLAIN_CHARS) {
    console.warn(`[outreach-relance-ai] body trop court (${plainLen}) — rejeté`);
    return null;
  }
  const breaks = (out.match(/(?:<br\s*\/?>\s*){2}/gi) || []).length;
  if (breaks < 4) {
    console.warn(`[outreach-relance-ai] format pavé (breaks=${breaks}) — rejeté`);
    return null;
  }
  return out;
}

function buildPrompt(args: {
  language: "fr" | "en";
  round: OutreachRelanceAiRound;
  company: string;
  previousSubject: string;
  previousBodyText: string;
  firstSentLabel: string | null;
  suggestedCta: string;
  talents: TalentSnap[];
}): string {
  const brand = args.company || (args.language === "en" ? "the brand" : "la marque");
  const multi = args.talents.length >= 2;
  const talentBlocks = args.talents
    .map((t, i) => formatTalentBlock(t, i))
    .join("\n");
  const roundHint =
    args.round === 2
      ? args.language === "en"
        ? "ROUND 2: complete letter, slightly firmer, fresh media-kit angle — not a clone of round 1, NOT telegraphic."
        : "ROUND 2 : lettre complète, un cran plus ferme, angle media kits frais — pas un clone du R1, jamais télégraphique."
      : args.language === "en"
        ? "ROUND 1: complete human follow-up letter after silence — NOT a short blurb."
        : "ROUND 1 : relance LETTRE COMPLÈTE après silence — jamais un mini-mail de 5 lignes.";

  if (args.language === "en") {
    return `You are Leyna (Glow Up Agence). Write a COMPLETE BD follow-up email — full Gmail letter, not a CRM blurb.

Language: English ONLY.
Brand: ${brand}
${roundHint}

STRUCTURE:
1. Hello {{contact.firstname}},
2. ALWAYS exactly: Hope you're well?
3. Short follow-up on the previous multi-talent pitch for ${brand}
4. ${
      multi
        ? "ONE full paragraph per creator (max 3) — who + numbers + pink IG link. Never compare / rank them."
        : "Develop the creator in full sentences (who + numbers + pink IG link)."
    }
5. Offer concrete next steps: media kits, reach estimates (NO invented creative angles / shot lists)
6. LAST line = CTA: "${args.suggestedCta}"
7. Close with "Have a great day," ONLY — never sign Leyna / Glow Up Agence

RULES:
- Keep the SAME creators as in the original / TALENT PROFILES — do not invent new ones or other brands.
- Every performance claim = a number from TALENT PROFILES (otherwise skip).
- For each creator with Instagram: mandatory pink bold underlined HTML link (name/handle only — NEVER "check out their profile" / "go to their profile" / "have a look at their Instagram").
- Keep {{contact.firstname}} literal. Write brand name plainly (« ${brand} »).
- Letter paragraphs with <br /><br /> — never one pasted block.
- Forbidden: competitor brands, telegraphic dash-stats, "still interested", ranking creators.
- ${IDENTITY_LABEL_BAN_EN}

PREVIOUS SUBJECT: ${args.previousSubject || "—"}
PREVIOUS EMAIL (truncated):
"""
${args.previousBodyText.slice(0, 2800)}
"""
${args.firstSentLabel ? `FIRST SENT: ${args.firstSentLabel}` : ""}

TALENT PROFILES (facts only):
${talentBlocks || "- (no CRM stats — do not invent numbers; remind creators from previous email only)"}

JSON: {"body":"<html with <br /><br /> >"}`;
  }

  return `Tu es Leyna (Glow Up Agence). Tu écris une RELANCE comme une vraie personne — lettre Gmail, pas une IA, pas une fiche CRM.

Language: French — TUTOIEMENT UNIQUEMENT (tu / te / t’ / ton). JAMAIS vous / votre / vos.
Brand: ${brand}
${roundHint}

STRUCTURE :
1. Hello {{contact.firstname}},
2. TOUJOURS exactement : J'espère que tu vas bien ?
3. Court paragraphe suite au pitch multi-talents pour ${brand}
4. ${
    multi
      ? "UN paragraphe complet PAR créateur (max 3) — qui + chiffres + lien IG rose. Jamais comparer / classer."
      : "Développer le créateur en phrases complètes (qui + chiffres + lien IG rose)."
  }
5. Propose media kits / estimations de reach (PAS d’angles créa inventés / shot list)
6. DERNIÈRE phrase = CTA : « ${args.suggestedCta} »
7. Formule de fin UNIQUEMENT : Belle journée, — JAMAIS signer Leyna / Glow Up Agence

RÈGLES :
- Garder les MÊMES créateurs que le mail initial / TALENT PROFILES — n’en invente pas, ni d’autres marques.
- Chaque affirmation de perf = un chiffre issu de TALENT PROFILES (sinon ne pas inventer).
- Pour CHAQUE créateur avec Instagram : lien HTML rose souligné gras obligatoire (nom / @handle seulement).
- INTERDIT ABSOLU — trop IA : jamais « rends-toi sur son profil », « rendez-vous sur son profil »,
  « va sur son Instagram », « jette un œil à son profil », « n’hésite pas à checker son profil »,
  ni aucune invite à « aller voir le profil ». Le lien IG suffit, sans consigne méta.
- Conserve {{contact.firstname}}. Écrire la marque en clair (« ${brand} »).
- Vrais paragraphes séparés (<br /><br />). INTERDIT un pavé collé.
- Ouverture type : « Suite à mon mail sur … » — pas « Je reviens vers toi ».
- INTERDIT : concurrents, style télégraphique, « toujours intéressé ».
- INTERDIT ABSOLU de classer / enchaîner les talents : jamais « Ensuite », « Enfin »,
  « se distingue », « de son côté », « quant à elle », « à ses côtés », « complète ce trio »,
  « talent principal », « HERO ». Chaque personne = paragraphe indépendant.
- ${IDENTITY_LABEL_BAN_FR}

OBJET INITIAL : ${args.previousSubject || "—"}
MAIL INITIAL (extrait) :
"""
${args.previousBodyText.slice(0, 2800)}
"""
${args.firstSentLabel ? `ENVOYÉ LE : ${args.firstSentLabel}` : ""}

TALENT PROFILES (faits uniquement) :
${talentBlocks || "- (pas de stats CRM — n’invente pas de chiffres ; rappelle seulement les créateurs du mail initial)"}

JSON : {"body":"<html avec <br /><br /> >"}`;
}

/**
 * Génère le corps d’une relance Outreach Clients via gpt-4o (style indiv).
 * Retourne null si échec → l’appelant utilise le template fallback.
 */
export async function generateOutreachRelanceBody(
  input: OutreachRelanceAiInput
): Promise<OutreachRelanceAiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[outreach-relance-ai] OPENAI_API_KEY manquant — skip IA");
    return null;
  }

  try {
    const round: OutreachRelanceAiRound = input.round === 2 ? 2 : 1;
    const brand = (input.company || "").trim();
    const previousBodyText = stripHtmlToText(input.previousBodyHtml)
      .replace(/\{\{\s*contact\.company\s*\}\}/gi, brand || "la marque")
      .replace(/\{\{\s*company\s*\}\}/gi, brand || "la marque");
    const suggestedCta = pickCta(input.touchId, round, input.language);
    const firstSentLabel = formatSentDate(input.firstSentAt, input.language);
    const talents = await loadTalentSnaps(
      input.touchId,
      input.previousBodyHtml
    );

    const prompt = buildPrompt({
      language: input.language,
      round,
      company: brand,
      previousSubject: input.previousSubject,
      previousBodyText,
      firstSentLabel,
      suggestedCta,
      talents,
    });

    const openai = new OpenAI({ apiKey });
    const safePrompt = prompt.replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      ""
    );
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: round === 2 ? 0.6 : 0.55,
      max_tokens: round === 2 ? 1000 : 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            input.language === "en"
              ? `You write COMPLETE BD follow-ups in ENGLISH ONLY for a talent agency client cycle (round ${round}). Full letter: Hello + hope you're well + one developed paragraph per creator with CRM numbers + pink IG link + media kits + CTA. Never French. Never telegraphic. Never "check out their profile". Never orientation/identity labels (lesbian/gay/LGBTQ). Never sign Leyna. JSON {"body":"..."}.`
              : `Tu rédiges des relances BD COMPLÈTES en FRANÇAIS (tutoiement) pour le cycle Outreach Clients (round ${round}). Lettre complète : Hello + J'espère que tu vas bien ? + un paragraphe développé PAR créateur (chiffres CRM + lien IG rose) + media kits + CTA. Jamais télégraphique. Jamais « rends-toi sur son profil ». Jamais « couple lesbien » / labels d'orientation. Jamais signer Leyna. JSON {"body":"..."}.`,
        },
        { role: "user", content: safePrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";
    const extracted = extractJsonBody(raw);
    if (!extracted) {
      console.warn("[outreach-relance-ai] JSON body manquant");
      return null;
    }

    const bodyHtml = postProcess(
      extracted,
      input.language,
      suggestedCta,
      talents,
      input.previousBodyHtml
    );
    if (!bodyHtml) return null;

    if (input.language === "en") {
      const plainCheck = stripHtmlToText(bodyHtml);
      const frHits = (
        plainCheck.match(
          /\b(Suite à mon mail|je voulais|J['’]espère que|Seriez-vous|Belle journée)\b/gi
        ) || []
      ).length;
      if (frHits >= 2) {
        console.warn(
          `[outreach-relance-ai] body FR alors que EN (hits=${frHits})`
        );
        return null;
      }
    }

    console.log(
      `[outreach-relance-ai] touch=${input.touchId} round=${round} lang=${input.language} talents=${talents.length}`
    );
    return { bodyHtml };
  } catch (e) {
    console.warn(
      "[outreach-relance-ai] échec:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
