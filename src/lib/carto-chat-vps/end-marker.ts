/**
 * Jeton de fin imposé dans le prompt Chat.
 * Un code UNIQUE à chaque lancement (même marque) → l’ancien fil ne déclenche plus le classement.
 */

export const CARTO_CHAT_END_MARKER_PREFIX = "GLOWUP_CART_DONE_";

/** Legacy fixe (anciens prompts) */
export const CARTO_CHAT_END_MARKER = "GLOWUP_CART_DONE_9f3k2x";

const ANY_MARKER_RE = new RegExp(
  `${CARTO_CHAT_END_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z0-9]+`,
  "gi"
);

/** Nouveau jeton par run : GLOWUP_CART_DONE_<unique> — jamais réutilisé. */
export function createEndMarker(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${CARTO_CHAT_END_MARKER_PREFIX}${rand}`;
}

export function endMarkerInstruction(marker: string): string {
  return `

### CODE DE FIN OBLIGATOIRE (ne pas ignorer)
À la TOUTE FIN de ta réponse, sur une ligne seule, copie-colle EXACTEMENT ce code — caractère pour caractère :

${marker}

Règles:
- Ce code est UNIQUE à cette recherche. N'invente PAS un autre GLOWUP_CART_DONE_…
- N'utilise PAS un ancien code d'une autre marque / autre message.
- Rien après cette ligne (pas de phrase, pas de source).
- Si tu oublies ce code, la cartographie est considérée INCOMPLÈTE.`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retire instruction + jetons GLOWUP_CART_DONE_* déjà présents. */
function stripExistingMarkerBlocks(prompt: string): string {
  return String(prompt || "")
    .replace(
      /\n*À la TOUTE FIN de ta réponse[\s\S]*?GLOWUP_CART_DONE_[a-z0-9]+/gi,
      ""
    )
    .replace(ANY_MARKER_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
 * Retire TOUS les jetons GLOWUP_CART_DONE_* (y compris un mauvais/ancien).
 * Ne pas tout couper après : section LinkedIn souvent après le marker.
 */
export function stripEndMarker(text: string, _marker?: string | null): string {
  return String(text || "")
    .replace(
      new RegExp(
        `^[ \\t]*${escapeRe(CARTO_CHAT_END_MARKER_PREFIX)}[a-z0-9]+[ \\t]*$`,
        "gim"
      ),
      ""
    )
    .replace(
      new RegExp(
        `\\s*${escapeRe(CARTO_CHAT_END_MARKER_PREFIX)}[a-z0-9]+\\b`,
        "gi"
      ),
      ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Ajoute un jeton NEUF à chaque appel.
 * Si un vieux marker trainait dans le prompt custom, il est remplacé.
 */
export function appendEndMarkerInstruction(
  prompt: string,
  marker?: string | null
): { prompt: string; endMarker: string } {
  const endMarker = (marker && marker.trim()) || createEndMarker();
  const cleaned = stripExistingMarkerBlocks(prompt);
  if (!cleaned) return { prompt: cleaned, endMarker };
  return {
    prompt: `${cleaned}${endMarkerInstruction(endMarker)}`,
    endMarker,
  };
}
