/**
 * Relance gift J+2 — lettre BD complète (même niveau que casting-relance-ai solo R1).
 * OpenAI gpt-4o + profil CRM ; fallback Grok puis template enrichi.
 * Pas de signature hardcodée (Gmail). Pas d'invention de formats stories/reels.
 */
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { xaiResponse } from "@/lib/xai";
import {
  getInstagramProfileUrl,
  normalizeInstagramHandle,
} from "@/lib/social-links";
import {
  ensureGiftParagraphs,
  GIFT_PRENOM_TOKEN,
  scrubCringeCtas,
  scrubHeyOpeners,
  scrubMarketingFluff,
  scrubVouvoiementLeaks,
  stripGiftAiSignOff,
  tokenizeGiftPrenomGreeting,
} from "@/lib/gifts/contact-marque-ai-scrub";
import { normalizeContactLanguage } from "@/lib/gifts/contact-language";

const AI_MODEL = "gpt-4o";
const INSTAGRAM_LINK_STYLE =
  "color: #E1306C; text-decoration: underline; font-weight: bold;";

const CTA_POOL_FR = [
  "On en discute ?",
  "Est-ce que le projet pourrait t’intéresser ?",
  "Tu serais dispo pour en parler rapidement ?",
  "Je t’envoie plus de détails si utile — dis-moi ?",
] as const;

const CTA_POOL_EN = [
  "Would you be open to a quick chat?",
  "Would this be of interest on your side?",
  "Happy to send more details — shall I?",
  "Would a short call help?",
] as const;

type GiftTalentSnap = {
  id: string;
  name: string;
  prenom: string;
  nom: string;
  presentation: string | null;
  niche: string | null;
  instagram: string | null;
  igFollowers: number | null;
  ttFollowers: number | null;
  igEngagement: number | null;
  igMoyenneVuesReels: number | null;
  igMeilleurReelVues: number | null;
  ttMoyenneVues: number | null;
  ttMeilleurTiktokVues: number | null;
};

function formatNum(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function pickCta(seed: string, language: "fr" | "en"): string {
  const pool = language === "en" ? CTA_POOL_EN : CTA_POOL_FR;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

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
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* next */
    }
  }
  return {};
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlBodyToPlainParagraphs(body: string): string {
  if (!/<[a-z][\s\S]*>/i.test(body)) return body;
  return stripHtmlToText(body);
}

async function loadGiftTalentSnap(
  talentId: string | null | undefined
): Promise<GiftTalentSnap | null> {
  const id = (talentId || "").trim();
  if (!id) return null;

  const row = await prisma.talent.findUnique({
    where: { id },
    select: {
      id: true,
      prenom: true,
      nom: true,
      niches: true,
      presentation: true,
      instagram: true,
      stats: {
        select: {
          igFollowers: true,
          ttFollowers: true,
          igEngagement: true,
        },
      },
    },
  });
  if (!row) return null;

  let perf: {
    igMoyenneVuesReels: number | null;
    igMeilleurReelVues: number | null;
    ttMoyenneVues: number | null;
    ttMeilleurTiktokVues: number | null;
  } | null = null;
  try {
    const latest = await prisma.talentPerformanceMensuelle.findFirst({
      where: { talentId: id },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
      select: {
        igMoyenneVuesReels: true,
        igMeilleurReelVues: true,
        ttMoyenneVues: true,
        ttMeilleurTiktokVues: true,
      },
    });
    perf = latest;
  } catch (e) {
    console.warn("[gift-relance-ai] load perfs:", e);
  }

  const eng =
    row.stats?.igEngagement != null &&
    Number.isFinite(Number(row.stats.igEngagement))
      ? Number(row.stats.igEngagement)
      : null;

  return {
    id: row.id,
    name: `${row.prenom} ${row.nom}`.trim(),
    prenom: row.prenom,
    nom: row.nom,
    presentation: row.presentation?.trim() || null,
    niche: row.niches?.[0] || null,
    instagram: row.instagram,
    igFollowers: row.stats?.igFollowers ?? null,
    ttFollowers: row.stats?.ttFollowers ?? null,
    igEngagement: eng,
    igMoyenneVuesReels: perf?.igMoyenneVuesReels ?? null,
    igMeilleurReelVues: perf?.igMeilleurReelVues ?? null,
    ttMoyenneVues: perf?.ttMoyenneVues ?? null,
    ttMeilleurTiktokVues: perf?.ttMeilleurTiktokVues ?? null,
  };
}

