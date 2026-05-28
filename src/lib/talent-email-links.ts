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
 * Met à niveau le HTML d'un brouillon avant envoi :
 * - jetons {{talent_N}}
 * - liens vers le nom du talent sans gras → format inbound (gras + Instagram)
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

  out = upgradeInstagramLinksToBold(out);
  return normalizeWhitespaceAroundLinks(out);
}
