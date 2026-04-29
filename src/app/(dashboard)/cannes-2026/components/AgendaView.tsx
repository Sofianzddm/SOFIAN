"use client";

import { useState } from "react";
import { Calendar, List, Plus } from "lucide-react";
import Modal from "./Modal";
import EventForm from "./forms/EventForm";
import WeekCalendarView from "./WeekCalendarView";
import AgendaListView from "./AgendaListView";
import type { CannesEvent, CannesPresence } from "../types";

type Props = { events: CannesEvent[]; presences: CannesPresence[]; isAdmin: boolean };
type ViewMode = "calendar" | "list";

export default function AgendaView({ events, presences, isAdmin }: Props) {
  const [mode, setMode] = useState<ViewMode>("calendar");
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full border border-[#E5E0D8] bg-white p-1">
          <button
            onClick={() => setMode("calendar")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              mode === "calendar" ? "bg-[#1A1110] text-[#F5EBE0]" : "text-[#1A1110]/60 hover:text-[#1A1110]"
            }`}
          >
            <Calendar size={14} /> Calendrier
          </button>
          <button
            onClick={() => setMode("list")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              mode === "list" ? "bg-[#1A1110] text-[#F5EBE0]" : "text-[#1A1110]/60 hover:text-[#1A1110]"
            }`}
          >
            <List size={14} /> Liste
          </button>
        </div>

        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#1A1110] px-4 py-2 text-xs font-medium text-[#F5EBE0] transition hover:bg-[#C08B8B]"
          >
            <Plus size={14} /> Nouvel evenement
          </button>
        )}
      </div>

      {mode === "calendar" ? (
        <WeekCalendarView events={events} presences={presences} isAdmin={isAdmin} />
      ) : (
        <AgendaListView events={events} presences={presences} isAdmin={isAdmin} />
      )}

      <Modal open={creating} title="Nouvel evenement" onClose={() => setCreating(false)}>
        <EventForm mode="create" onClose={() => setCreating(false)} />
      </Modal>
    </div>
  );
}