function formatGiftTalentBlock(t: GiftTalentSnap): string {
  const lines = [
    `- ${t.name}${t.niche ? ` (${t.niche})` : ""}`,
  ];
  if (t.presentation) {
    lines.push(`  Presentation: ${t.presentation.slice(0, 280)}`);
  }
  const handle = normalizeInstagramHandle(t.instagram);
  const igUrl = getInstagramProfileUrl(t.instagram);
  if (handle && igUrl) {
    lines.push(
      `  Instagram OBLIGATOIRE dans le mail: @${handle} → ${igUrl} (écrire @${handle} dans le flux — le lien HTML rose sera injecté à l'envoi)`
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

function buildGiftRelancePrompt(opts: {
  language: "fr" | "en";
  marqueNom: string;
  talentName: string;
  amName: string;
  contactPrenom: string;
  previousSubject: string;
  previousBodyText: string;
  giftReference: string;
  typeGiftLabel: string;
  conceptSnippet: string;
  suggestedCta: string;
  talentBlock: string;
}): string {
  const isEn = opts.language === "en";
  const crmPrenomHint = (opts.contactPrenom || "").trim();

  if (isEn) {
    return `You are an Account Manager at Glow Up Agence. Write a COMPLETE follow-up email (round 1, ~2 business days after silence) about a gift proposal — FULL human BD letter, NOT a short blurb.

Language: ENGLISH ONLY. Never French.
Brand: ${opts.marqueNom}
Talent (subject of the mail, NOT the sender): ${opts.talentName}
AM sender (do NOT sign in body): ${opts.amName}
CRM first-name hint (do NOT hardcode in the greeting): ${crmPrenomHint || "(unknown)"}

STRUCTURE (solo — FULL letter):
1) Hello ${GIFT_PRENOM_TOKEN}, — keep the token LITERAL (resolved at send from CRM). NEVER invent a real first name. NEVER "Hey" / "Hi" / "Bonjour"
2) ALWAYS exactly: Hope you're well?
3) Follow-up paragraph on the previous gift email for ${opts.marqueNom} — open with "Just following up on my note about…" / "I wanted to follow up on…" — NEVER "Just contacting you For reminder" / glued sentences
4) Who ${opts.talentName} is — 2–4 full sentences + their Instagram @handle in the flow
5) Audience / performance numbers in full sentences (ONLY from TALENT PROFILE — never invent). If no numbers, skip without inventing.
6) Concrete reminder of the gift ask for ${opts.marqueNom} (type: ${opts.typeGiftLabel}) from the previous email / concept — NEVER invent formats (stories / reels / TikTok / posts) unless already in the previous email
7) LAST line = suggested CTA (or very close variant) — interest only, no projection ("let's move forward")
8) NO signature / name / agency / "Best regards" / "Have a great day" — Gmail signature handles that

RULES:
- ROUND 1: complete human follow-up letter after silence — NOT a 5-line mini-mail.
- MIN LENGTH: at least 4 developed paragraphs before the CTA.
- Plain text with blank-line paragraphs (\\n\\n). NEVER a glued wall of text. No HTML.
- They did NOT reply → never "still", "as you may still be interested", "circling back again".
- Do NOT invent prior conversations beyond the previous email below.
- No marketing fluff: showcase, scenography, immersive, statement…
- Include the Instagram @handle in the talent paragraph when provided in TALENT PROFILE.

CTA SUGGESTED (use it or a VERY close variant, same meaning):
${opts.suggestedCta}

Previous subject: ${opts.previousSubject || "(n/a)"}
Previous body:
${opts.previousBodyText || "(n/a)"}
Gift concept snippet: ${opts.conceptSnippet || "(n/a)"}
Reference: ${opts.giftReference || "(n/a)"}

TALENT PROFILE (facts only — do not invent numbers):
${opts.talentBlock || "- (no CRM stats — do not invent numbers)"}

Reply ONLY JSON: {"subject":"...","body":"..."}
Subject should be Re: … if previous subject exists.
CRITICAL: greeting MUST be exactly Hello ${GIFT_PRENOM_TOKEN}, — never a real first name.`;
  }

  return `Tu es Account Manager chez Glow Up Agence. Tu écris une RELANCE COMPLÈTE (round 1, ~2 jours ouvrés après silence) sur une proposition de gift — LETTRE BD humaine, jamais un mini-mail.

Langue: FRANÇAIS — TUTOIEMENT STRICT (tu / te / ton). JAMAIS vous / votre / vos.
Marque: ${opts.marqueNom}
Talent (sujet du mail, PAS l'expéditeur): ${opts.talentName}
AM (ne PAS signer dans le body): ${opts.amName}
Indice prénom CRM (ne PAS l'écrire en dur dans l'accroche): ${crmPrenomHint || "(inconnu)"}

STRUCTURE (solo — LETTRE COMPLÈTE, modèle pipeline indiv) :
1) Hello ${GIFT_PRENOM_TOKEN}, — laisse le token TEL QUEL (remplacé à l'envoi par le prénom CRM). JAMAIS un prénom en dur. JAMAIS « Hey » / « Salut » / « Coucou » / « Bonjour »
2) TOUJOURS exactement : J'espère que tu vas bien ?
3) Suite au mail gift pour ${opts.marqueNom} — 1 paragraphe. Ouverture OBLIGATOIRE type « Je me permets de te relancer concernant… » / « Je me permets de te relancer au sujet de… ». INTERDIT : « Je me permets de te contacter Pour rappel » (collé), « Je reviens vers toi », « Suite à mon mail », phrases collées sans ponctuation.
4) Qui est ${opts.talentName} — 2–4 phrases + son @handle Instagram dans le flux
5) Chiffres audience / perfs en phrases complètes (UNIQUEMENT depuis TALENT PROFILE — sinon ne pas inventer). INTERDIT style tirets « 274k IG — eng. 9.7% ».
6) Rappel concret de la demande gift pour ${opts.marqueNom} (type: ${opts.typeGiftLabel}) depuis le mail précédent / concept — SANS inventer de formats (stories / reels / TikTok / posts) s'ils ne sont pas déjà dans le mail précédent
7) DERNIÈRE phrase = CTA suggéré (ou variante TRÈS proche) — intérêt only, pas de projection (« on avance », « on lance »)
8) PAS de signature / prénom / agence / « Belle journée » — le Gmail s'en charge

RÈGLES:
- ROUND 1 : relance LETTRE COMPLÈTE après silence — jamais un mini-mail de 5 lignes.
- LONGUEUR MIN : au moins 4 paragraphes développés avant le CTA.
- Texte brut avec paragraphes séparés par \\n\\n. INTERDIT un pavé collé. Pas de HTML.
- Pas de réponse → jamais « toujours », « encore », « si jamais ça t'intéresse encore ».
- N'invente pas d'échange hors du mail précédent.
- INTERDIT jargon : scénographie, showcase, statement, immersif…
- Inclure le @handle Instagram dans le paragraphe talent quand fourni dans TALENT PROFILE.
- INTERDIT écriture inclusive / (e).

CTA SUGGÉRÉ (utilise-le ou une variante TRÈS proche, même sens) :
${opts.suggestedCta}

Sujet précédent: ${opts.previousSubject || "(n/a)"}
Corps précédent:
${opts.previousBodyText || "(n/a)"}
Concept gift: ${opts.conceptSnippet || "(n/a)"}
Réf: ${opts.giftReference || "(n/a)"}

TALENT PROFILE (faits uniquement — ne pas inventer de chiffres) :
${opts.talentBlock || "- (pas de stats CRM — ne pas inventer de chiffres)"}

Réponds UNIQUEMENT en JSON: {"subject":"...","body":"..."}
Sujet = Re: … si un sujet précédent existe.
CRITIQUE: accroche EXACTE Hello ${GIFT_PRENOM_TOKEN}, — jamais un prénom réel.`;
}

function scrubGluedRelanceOpeners(body: string): string {
  let text = body.replace(/\r\n/g, "\n");
  // « Je me permets de te contacter Pour rappel, » → forme propre de relance
  text = text.replace(
    /Je me permets de te contacter\s*[Pp]our rappel[,]?\s*/gi,
    "Je me permets de te relancer concernant "
  );
  text = text.replace(
    /Je me permets de te relancer\s*[Pp]our rappel[,]?\s*/gi,
    "Je me permets de te relancer concernant "
  );
  text = text.replace(
    /Just (?:contacting|reaching out)(?: you)?\s*[Ff]or reminder[,]?\s*/gi,
    "Just following up on my note about "
  );
  // Colle « contacterPour »
  text = text.replace(
    /(contacter|relancer)\s*([Pp]our rappel)/g,
    "$1. $2"
  );
  return text;
}

function countParagraphBreaks(body: string): number {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

function giftRelanceBodyQualityOk(body: string): boolean {
  const plain = stripHtmlToText(body);
  const withoutGreeting = plain
    .replace(/^(?:Hello|Bonjour|Hey|Salut)[^,]*,?\s*/i, "")
    .replace(/^J['']espère que tu vas bien\s*\?\s*/i, "")
    .replace(/^Hope you(?:'re| are) well\s*\?\s*/i, "")
    .trim();
  if (withoutGreeting.length < 450) return false;
  if (countParagraphBreaks(plain) < 4) return false;
  if (/Je me permets de te contacter\s*Pour rappel/i.test(plain)) return false;
  return true;
}

function postProcessGiftRelanceBody(
  body: string,
  opts: {
    language: "fr" | "en";
    talentName: string;
    amName: string;
  }
): string {
  let out = htmlBodyToPlainParagraphs(body);
  out = stripGiftAiSignOff(out, {
    talentName: opts.talentName,
    amName: opts.amName,
  });
  out = scrubGluedRelanceOpeners(out);
  // Pas de scrubFalseFollowUpOpeners ici : une vraie relance DOIT pouvoir
  // dire « Je me permets de te relancer » (interdit sur le 1er contact seulement).
  out = scrubHeyOpeners(out, opts.language);
  // Forcer Hello (pas Bonjour) comme casting indiv
  out = out.replace(/^Bonjour(\s+[^,\n]+)?,/i, (_m, name: string | undefined) =>
    `Hello${name || ""},`
  );
  out = scrubCringeCtas(out);
  out = scrubMarketingFluff(out);
  if (opts.language !== "en") out = scrubVouvoiementLeaks(out);
  out = ensureGiftParagraphs(out);
  return out.trim();
}

function igAnchor(handle: string): string {
  const url = `https://instagram.com/${encodeURIComponent(handle)}`;
  return `<a href="${url}" style="${INSTAGRAM_LINK_STYLE}">@${handle}</a>`;
}

/**
 * Remplace @handle / URL IG dans le HTML sans toucher aux <a> déjà présents.
 * 1) Placeholder sur les ancres existantes
 * 2) Remplacement uniquement hors balises
 * Sinon on réécrit l’URL dans href="…" → HTML cassé
 * (`<a href=" <a … style=…>@h</a>" style=…>` → style visible en clair dans Gmail).
 */
function linkifyBareIgOutsideAnchors(
  html: string,
  handle: string,
  anchor: string
): string {
  const handleEsc = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const placeholders: string[] = [];
  let out = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (m) => {
    const i = placeholders.length;
    placeholders.push(m);
    return `\u0000IGLINK${i}\u0000`;
  });

  const bareRe = new RegExp(
    `(?:https?:\\/\\/(?:www\\.)?instagram\\.com\\/${handleEsc}\\/?|@${handleEsc})\\b`,
    "gi"
  );
  out = out.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, text: string | undefined) => {
    if (tag || text == null) return full;
    return text.replace(bareRe, anchor);
  });

  return out.replace(/\u0000IGLINK(\d+)\u0000/g, (_, idx: string) => {
    return placeholders[Number(idx)] ?? "";
  });
}

/**
 * Après render HTML du mail gift : force le lien IG rose @handle (comme casting).
 */
export function injectGiftRelanceIgLinks(
  html: string,
  talent: {
    prenom?: string | null;
    nom?: string | null;
    name?: string | null;
    instagram?: string | null;
  } | null
): string {
  if (!html || !talent) return html;
  const handle = normalizeInstagramHandle(talent.instagram);
  if (!handle) return html;

  let out = html;
  const anchor = igAnchor(handle);
  const handleEsc = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Restyle TOUT lien IG de ce handle en rose @handle (y compris lien sur le nom)
  out = out.replace(
    new RegExp(
      `<a\\s+[^>]*href=["']https?:\\/\\/(?:www\\.)?instagram\\.com\\/${handleEsc}\\/?["'][^>]*>[\\s\\S]*?<\\/a>`,
      "gi"
    ),
    anchor
  );

  // @handle / URL bruts hors ancres déjà posées (jamais dans un href)
  out = linkifyBareIgOutsideAnchors(out, handle, anchor);

  if (new RegExp(`instagram\\.com\\/${handleEsc}`, "i").test(out)) {
    return out;
  }

  const fullName =
    (talent.name || "").trim() ||
    [talent.prenom, talent.nom].filter(Boolean).join(" ").trim();
  const firstName = fullName.split(/\s+/)[0] || "";

  // Filet : injecter après le nom si aucun lien IG n'a pu être posé
  const placeholders: string[] = [];
  out = out.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (m) => {
    const i = placeholders.length;
    placeholders.push(m);
    return `\u0000IGLINK${i}\u0000`;
  });

  if (fullName.length >= 3) {
    const fullEsc = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, text: string | undefined) => {
      if (tag || text == null) return full;
      if (!new RegExp(fullEsc, "i").test(text)) return full;
      return text.replace(new RegExp(`(${fullEsc})`, "i"), `$1 (${anchor})`);
    });
  } else if (firstName.length >= 2) {
    const nameEsc = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, text: string | undefined) => {
      if (tag || text == null) return full;
      const re = new RegExp(`\\b(${nameEsc})\\b`, "i");
      if (!re.test(text)) return full;
      return text.replace(re, `$1 (${anchor})`);
    });
  }

  return out.replace(/\u0000IGLINK(\d+)\u0000/g, (_, idx: string) => {
    return placeholders[Number(idx)] ?? "";
  });
}

