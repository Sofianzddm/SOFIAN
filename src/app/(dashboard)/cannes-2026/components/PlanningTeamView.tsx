"use client";

import { useMemo, useState } from "react";
import { CANNES_2026_DAYS } from "@/lib/cannes/dates";
import Modal from "./Modal";
import PresenceForm from "./forms/PresenceForm";
import type { CannesPresence } from "../types";
type Props = { presences: CannesPresence[]; isAdmin: boolean };

export default function PlanningTeamView({ presences, isAdmin }: Props) {
  const [creatingPresence, setCreatingPresence] = useState(false);
  const [selectedPresence, setSelectedPresence] = useState<CannesPresence | null>(null);

  const rows = useMemo(() => presences.filter((p) => p.user), [presences]);

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-medium text-[#1A1110]">{rows.length} collaborateurs sur place</p>
        {isAdmin && (
          <button
            onClick={() => setCreatingPresence(true)}
            className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B]"
          >
            + Ajouter une presence
          </button>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((p) => (
          <button key={p.id} onClick={() => setSelectedPresence(p)} className="w-full rounded border border-[#E5E0D8] p-3 text-left">
            <p className="font-medium text-[#1A1110]">{p.user?.prenom} {p.user?.nom}</p>
            <p className="text-sm text-[#1A1110]/70">
              {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} - {new Date(p.departureDate).toLocaleDateString("fr-FR")} · {p.hotel || "Hotel non renseigne"}
            </p>
            <div className="mt-2 grid grid-cols-12 gap-1">
              {CANNES_2026_DAYS.map((d) => {
                const active = new Date(p.arrivalDate) <= d && new Date(p.departureDate) >= d;
                return <div key={d.toISOString()} className={`h-2 rounded ${active ? "bg-[#C08B8B]" : "bg-[#F5EBE0]"}`} />;
              })}
            </div>
          </button>
        ))}
      </div>

      <Modal open={creatingPresence} title="Ajouter une presence collaborateur" onClose={() => setCreatingPresence(false)}>
        <PresenceForm forcedType="user" onClose={() => setCreatingPresence(false)} />
      </Modal>

      <Modal open={!!selectedPresence} title="Presence collaborateur" onClose={() => setSelectedPresence(null)}>
        {selectedPresence && (
          isAdmin ? (
            <PresenceForm initialData={selectedPresence} onClose={() => setSelectedPresence(null)} />
          ) : (
            <div className="space-y-2 text-sm text-[#1A1110]/80">
              <p>Hotel : {selectedPresence.hotel || "-"}</p>
              <p>Vol arrivee : {selectedPresence.flightArrival || "-"}</p>
              <p>Vol depart : {selectedPresence.flightDeparture || "-"}</p>
              <p>Notes : {selectedPresence.notes || "-"}</p>
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
