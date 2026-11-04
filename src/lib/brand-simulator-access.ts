import { normalizeEmail } from "@/lib/account-access-lock";

/** Accès Simulateur marque : ADMIN + Inès uniquement (pas tout STRATEGY_PLANNER). */
export const BRAND_SIMULATOR_EXTRA_EMAILS = [
  "ines@glowupagence.fr",
  "ines@glowup-agence.com",
] as const;

export function canAccessBrandSimulator(
  role: string | null | undefined,
  email: string | null | undefined
): boolean {
  if (role === "ADMIN") return true;
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (BRAND_SIMULATOR_EXTRA_EMAILS as readonly string[]).includes(
    normalized
  );
}
