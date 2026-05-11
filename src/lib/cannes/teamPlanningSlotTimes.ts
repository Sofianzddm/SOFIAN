import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";

import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseParisHhmm(raw: string): { ok: true; hh: number; mm: number } | { ok: false } {
  const s = raw.trim();
  const m = HHMM_RE.exec(s);
  if (!m) return { ok: false };
  return { ok: true, hh: parseInt(m[1], 10), mm: parseInt(m[2], 10) };
}

/** Instant UTC correspondant au mur Paris `yyyy-MM-dd` + `HH:mm`. */
export function parisYmdHhmmToUtc(ymd: string, hhmm: string): Date | null {
  const p = parseParisHhmm(hhmm);
  if (!p.ok) return null;
  const wall = `${ymd} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}:00`;
  return fromZonedTime(wall, PARIS_TZ);
}

export function formatParisSlotRange(startsAt: Date, endsAt: Date): string {
  const d0 = formatInTimeZone(startsAt, PARIS_TZ, "EEEE d MMM", { locale: fr });
  const t0 = formatInTimeZone(startsAt, PARIS_TZ, "HH:mm", { locale: fr });
  const t1 = formatInTimeZone(endsAt, PARIS_TZ, "HH:mm", { locale: fr });
  return `${d0} · ${t0} – ${t1}`;
}

export function formatParisYmd(startsAt: Date): string {
  return formatInTimeZone(startsAt, PARIS_TZ, "yyyy-MM-dd");
}

export function formatParisHhmmFromUtc(d: Date): string {
  return formatInTimeZone(d, PARIS_TZ, "HH:mm");
}

/** Titre de jour pour une clé `yyyy-MM-dd` (Paris, midi civil pour éviter les bords). */
export function formatParisLongHeadingFromYmd(ymd: string): string {
  const utc = fromZonedTime(`${ymd} 12:00:00`, PARIS_TZ);
  return formatInTimeZone(utc, PARIS_TZ, "EEEE d MMMM", { locale: fr });
}