async function generateViaOpenAI(
  prompt: string,
  language: "fr" | "en"
): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });
  const safePrompt = prompt.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
    ""
  );
  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.55,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          language === "en"
            ? `You write COMPLETE BD gift follow-ups in ENGLISH ONLY: Hello ${GIFT_PRENOM_TOKEN}, + "Hope you're well?" + talent profile + proof points + gift ask reminder + CTA. Keep ${GIFT_PRENOM_TOKEN} literal — never a real first name. Never French. Never telegraphic. Include @instagram handle when provided. NO signature. JSON {"subject":"...","body":"..."}.`
            : `Tu rédiges des relances gift BD COMPLÈTES en FRANÇAIS : Hello ${GIFT_PRENOM_TOKEN}, + « J'espère que tu vas bien ? » + tutoiement, profil + preuves, rappel demande gift, CTA. Laisse ${GIFT_PRENOM_TOKEN} tel quel — jamais un prénom en dur. Jamais Bonjour/Salut, jamais vouvoiement, jamais style télégraphique. Inclure @handle Instagram si fourni. PAS de signature. JSON {"subject":"...","body":"..."}.`,
      },
      { role: "user", content: safePrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "";
  const o = tryParseJsonObject(raw);
  const subject = String(o.subject || "").trim();
  const body = String(o.body || "").trim();
  if (!subject || !body) return null;
  return { subject, body };
}

