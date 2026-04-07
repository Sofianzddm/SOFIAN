import { normalizeInstagramHandle } from "@/lib/social-links";

/**
 * Formatage des abonnés pour le bloc email (ex: 280K, 1.4M)
 */
export function formatFollowers(num: number): string {
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return (m % 1 === 0 ? m : m.toFixed(1).replace(".", ",")) + "M";
  }
  if (num >= 1_000) {
    const k = num / 1_000;
    return (k % 1 === 0 ? Math.round(k) : k.toFixed(1).replace(".", ",")) + "K";
  }
  return num.toString();
}

export const BLOC_EMOJIS = ["🌿", "✨", "💫", "🌸", "⚡", "🎯"];

export interface TalentForBloc {
  prenom: string;
  pitch: string;
  /** Handle Instagram sans @ (ex: flavybarla) pour lien et fallback plain */
  instagramHandle?: string | null;
  igFollowers?: number | null;
  ttFollowers?: number | null;
  ytAbonnes?: number | null;
}

export type BlocFormat = "html" | "plain";

const INSTAGRAM_LINK_STYLE =
  'color: #E1306C; text-decoration: underline; font-weight: bold;';

/**
 * Construit la partie "nom" d'une ligne :
 * - HTML : @handle cliquable vers Instagram
 * - Texte brut : @handle (instagram.com/handle)
 * - Fallback : prénom si pas de handle
 */
function formatNamePart(prenom: string, instagramHandle: string | null | undefined, format: BlocFormat): string {
  const handle = normalizeInstagramHandle(instagramHandle);
  if (format === "html") {
    if (handle) {
      const label = `@${handle}`;
      return `<a href="https://instagram.com/${encodeURIComponent(handle)}" style="${INSTAGRAM_LINK_STYLE}">${escapeHtml(label)}</a>`;
    }
    return escapeHtml(prenom);
  }
  if (handle) {
    return `@${handle} (instagram.com/${handle})`;
  }
  return prenom;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Construit une ligne du bloc talents.
 * html : nom cliquable vers Instagram (style #E1306C, underline, bold).
 * plain : "Prénom (instagram.com/handle)" si handle, sinon "Prénom".
 */
export function formatBlocLine(
  talent: TalentForBloc,
  emoji: string, // conservé pour compat mais plus affiché
  format: BlocFormat = "html"
): string {
  const parts: string[] = [];
  const ig = Number(talent.igFollowers ?? 0);
  const tt = Number(talent.ttFollowers ?? 0);
  const yt = Number(talent.ytAbonnes ?? 0);

  if (ig > 0) parts.push(`${formatFollowers(ig)} sur Instagram`);
  if (tt > 0) parts.push(`${formatFollowers(tt)} sur TikTok`);
  if (yt > 0) parts.push(`${formatFollowers(yt)} sur YouTube`);

  const statsStr = parts.join(" · ");
  const mid = statsStr ? ` — ${statsStr} — ` : " — ";
  const pitch = (talent.pitch || "").trim();
  const namePart = formatNamePart(talent.prenom, talent.instagramHandle, format);
  // On n'affiche plus l'emoji, uniquement le @handle / prénom
  return `${namePart}${mid}${format === "html" ? escapeHtml(pitch) : pitch}`.trim();
}

/**
 * Construit le bloc talents complet pour {{bloc_talents}} HubSpot.
 * format "html" pour propriété Rich text (noms cliquables Instagram), "plain" en fallback.
 */
export function formatBlocTalents(
  talents: TalentForBloc[],
  format: BlocFormat = "html"
): string {
  return talents
    .map((t, i) => formatBlocLine(t, BLOC_EMOJIS[i % BLOC_EMOJIS.length], format))
    // Une ligne vide entre chaque talent pour aérer un minimum le bloc
    .join("\n\n");
}
