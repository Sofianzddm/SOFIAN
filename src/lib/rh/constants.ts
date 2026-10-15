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

/** Numéro de semaine ISO (lundi = début) pour une date locale. */
export function isoYearWeek(d: Date): { isoYear: number; isoWeek: number } {
  const anchor = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  );
  const day = anchor.getUTCDay() || 7;
  const thursday = new Date(anchor);
  thursday.setUTCDate(anchor.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1, 12));
  const isoWeek = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { isoYear, isoWeek };
}

export function isRhDateAllowed(d: Date | string): boolean {
  const date =
    typeof d === "string" ? new Date(d.slice(0, 10) + "T12:00:00") : d;
  const { isoYear, isoWeek } = isoYearWeek(date);
  return isRhWeekAllowed(isoYear, isoWeek);
}
