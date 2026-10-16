/** Conservation journal activité : 12 mois, puis purge cron. */
export const ACTIVITY_LOG_RETENTION_DAYS = 365;

export const PULSE_RANGE_DAYS = [7, 30, 365] as const;
export type PulseRangeDays = (typeof PULSE_RANGE_DAYS)[number];

export function isPulseRangeDays(n: number): n is PulseRangeDays {
  return (PULSE_RANGE_DAYS as readonly number[]).includes(n);
}

/** Bornes [from, to) pour un jour civil Europe/Paris (YYYY-MM-DD). */
export function parisDayBounds(dayYmd: string): { from: Date; to: Date } {
  let from = new Date(`${dayYmd}T00:00:00+02:00`);
  if (
    from.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) !== dayYmd
  ) {
    from = new Date(`${dayYmd}T00:00:00+01:00`);
  }
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function todayParisYmd(): string {
  return new Date().toLocaleString("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Ajoute/soustrait des jours civils Paris à un YYYY-MM-DD. */
export function addParisDays(dayYmd: string, deltaDays: number): string {
  const { from } = parisDayBounds(dayYmd);
  const shifted = new Date(from.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return shifted.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}