async function generateViaGrok(
  prompt: string
): Promise<{ subject: string; body: string } | null> {
  if (!process.env.XAI_API_KEY?.trim()) return null;
  const raw = await xaiResponse(prompt, {
    model: "grok-4.20-0309-non-reasoning",
    timeoutMs: 70_000,
  });
  const o = tryParseJsonObject(raw);
  const subject = String(o.subject || "").trim();
  const body = String(o.body || "").trim();
  if (!subject || !body) return null;
  return { subject, body };
}

/**
 * Relance gift J+2 — lettre complète (qualité pipeline indiv).
 */
export async function generateGiftRelanceBody(opts: {
  language?: "fr" | "en" | null;
  marqueNom: string;
  talentName: string;
  amName: string;
  contactPrenom?: string | null;
  previousSubject?: string | null;
  previousBodyText?: string | null;
  giftReference?: string | null;
  typeGiftLabel?: string | null;
  conceptSnippet?: string | null;
  /** Charge stats CRM + IG pour preuves chiffrées. */
  talentId?: string | null;
}): Promise<{ subject: string; bodyText: string }> {
  const language = normalizeContactLanguage(opts.language);
  const isEn = language === "en";
  const prenom = (opts.contactPrenom || "").trim();
  const prevSubject = (opts.previousSubject || "").trim();
  const prevBody = (opts.previousBodyText || "").trim().slice(0, 3200);
  const concept = (opts.conceptSnippet || "").trim().slice(0, 400);
  const typeLabel = (opts.typeGiftLabel || "gift").trim();
  const talentName = (opts.talentName || "").trim() || "le talent";
  const suggestedCta = pickCta(
    `${opts.marqueNom}|${opts.giftReference || ""}|${talentName}`,
    language
  );

  const snap = await loadGiftTalentSnap(opts.talentId);
  const talentBlock = snap
    ? formatGiftTalentBlock(snap)
    : `- ${talentName}\n  (pas de fiche CRM chargée — ne pas inventer de chiffres)`;

  const prompt = buildGiftRelancePrompt({
    language,
    marqueNom: opts.marqueNom,
    talentName,
    amName: opts.amName,
    contactPrenom: prenom,
    previousSubject: prevSubject,
    previousBodyText: prevBody,
    giftReference: opts.giftReference || "",
    typeGiftLabel: typeLabel,
    conceptSnippet: concept,
    suggestedCta,
    talentBlock,
  });

  let subject = "";
  let body = "";

  try {
    const viaOpenAI = await generateViaOpenAI(prompt, language);
    if (viaOpenAI) {
      subject = viaOpenAI.subject;
      body = viaOpenAI.body;
    }
  } catch (e) {
    console.warn(
      "[gift-relance-ai] OpenAI KO:",
      e instanceof Error ? e.message : e
    );
  }

  if (!subject || !body) {
    try {
      const viaGrok = await generateViaGrok(prompt);
      if (viaGrok) {
        subject = viaGrok.subject;
        body = viaGrok.body;
      }
    } catch (e) {
      console.warn(
        "[gift-relance-ai] Grok KO:",
        e instanceof Error ? e.message : e
      );
    }
  }

  if (!subject || !body) {
    throw new Error("Relance IA vide");
  }

  if (!/^re\s*:/i.test(subject)) {
    subject = prevSubject
      ? prevSubject.toLowerCase().startsWith("re:")
        ? prevSubject
        : `Re: ${prevSubject}`
      : isEn
        ? `Re: Gift proposal — ${talentName} × ${opts.marqueNom}`
        : `Re: Proposition gift — ${talentName} × ${opts.marqueNom}`;
  }

  body = postProcessGiftRelanceBody(body, {
    language,
    talentName,
    amName: opts.amName,
  });
  // Accroche toujours tokenisée — résolue à l'envoi (manuel / auto)
  body = tokenizeGiftPrenomGreeting(body, language);

  if (!giftRelanceBodyQualityOk(body)) {
    console.warn(
      `[gift-relance-ai] body qualité insuffisante (len/paragraphes) — fallback`
    );
    return buildGiftRelanceFallback({
      language,
      marqueNom: opts.marqueNom,
      talentName,
      previousSubject: prevSubject,
      instagram: snap?.instagram,
      typeGiftLabel: typeLabel,
    });
  }

  // S'assurer que le @handle apparaît en clair pour injection HTML à l'envoi
  const handle = normalizeInstagramHandle(snap?.instagram);
  if (handle && !new RegExp(`@?${handle}\\b`, "i").test(body)) {
    const nameEsc = talentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (nameEsc && new RegExp(nameEsc, "i").test(body)) {
      body = body.replace(
        new RegExp(`(${nameEsc})`, "i"),
        `$1 (@${handle})`
      );
    } else {
      body = `${body}\n\n(@${handle})`;
    }
    body = ensureGiftParagraphs(body);
  }

  return { subject, bodyText: body };
}

