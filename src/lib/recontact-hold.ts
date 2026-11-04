/**
 * Mise en attente manuelle d'une marque sur le Pipeline Casting :
 * pas de casting ouvert avant une date choisie. La carte sort de la file
 * et y revient le matin de cette date (Europe/Paris).
 */

export function isRecontactHoldActive(
  until: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!until) return false;
  const t = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(t.getTime())) return false;
  return t.getTime() > now.getTime();
}

/** Début du jour calendaire Europe/Paris pour une saisie `YYYY-MM-DD`. */
export function parisStartOfCalendarDay(yyyyMmDd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(noonUtc);
  const parisHour = Number(hour.find((part) => part.type === "hour")?.value);
  if (!Number.isFinite(parisHour)) return null;
  const offsetHours = parisHour - 12;
  const start = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0));
  if (Number.isNaN(start.getTime())) return null;
  return start;
}

export function formatRecontactHoldDate(until: Date | string): string {
  const t = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
