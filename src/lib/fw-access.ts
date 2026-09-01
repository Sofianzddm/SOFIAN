/** Strategy planners autorisés (Inès). Les ADMIN ont tous accès. */
const FW_STRATEGY_EMAILS = [
  "ines@glowupagence.fr",
  "ines@glowup-agence.com",
];

export function canAccessFashionWeek(role: string, email?: string | null): boolean {
  if (role === "ADMIN") return true;
  if (role !== "STRATEGY_PLANNER") return false;
  return FW_STRATEGY_EMAILS.includes((email || "").trim().toLowerCase());
}
