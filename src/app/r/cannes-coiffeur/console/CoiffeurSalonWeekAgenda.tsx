"use client";

import { useMemo } from "react";
import { addDays, addWeeks, getISODay, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

/** Hauteur du corps de la grille (hors ligne d’entête). ~14h × 52px/h */
export const PARIS_GRID_START_HOUR = 8;
export const PARIS_GRID_END_HOUR = 21;
export const PX_PER_HOUR = 52;
export const GRID_TOTAL_H = (PARIS_GRID_END_HOUR - PARIS_GRID_START_HOUR) * PX_PER_HOUR;

export type WeekAgendaSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string | null;
  cancelledAt: string | null;
  booking: {
    id: string;
    status: string;
    guestName: string | null;
    guestEmail: string | null;
    notes: string | null;
    talent: { prenom: string; nom: string } | null;
    prestation: { title: string } | null;
  } | null;
};

function mondayYmdOfWeekContaining(referenceUtc: Date, weekOffset: number): string {
  const shifted = addWeeks(referenceUtc, weekOffset);
  const ymd = formatInTimeZone(shifted, PARIS_TZ, "yyyy-MM-dd");
  const noon = fromZonedTime(`${ymd} 12:00:00`, PARIS_TZ);
  const isoDow = getISODay(noon); // 1 = lundi
  const mondayNoon = subDays(noon, isoDow - 1);
  return formatInTimeZone(mondayNoon, PARIS_TZ, "yyyy-MM-dd");
}

function ymdToParisNoonUtc(ymd: string): Date {
  return fromZonedTime(`${ymd} 12:00:00`, PARIS_TZ);
}

