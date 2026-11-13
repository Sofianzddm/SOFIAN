/**
 * Jeton de fin imposé dans le prompt Chat.
 * Dès qu'il apparaît dans la réponse → génération terminée (fiable vs Stop / Searching).
 */
export const CARTO_CHAT_END_MARKER = "GLOWUP_CART_DONE_9f3k2x";

export const CARTO_CHAT_END_MARKER_INSTRUCTION = `

À la TOUTE FIN de ta réponse, sur une ligne seule, écris exactement ce code (rien après) :
${CARTO_CHAT_END_MARKER}`;

function markerRegex(): RegExp {
  const esc = CARTO_CHAT_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i");
}

export function answerHasEndMarker(text: string): boolean {
  return markerRegex().test(text || "");
}

/**
 * Retire uniquement le jeton de fin.
 * Ne pas tout couper après le jeton : la section "## LinkedIn URLs (hrefs page)"
 * est souvent appendée APRÈS le marker.
 */
export function stripEndMarker(text: string): string {
  const raw = String(text || "");
  if (!answerHasEndMarker(raw)) return raw.trim();
  const esc = CARTO_CHAT_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw
    .replace(new RegExp(`^[ \\t]*${esc}[ \\t]*$`, "gim"), "")
    .replace(new RegExp(`\\s*${esc}\\b`, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendEndMarkerInstruction(prompt: string): string {
  const p = String(prompt || "").trim();
  if (!p) return p;
  if (p.includes(CARTO_CHAT_END_MARKER)) return p;
  return `${p}${CARTO_CHAT_END_MARKER_INSTRUCTION}`;
}
