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

type CalendarFilters = {
  talentArrivals: boolean;
  talentDepartures: boolean;
  teamArrivals: boolean;
  teamDepartures: boolean;
  externalPresences: boolean;
};

type DayPresenceHighlights = {
  talentArrivals: number;
  talentDepartures: number;
  teamArrivals: number;
  teamDepartures: number;
  externalPresences: number;
  talentArrivalHours: string[];
  talentDepartureHours: string[];
  teamArrivalHours: string[];
  teamDepartureHours: string[];
  talentArrivalNames: string[];
  talentDepartureNames: string[];
  teamArrivalNames: string[];
  teamDepartureNames: string[];
  externalPresenceNames: string[];
};

type PresenceCalendarKind =
  | "talent-arrival"
  | "talent-departure"
  | "team-arrival"
  | "team-departure"
  | "external-presence";

type CalendarRenderableEvent = CannesEvent & {
  syntheticKind?: PresenceCalendarKind;
  syntheticPresenceId?: string;
};

function normalizeHour(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function extractHourFromFlightText(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b([0-2]?\d[:hH][0-5]\d)\b/);
  if (!match) return null;
  return normalizeHour(match[1]);
}

function extractHourFromIso(value: string): string | null {
  if (!value.includes("T")) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  if (hh === 0 && mm === 0) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function summarizeHours(hours: string[]): string {
  if (hours.length === 0) return "";
  const uniq = [...new Set(hours)].sort();
  if (uniq.length <= 2) return uniq.join(", ");
  return `${uniq.slice(0, 2).join(", ")} +${uniq.length - 2}`;
}

function summarizeNames(names: string[]): string {
  const uniq = [...new Set(names.filter(Boolean))];
  if (uniq.length === 0) return "Noms non renseignes";
  if (uniq.length <= 3) return uniq.join(", ");
  return `${uniq.slice(0, 3).join(", ")} +${uniq.length - 3}`;
}

function presenceLabel(presence: CannesPresence): string {
  if (presence.talent) return `${presence.talent.prenom ?? ""} ${presence.talent.nom ?? ""}`.trim() || "Talent";
  if (presence.user) return `${presence.user.prenom ?? ""} ${presence.user.nom ?? ""}`.trim() || "Collaborateur";
  return "Profil";
}

function isExternalTeamPresence(presence: CannesPresence): boolean {
  if (!presence.userId || presence.talentId) return false;
  const role = (presence.user?.role || "").toLowerCase();
  return (
    role.includes("prestat") ||
    role.includes("extern") ||
    role.includes("freelance") ||
    role.includes("outside")
  );
}

function plusOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function earliestHour(hours: string[], fallback: string): string {
  if (hours.length === 0) return fallback;
  return [...hours].sort()[0] || fallback;
}

export default function WeekCalendarView({ events, presences, isAdmin }: Props) {
  const [weekIndex, setWeekIndex] = useState<0 | 1>(0);
  const [selectedEvent, setSelectedEvent] = useState<CannesEvent | null>(null);
  const [selectedSyntheticEvent, setSelectedSyntheticEvent] = useState<CalendarRenderableEvent | null>(null);
  const [createSlot, setCreateSlot] = useState<{ date: string; time: string } | null>(null);
  const [filters, setFilters] = useState<CalendarFilters>({
    talentArrivals: true,
    talentDepartures: true,
    teamArrivals: true,
    teamDepartures: true,
    externalPresences: true,
  });
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

  const dayHighlightsByKey = useMemo(() => {
    const map = new Map<string, DayPresenceHighlights>();
    for (const day of week.days) {
      map.set(day.date, {
        talentArrivals: 0,
        talentDepartures: 0,
        teamArrivals: 0,
        teamDepartures: 0,
        externalPresences: 0,
        talentArrivalHours: [],
        talentDepartureHours: [],
        teamArrivalHours: [],
        teamDepartureHours: [],
        talentArrivalNames: [],
        talentDepartureNames: [],
        teamArrivalNames: [],
        teamDepartureNames: [],
        externalPresenceNames: [],
      });
    }

    for (const presence of presences) {
      const arrivalDay = new Date(presence.arrivalDate).toISOString().slice(0, 10);
      const departureDay = new Date(presence.departureDate).toISOString().slice(0, 10);
      const isTalent = !!presence.talentId;
      const isTeam = !!presence.userId && !presence.talentId;
      const isExternal = isExternalTeamPresence(presence);
      const displayName = presenceLabel(presence);
      const arrivalHour = extractHourFromFlightText(presence.flightArrival) ?? extractHourFromIso(presence.arrivalDate);
      const departureHour =
        extractHourFromFlightText(presence.flightDeparture) ?? extractHourFromIso(presence.departureDate);

      const arrivalEntry = map.get(arrivalDay);
      if (arrivalEntry) {
        if (isTalent) {
          arrivalEntry.talentArrivals += 1;
          if (arrivalHour) arrivalEntry.talentArrivalHours.push(arrivalHour);
          arrivalEntry.talentArrivalNames.push(displayName);
        }
        if (isTeam) {
          arrivalEntry.teamArrivals += 1;
          if (arrivalHour) arrivalEntry.teamArrivalHours.push(arrivalHour);
          arrivalEntry.teamArrivalNames.push(displayName);
        }
      }

      const departureEntry = map.get(departureDay);
      if (departureEntry) {
        if (isTalent) {
          departureEntry.talentDepartures += 1;
          if (departureHour) departureEntry.talentDepartureHours.push(departureHour);
          departureEntry.talentDepartureNames.push(displayName);
        }
        if (isTeam) {
          departureEntry.teamDepartures += 1;
          if (departureHour) departureEntry.teamDepartureHours.push(departureHour);
          departureEntry.teamDepartureNames.push(displayName);
        }
      }

      if (isExternal) {
        const arrivalTs = new Date(presence.arrivalDate).getTime();
        const departureTs = new Date(presence.departureDate).getTime();
        for (const day of week.days) {
          const dayTs = new Date(`${day.date}T12:00:00.000Z`).getTime();
          if (dayTs >= arrivalTs && dayTs <= departureTs) {
            const entry = map.get(day.date);
            if (entry) {
              entry.externalPresences += 1;
              entry.externalPresenceNames.push(displayName);
            }
          }
        }
      }
    }

    return map;
  }, [presences, week]);

  const filterButtons: Array<{ key: keyof CalendarFilters; label: string; activeClass: string }> = [
    { key: "talentArrivals", label: "Arrivees talents", activeClass: "bg-[#FDE8E8] text-[#8B1E1E]" },
    { key: "talentDepartures", label: "Departs talents", activeClass: "bg-[#FFEED8] text-[#8A4A00]" },
    { key: "teamArrivals", label: "Arrivees equipe", activeClass: "bg-[#E8F0FE] text-[#204A8A]" },
    { key: "teamDepartures", label: "Departs equipe", activeClass: "bg-[#EAF8E6] text-[#2E5B0F]" },
    { key: "externalPresences", label: "Prestats externes", activeClass: "bg-[#F1EAFE] text-[#5F3B91]" },
  ];

  const syntheticEventsByDay = useMemo(() => {
    const map = new Map<string, CalendarRenderableEvent[]>();
    const weekDaySet: Set<string> = new Set(week.days.map((d) => d.date));

    const makeSyntheticEvent = (
      dayDate: string,
      kind: PresenceCalendarKind,
      title: string,
      startTime: string,
      description: string,
      location: string,
      presenceId: string
    ): CalendarRenderableEvent => ({
      id: `presence-${kind}-${dayDate}-${startTime}`,
      date: `${dayDate}T00:00:00.000Z`,
      startTime,
      endTime: plusOneHour(startTime),
      title,
      type: "AUTRE",
      location,
      address: null,
      organizer: null,
      contactInfo: null,
      dressCode: null,
      invitationLink: null,
      description,
      notes: null,
      attendees: [],
      syntheticKind: kind,
      syntheticPresenceId: presenceId,
    });

    const pushDayItem = (dayKey: string, item: CalendarRenderableEvent) => {
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(item);
    };

    for (const presence of presences) {
      const name = presenceLabel(presence);
      const arrivalDay = new Date(presence.arrivalDate).toISOString().slice(0, 10);
      const departureDay = new Date(presence.departureDate).toISOString().slice(0, 10);
      const arrivalHour = extractHourFromFlightText(presence.flightArrival) ?? extractHourFromIso(presence.arrivalDate);
      const departureHour =
        extractHourFromFlightText(presence.flightDeparture) ?? extractHourFromIso(presence.departureDate);
      const isTalent = !!presence.talentId;
      const isTeam = !!presence.userId && !presence.talentId;
      const isExternal = isExternalTeamPresence(presence);

      if (isTalent && filters.talentArrivals && weekDaySet.has(arrivalDay)) {
        pushDayItem(
          arrivalDay,
          makeSyntheticEvent(
            arrivalDay,
            "talent-arrival",
            `Arrivee talent · ${name}`,
            arrivalHour || "09:00",
            `Arrivee talent ${name} · heure ${arrivalHour || "non renseignee"}`,
            name,
            presence.id
          )
        );
      }

      if (isTalent && filters.talentDepartures && weekDaySet.has(departureDay)) {
        pushDayItem(
          departureDay,
          makeSyntheticEvent(
            departureDay,
            "talent-departure",
            `Depart talent · ${name}`,
            departureHour || "18:00",
            `Depart talent ${name} · heure ${departureHour || "non renseignee"}`,
            name,
            presence.id
          )
        );
      }

      if (isTeam && filters.teamArrivals && weekDaySet.has(arrivalDay)) {
        pushDayItem(
          arrivalDay,
          makeSyntheticEvent(
            arrivalDay,
            "team-arrival",
            `Arrivee equipe · ${name}`,
            arrivalHour || "10:00",
            `Arrivee equipe ${name} · heure ${arrivalHour || "non renseignee"}`,
            name,
            presence.id
          )
        );
      }

      if (isTeam && filters.teamDepartures && weekDaySet.has(departureDay)) {
        pushDayItem(
          departureDay,
          makeSyntheticEvent(
            departureDay,
            "team-departure",
            `Depart equipe · ${name}`,
            departureHour || "17:00",
            `Depart equipe ${name} · heure ${departureHour || "non renseignee"}`,
            name,
            presence.id
          )
        );
      }

      if (isExternal && filters.externalPresences) {
        const startTs = new Date(presence.arrivalDate).getTime();
        const endTs = new Date(presence.departureDate).getTime();
        for (const day of week.days) {
          const dayTs = new Date(`${day.date}T12:00:00.000Z`).getTime();
          if (dayTs >= startTs && dayTs <= endTs) {
            pushDayItem(
              day.date,
              makeSyntheticEvent(
                day.date,
                "external-presence",
                `Prestat externe · ${name}`,
                arrivalHour || "12:00",
                `Presence externe ${name}`,
                name,
                presence.id
              )
            );
          }
        }
      }
    }

    return map;
  }, [filters, presences, week.days]);

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
        <div className="border-b border-[#E5E0D8] px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {filterButtons.map((filter) => {
              const enabled = filters[filter.key];
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      [filter.key]: !prev[filter.key],
                    }))
                  }
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    enabled
                      ? `border-transparent ${filter.activeClass}`
                      : "border-[#E5E0D8] bg-white text-[#1A1110]/55 hover:text-[#1A1110]"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
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
            const highlights = dayHighlightsByKey.get(day.date);
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
                  <>
                    <div className="mt-1 text-[9px] text-[#1A1110]/40">
                      {evCount} evt · {presCount} pers.
                    </div>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {filters.talentArrivals && (highlights?.talentArrivals ?? 0) > 0 && (
                        <span
                          title={
                            highlights
                              ? `Heures: ${summarizeHours(highlights.talentArrivalHours) || "non renseignees"}`
                              : undefined
                          }
                          className="rounded-full bg-[#FDE8E8] px-1.5 py-0.5 text-[9px] text-[#8B1E1E]"
                        >
                          A T {highlights?.talentArrivals}
                        </span>
                      )}
                      {filters.talentDepartures && (highlights?.talentDepartures ?? 0) > 0 && (
                        <span
                          title={
                            highlights
                              ? `Heures: ${summarizeHours(highlights.talentDepartureHours) || "non renseignees"}`
                              : undefined
                          }
                          className="rounded-full bg-[#FFEED8] px-1.5 py-0.5 text-[9px] text-[#8A4A00]"
                        >
                          D T {highlights?.talentDepartures}
                        </span>
                      )}
                      {filters.teamArrivals && (highlights?.teamArrivals ?? 0) > 0 && (
                        <span
                          title={
                            highlights
                              ? `Heures: ${summarizeHours(highlights.teamArrivalHours) || "non renseignees"}`
                              : undefined
                          }
                          className="rounded-full bg-[#E8F0FE] px-1.5 py-0.5 text-[9px] text-[#204A8A]"
                        >
                          A E {highlights?.teamArrivals}
                        </span>
                      )}
                      {filters.teamDepartures && (highlights?.teamDepartures ?? 0) > 0 && (
                        <span
                          title={
                            highlights
                              ? `Heures: ${summarizeHours(highlights.teamDepartureHours) || "non renseignees"}`
                              : undefined
                          }
                          className="rounded-full bg-[#EAF8E6] px-1.5 py-0.5 text-[9px] text-[#2E5B0F]"
                        >
                          D E {highlights?.teamDepartures}
                        </span>
                      )}
                      {filters.externalPresences && (highlights?.externalPresences ?? 0) > 0 && (
                        <span className="rounded-full bg-[#F1EAFE] px-1.5 py-0.5 text-[9px] text-[#5F3B91]">
                          Ext {highlights?.externalPresences}
                        </span>
                      )}
                    </div>
                  </>
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
              const realDayEvents = eventsByDay.get(day.date) ?? [];
              const syntheticDayEvents = syntheticEventsByDay.get(day.date) ?? [];
              const dayEvents: CalendarRenderableEvent[] = [...realDayEvents, ...syntheticDayEvents];
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
                    const syntheticColors: Record<PresenceCalendarKind, { bg: string; border: string; text: string }> = {
                      "talent-arrival": { bg: "#FDE8E8", border: "#E7A4A4", text: "#7B1A1A" },
                      "talent-departure": { bg: "#FFEED8", border: "#E8C08D", text: "#7A4A0B" },
                      "team-arrival": { bg: "#E8F0FE", border: "#A8BEEA", text: "#204A8A" },
                      "team-departure": { bg: "#EAF8E6", border: "#B2D5A7", text: "#2E5B0F" },
                      "external-presence": { bg: "#F1EAFE", border: "#C8B6E8", text: "#5F3B91" },
                    };
                    const colors = ev.syntheticKind
                      ? syntheticColors[ev.syntheticKind]
                      : (TYPE_COLORS[ev.type] ?? TYPE_COLORS.AUTRE);
                    const widthPct = 100 / ev._totalColumns;
                    const leftPct = ev._column * widthPct;
                    const isSynthetic = !!ev.syntheticKind;

                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSynthetic) setSelectedSyntheticEvent(ev);
                          else setSelectedEvent(ev);
                        }}
                        title={isSynthetic ? ev.description || undefined : undefined}
                        className={`absolute overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-[11px] shadow-sm transition hover:z-10 hover:shadow-md ${
                          isSynthetic ? "border-dashed" : ""
                        }`}
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
      <Modal open={!!selectedSyntheticEvent} title="Detail mouvement presence" onClose={() => setSelectedSyntheticEvent(null)}>
        {selectedSyntheticEvent && (
          <div className="space-y-3 text-sm text-[#1A1110]/85">
            <p className="font-medium text-[#1A1110]">{selectedSyntheticEvent.title}</p>
            <p>
              {new Date(selectedSyntheticEvent.date).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              · {selectedSyntheticEvent.startTime}
              {selectedSyntheticEvent.endTime ? ` -> ${selectedSyntheticEvent.endTime}` : ""}
            </p>
            <p>{selectedSyntheticEvent.description || "-"}</p>
            {(() => {
              const presence = presences.find((p) => p.id === selectedSyntheticEvent.syntheticPresenceId);
              if (!presence) return null;
              const name = presence.talent
                ? `${presence.talent.prenom ?? ""} ${presence.talent.nom ?? ""}`.trim()
                : `${presence.user?.prenom ?? ""} ${presence.user?.nom ?? ""}`.trim();
              return (
                <div className="rounded-lg border border-[#E5E0D8] bg-[#FCFAF8] p-3">
                  <p>
                    <strong>Personne:</strong> {name || "-"}
                  </p>
                  <p>
                    <strong>Hotel:</strong> {presence.hotel || "-"}
                  </p>
                  <p>
                    <strong>Vol arrivee:</strong> {presence.flightArrival || "-"}
                  </p>
                  <p>
                    <strong>Vol depart:</strong> {presence.flightDeparture || "-"}
                  </p>
                  <p>
                    <strong>Notes:</strong> {presence.notes || "-"}
                  </p>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>
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
