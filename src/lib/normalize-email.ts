/**
 * Normalise une adresse email avant toute écriture CRM / outreach.
 *
 * Cas fréquents issus des headers / imports :
 *   "Alice <alice@agence.fr>"  → alice@agence.fr
 *   "<alice@agence.fr>"        → alice@agence.fr
 *   "<<alice@agence.fr>>"      → alice@agence.fr
 *   " alice@agence.fr "        → alice@agence.fr
 */
export function normalizeEmail(raw: string | null | undefined): string {
  let value = String(raw || "").trim();
  if (!value) return "";

  // "Name <email>" ou "<email>" (éventuellement plusieurs paires de chevrons).
  const bracket = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (bracket?.[1]) {
    value = bracket[1];
  } else {
    // Chevrons orphelins restants (ex. import mal formé).
    value = value.replace(/^<+/, "").replace(/>+$/, "").trim();
  }

  return value.toLowerCase();
}

export function isValidNormalizedEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
