// Festival de Cannes 2026 : du 12 au 23 mai 2026
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
  });
}

export function isDateInRange(date: Date, start: Date, end: Date) {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Jour calendaire UTC (comparaison par clé YYYY-MM-DD). */
export function isUtcDayInIsoRange(day: Date, rangeStartIso: string, rangeEndIso: string) {
  const k = day.toISOString().slice(0, 10);
  const s = new Date(rangeStartIso).toISOString().slice(0, 10);
  const e = new Date(rangeEndIso).toISOString().slice(0, 10);
  return k >= s && k <= e;
}

/**
 * Nuit d’hôtel (planning chambres / PDF) : clés UTC `YYYY-MM-DD`.
 * - Jour d’arrivée : inclus (première nuit).
 * - Jour de départ : exclu (check-out, chambre libérée).
 * - Arrivée et départ le même jour calendaire : ce jour compte une nuit.
 */
export function occupiesHotelNightUtcDay(day: Date, arrivalIso: string, departureIso: string): boolean {
  const dayKey = day.toISOString().slice(0, 10);
  const arrKey = new Date(arrivalIso).toISOString().slice(0, 10);
  const depKey = new Date(departureIso).toISOString().slice(0, 10);
  if (arrKey > depKey) return false;
  if (arrKey === depKey) return dayKey === arrKey;
  return dayKey >= arrKey && dayKey < depKey;
}
