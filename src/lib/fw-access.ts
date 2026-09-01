/** Accès Fashion Week : Inès (strategy planner) et Sofian (admin) uniquement. */
const FW_ALLOWED_EMAILS = [
  "ines@glowupagence.fr",
  "sofian@glowupagence.fr",
  "ines@glowup-agence.com",
  "sofian@glowup-agence.com",
];

export function canAccessFashionWeek(role: string, email?: string | null): boolean {
  if (role !== "ADMIN" && role !== "STRATEGY_PLANNER") return false;
  return FW_ALLOWED_EMAILS.includes((email || "").trim().toLowerCase());
}
