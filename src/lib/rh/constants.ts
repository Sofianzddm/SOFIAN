/**
 * Soft-launch RH : l’UI ne propose pas les semaines antérieures.
 * Semaine ISO 36 · 2026 = lundi 31 août 2026.
 */
export const RH_MIN_ISO_YEAR = 2026;
export const RH_MIN_ISO_WEEK = 36;

/** Compare (year, week) >= (RH_MIN_ISO_YEAR, RH_MIN_ISO_WEEK). */
export function isRhWeekAllowed(isoYear: number, isoWeek: number): boolean {
  if (isoYear > RH_MIN_ISO_YEAR) return true;
  if (isoYear < RH_MIN_ISO_YEAR) return false;
  return isoWeek >= RH_MIN_ISO_WEEK;
}
