import { getInstagramProfileUrl } from "@/lib/social-links";

export type TalentLinkInput = {
  prenom?: string | null;
  nom?: string | null;
  instagram?: string | null;
};

export function talentDisplayName(t: TalentLinkInput): string {
  const label = `${t.prenom || ""} ${t.nom || ""}`.trim();
  return label || "Talent";
}

export function talentInstagramUrl(t: TalentLinkInput): string | null {
  return getInstagramProfileUrl(t.instagram);
}

/** Lien HTML cliquable vers Instagram, en gras (ou texte gras seul si pas d'@). */
export function talentToHtmlLink(t: TalentLinkInput): string {
  const label = talentDisplayName(t);
  const url = talentInstagramUrl(t);
  if (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"><strong>${label}</strong></a>`;
  }
  return `<strong>${label}</strong>`;
}

/**
 * Représentation Tiptap d'un nom de talent : nœud texte avec marques
 * `bold` + `link` (vers Instagram si dispo). Garantit que la mark `link`
 * est bien appliquée, sans dépendre du parsing HTML.
 */
export function talentToTiptapNode(t: TalentLinkInput): Record<string, unknown> {
  const label = talentDisplayName(t);
  const url = talentInstagramUrl(t);
  const marks: Array<Record<string, unknown>> = [{ type: "bold" }];
  if (url) {
    marks.push({
      type: "link",
      attrs: { href: url, target: "_blank", rel: "noopener noreferrer" },
    });
  }
  return { type: "text", text: label, marks };
}

