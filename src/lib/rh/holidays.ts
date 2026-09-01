/**
 * Jours fériés Glow Up — calendrier France, aligné Lucca.
 * Lundi de Pentecôte volontairement exclu (journée de solidarité travaillée).
 */

export type FrenchHoliday = {
  date: string; // YYYY-MM-DD
  label: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoDateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return localDateKey(value);
}

/** Dimanche de Pâques (algorithme de Meeus / anonyme grégorien). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}

function ymd(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

export function frenchHolidays(year: number): FrenchHoliday[] {
  const easter = easterSunday(year);
  return [
    { date: ymd(year, 1, 1), label: "Jour de l'an" },
    { date: localDateKey(addDays(easter, 1)), label: "Lundi de Pâques" },
    { date: ymd(year, 5, 1), label: "Fête du Travail" },
    { date: ymd(year, 5, 8), label: "Victoire 1945" },
    { date: localDateKey(addDays(easter, 39)), label: "Ascension" },
    { date: ymd(year, 7, 14), label: "Fête nationale" },
    { date: ymd(year, 8, 15), label: "Assomption" },
    { date: ymd(year, 11, 1), label: "Toussaint" },
    { date: ymd(year, 11, 11), label: "Armistice" },
    { date: ymd(year, 12, 25), label: "Noël" },
  ];
}

const holidayCache = new Map<number, Map<string, string>>();

function holidayMap(year: number): Map<string, string> {
  let map = holidayCache.get(year);
  if (!map) {
    map = new Map(frenchHolidays(year).map((h) => [h.date, h.label]));
    holidayCache.set(year, map);
  }
  return map;
}

export function frenchHolidayLabel(d: Date | string): string | null {
  const key = isoDateKey(d);
  const year = Number(key.slice(0, 4));
  if (!year) return null;
  return holidayMap(year).get(key) ?? null;
}

export function isFrenchHoliday(d: Date | string): boolean {
  return frenchHolidayLabel(d) !== null;
}

export function isWeekday(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d.slice(0, 10) + "T12:00:00") : d;
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/** Jour ouvré Glow Up : lundi–vendredi hors férié. */
export function isWorkday(d: Date | string): boolean {
  return isWeekday(d) && !isFrenchHoliday(d);
}

export function frenchHolidaysInMonth(
  year: number,
  month: number
): FrenchHoliday[] {
  return frenchHolidays(year).filter((h) => {
    const m = Number(h.date.slice(5, 7)) - 1;
    return m === month;
  });
}
