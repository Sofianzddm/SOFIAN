import type { PrismaClient } from "@prisma/client";
import { CannesCoiffeurBookingStatus } from "@prisma/client";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";

import { PARIS_TZ, todayParisYmd } from "@/lib/cannes-coiffeur/formatParisTime";

export type BreakWindow = { start: string; end: string };

/** Slugs publics (paramètre URL) : minuscules et tirets. */
export const COIFFEUR_PRESTATION_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Une règle de fenêtre journalière (`prestation` null si la ligne s’applique à toutes les prestations). */
type AvailabilityWindowRow = {
  startTime: string;
  endTime: string;
  breaks: unknown;
  note?: string | null;
  prestationId: string | null;
  prestation: { title: string; slug: string; durationMinutes: number; bufferMinutes: number } | null;
};

export type ComputedFreeSlot = {
  startsAt: Date;
  endsAt: Date;
  label: string | null;
  prestationTitle: string;
  prestationSlug: string;
};

export async function resolveActivePrestationBySlug(
  prisma: PrismaClient,
  slug: string
): Promise<{ id: string; title: string; slug: string; durationMinutes: number; bufferMinutes: number } | null> {
  if (!COIFFEUR_PRESTATION_SLUG_RE.test(slug.trim())) return null;
  const p = await prisma.cannesCoiffeurPrestation.findFirst({
    where: { slug: slug.trim(), active: true },
    select: { id: true, title: true, slug: true, durationMinutes: true, bufferMinutes: true },
  });
  return p;
}

