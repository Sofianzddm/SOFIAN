"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CannesEvent, CannesPresence } from "../types";
import { CANNES_WEEKS } from "../lib/weeks";
import {
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  computeEventPosition,
  layoutEvents,
} from "../lib/calendarMath";
import EventDetailModal from "./EventDetailModal";
import EventForm from "./forms/EventForm";
import Modal from "./Modal";

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SOIREE: { bg: "#C08B8B", border: "#A06B6B", text: "#FFFFFF" },
  DINER: { bg: "#1A1110", border: "#000000", text: "#F5EBE0" },
  BRUNCH: { bg: "#FFD8A8", border: "#E0B888", text: "#1A1110" },
  COCKTAIL: { bg: "#C8F285", border: "#A8D265", text: "#1A1110" },
  CONFERENCE: { bg: "#A8C8F2", border: "#88A8D2", text: "#1A1110" },
  PROJECTION: { bg: "#E8C8F2", border: "#C8A8D2", text: "#1A1110" },
  SHOOTING: { bg: "#F2E8C8", border: "#D2C8A8", text: "#1A1110" },
  AUTRE: { bg: "#E5E0D8", border: "#C5C0B8", text: "#1A1110" },
};

const DAY_NAMES_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type Props = {
  events: CannesEvent[];
  presences: CannesPresence[];
  isAdmin: boolean;
};