function parisMinutesFromMidnight(d: Date): number {
  const h = Number(formatInTimeZone(d, PARIS_TZ, "H"));
  const m = Number(formatInTimeZone(d, PARIS_TZ, "m"));
  return h * 60 + m;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeWeekParisDays(referenceUtc: Date, weekOffset: number) {
  const monYmd = mondayYmdOfWeekContaining(referenceUtc, weekOffset);
  const start = ymdToParisNoonUtc(monYmd);
  return Array.from({ length: 7 }, (_, i) => {
    const inst = addDays(start, i);
    return {
      ymd: formatInTimeZone(inst, PARIS_TZ, "yyyy-MM-dd"),
      labelShort: formatInTimeZone(inst, PARIS_TZ, "EEE", { locale: fr }),
      labelDay: formatInTimeZone(inst, PARIS_TZ, "d MMM", { locale: fr }),
    };
  });
}

type Props = {
  referenceUtc?: Date;
  weekOffset: number;
  slots: WeekAgendaSlot[];
  showCancelled: boolean;
  onSelectSlot: (slot: WeekAgendaSlot) => void;
};

export default function CoiffeurSalonWeekAgenda({
  referenceUtc = new Date(),
  weekOffset,
  slots,
  showCancelled,
  onSelectSlot,
}: Props) {
  const days = useMemo(
    () => computeWeekParisDays(referenceUtc, weekOffset),
    [referenceUtc, weekOffset]
  );

  const hours = useMemo(
    () =>
      Array.from({ length: PARIS_GRID_END_HOUR - PARIS_GRID_START_HOUR }, (_, i) => PARIS_GRID_START_HOUR + i),
    []
  );

  const slotsByYmd = useMemo(() => {
    const map = new Map<string, WeekAgendaSlot[]>();
    for (const day of days) {
      map.set(day.ymd, []);
    }
    for (const s of slots) {
      const ymd = formatInTimeZone(new Date(s.startsAt), PARIS_TZ, "yyyy-MM-dd");
      if (!map.has(ymd)) continue;
      if (!showCancelled && s.cancelledAt) continue;
      map.get(ymd)!.push(s);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    }
    return map;
  }, [days, slots, showCancelled]);

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl border border-glowup-rose/25 bg-black/20 [-webkit-overflow-scrolling:touch]">
      <div className="flex w-full min-w-[600px] sm:min-w-[680px] md:min-w-[720px]">
        <div className="sticky left-0 z-20 flex w-9 shrink-0 flex-col border-r border-glowup-rose/20 bg-black/35 sm:w-12">
          <div className="h-11 shrink-0 border-b border-glowup-rose/25 sm:h-14" aria-hidden />
          {hours.map((h) => (
            <div
              key={h}
              className="flex shrink-0 items-start justify-end pr-1.5 text-[9px] text-glowup-lace/40 sm:pr-2 sm:text-[10px]"
              style={{ height: PX_PER_HOUR }}
            >
              {String(h).padStart(2, "0")}h
            </div>
          ))}
        </div>

        <div className="flex flex-1">
          {days.map((day) => (
            <div
              key={day.ymd}
              className="relative min-w-[76px] flex-1 border-r border-glowup-rose/15 last:border-r-0 sm:min-w-[84px] md:min-w-[92px]"
            >
              <div className="sticky top-0 z-10 border-b border-glowup-rose/25 bg-black/55 px-0.5 py-1.5 text-center backdrop-blur-sm sm:px-1 sm:py-2">
                <div className="text-[9px] uppercase tracking-wider text-glowup-lace/50 sm:text-[10px]">{day.labelShort}</div>
                <div className="font-[Spectral] text-xs leading-tight text-glowup-lace sm:text-sm">{day.labelDay}</div>
              </div>

              <div className="relative" style={{ height: GRID_TOTAL_H }}>
                {hours.map((h) => (
                  <div
                    key={`${day.ymd}-${h}`}
                    className="border-b border-glowup-rose/10"
                    style={{ height: PX_PER_HOUR }}
                  />
                ))}

                {slotsByYmd.get(day.ymd)?.map((s) => {
                  const start = new Date(s.startsAt);
                  const end = new Date(s.endsAt);
                  const mins0 = PARIS_GRID_START_HOUR * 60;
                  const mins1 = PARIS_GRID_END_HOUR * 60;
                  const topMin = clamp(parisMinutesFromMidnight(start), mins0, mins1);
                  const bottomMin = clamp(parisMinutesFromMidnight(end), mins0, mins1);
                  const topPx = ((topMin - mins0) / 60) * PX_PER_HOUR;
                  const hPx = Math.max(((bottomMin - topMin) / 60) * PX_PER_HOUR, 18);
                  const confirmed = s.booking?.status === "CONFIRMED";
                  const cancelled = !!s.cancelledAt;
                  const name =
                    s.booking?.guestName?.trim() ||
                    (s.booking?.talent ? `${s.booking.talent.prenom} ${s.booking.talent.nom}` : null);
                  const prest = s.booking?.prestation?.title;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSlot(s)}
                      className={`absolute left-0.5 right-0.5 overflow-hidden rounded-lg border px-1 py-0.5 text-left text-[10px] leading-tight shadow-md transition hover:ring-2 hover:ring-glowup-rose-light/50 ${
                        cancelled
                          ? "border-white/10 bg-white/5 text-glowup-lace/35 line-through"
                          : confirmed
                            ? "border-glowup-rose/60 bg-glowup-rose/35 text-glowup-lace"
                            : "border-glowup-rose/35 bg-black/40 text-glowup-lace/90"
                      }`}
                      style={{ top: topPx, height: hPx }}
                    >
                      <div className="truncate font-medium">
                        {formatInTimeZone(start, PARIS_TZ, "HH:mm")} – {formatInTimeZone(end, PARIS_TZ, "HH:mm")}
                      </div>
                      {confirmed && name && <div className="truncate text-glowup-lace/95">{name}</div>}
                      {confirmed && prest && <div className="truncate text-glowup-lace/70">{prest}</div>}
                      {!confirmed && !cancelled && <div className="truncate text-glowup-lace/60">Libre</div>}
                      {cancelled && <div className="truncate">Retiré</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
