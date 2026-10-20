/**
 * Tests pacing anti-spam. Lancer : npx tsx src/lib/email-send-pacing.test.ts
 */
import {
  computeStaggeredSendTimesFrom,
  nextSendWindowInstant,
  parisTimeOnDay,
  SEND_PACING_END_HOUR,
  SEND_PACING_MIN_GAP_MS,
  SEND_PACING_START_HOUR,
  SEND_PACING_START_MINUTE,
} from "./email-send-pacing";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Avant 7h30 → 7h30 le jour même
{
  const early = new Date("2026-03-10T05:00:00.000Z"); // 06:00 Paris
  const next = nextSendWindowInstant(early);
  const start = parisTimeOnDay(
    early,
    SEND_PACING_START_HOUR,
    SEND_PACING_START_MINUTE
  );
  assert(next.getTime() === start.getTime(), "snap 7h30 matin");
}

// Après 19h → lendemain 7h30
{
  const late = new Date("2026-03-10T18:30:00.000Z"); // 19:30 Paris
  const next = nextSendWindowInstant(late);
  const tomorrowStart = parisTimeOnDay(
    new Date("2026-03-11T12:00:00.000Z"),
    SEND_PACING_START_HOUR,
    SEND_PACING_START_MINUTE
  );
  assert(next.getTime() === tomorrowStart.getTime(), "report J+1 7h30");
}

// Gap mini + spillover après 19h
{
  const start = parisTimeOnDay(new Date("2026-03-10T12:00:00.000Z"), 18, 50);
  const times = computeStaggeredSendTimesFrom(5, start);
  assert(times.length === 5, "5 créneaux");
  for (let i = 1; i < times.length; i += 1) {
    assert(
      times[i]!.getTime() - times[i - 1]!.getTime() >= SEND_PACING_MIN_GAP_MS,
      `gap >= 3 min entre ${i - 1} et ${i}`
    );
  }
  const dayEnd = parisTimeOnDay(start, SEND_PACING_END_HOUR, 0);
  const sameDay = times.filter((t) => t.getTime() < dayEnd.getTime());
  const nextDay = times.filter((t) => t.getTime() >= dayEnd.getTime());
  assert(sameDay.length > 0, "au moins 1 créneau le jour J");
  assert(nextDay.length > 0, "au moins 1 créneau J+1");
  assert(
    nextDay[0]!.getTime() >=
      parisTimeOnDay(
        new Date("2026-03-11T12:00:00.000Z"),
        SEND_PACING_START_HOUR,
        SEND_PACING_START_MINUTE
      ).getTime(),
    "reprise >= 7h30 J+1"
  );
}

console.log("email-send-pacing tests passed.");
