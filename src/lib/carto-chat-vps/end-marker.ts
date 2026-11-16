/**
 * Jeton de fin imposé dans le prompt Chat.
 * Un code UNIQUE par fil/run → l’ancien fil ne déclenche plus le classement.
 */

export const CARTO_CHAT_END_MARKER_PREFIX = "GLOWUP_CART_DONE_";

/** Legacy fixe (anciens prompts) */
export const CARTO_CHAT_END_MARKER = "GLOWUP_CART_DONE_9f3k2x";

/** Nouveau jeton par run : GLOWUP_CART_DONE_a1b2c3d4 */
export function createEndMarker(): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `${CARTO_CHAT_END_MARKER_PREFIX}${id}`;
}

export function endMarkerInstruction(marker: string): string {
  return `

À la TOUTE FIN de ta réponse, sur une ligne seule, écris exactement ce code (rien après) :
${marker}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Détecte un marker précis, ou n’importe quel GLOWUP_CART_DONE_* si marker omis. */
export function answerHasEndMarker(text: string, marker?: string | null): boolean {
  const raw = text || "";
  if (marker && marker.trim()) {
    return new RegExp(`\\b${escapeRe(marker.trim())}\\b`, "i").test(raw);
  }
  return new RegExp(
    `\\b${escapeRe(CARTO_CHAT_END_MARKER_PREFIX)}[a-z0-9]+\\b`,
    "i"
  ).test(raw);
}

/**
 * Retire le(s) jeton(s) de fin.
 * Ne pas tout couper après : section LinkedIn souvent après le marker.
 */
export function stripEndMarker(text: string, marker?: string | null): string {
  const raw = String(text || "");
  if (!answerHasEndMarker(raw, marker)) return raw.trim();
  const pattern = marker?.trim()
    ? escapeRe(marker.trim())
    : `${escapeRe(CARTO_CHAT_END_MARKER_PREFIX)}[a-z0-9]+`;
  return raw
    .replace(new RegExp(`^[ \\t]*${pattern}[ \\t]*$`, "gim"), "")
    .replace(new RegExp(`\\s*${pattern}\\b`, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendEndMarkerInstruction(
  prompt: string,
  marker?: string | null
): { prompt: string; endMarker: string } {
  const p = String(prompt || "").trim();
  const endMarker = (marker && marker.trim()) || createEndMarker();
  if (!p) return { prompt: p, endMarker };
  if (p.includes(endMarker)) return { prompt: p, endMarker };
  // Évite de doubler si un vieux marker fixe est déjà dans le prompt custom
  if (/GLOWUP_CART_DONE_[a-z0-9]+/i.test(p)) {
    return { prompt: p, endMarker };
  }
  return {
    prompt: `${p}${endMarkerInstruction(endMarker)}`,
    endMarker,
  };
}
