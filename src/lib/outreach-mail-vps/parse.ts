/**
 * Parse la réponse ChatGPT VPS outreach → sujet + body HTML + récap / alertes.
 */

import { plainTextToEmailHtml } from "@/lib/email-body-html";
import { stripEndMarker } from "@/lib/carto-chat-vps/end-marker";
import { ensureContactFirstnameToken } from "@/lib/outreach-mail-vps/ensure-contact-firstname-token";
import { getInstagramProfileUrl } from "@/lib/social-links";
import { trimEmailHtmlEdges } from "@/lib/talent-email-links";

export type OutreachMailVpsRecap = {
  notes: string;
  hasExchange: boolean | null;
  historySummary: string;
  /** Analyse marque (web) — positionnement / nouveautés. */
  brandAnalysis: string;
  influenceSummary: string;
  /** Pourquoi chaque talent (data Glow Up + fit). */
  talentWhySummary: string;
  otherInfo: string;
  alerts: string[];
};

export type ParsedOutreachMailVps = {
  subject: string;
  bodyHtml: string;
  notes: string;
  recap: OutreachMailVpsRecap;
  raw: string;
};

/**
 * ChatGPT échappe souvent le HTML / markdown : `\<p>`, `https\://`, `\\Nom\\`, `\` en fin de ligne.
 * Sans ce nettoyage, le mail s’affiche avec des `\` partout chez le destinataire.
 */
/**
 * Détecte le VIEUX template casting (generate-email) :
 * media kits / moodboard / dump de vues / CTA « prochaines campagnes ».
 * Ces mails ne doivent JAMAIS être sauvés comme brouillon VPS Joey/Leyna.
 */
