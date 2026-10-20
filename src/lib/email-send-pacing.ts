/**
 * Étalement anti-spam des envois cold (heure Europe/Paris).
 *
 * Fenêtre : 7h30 → 19h00. Si la vague ne tient pas dans la journée,
 * le reste reprend le lendemain à 7h30 (jour calendaire suivant).
 *
 * Espacement mini entre deux mails : 3 minutes (avec léger jitter).
 */

export const SEND_PACING_TZ = "Europe/Paris";

export const SEND_PACING_START_HOUR = 7;
export const SEND_PACING_START_MINUTE = 30;
export const SEND_PACING_END_HOUR = 19;
export const SEND_PACING_END_MINUTE = 0;

/** Délai mini entre deux envois d'une même vague. */
export const SEND_PACING_MIN_GAP_MS = 3 * 60 * 1000;

/** Premier créneau ≈ 1 min après « maintenant ». */
export const SEND_PACING_LEAD_MS = 60_000;

/** Au-delà de ce seuil, un bulk « maintenant » est forcé en mode étalé. */
export const SEND_PACING_STAGGER_THRESHOLD = 2;

/** Convertit une heure murale Paris (y/m/d h:min) en instant UTC. */
export function parisWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEND_PACING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const h = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, h, map.minute, map.second);
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Instant UTC pour `hour:minute` (Paris) le jour calendaire de `base`. */
export function parisTimeOnDay(base: Date, hour: number, minute: number): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEND_PACING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(base)
    .split("-")
    .map(Number);
  return parisWallClockToUtc(y, m, d, hour, minute);
}

/** Ajoute `days` calendaires (vue Paris) à une date. */
function addParisCalendarDays(base: Date, days: number): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEND_PACING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(base)
    .split("-")
    .map(Number);
  // Midi UTC du jour civil + days → stable face au DST.
  const noonUtc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return noonUtc;
}

/**
 * Prochain instant valide pour un envoi : dans [7h30, 19h00) Paris.
 * Avant 7h30 → 7h30 le jour même. À partir de 19h00 → 7h30 le lendemain.
 */
export function nextSendWindowInstant(from: Date = new Date()): Date {
  const dayStart = parisTimeOnDay(
    from,
    SEND_PACING_START_HOUR,
    SEND_PACING_START_MINUTE
  );
  const dayEnd = parisTimeOnDay(from, SEND_PACING_END_HOUR, SEND_PACING_END_MINUTE);

  if (from.getTime() < dayStart.getTime()) return dayStart;
  if (from.getTime() >= dayEnd.getTime()) {
    const tomorrow = addParisCalendarDays(from, 1);
    return parisTimeOnDay(
      tomorrow,
      SEND_PACING_START_HOUR,
      SEND_PACING_START_MINUTE
    );
  }
  return new Date(from);
}

/**
 * Répartit `count` envois : gap mini 3 min, jamais après 19h,
 * report automatique au lendemain 7h30.
 */
export function computeStaggeredSendTimes(
  count: number,
  now: Date = new Date()
): Date[] {
  if (count <= 0) return [];
  const start = nextSendWindowInstant(new Date(now.getTime() + SEND_PACING_LEAD_MS));
  return computeStaggeredSendTimesFrom(count, start);
}

/**
 * Même logique à partir d'un `start` explicite (mode « à une heure précise »).
 * Si `start` est hors fenêtre, on snappe au prochain créneau valide.
 */
export function computeStaggeredSendTimesFrom(count: number, start: Date): Date[] {
  if (count <= 0) return [];

  const times: Date[] = [];
  let cursor = nextSendWindowInstant(start);

  for (let i = 0; i < count; i += 1) {
    times.push(new Date(cursor));
    // Prochain créneau = cursor + gap (+ jitter 0–45s), snappé dans la fenêtre.
    const jitter = Math.floor(Math.random() * 45_000);
    cursor = nextSendWindowInstant(
      new Date(cursor.getTime() + SEND_PACING_MIN_GAP_MS + jitter)
    );
  }

  return times;
}

/** True si un bulk doit être étalé plutôt qu'envoyé en rafale. */
export function shouldStaggerBulk(count: number): boolean {
  return count >= SEND_PACING_STAGGER_THRESHOLD;
}