/** Remplace {{talent_1}}, {{talent_2}}, … par les vrais liens (ordre = sélection). */
export function resolveTalentPlaceholders(html: string, talents: TalentLinkInput[]): string {
  if (!html || talents.length === 0) return html;
  let out = html;
  talents.forEach((t, i) => {
    const link = talentToHtmlLink(t);
    const tokenRegex = new RegExp(`\\{\\{\\s*talent_${i + 1}\\s*\\}\\}`, "gi");
    out = out.replace(tokenRegex, link);
  });
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Anciens brouillons : <a href="instagram…">Prénom Nom</a> sans <strong>.
 * On enveloppe le texte du lien en gras (sans toucher aux liens déjà corrects).
 */
export function upgradeInstagramLinksToBold(html: string): string {
  if (!html) return html;
  return html.replace(
    /<a\b([^>]*\bhref\s*=\s*["'][^"']*instagram[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs, inner) => {
      if (/<strong\b/i.test(inner)) return full;
      const text = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!text) return full;
      return `<a${attrs}><strong>${text}</strong></a>`;
    }
  );
}

/**
 * Nettoie les espaces parasites :
 *  - &nbsp; collés à un lien/strong → espace simple
 *  - espaces ou nbsp DANS un <strong> ou <a> juste avant la fin → supprimés
 *  - doubles espaces autour d'un lien talent → simple
 */
function normalizeWhitespaceAroundLinks(html: string): string {
  if (!html) return html;
  let out = html;
  out = out.replace(/\u00a0/g, " ");
  out = out.replace(/(<strong>)\s+/gi, "$1");
  out = out.replace(/\s+(<\/strong>)/gi, "$1");
  out = out.replace(/(<a\b[^>]*>)\s+/gi, "$1");
  out = out.replace(/\s+(<\/a>)/gi, "$1");
  out = out.replace(/ {2,}(<a\b)/gi, " $1");
  out = out.replace(/(<\/a>) {2,}/gi, "$1 ");
  out = out.replace(/ {2,}(<strong>)/gi, " $1");
  out = out.replace(/(<\/strong>) {2,}/gi, "$1 ");
  return out;
}

/**
 * Retire les paragraphes / <br> / espaces vides en tête et en queue du HTML.
 * Sinon TipTap injecte souvent un `<p></p>` initial qui se traduit par une
 * ligne blanche visible avant "Bonjour" cote destinataire.
 */
export function trimEmailHtmlEdges(html: string): string {
  if (!html) return html;
  let out = html.trim();
  const emptyLeading = /^\s*(?:<p>\s*(?:&nbsp;|\u00a0|<br\s*\/?>)?\s*<\/p>|<br\s*\/?>|&nbsp;|\u00a0)+/i;
  while (emptyLeading.test(out)) {
    out = out.replace(emptyLeading, "").trim();
  }
  const emptyTrailing = /(?:<p>\s*(?:&nbsp;|\u00a0|<br\s*\/?>)?\s*<\/p>|<br\s*\/?>|&nbsp;|\u00a0)+\s*$/i;
  while (emptyTrailing.test(out)) {
    out = out.replace(emptyTrailing, "").trim();
  }
  return out;
}

/**
 * Extrait les talents déjà liés (Instagram) depuis un HTML de mail :
 * `<a href="…instagram.com/handle"><strong>Prénom Nom</strong></a>`.
 * Sert à réappliquer les mêmes extralinks dans les relances.
 */
export function extractTalentLinksFromHtml(html: string): TalentLinkInput[] {
  if (!html) return [];
  const out: TalentLinkInput[] = [];
  const seen = new Set<string>();
  const re =
    /<a\b[^>]*href\s*=\s*["']([^"']*instagram\.com\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1] || "";
    const text = (m[2] || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    const handleRaw = href.match(/instagram\.com\/([^/?#]+)/i)?.[1] || "";
    const handle = decodeURIComponent(handleRaw).replace(/^@/, "").trim();
    if (!handle || /^(p|reel|stories|explore)$/i.test(handle)) continue;
    seen.add(key);
    const parts = text.split(/\s+/);
    out.push({
      prenom: parts[0] || text,
      nom: parts.length > 1 ? parts.slice(1).join(" ") : null,
      instagram: handle,
    });
  }
  return out;
}

/**
 * Remplace les occurrences en texte brut du nom complet (hors balises HTML)
 * par le lien Instagram gras — pour les relances IA qui citent le nom sans lien.
 */
function linkifyPlainTalentNames(html: string, talents: TalentLinkInput[]): string {
  if (!html || talents.length === 0) return html;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, text: string | undefined) => {
    if (tag || text == null) return full;
    let chunk = text;
    for (const t of talents) {
      const label = talentDisplayName(t);
      if (!label || label === "Talent" || !talentInstagramUrl(t)) continue;
      if (label.length < 3) continue;
      const re = new RegExp(`(^|[^\\wÀ-ÿ])(${escapeRegex(label)})(?=[^\\wÀ-ÿ]|$)`, "gi");
      chunk = chunk.replace(re, (_m, before: string) => `${before}${talentToHtmlLink(t)}`);
    }
    return chunk;
  });
}

/**
 * Met à niveau le HTML d'un brouillon avant envoi :
 * - jetons {{talent_N}}
 * - liens vers le nom du talent sans gras → format inbound (gras + Instagram)
 * - noms en clair → extralink Instagram
 * - filet : tout lien Instagram sans gras dans le corps
 * - normalisation des espaces parasites autour des liens
 */
export function upgradeTalentLinksInHtml(html: string, talents: TalentLinkInput[]): string {
  if (!html) return html;
  let out = resolveTalentPlaceholders(html, talents);

  for (const t of talents) {
    const label = talentDisplayName(t);
    if (!label || label === "Talent") continue;
    const esc = escapeRegex(label);

    const plainTalentLink = new RegExp(
      `<a\\b([^>]*?)>\\s*(${esc})\\s*</a>`,
      "gi"
    );
    out = out.replace(plainTalentLink, (full) => {
      if (/<strong\b/i.test(full)) return full;
      return talentToHtmlLink(t);
    });

    const strongOnly = new RegExp(`<strong>\\s*(${esc})\\s*</strong>`, "gi");
    if (!talentInstagramUrl(t)) continue;
    out = out.replace(strongOnly, () => talentToHtmlLink(t));
  }

  out = linkifyPlainTalentNames(out, talents);
  out = upgradeInstagramLinksToBold(out);
  out = normalizeWhitespaceAroundLinks(out);
  return trimEmailHtmlEdges(out);
}

/** Filet unique : extrait les IG du HTML source (ou liste fournie) et upgrade. */
export function ensureTalentExtralinksInHtml(
  html: string,
  talents?: TalentLinkInput[] | null,
  sourceHtmlForTalents?: string | null
): string {
  if (!html) return html;
  const fromList = talents?.length ? talents : [];
  const fromSource = extractTalentLinksFromHtml(sourceHtmlForTalents || html);
  const byKey = new Map<string, TalentLinkInput>();
  for (const t of [...fromList, ...fromSource]) {
    const key = talentDisplayName(t).toLowerCase();
    if (!key || key === "talent") continue;
    if (!byKey.has(key)) byKey.set(key, t);
  }
  const merged = Array.from(byKey.values());
  if (merged.length === 0) return html;
  return upgradeTalentLinksInHtml(html, merged);
}