export function isLegacyCastingOutreachTemplate(html: string): boolean {
  const s = String(html || "");
  if (!s.trim()) return false;
  const hard = [
    /\bmedia\s*kits?\b/i,
    /\bmoodboard\b/i,
    /estimations?\s+de\s+performance(?:\s+sur\s+mesure)?/i,
    /plusieurs créateurs qui peuvent correspondre/i,
    /Nous serions ravis d'envisager une collaboration/i,
    /Je peux vous transmettre rapidement leurs media kits/i,
    /Dans notre agence nous avons plusieurs créateurs/i,
  ];
  if (hard.some((re) => re.test(s))) return true;

  // Combo soft = ancien pattern (vues + CTA campagnes + pas de gold Joey)
  const softHits = [
    /millions?\s+de\s+vues/i.test(s),
    /quelles seraient vos prochaines campagnes/i.test(s),
    /Seriez-vous intéressé par (?:l['’]un de )?ces créateurs/i.test(s),
    /roster ici/i.test(s),
  ].filter(Boolean).length;
  const hasJoeyGold =
    /viens de rejoindre le pôle Business Development/i.test(s) ||
    /Au-delà de cette première sélection/i.test(s);
  return softHits >= 2 && !hasJoeyGold;
}

/** Normalise HTML mail pour tests d’intro (accents, entities, backslashes Chat). */
function foldMailTextForIntroCheck(html: string): string {
  return unescapeChatMailHtml(String(html || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ocirc;/gi, "o")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(Number(n));
      } catch {
        return " ";
      }
    })
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Intro Joey gold obligatoire (tolérante : accents / entities / typos légères). */
export function hasJoeyGoldIntro(html: string): boolean {
  const t = foldMailTextForIntroCheck(html);
  if (/viens de rejoindre le pole business development/i.test(t)) return true;
  // Variantes Chat encore acceptables
  if (
    /je suis joey/i.test(t) &&
    /pole business development|pole bd|business development de glow up/i.test(t)
  ) {
    return true;
  }
  return false;
}

const JOEY_GOLD_INTRO_HTML =
  `<p>Je suis Joey, je viens de rejoindre le pôle Business Development de Glow Up et je serai ravie d'échanger avec vous autour de vos prochaines campagnes d'influence.</p>`;

/**
 * Filet Joey : si l’intro BD manque (faux négatif parse / HTML échappé),
 * l’insère après « J'espère que vous allez bien ».
 */
export function ensureJoeyGoldIntroHtml(html: string): string {
  let s = String(html || "").trim();
  if (!s || hasJoeyGoldIntro(s)) return s;
  if (isLegacyCastingOutreachTemplate(s)) return s;

  // Après le paragraphe d’espoir
  const hopeRe =
    /(<p\b[^>]*>\s*J['’]espère que vous allez bien\s*[!.]?\s*<\/p>)/i;
  if (hopeRe.test(s)) {
    return s.replace(hopeRe, `$1\n${JOEY_GOLD_INTRO_HTML}`);
  }
  // Après Bonjour {{ contact.firstname }}
  const helloRe =
    /(<p\b[^>]*>\s*Bonjour\s*\{\{\s*contact\.firstname\s*\}\}\s*,?\s*<\/p>)/i;
  if (helloRe.test(s)) {
    return s.replace(
      helloRe,
      `$1\n<p>J'espère que vous allez bien !</p>\n${JOEY_GOLD_INTRO_HTML}`
    );
  }
  // En tête de BODY
  return `${JOEY_GOLD_INTRO_HTML}\n${s}`;
}

/** Décode entities HTML courantes avant match talents (sinon M&eacute;lissa ≠ Mélissa). */
function decodeBasicHtmlEntities(v: string): string {
  return String(v || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(Number(n));
      } catch {
        return " ";
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCharCode(parseInt(h, 16));
      } catch {
        return " ";
      }
    })
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ");
}

/** Fold texte pour matcher prénoms talents (accents / ponctuation). */
function foldForTalentNameCheck(v: string): string {
  return decodeBasicHtmlEntities(v)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Noms requis absents du BODY (même règle que TALENTS_MISSING).
 * Match sur le 1er token (prénom) ≥ 2 chars.
 */
export function listMissingRequiredTalentNames(
  html: string,
  requiredTalentNames?: string[] | null
): string[] {
  const required = (requiredTalentNames || [])
    .map((n) => String(n || "").trim())
    .filter(Boolean);
  if (required.length === 0) return [];
  const textFold = foldForTalentNameCheck(
    String(html || "").replace(/<[^>]+>/g, " ")
  );
  return required.filter((full) => {
    const first =
      foldForTalentNameCheck(full).split(/\s+/).filter(Boolean)[0] || "";
    return first.length >= 2 && !textFold.includes(first);
  });
}

export type RequiredTalentMailPitch = {
  name: string;
  instagram?: string | null;
  /** Phrase courte (angle / why CRM) — sans HTML. */
  pitch?: string | null;
};

function escapeHtmlText(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function talentNameLinkHtml(name: string, instagram?: string | null): string {
  const label = escapeHtmlText(name.trim());
  const url = getInstagramProfileUrl(instagram);
  if (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"><strong>${label}</strong></a>`;
  }
  return `<strong>${label}</strong>`;
}

function sanitizeTalentPitchLine(raw: string, maxLen = 180): string {
  let s = String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(
    /(?:Secret\s*Story|Koh[- ]?Lanta|Loft\s*Story|P[ée]kin\s*Express|The\s*Voice|Star\s*Academy|t[ée]l[ée][- ]?r[ée]alit[ée])/gi,
    ""
  );
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
  if (s.length > maxLen) {
    s = `${s.slice(0, maxLen - 1).replace(/\s+\S*$/, "").trim()}…`;
  }
  return s;
}

/**
 * Filet TALENTS_MISSING (officiel) : injecte les puces absentes depuis CRM / research
 * avant talentbook / pont / CTA — même famille que ensureJoey / ensureTalentbook.
 * Chat saute souvent 2–4 talents sur les gros rosters ; le prompt seul ne suffit pas.
 */
export function ensureRequiredTalentsInHtml(
  html: string,
  talents: RequiredTalentMailPitch[],
  opts?: { language?: "fr" | "en" | null }
): string {
  let s = String(html || "").trim();
  if (!s || !Array.isArray(talents) || talents.length === 0) return s;
  if (isLegacyCastingOutreachTemplate(s)) return s;

  const missingFold = new Set(
    listMissingRequiredTalentNames(
      s,
      talents.map((t) => t.name)
    ).map((n) => foldForTalentNameCheck(n))
  );
  if (missingFold.size === 0) return s;

  const en = opts?.language === "en";
  const fallback = en
    ? "a creator who fits this brief"
    : "un profil aligné avec ce brief";
  const bullets: string[] = [];
  for (const t of talents) {
    const name = String(t.name || "").trim();
    if (!name) continue;
    if (!missingFold.has(foldForTalentNameCheck(name))) continue;
    const pitch = sanitizeTalentPitchLine(String(t.pitch || "")) || fallback;
    bullets.push(
      `<p>• ${talentNameLinkHtml(name, t.instagram)} — ${escapeHtmlText(pitch)}</p>`
    );
  }
  if (bullets.length === 0) return s;

  const block = bullets.join("\n");

  const tbRe =
    /(<p[^>]*>[\s\S]*?(?:talent\s*book|talentbook)[\s\S]*?<\/p>)/i;
  if (tbRe.test(s)) {
    return s.replace(tbRe, `${block}\n$1`);
  }
  const pontRe =
    /(<p[^>]*>\s*(?:Au-delà de cette première sélection|Beyond this first selection)[\s\S]*?<\/p>)/i;
  if (pontRe.test(s)) {
    return s.replace(pontRe, `${block}\n$1`);
  }
  const ctaRe =
    /(<p[^>]*>[\s\S]*?15\s*min(?:utes)?[\s\S]*?<\/p>)/i;
  if (ctaRe.test(s)) {
    return s.replace(ctaRe, `${block}\n$1`);
  }
  const closeRe =
    /(<p[^>]*>\s*(?:Au plaisir|Belle journée|Best regards|Looking forward|Cordialement)[\s\S]*?<\/p>)/i;
  if (closeRe.test(s)) {
    return s.replace(closeRe, `${block}\n$1`);
  }
  return `${s}\n${block}`;
}

/**
 * Garde-fou qualité mail VPS — throw si legacy / Joey sans intro / incomplet
 * / talents sélectionnés absents du BODY.
 * Appelé au parse ET avant save (double filet).
 */
export function assertOutreachVpsMailQuality(
  html: string,
  opts?: {
    joey?: boolean | null;
    /** Prénoms / noms des talents à pitcher — tous doivent apparaître dans le BODY. */
    requiredTalentNames?: string[] | null;
  }
): void {
  const s = String(html || "");
  if (isLegacyCastingOutreachTemplate(s)) {
    throw new Error(
      "LEGACY_CASTING_TEMPLATE — refus (media kits / moodboard / vieux CTA). Relancer la rédaction gold."
    );
  }
  if (looksLikeMailPromptEcho(s)) {
    throw new Error(
      "PROMPT_ECHO — refus (consignes prompt / FIN DE BODY collées dans le mail). Relancer."
    );
  }
  if (opts?.joey) {
    if (!hasJoeyGoldIntro(s)) {
      throw new Error(
        "JOEY_INTRO_MISSING — refus (pas d’intro « je viens de rejoindre le pôle Business Development »)."
      );
    }
    if (!/15\s*minutes/i.test(s)) {
      throw new Error(
        "JOEY_CTA_MISSING — refus (CTA 15 minutes manquant)."
      );
    }
    // Salut / espoir avant les puces (sinon mail tronqué / ordre inversé).
    const plain = s.replace(/<[^>]+>/g, " ");
    const helloIdx = plain.search(/Bonjour\s*\{\{\s*contact\.firstname\s*\}\}/i);
    const hopeIdx = plain.search(/J['’]esp[eè]re que vous allez bien/i);
    const bulletIdx = plain.search(/•/);
    if (helloIdx < 0 || hopeIdx < 0) {
      throw new Error(
        "JOEY_STRUCTURE — refus (manque Bonjour / J'espère en tête). Relancer."
      );
    }
    if (bulletIdx >= 0 && (bulletIdx < helloIdx || bulletIdx < hopeIdx)) {
      throw new Error(
        "JOEY_STRUCTURE — refus (puces talents avant le salut). Relancer."
      );
    }
  }
  if (isOutreachMailBodyIncomplete(s)) {
    throw new Error(
      "MAIL_INCOMPLETE — refus (CTA / clôture manquants ou BODY tronqué)."
    );
  }
  const missing = listMissingRequiredTalentNames(
    s,
    opts?.requiredTalentNames
  );
  if (missing.length > 0) {
    throw new Error(
      `TALENTS_MISSING — refus (absents du BODY : ${missing.join(", ")}). Tous les talents sélectionnés doivent être pitchés.`
    );
  }
}
/** True si le BODY semble coupé (pas de CTA / clôture, ou dernier &lt;p&gt; tronqué). */
export function isOutreachMailBodyIncomplete(html: string): boolean {
  const s = String(html || "").trim();
  if (s.length < 120) return true;
  const text = s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasCta =
    /15\s*minutes/i.test(text) ||
    /organiser un call avec vous/i.test(text) ||
    /would you have 15/i.test(text);
  const hasClose =
    /Au plaisir d['’]échanger/i.test(text) ||
    /Belle journée/i.test(text) ||
    /Best regards/i.test(text) ||
    /Looking forward/i.test(text) ||
    /Cordialement/i.test(text);
  if (!hasCta || !hasClose) return true;

  // &lt;p&gt; non fermé en fin
  const opens = (s.match(/<p\b/gi) || []).length;
  const closes = (s.match(/<\/p>/gi) || []).length;
  if (opens > closes) return true;

  const paras = [...s.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const lastInner = (paras[paras.length - 1]?.[1] || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  if (!lastInner) return true;
  // Clôtures connues OK même avec virgule finale
  if (
    /^(Au plaisir|Belle journée|Best regards|Looking forward|Cordialement)/i.test(
      lastInner
    )
  ) {
    return false;
  }
  // CTA / question en dernier paragraphe OK si « ? » présent
  if (/15\s*minutes|organiser un call|Would you have 15/i.test(lastInner)) {
    return !/\?/.test(lastInner);
  }
  // Dernier paragraphe qui ne finit pas par ponctuation → tronqué (ex. « campagnes d' »)
  return !/[.!?…,]$/.test(lastInner);
}

/**
 * Filet : si Chat a coupé avant CTA / clôture, retire le dernier &lt;p&gt; tronqué
 * et append la fin gold (pont + CTA 15 min + Au plaisir).
 */
export function ensureOutreachMailClosingHtml(
  html: string,
  opts?: { language?: "fr" | "en" | null }
): string {
  let s = String(html || "").trim();
  if (!s) return s;
  // Ne JAMAIS « réparer » un vieux template casting en collant le CTA gold dessus.
  if (isLegacyCastingOutreachTemplate(s)) return s;
  const en = opts?.language === "en";

  // Ferme un &lt;p&gt; orphelin
  const opens = (s.match(/<p\b/gi) || []).length;
  const closes = (s.match(/<\/p>/gi) || []).length;
  if (opens > closes) s = `${s}</p>`;

  const hasCta =
    /15\s*minutes/i.test(s) ||
    /organiser un call avec vous/i.test(s) ||
    /would you have 15/i.test(s);
  const hasClose =
    /Au plaisir d['’]échanger/i.test(s) ||
    /Belle journée/i.test(s) ||
    /Best regards/i.test(s) ||
    /Looking forward/i.test(s);

  if (hasCta && hasClose && !isOutreachMailBodyIncomplete(s)) {
    return s;
  }

  // Retire le dernier paragraphe s'il est clairement tronqué / pont incomplet
  const paras = [...s.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)];
  if (paras.length > 0) {
    const last = paras[paras.length - 1][0];
    const lastText = last
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const looksTruncated =
      (/Au-delà de cette première sélection|Beyond this first selection/i.test(
        lastText
      ) &&
        !/[.!?…]$/.test(lastText)) ||
      (!/[.!?…,]$/.test(lastText) &&
        !/15\s*minutes/i.test(lastText) &&
        !/Au plaisir|Belle journée|Best regards/i.test(lastText));
    if (looksTruncated) {
      const idx = s.lastIndexOf(last);
      if (idx >= 0) s = s.slice(0, idx).trim();
    }
  }

  const hasPont = /Au-delà de cette première sélection|Beyond this first selection/i.test(
    s
  );
  const pont = en
    ? `<p>Beyond this first selection, I'd especially like to take the time to get to know you, understand how you run your influencer campaigns and what kinds of profiles you're looking for.</p>`
    : `<p>Au-delà de cette première sélection, j'aimerais surtout prendre le temps de faire votre connaissance, comprendre comment vous travaillez vos campagnes d'influence et quels types de profils vous recherchez.</p>`;
  const cta = en
    ? `<p><strong>Would you have 15 minutes in the coming days to discuss?</strong></p>`
    : `<p><strong>Est-ce que vous auriez 15 minutes à m'accorder dans les prochains jours pour en discuter ?</strong></p>`;
  const close = en
    ? `<p>Looking forward to speaking with you,</p>`
    : `<p>Au plaisir d'échanger avec vous,</p>`;

  const parts = [s];
  if (!hasCta) {
    if (!hasPont) parts.push(pont);
    parts.push(cta);
  }
  if (!hasClose) parts.push(close);

  return parts.filter(Boolean).join("\n");
}

/**
 * Filet CTA : force le gras sur la question « 15 minutes… » (gold Joey / Leyna).
 */
export function ensureOutreachCtaBoldHtml(html: string): string {
  let s = String(html || "");
  if (!s.trim()) return s;

  // Déjà en strong sur la question 15 min → ok
  if (
    /<strong[^>]*>[^<]*15\s*minutes[^<]*<\/strong>/i.test(s) ||
    /<strong[^>]*>[^<]*15\s*min[^<]*<\/strong>/i.test(s)
  ) {
    return s;
  }

  // <p>Est-ce que vous auriez 15 minutes… ?</p> → wrap strong
  s = s.replace(
    /(<p[^>]*>)\s*((?:Est-ce que vous auriez|Auriez-vous|Would you have)[^<]*15\s*min(?:utes)?[^<]*\?)\s*(<\/p>)/i,
    "$1<strong>$2</strong>$3"
  );

  // Si toujours pas de strong 15 min mais phrase présente hors balise
  if (!/<strong[^>]*>[^<]*15\s*min/i.test(s)) {
    s = s.replace(
      /((?:Est-ce que vous auriez|Auriez-vous|Would you have)[^<]*15\s*min(?:utes)?[^<.]*\?)/i,
      "<strong>$1</strong>"
    );
  }

  return s;
}

/**
 * Filet : retire mentions télé-réalité / Secret Story (jamais dans un mail client).
 */
export function stripForbiddenTalentBioFromHtml(html: string): string {
  let s = String(html || "");
  if (!s.trim()) return s;

  // Phrases type « passé par Secret Story en 2026, »
  s = s.replace(
    /(?:passé[e]?\s+par|connu[e]?\s+pour|vu[e]?\s+dans|issu[e]?\s+de|après)\s+[^.<,]{0,40}?(?:Secret\s*Story|Koh[- ]?Lanta|Loft\s*Story|P[ée]kin\s*Express|The\s*Voice|Star\s*Academy|t[ée]l[ée][- ]?r[ée]alit[ée])[^.<,]{0,40}?(?:,|\s+en\s+20\d{2})?\s*/gi,
    ""
  );
  // Mentions isolées encore présentes
  s = s.replace(
    /(?:Secret\s*Story|Koh[- ]?Lanta|Loft\s*Story|P[ée]kin\s*Express|The\s*Voice|Star\s*Academy)/gi,
    ""
  );
  // Nettoyage espaces / ponctuation cassée
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/\s+([,.;])/g, "$1");
  s = s.replace(/—\s*,/g, "—");
  s = s.replace(/,\s*—/g, " —");
  return s;
}

/**
 * Filet : talentbook toujours présent + lien cliquable (pas d’URL brute seule).
 */
export function ensureTalentbookInHtml(
  html: string,
  opts?: { market?: string | null; language?: "fr" | "en" | null }
): string {
  let s = String(html || "");
  if (!s.trim()) return s;
  const url =
    String(opts?.market || "").toUpperCase() === "BENELUX"
      ? "https://app.glowupagence.fr/talentbook/be"
      : "https://app.glowupagence.fr/talentbook";

  // URL brute → lien cliquable
  s = s.replace(
    /(?<!href=["'])(https?:\/\/app\.glowupagence\.fr\/talentbook(?:\/be)?\/?(?:[^\s<"']*)?)/gi,
    (m) => {
      const clean = m.replace(/[),.;]+$/g, "");
      return `<a href="${clean}">${clean}</a>`;
    }
  );

  if (/talentbook/i.test(s) || /app\.glowupagence\.fr\/talentbook/i.test(s)) {
    // Mention sans URL → ajoute le lien à la fin du paragraphe concerné
    if (!/href=["'][^"']*talentbook/i.test(s)) {
      s = s.replace(
        /(<(?:p|div)[^>]*>[^<]*talent\s*book[^<]*)(<\/(?:p|div)>)/i,
        `$1 <a href="${url}">${url}</a>$2`
      );
      if (!/href=["'][^"']*talentbook/i.test(s)) {
        s = s.replace(
          /(<(?:p|div)[^>]*>[^<]*talentbook[^<]*)(<\/(?:p|div)>)/i,
          `$1 <a href="${url}">${url}</a>$2`
        );
      }
    }
    return s;
  }

  const en = opts?.language === "en";
  const sentence = en
    ? `<p>You can also browse all our profiles in our <a href="${url}">talentbook</a>.</p>`
    : `<p>Vous pouvez également retrouver l'ensemble de nos profils dans notre <a href="${url}">talentbook</a>.</p>`;

  // Avant « Belle journée / Best regards / Cordialement »
  const closeRe =
    /(<p[^>]*>\s*(?:Belle journée\s*,|Best regards\s*,|Cordialement\s*,)\s*<\/p>)/i;
  if (closeRe.test(s)) {
    return s.replace(closeRe, `${sentence}\n$1`);
  }

  // Avant un paragraphe CTA call
  const ctaRe =
    /(<p[^>]*>[^<]*(?:call|appel|15\s*min|priorit)[^<]*<\/p>)/i;
  if (ctaRe.test(s)) {
    return s.replace(ctaRe, `${sentence}\n$1`);
  }

  return `${s.trim()}\n${sentence}`;
}

export function unescapeChatMailHtml(raw: string): string {
  let s = String(raw || "");
  // Balises / quotes échappées
  s = s
    .replace(/\\</g, "<")
    .replace(/\\>/g, ">")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
  // URLs type https\://www\.instagram\.com\/x\/
  s = s.replace(/\\([/:._~?&=%@#-])/g, "$1");
  // Gras markdown échappé : \\Nom Complet\\ → <strong>Nom Complet</strong>
  s = s.replace(
    /\\\\([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-]*){0,3})\\\\/g,
    "<strong>$1</strong>"
  );
  // Italique / mot isolé : \Studio\ → Studio (le strong métier suffit)
  s = s.replace(
    /\\([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’&\-]*(?:\s+[A-Za-zÀ-ÿ0-9'’&\-]*){0,2})\\/g,
    "$1"
  );
  // `\` orphelin en fin de ligne / avant balise / entre tags
  s = s.replace(/\\\s*(?=<)/g, "");
  s = s.replace(/\\\s*$/gm, "");
  s = s.replace(/>\s*\\\s*</g, "><");
  s = s.replace(/\\{2,}/g, "");
  s = s.replace(/\\(?![a-zA-Z0-9])/g, "");
  return s;
}

function isNoiseAlert(line: string): boolean {
  const t = String(line || "")
    .trim()
    .replace(/^\*+\s*/, "")
    .replace(/\*+$/, "")
    .trim();
  if (!t || t === "*" || t === "**") return true;
  if (/^aucune\b/i.test(t)) return true;
  if (/une ligne par alerte/i.test(t)) return true;
  if (/ex\.\s*négociation|refus récent|déjà contacté il y a/i.test(t))
    return true;
  if (/CODE DE FIN|GLOWUP_CART_DONE|caractère pour caractère/i.test(t))
    return true;
  if (/ne pas ignorer|UNIQUE à cette recherche|cartographie/i.test(t))
    return true;
  if (/^Règles?\s*:/i.test(t)) return true;
  if (/^Puis le CODE/i.test(t)) return true;
  if (/FORMAT DE RÉPONSE|N'invente PAS|N'utilise PAS|Rien après/i.test(t))
    return true;
  if (/^#{1,3}\s*CODE/i.test(t)) return true;
  if (/web obligatoire|oui\/non|Branche mail utilisée/i.test(t)) return true;
  return false;
}

/** Chat / scrape a parfois renvoyé le brief entier au lieu du mail. */
export function looksLikeMailPromptEcho(text: string): boolean {
  const t = String(text || "");
  if (
    /Tu es business developer chez \*\*Glow Up Agence\*\*/i.test(t) ||
    /^MARQUE À ANALYSER\s*:/i.test(t.trim())
  ) {
    // Echo typique : le brief complet est encore là
    if (/FORMAT DE RÉPONSE \(STRICT\)/i.test(t)) return true;
    if (/MISSION \(dans cet ordre\)/i.test(t)) return true;
  }
  if (/objet court avec le nom/i.test(t) && /mail en HTML simple/i.test(t)) {
    return true;
  }
  // Consignes du prompt collées dans le BODY (ex. Deezer Joey).
  if (/FIN DE BODY\s*\(NON N[ÉE]GOCIABLE/i.test(t)) return true;
  if (/anti-troncature/i.test(t) && /100\s*%\s*termin/i.test(t)) return true;
  if (/vrai mail HTML COMPLET\s*\(structure gold/i.test(t)) return true;
  if (/Le BODY doit être\s*\*\*100\s*%/i.test(t)) return true;
  if (/N['’]écris NOTES que lorsque/i.test(t)) return true;
  if (/##\s*FIN DE BODY/i.test(t)) return true;
  return false;
}

/**
 * Retire les fuites de consignes prompt collées dans le BODY
 * (FIN DE BODY, placeholders « structure gold », etc.).
 */
export function stripPromptLeakFromMailBody(html: string): string {
  let s = String(html || "");
  if (!s.trim()) return s;

  // Coupe dès un titre / consigne de prompt.
  const cutRe =
    /(?:<\/p>\s*)?(?:#{1,3}\s*)?(?:FIN DE BODY|BARRE QUALIT[EÉ]|FORMAT\s*\(STRICT\)|##\s*NOTES)\b[\s\S]*$/i;
  s = s.replace(cutRe, "").trim();

  // Lignes / paragraphes consignes isolés
  s = s.replace(
    /<p\b[^>]*>[\s\S]*?(?:vrai mail HTML COMPLET|structure gold\s+Joey|structure gold\s+Leyna)[\s\S]*?<\/p>/gi,
    ""
  );
  s = s.replace(
    /(?:…|\.{2,})\s*vrai mail HTML COMPLET[\s\S]*?(?:structure gold[^<\n]*)?/gi,
    ""
  );
  s = s.replace(/\(?\s*structure gold\s+(?:Joey|Leyna)\s*\)?/gi, "");
  s = s.replace(
    /(?:^|\n)\s*[-*•]?\s*Le BODY doit être[\s\S]*?(?=\n\s*<p|\n\s*$|$)/gi,
    "\n"
  );
  s = s.replace(
    /(?:^|\n)\s*[-*•]?\s*INTERDIT de couper[\s\S]*?(?=\n\s*<p|\n\s*$|$)/gi,
    "\n"
  );
  s = s.replace(
    /(?:^|\n)\s*[-*•]?\s*Si tu manques de place[\s\S]*?(?=\n\s*<p|\n\s*$|$)/gi,
    "\n"
  );
  s = s.replace(
    /(?:^|\n)\s*[-*•]?\s*N['’]écris NOTES[\s\S]*?(?=\n\s*<p|\n\s*$|$)/gi,
    "\n"
  );
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  const opens = (s.match(/<p\b/gi) || []).length;
  const closes = (s.match(/<\/p>/gi) || []).length;
  if (opens > closes) s = `${s}</p>`;
  return s.trim();
}

/** Accroche usine / placeholders — à réécrire (le préfixe « Marque x Glow Up » est OBLIGATOIRE). */
export function isFactoryOutreachSubject(subject: string): boolean {
  const s = String(subject || "").trim();
  if (!s) return true;
  if (/\{\{\s*contact\./i.test(s)) return true;
  if (/bel objet ancré|voir règles OBJET/i.test(s)) return true;
  if (/^\[accroche|^\[REMPLACE/i.test(s)) return true;
  if (/quelques profils pour vos prochaines campagnes/i.test(s)) return true;
  if (/d[ée]couvrez nos talents/i.test(s)) return true;
  if (/pour vos prochaines activations/i.test(s)) return true;
  if (/idées?\s+côté\s+influence/i.test(s)) return true;
  if (/proposition de (?:créateurs|talents)/i.test(s)) return true;
  // Manque le format obligatoire « … x Glow Up — »
  if (!/[x×]\s*Glow\s*Up\s*[—\-–:]/i.test(s)) return true;
  return false;
}

/**
 * Force le format obligatoire : « {Marque} x Glow Up — {accroche} ».
 */
export function rewriteFactoryOutreachSubject(
  subject: string,
  brandName?: string | null
): string {
  const brand = String(brandName || "").trim() || "Marque";
  let s = String(subject || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extraire l’accroche si déjà préfixée (x Glow Up / × Glow Up / ordre inversé)
  let hook = s
    .replace(/^.*?[x×]\s*Glow\s*Up\s*[—\-–:]\s*/i, "")
    .replace(/^.*?Glow\s*Up\s*[x×]\s*[—\-–:]?\s*/i, "")
    .trim();
  // Si pas de préfixe, l’objet entier = accroche (éventuellement « Marque — … »)
  if (hook === s) {
    hook = s
      .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—\\-–:]\\s*`, "i"), "")
      .trim();
  }
  hook = hook
    .replace(/^quelques profils pour vos prochaines campagnes$/i, "")
    .replace(/^idées?\s+côté\s+influence$/i, "")
    .replace(/^proposition de (?:créateurs|talents).*$/i, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .trim();
  if (!hook || hook.length < 4) hook = "idée créateurs";

  return `${brand} x Glow Up — ${hook}`.slice(0, 90);
}

function isTemplateSubject(subject: string): boolean {
  const s = String(subject || "").trim();
  if (!s) return true;
  if (/^\\?</.test(s) || /objet court/i.test(s)) return true;
  if (/^\[REMPLACE/i.test(s)) return true;
  if (/^<.*>$/.test(s)) return true;
  // « Marque x Glow Up » = usine → réécrit à la save, pas un fail parse.
  return false;
}

function isTemplateBody(body: string): boolean {
  const b = String(body || "").trim();
  if (!b) return true;
  if (/mail en HTML simple/i.test(b)) return true;
  if (/…mail|\\.\\.\\.mail/i.test(b) && b.length < 200) return true;
  // Body qui n'est que le squelette html d'exemple
  const plain = b.replace(/<[^>]+>/g, "").replace(/\\/g, "").trim();
  if (plain.length < 60) return true;
  return false;
}

/**
 * Chat colle parfois NOTES / ALERTES / analyse marque dans le BODY.
 * Coupe dès le premier marqueur dossier interne (hors mail client).
 */
export function stripNotesLeakFromMailBody(body: string): string {
  let s = String(body || "");
  if (!s.trim()) return s;

  // Après clôture mail → tout le reste est du dossier.
  const closeRe =
    /((?:<p[^>]*>\s*)?(?:Belle journée\s*,|Best regards\s*,|Cordialement\s*,)\s*(?:<\/p>)?)/i;
  const closeM = closeRe.exec(s);
  if (closeM && typeof closeM.index === "number") {
    s = s.slice(0, closeM.index + closeM[1].length).trim();
  }

  // NOTES / dossier interne — pas le BODY client.
  // « Influence Marque: » : lookbehind + majuscule après Influence pour NE PAS
  // matcher « campagnes d'influence … » (sinon coupe les puces talents → faux TALENTS_MISSING).
  const leakRe =
    /(?:<\/p>\s*)?(?:<p[^>]*>\s*)?(?:\*{0,2}\s*)?(?:NOTES(?:\s+Échange|\s+Leyna|\s+Joey)?|ALERTES?|Échange\s+Leyna\s*\/\s*Joey|Branche\s*:|Ton utilisé\s*:|Analyse marque|Pourquoi chaque talent|Cohérence\s*10\s*\/\s*10)\b|(?<![A-Za-zÀ-ÿ'’])Influence\s+[A-ZÀ-Ü][^<\n:]{0,80}:/i;
  const leakIdx = s.search(leakRe);
  if (leakIdx >= 0) {
    s = s.slice(0, leakIdx).trim();
  }

  s = s.replace(/(?:<br\s*\/?>|\s)+$/gi, "").trim();
  const opens = (s.match(/<p\b/gi) || []).length;
  const closes = (s.match(/<\/p>/gi) || []).length;
  if (opens > closes) s = `${s}</p>`;
  return s.trim();
}

function parseNotesBlock(notesRaw: string): OutreachMailVpsRecap {
  const full = String(notesRaw || "").trim();
  // Couper avant le bloc CODE DE FIN s'il a fuité dans NOTES
  const cut = full.split(
    /\n\s*(?:Puis le CODE|#{1,3}\s*CODE DE FIN|À la TOUTE FIN)/i
  )[0];
  const alertsSplit = cut.split(/\bALERTES?\s*:/i);
  const notesPart = (alertsSplit[0] || "").trim();
  const alertsPart = (alertsSplit[1] || "").trim();

  const alerts: string[] = [];
  for (const line of alertsPart.split(/\n/)) {
    const t = line
      .replace(/^[-*•]\s*/, "")
      .replace(/^⚠\s*/, "")
      .replace(/^\\/, "")
      .replace(/\*{1,2}/g, "")
      .replace(/\s+:/g, ":")
      .trim();
    if (isNoiseAlert(t)) continue;
    alerts.push(t);
  }
  // Alertes aussi éventuellement dans NOTES (lignes ⚠ / ALERTE)
  for (const line of notesPart.split(/\n/)) {
    const rawLine = line.trim();
    if (/^(⚠|ALERTE\b)/i.test(rawLine)) {
      const t = rawLine.replace(/^(⚠|ALERTE)\s*:?\s*/i, "").trim();
      if (t && !isNoiseAlert(t) && !alerts.includes(t)) alerts.push(t);
    }
  }

  let hasExchange: boolean | null = null;
  if (/échange[^:\n]*:\s*oui\b/i.test(notesPart) || /\boui\b.*échange/i.test(notesPart)) {
    hasExchange = true;
  } else if (
    /échange[^:\n]*:\s*non\b/i.test(notesPart) ||
    (/\baucun\b/i.test(notesPart) && /échange|historique/i.test(notesPart))
  ) {
    hasExchange = false;
  }

  const pickSection = (...labels: string[]) => {
    for (const label of labels) {
      // Accepte `- **Label :**` / `**Label:**` / `Label:`
      const re = new RegExp(
        `(?:^|\\n)\\s*[-*•]?\\s*\\*{0,2}\\s*${label}\\s*\\*{0,2}\\s*[:：]\\s*\\*{0,2}\\s*([\\s\\S]*?)(?=\\n\\s*(?:[-*•]\\s*)?\\*{0,2}\\s*(?:Échange|Branche|Résumé|Analyse\\s+marque|Influence|Pourquoi\\s+chaque|Cohérence|Autres|ALERT)|$)`,
        "i"
      );
      const m = notesPart.match(re);
      if (m?.[1]?.trim()) {
        const v = m[1].trim().replace(/^\*+\s*/, "").replace(/\*+$/g, "").trim();
        // Refuse les lignes d'exemple du template NOTES
        if (/web obligatoire|oui\/non|2–4 lignes|1 ligne \/ talent/i.test(v)) {
          continue;
        }
        return v;
      }
    }
    return "";
  };

  return {
    notes: notesPart,
    hasExchange,
    historySummary:
      pickSection("Résumé historique", "Historique", "Résumé") || "",
    brandAnalysis:
      pickSection("Analyse marque[^\\n:]*", "Analyse de la marque", "Marque") ||
      "",
    influenceSummary: pickSection("Influence[^\n:]*", "Influence") || "",
    talentWhySummary:
      pickSection(
        "Pourquoi chaque talent[^\\n:]*",
        "Pourquoi les talents",
        "Fit talents"
      ) || "",
    otherInfo: pickSection("Autres infos[^\\n:]*", "Autres") || "",
    alerts,
  };
}

export function parseOutreachMailVpsAnswer(
  rawAnswer: string,
  endMarker?: string | null
): ParsedOutreachMailVps {
  const raw = stripEndMarker(String(rawAnswer || ""), endMarker).trim();
  if (!raw) {
    throw new Error("Réponse Chat vide");
  }
  if (looksLikeMailPromptEcho(raw)) {
    throw new Error("Réponse Chat = echo du prompt (pas un mail)");
  }

  // Préférer le DERNIER bloc SUBJECT:… (évite le template collé avant la vraie réponse)
  const subjectMatches = [...raw.matchAll(/^\s*SUBJECT\s*:\s*(.+)$/gim)];
  const lastSubject = subjectMatches[subjectMatches.length - 1];
  const subjectIdx = lastSubject?.index ?? -1;
  const fromSubject =
    subjectIdx >= 0 ? raw.slice(subjectIdx) : raw;

  const subjectMatch = fromSubject.match(/^\s*SUBJECT\s*:\s*(.+)$/im);
  const bodyMatch = fromSubject.match(
    /\bBODY\s*:\s*([\s\S]*?)(?=\n\s*NOTES(?:\s|:)|$)/i
  );
  const notesMatch = fromSubject.match(
    /\bNOTES(?:\s*:|\s+Échange|\s+Leyna|\s+Joey)\s*:?\s*([\s\S]*)$/i
  );

  let subject = (subjectMatch?.[1] || "").trim().replace(/^\\/, "");
  let bodyRaw = (bodyMatch?.[1] || "").trim().replace(/^\\/, "");
  let notes = (notesMatch?.[1] || "").trim();

  // Fallback: si Chat n'a pas respecté le format, tenter un découpage naïf.
  if (!subject || !bodyRaw) {
    const lines = fromSubject.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (!subject && lines[0]) {
      subject = lines[0].replace(/^#+\s*/, "").replace(/^SUBJECT\s*:\s*/i, "");
    }
    if (!bodyRaw) {
      bodyRaw = fromSubject
        .replace(/^\s*SUBJECT\s*:.*$/im, "")
        .replace(/\bNOTES(?:\s*:|\s+Échange)[\s\S]*$/i, "")
        .replace(/^\s*BODY\s*:\s*/im, "")
        .trim();
    }
  }

  // Si NOTES a fuité dans le BODY, récupère le dossier + purge le mail.
  if (!notes && /\bNOTES\b/i.test(bodyRaw)) {
    const split = bodyRaw.split(/\bNOTES(?:\s*:|\s+Échange|\s+Leyna|\s+Joey)?\s*:?\s*/i);
    if (split.length > 1) {
      notes = split.slice(1).join("\n").trim();
      bodyRaw = split[0].trim();
    }
  }
  bodyRaw = stripPromptLeakFromMailBody(stripNotesLeakFromMailBody(bodyRaw));

  subject = subject.replace(/^["«]|["»]$/g, "").trim();
  if (isTemplateSubject(subject)) {
    throw new Error("Sujet template / placeholder — pas une vraie réponse");
  }
  if (!subject) throw new Error("Sujet manquant dans la réponse Chat");
  if (isTemplateBody(bodyRaw) || !bodyRaw || bodyRaw.length < 80) {
    throw new Error("Corps du mail trop court / template / manquant");
  }
  if (looksLikeMailPromptEcho(bodyRaw)) {
    throw new Error("Réponse Chat = echo du prompt (consignes dans le BODY)");
  }

  const unescaped = unescapeChatMailHtml(bodyRaw);
  const bodyHtmlRaw = unescaped.trim().startsWith("<")
    ? unescaped
    : plainTextToEmailHtml(unescaped) || `<p>${unescaped}</p>`;
  let bodyHtml = ensureContactFirstnameToken(
    trimEmailHtmlEdges(
      stripPromptLeakFromMailBody(stripNotesLeakFromMailBody(bodyHtmlRaw))
    )
  );
  // Filet anti-troncature : Chat coupe parfois le BODY avant CTA / clôture.
  bodyHtml = ensureOutreachMailClosingHtml(bodyHtml);
  bodyHtml = ensureOutreachCtaBoldHtml(bodyHtml);

  // Legacy + complétude (intro Joey vérifiée plus bas via fromEmail dans le job).
  assertOutreachVpsMailQuality(bodyHtml);
  const recap = parseNotesBlock(notes);

  return { subject, bodyHtml, notes, recap, raw };
}
