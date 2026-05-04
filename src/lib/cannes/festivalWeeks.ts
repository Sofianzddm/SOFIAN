import { CANNES_2026_END, CANNES_2026_START } from "@/lib/cannes/dates";

/** Lundi 00:00 UTC de la semaine qui contient ce jour. */
export function startOfUtcMondayWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + offset);
  return x;
}

/** Tous les lundis (UTC) dont la semaine [lun–dim] intersecte [rangeStart, rangeEnd]. */
export function getUtcMondayStartsIntersecting(rangeStart: Date, rangeEnd: Date): Date[] {
  const weeks: Date[] = [];
  let mon = startOfUtcMondayWeek(new Date(rangeStart));
  const endT = rangeEnd.getTime();
  let guard = 0;
  while (mon.getTime() <= endT && guard++ < 54) {
    weeks.push(new Date(mon));
    mon.setUTCDate(mon.getUTCDate() + 7);
  }
  return weeks;
}

/** Lundis des semaines qui couvrent le festival Cannes 2026. */
export function getCannesFestivalMondayWeeks(): Date[] {
  return getUtcMondayStartsIntersecting(CANNES_2026_START, CANNES_2026_END);
}

/** 7 jours à partir du lundi (lun → dim), minuit UTC. */
export function eachUtcDayFromMonday(monday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }
  return days;
}
