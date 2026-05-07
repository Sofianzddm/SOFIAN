// Festival de Cannes 2026 : du 12 au 23 mai 2026.
// Le festival se déroulant à Cannes (Europe/Paris), TOUTES les comparaisons de jours
// (kanban, organisateur de chambres, PDF) sont faites sur le calendrier Europe/Paris.
// Cela évite les décalages quand une date est saisie avec une heure (ex. 22:00 UTC stocké
// comme `2026-05-12T22:00:00.000Z` mais affiché « 13/05 » en heure locale).
export const CANNES_2026_TIMEZONE = "Europe/Paris";

export const CANNES_2026_START = new Date("2026-05-12T00:00:00.000Z");
export const CANNES_2026_END = new Date("2026-05-23T23:59:59.999Z");

export const CANNES_2026_DAYS: Date[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(CANNES_2026_START);
  d.setUTCDate(d.getUTCDate() + i);
  return d;
});

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: CANNES_2026_TIMEZONE,
  });
}

export function isDateInRange(date: Date, start: Date, end: Date) {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/**
 * Formate une date dans le fuseau du festival (Europe/Paris) en français.
 * À utiliser pour tout affichage Cannes 2026 (kanban, organisateur, PDF) afin que
 * ce qui est affiché corresponde au jour utilisé dans les comparaisons.
 */
export function formatParisDate(
  input: Date | string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { timeZone: CANNES_2026_TIMEZONE, ...options });
}

const PARIS_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CANNES_2026_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Renvoie la clé de jour `YYYY-MM-DD` calculée dans le fuseau du festival
 * (Europe/Paris). C’est la seule fonction à utiliser pour comparer un jour
 * (kanban, chambres, PDF) — on ne raisonne plus en UTC pur dans Cannes.
 */
export function parisDayKey(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  // `en-CA` formate naturellement en `YYYY-MM-DD`.
  return PARIS_DAY_FMT.format(d);
}

/** Jour calendaire dans le fuseau du festival (clé `YYYY-MM-DD` Europe/Paris). */
export function isUtcDayInIsoRange(day: Date, rangeStartIso: string, rangeEndIso: string) {
  const k = parisDayKey(day);
  const s = parisDayKey(rangeStartIso);
  const e = parisDayKey(rangeEndIso);
  if (!k || !s || !e) return false;
  return k >= s && k <= e;
}

/**
 * Nuit d’hôtel (planning chambres / PDF), clés `YYYY-MM-DD` Europe/Paris.
 * - Jour d’arrivée : inclus (première nuit).
 * - Jour de départ : exclu (check-out, chambre libérée).
 * - Arrivée et départ le même jour calendaire : ce jour compte une nuit.
 */
export function occupiesHotelNightUtcDay(day: Date, arrivalIso: string, departureIso: string): boolean {
  const dayKey = parisDayKey(day);
  const arrKey = parisDayKey(arrivalIso);
  const depKey = parisDayKey(departureIso);
  if (!dayKey || !arrKey || !depKey) return false;
  if (arrKey > depKey) return false;
  if (arrKey === depKey) return dayKey === arrKey;
  return dayKey >= arrKey && dayKey < depKey;
}