/** Convertit "HH:mm" ou "H:mm" en minutes depuis minuit. */
export function hhmmToMinutes(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.trim().split(":");
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** Vérifie si l’intervalle [slotStartMin, slotEndMin) intersecte une pause [bStart, bEnd). */
function intervalOverlapsMinutes(
  slotStartMin: number,
  slotEndMin: number,
  bStartMin: number,
  bEndMin: number
): boolean {
  return slotStartMin < bEndMin && bStartMin < slotEndMin;
}

/** Parse sécurisé du JSON breaks : `[{ start, end }]` en minutes. */
export function normalizeBreaks(breaksJson: unknown): Array<{ startMin: number; endMin: number }> {
  if (!Array.isArray(breaksJson)) return [];
  const out: Array<{ startMin: number; endMin: number }> = [];
  for (const item of breaksJson) {
    if (!item || typeof item !== "object") continue;
    const s = "start" in item ? String((item as BreakWindow).start) : "";
    const e = "end" in item ? String((item as BreakWindow).end) : "";
    const a = hhmmToMinutes(s);
    const b = hhmmToMinutes(e);
    if (Number.isNaN(a) || Number.isNaN(b) || b <= a) continue;
    out.push({ startMin: a, endMin: b });
  }
  return out;
}

/**
 * À partir d’un jour civil Paris `yyyy-MM-dd` et de minutes depuis minuit (ce même jour),
 * retourne l’instant UTC correspondant à cette heure murale Paris.
 */
export function parisDayMinutesToUtc(ymd: string, minutesFromMidnight: number): Date {
  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const wall = `${ymd} ${pad(hh)}:${pad(mm)}:00`;
  return fromZonedTime(wall, PARIS_TZ);
}

/** Une journée `[dayStartUtc, nextDayMidnightParisUtc)` pour filtrer les slots en base. */
function addOneCalendarDayParisYmd(ymd: string): string {
  const baseUtc = fromZonedTime(`${ymd} 12:00:00`, PARIS_TZ);
  return formatInTimeZone(addDays(baseUtc, 1), PARIS_TZ, "yyyy-MM-dd");
}

function parisDayBoundsUtc(ymd: string): { inclusiveStartUtc: Date; exclusiveEndUtc: Date } {
  const inclusiveStartUtc = fromZonedTime(`${ymd} 00:00:00`, PARIS_TZ);
  const exclusiveEndUtc = fromZonedTime(`${addOneCalendarDayParisYmd(ymd)} 00:00:00`, PARIS_TZ);
  return { inclusiveStartUtc, exclusiveEndUtc };
}

/** Deux plages UTC se chevauchent si intervalles semi-ouverts [start, end) se touchent. */
export function utcRangesOverlap(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0.getTime() < b1.getTime() && b0.getTime() < a1.getTime();
}

/**
 * Créneaux libres pour une date Paris et une prestation choisie :
 * prend les règles soit « toutes prestations » (`prestationId` null), soit réservées à cette prestation.
 * La grille (durée + buffer des pas) utilise **toujours** la prestation sélectionnée sur le lien public.
 */
export async function computeFreeSlotsForDate(
  prisma: PrismaClient,
  dateParisYmd: string,
  prestationId: string,
  nowUtc: Date = new Date()
): Promise<ComputedFreeSlot[]> {
  const timing = await prisma.cannesCoiffeurPrestation.findFirst({
    where: { id: prestationId, active: true },
    select: { title: true, slug: true, durationMinutes: true, bufferMinutes: true },
  });
  if (!timing) return [];

  const dayDate = new Date(`${dateParisYmd}T12:00:00.000Z`);

  const rules = await prisma.cannesCoiffeurAvailability.findMany({
    where: {
      date: dayDate,
      OR: [{ prestationId: null }, { prestationId }],
    },
    orderBy: { startTime: "asc" },
    include: { prestation: { select: { title: true, slug: true, durationMinutes: true, bufferMinutes: true } } },
  });

  const { inclusiveStartUtc, exclusiveEndUtc } = parisDayBoundsUtc(dateParisYmd);

  /** Slots déjà réservés (Paris ce jour ± marge UTC) — quel que soit la prestation, le fauteuil est occupé. */
  const occupied = await prisma.cannesCoiffeurSlot.findMany({
    where: {
      cancelledAt: null,
      startsAt: { lt: exclusiveEndUtc },
      endsAt: { gt: inclusiveStartUtc },
      booking: { status: CannesCoiffeurBookingStatus.CONFIRMED },
    },
    select: { startsAt: true, endsAt: true },
  });

  const candidates: ComputedFreeSlot[] = [];

  for (const rule of rules) {
    generateSlotsForRule(dateParisYmd, rule as AvailabilityWindowRow, timing, candidates);
  }

  candidates.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = `${c.startsAt.toISOString()}_${c.endsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const nowMs = nowUtc.getTime();

  return unique.filter((c) => {
    if (c.startsAt.getTime() < nowMs) return false;
    for (const o of occupied) {
      if (utcRangesOverlap(c.startsAt, c.endsAt, o.startsAt, o.endsAt)) return false;
    }
    return true;
  });
}

/**
 * Découpe une fenêtre règle en créneaux alignés sur la **prestation choisie** (`timing`).
 */
function generateSlotsForRule(
  dateParisYmd: string,
  rule: AvailabilityWindowRow,
  timing: { title: string; slug: string; durationMinutes: number; bufferMinutes: number },
  out: ComputedFreeSlot[]
) {
  const startMin = hhmmToMinutes(rule.startTime);
  const endMin = hhmmToMinutes(rule.endTime);
  const duration = timing.durationMinutes;
  const step = timing.durationMinutes + timing.bufferMinutes;
  const breaksMin = normalizeBreaks(rule.breaks);

  if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin || duration <= 0 || step <= 0) {
    return;
  }

  for (let cursor = startMin; cursor + duration <= endMin; cursor += step) {
    const slotEndMin = cursor + duration;
    /** Tout créneau qui coupe une pause est ignoré. */
    let hitsBreak = false;
    for (const b of breaksMin) {
      if (intervalOverlapsMinutes(cursor, slotEndMin, b.startMin, b.endMin)) {
        hitsBreak = true;
        break;
      }
    }
    if (hitsBreak) continue;

    const startsAt = parisDayMinutesToUtc(dateParisYmd, cursor);
    const endsAt = parisDayMinutesToUtc(dateParisYmd, slotEndMin);
    const note = rule.note?.trim();
    const label = note ? `${timing.title} — ${note}` : timing.title;

    out.push({
      startsAt,
      endsAt,
      label,
      prestationTitle: timing.title,
      prestationSlug: timing.slug,
    });
  }
}

/** Indique si l’instant est exactement un créneau libre pour cette prestation. */
export async function isValidatedFreeSlot(
  prisma: PrismaClient,
  dateParisYmd: string,
  prestationId: string,
  startsAt: Date,
  endsAt: Date,
  nowUtc: Date = new Date()
): Promise<boolean> {
  const free = await computeFreeSlotsForDate(prisma, dateParisYmd, prestationId, nowUtc);
  const t0 = startsAt.getTime();
  const t1 = endsAt.getTime();
  return free.some((w) => w.startsAt.getTime() === t0 && w.endsAt.getTime() === t1);
}

/**
 * Dates (yyyy-MM-dd) entre « aujourd’hui » Paris et `festivalEndYmd` avec au moins un créneau libre pour la prestation.
 */
export async function computeAvailableDatesParis(
  prisma: PrismaClient,
  festivalEndYmd: string,
  prestationId: string,
  nowUtc: Date = new Date()
): Promise<string[]> {
  const startYmd = todayParisYmd(nowUtc);
  const dates: string[] = [];
  let ymd = startYmd;
  while (ymd <= festivalEndYmd) {
    const slots = await computeFreeSlotsForDate(prisma, ymd, prestationId, nowUtc);
    if (slots.length > 0) dates.push(ymd);
    ymd = addOneCalendarDayParisYmd(ymd);
  }
  return dates;
}

/** Contrôle fenêtre horaire et pauses (la durée de créneau vient de la prestation sélectionnée). */
export function validateAvailabilityPayload(input: {
  startTime: string;
  endTime: string;
  breaks: unknown;
}): { ok: true } | { ok: false; error: string } {
  const a = hhmmToMinutes(input.startTime);
  const b = hhmmToMinutes(input.endTime);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) {
    return { ok: false, error: "endTime doit etre apres startTime (HH:mm Paris)" };
  }
  const br = normalizeBreaks(input.breaks);
  for (const p of br) {
    if (p.startMin < a || p.endMin > b) {
      return { ok: false, error: "Chaque pause doit etre incluse dans la plage horaire" };
    }
  }
  return { ok: true };
}
