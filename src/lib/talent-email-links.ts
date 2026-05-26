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

/** Lien HTML cliquable vers Instagram, en gras (ou texte gras seul si pas d'@). */
export function talentToHtmlLink(t: TalentLinkInput): string {
  const label = talentDisplayName(t);
  const url = getInstagramProfileUrl(t.instagram);
  if (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"><strong>${label}</strong></a>`;
  }
  return `<strong>${label}</strong>`;
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
