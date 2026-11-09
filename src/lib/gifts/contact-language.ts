/** Normalise MarqueContact.language → fr | en (défaut fr). */
export function normalizeContactLanguage(
  raw: string | null | undefined
): "fr" | "en" {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "en" || v.startsWith("en")) return "en";
  return "fr";
}

/** Heuristique légère FR/EN sur un brouillon texte. */
export function detectGiftMailLanguage(
  subject: string,
  body: string
): "fr" | "en" {
  const text = `${subject}\n${body}`.toLowerCase();
  const frHits = (
    text.match(
      /\b(bonjour|salut|coucou|je\s+te|tu\s+|ton\s+|ta\s+|tes\s+|nous\s+|avec\s+toi|j'esp[eè]re|proposition|marque|disponible)\b/gi
    ) || []
  ).length;
  const enHits = (
    text.match(
      /\b(hello|hey|hope\s+you|you're|your\s+|with\s+you|looking\s+forward|collaboration|available|reach\s+out)\b/gi
    ) || []
  ).length;
  if (enHits > frHits + 1) return "en";
  return "fr";
}