/** Fallback lettre structurée si l'IA échoue / qualité insuffisante. */
export function buildGiftRelanceFallback(opts: {
  language?: "fr" | "en" | null;
  marqueNom: string;
  talentName: string;
  contactPrenom?: string | null;
  previousSubject?: string | null;
  instagram?: string | null;
  typeGiftLabel?: string | null;
}): { subject: string; bodyText: string } {
  const language = normalizeContactLanguage(opts.language);
  const isEn = language === "en";
  const prev = (opts.previousSubject || "").trim();
  const handle = normalizeInstagramHandle(opts.instagram);
  const talentRef = handle
    ? `${opts.talentName} (@${handle})`
    : opts.talentName;
  const typeLabel = (opts.typeGiftLabel || "").trim();

  const subject = prev
    ? prev.toLowerCase().startsWith("re:")
      ? prev
      : `Re: ${prev}`
    : isEn
      ? `Re: Gift proposal — ${opts.talentName} × ${opts.marqueNom}`
      : `Re: Proposition gift — ${opts.talentName} × ${opts.marqueNom}`;

  const bodyText = isEn
    ? [
        `Hello ${GIFT_PRENOM_TOKEN},`,
        "",
        "Hope you're well?",
        "",
        `Just following up on my note about a gift collaboration with ${talentRef} for ${opts.marqueNom}.`,
        "",
        `${opts.talentName} would be a strong fit to showcase your products in an authentic setting${
          typeLabel ? ` (${typeLabel})` : ""
        }. Happy to share more on her universe and the ask if useful.`,
        "",
        "Would you be open to a quick exchange?",
      ].join("\n\n")
    : [
        `Hello ${GIFT_PRENOM_TOKEN},`,
        "",
        "J'espère que tu vas bien ?",
        "",
        `Je me permets de te relancer concernant une collaboration gift avec ${talentRef} pour ${opts.marqueNom}.`,
        "",
        `${opts.talentName} serait très pertinente pour mettre en avant tes produits dans un cadre authentique${
          typeLabel ? ` (${typeLabel})` : ""
        }. Je peux t'envoyer plus de détails sur son univers et la demande si tu veux.`,
        "",
        "On en discute ?",
      ].join("\n\n");

  return {
    subject,
    bodyText: tokenizeGiftPrenomGreeting(
      ensureGiftParagraphs(bodyText),
      language
    ),
  };
}
