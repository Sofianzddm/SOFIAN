"use client";

import { useMemo, useState } from "react";
import { CANNES_2026_DAYS, formatDayLabel } from "@/lib/cannes/dates";
import Modal from "./Modal";
import EventForm from "./forms/EventForm";
import EventDetailModal from "./EventDetailModal";
import type { CannesEvent, CannesPresence } from "../types";
import { TYPE_COLORS } from "./constants";

type Props = { events: CannesEvent[]; presences: CannesPresence[]; isAdmin: boolean };

export default function AgendaView({ events, presences, isAdmin }: Props) {
  const [selected, setSelected] = useState<CannesEvent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);

  const grouped = useMemo(() => {
    return CANNES_2026_DAYS.map((day) => {
      const iso = day.toISOString().slice(0, 10);
      const dayEvents = events.filter((e) => new Date(e.date).toISOString().slice(0, 10) === iso);
      const onSiteCount = presences.filter((p) => {
        const d = day.getTime();
        return new Date(p.arrivalDate).getTime() <= d && new Date(p.departureDate).getTime() >= d;
      }).length;
      return { day, dayEvents, onSiteCount };
    });
  }, [events, presences]);

  return (
    <div className="space-y-4">
      {grouped.map(({ day, dayEvents, onSiteCount }) => (
        <section key={day.toISOString()} className="rounded-xl border border-[#E5E0D8] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <button
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return;
                setPrefilledDate(day.toISOString().slice(0, 10));
                setCreatingEvent(true);
              }}
              className="font-[Spectral] text-2xl capitalize text-[#1A1110]"
            >
              {formatDayLabel(day)}
            </button>
            <p className="text-sm text-[#1A1110]/60">
              {dayEvents.length} evenement(s) · {onSiteCount} personne(s) sur place
            </p>
          </div>
          <div className="grid gap-3">
            {dayEvents.length === 0 && <p className="text-sm text-[#1A1110]/50">Aucun evenement.</p>}
            {dayEvents.map((event) => {
              const cfg = TYPE_COLORS[event.type] || TYPE_COLORS.AUTRE;
              const attendees = event.attendees || [];
              return (
                <button
                  key={event.id}
                  onClick={() => setSelected(event)}
                  className="rounded-lg border border-[#E5E0D8] p-4 text-left transition hover:border-[#C08B8B]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[#1A1110]">
                      {event.startTime} {event.endTime ? `- ${event.endTime}` : ""}
                    </span>
                    <span className="rounded-full px-2 py-1 text-xs" style={{ background: cfg.bg, color: cfg.text }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold text-[#1A1110]">{event.title}</p>
                  <p className="text-sm text-[#1A1110]/70">{event.location}</p>
                  {event.organizer && <p className="text-xs text-[#1A1110]/60">Organise par {event.organizer}</p>}
                  {attendees.length > 0 && (
                    <p className="mt-2 text-xs text-[#1A1110]/70">{attendees.length} participant(s)</p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {isAdmin && (
        <button
          onClick={() => {
            setPrefilledDate(undefined);
            setCreatingEvent(true);
          }}
          className="fixed bottom-8 right-8 rounded-full bg-[#1A1110] px-5 py-3 text-sm font-medium text-[#F5EBE0] shadow-md hover:bg-[#C08B8B]"
        >
          + Nouvel evenement
        </button>
      )}

      <Modal open={creatingEvent} title="Nouvel evenement" onClose={() => setCreatingEvent(false)}>
        <EventForm defaultDate={prefilledDate} onClose={() => setCreatingEvent(false)} />
      </Modal>

      <EventDetailModal event={selected} presences={presences} isAdmin={isAdmin} onClose={() => setSelected(null)} />
    </div>
  );
}