export default function WeekCalendarView({ events, presences, isAdmin }: Props) {
  const [weekIndex, setWeekIndex] = useState<0 | 1>(0);
  const [selectedEvent, setSelectedEvent] = useState<CannesEvent | null>(null);
  const [createSlot, setCreateSlot] = useState<{ date: string; time: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const week = CANNES_WEEKS[weekIndex];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 9 * HOUR_HEIGHT;
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CannesEvent[]>();
    for (const ev of events) {
      const dayKey = new Date(ev.date).toISOString().slice(0, 10);
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(ev);
    }
    return map;
  }, [events]);

  const presenceCountByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of week.days) {
      const target = new Date(`${day.date}T12:00:00.000Z`).getTime();
      const count = presences.filter((p) => {
        const arr = new Date(p.arrivalDate).getTime();
        const dep = new Date(p.departureDate).getTime();
        return target >= arr && target <= dep;
      }).length;
      map.set(day.date, count);
    }
    return map;
  }, [presences, week]);

  const handleSlotClick = (e: React.MouseEvent<HTMLDivElement>, dayDate: string, inFestival: boolean) => {
    if (!isAdmin || !inFestival) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    const hour = Math.max(0, Math.min(23, Math.floor(offsetY / HOUR_HEIGHT)));
    const rawMinutes = ((offsetY % HOUR_HEIGHT) / HOUR_HEIGHT) * 60;
    const roundedMinutes = Math.round(rawMinutes / 30) * 30;
    const normalizedHour = roundedMinutes === 60 ? Math.min(23, hour + 1) : hour;
    const normalizedMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
    const time = `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinutes).padStart(2, "0")}`;
    setCreateSlot({ date: dayDate, time });
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px] rounded-2xl border border-[#E5E0D8] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E0D8] px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWeekIndex((prev) => (prev === 0 ? 0 : 0))}
              disabled={weekIndex === 0}
              className="rounded-full p-2 hover:bg-[#F5EBE0] disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Semaine precedente"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-[Spectral] text-xl text-[#1A1110]">
              {week.label} · {formatDateRange(week.days[0].date, week.days[6].date)}
            </h2>
            <button
              onClick={() => setWeekIndex((prev) => (prev === 1 ? 1 : 1))}
              disabled={weekIndex === 1}
              className="rounded-full p-2 hover:bg-[#F5EBE0] disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Semaine suivante"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex gap-1 rounded-full bg-[#F5EBE0] p-1">
            {[0, 1].map((i) => (
              <button
                key={i}
                onClick={() => setWeekIndex(i as 0 | 1)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  weekIndex === i ? "bg-white text-[#1A1110] shadow-sm" : "text-[#1A1110]/50"
                }`}
              >
                S{i + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="sticky top-0 z-20 grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#E5E0D8] bg-white">
          <div />
          {week.days.map((day, i) => {
            const d = new Date(`${day.date}T00:00:00.000Z`);
            const dayNum = d.getUTCDate();
            const monthShort = d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
            const evCount = eventsByDay.get(day.date)?.length ?? 0;
            const presCount = presenceCountByDay.get(day.date) ?? 0;
            return (
              <div
                key={day.date}
                className={`border-l border-[#E5E0D8] px-2 py-3 text-center ${
                  !day.inFestival ? "bg-[#FAFAFA] text-[#1A1110]/30" : ""
                }`}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider">{DAY_NAMES_FR[i]}</div>
                <div className="mt-1 font-[Spectral] text-2xl">{dayNum}</div>
                <div className="text-[10px] text-[#1A1110]/50">{monthShort}</div>
                {day.inFestival && (
                  <div className="mt-1 text-[9px] text-[#1A1110]/40">
                    {evCount} evt · {presCount} pers.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: TOTAL_HEIGHT }}>
            <div className="relative">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="border-b border-[#F0EBE0] pr-2 text-right text-[10px] text-[#1A1110]/40"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="relative -top-1.5">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {week.days.map((day) => {
              const dayEvents = eventsByDay.get(day.date) ?? [];
              const positionedEvents = layoutEvents(dayEvents);

              return (
                <div
                  key={day.date}
                  className={`relative border-l border-[#E5E0D8] ${
                    !day.inFestival
                      ? "bg-[repeating-linear-gradient(45deg,#FAFAFA,#FAFAFA_8px,#F5F5F5_8px,#F5F5F5_16px)]"
                      : ""
                  } ${day.inFestival && isAdmin ? "cursor-pointer" : ""}`}
                  onClick={(e) => handleSlotClick(e, day.date, day.inFestival)}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="border-b border-[#F0EBE0]" style={{ height: HOUR_HEIGHT }} />
                  ))}

                  {positionedEvents.map((ev) => {
                    const { top, height, overflowsNextDay } = computeEventPosition(ev.startTime, ev.endTime);
                    const colors = TYPE_COLORS[ev.type] ?? TYPE_COLORS.AUTRE;
                    const widthPct = 100 / ev._totalColumns;
                    const leftPct = ev._column * widthPct;

                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(ev);
                        }}
                        className="absolute overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-[11px] shadow-sm transition hover:z-10 hover:shadow-md"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: colors.bg,
                          borderLeftColor: colors.border,
                          color: colors.text,
                        }}
                      >
                        <div className="font-semibold leading-tight">
                          {ev.startTime}
                          {ev.endTime && !overflowsNextDay && ` - ${ev.endTime}`}
                          {overflowsNextDay && ev.endTime && ` -> ${ev.endTime} +1`}
                        </div>
                        <div className="truncate font-medium leading-tight">{ev.title}</div>
                        {height > 50 && <div className="mt-0.5 truncate text-[10px] opacity-80">{ev.location}</div>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <EventDetailModal
        event={selectedEvent}
        presences={presences}
        isAdmin={isAdmin}
        onClose={() => setSelectedEvent(null)}
      />
      <Modal open={!!createSlot} title="Nouvel evenement" onClose={() => setCreateSlot(null)}>
        <EventForm
          mode="create"
          initialData={{ date: createSlot?.date, startTime: createSlot?.time }}
          onClose={() => setCreateSlot(null)}
        />
      </Modal>
    </div>
  );
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00.000Z`);
  const e = new Date(`${end}T00:00:00.000Z`);
  const sLabel = s.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const eLabel = e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${sLabel} -> ${eLabel}`;
}
