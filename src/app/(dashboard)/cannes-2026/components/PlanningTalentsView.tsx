"use client";

import { useMemo, useState } from "react";
import { CANNES_2026_DAYS } from "@/lib/cannes/dates";
import { toast } from "sonner";
import Modal from "./Modal";
import PresenceForm from "./forms/PresenceForm";
import { downloadCannesPlanningPdf } from "../downloadPlanningPdf";
import type { CannesPresence } from "../types";
type Props = { presences: CannesPresence[]; isAdmin: boolean };

export default function PlanningTalentsView({ presences, isAdmin }: Props) {
  const [creatingPresence, setCreatingPresence] = useState(false);
  const [selectedPresence, setSelectedPresence] = useState<CannesPresence | null>(null);

  const rows = useMemo(() => presences.filter((p) => p.talent), [presences]);

  async function exportTalentsExcel() {
    try {
      const res = await fetch("/api/cannes/presences/export", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cannes-2026-presences-talents.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Export Excel telecharge");
    } catch {
      toast.error("Erreur lors de l'export Excel");
    }
  }

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-medium text-[#1A1110]">{rows.length} talents sur place</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadCannesPlanningPdf()}
            className="rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]"
          >
            Exporter PDF (complet)
          </button>
          <button
            type="button"
            onClick={() => void exportTalentsExcel()}
            className="rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]"
          >
            Exporter Excel
          </button>
          {isAdmin && (
            <button
              onClick={() => setCreatingPresence(true)}
              className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B]"
            >
              + Ajouter une presence
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((p) => (
          <button key={p.id} onClick={() => setSelectedPresence(p)} className="w-full rounded border border-[#E5E0D8] p-3 text-left">
            <p className="font-medium text-[#1A1110]">{p.talent?.prenom} {p.talent?.nom}</p>
            <p className="text-sm text-[#1A1110]/70">
              {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} - {new Date(p.departureDate).toLocaleDateString("fr-FR")} · {p.hotel || "Hotel non renseigne"}
            </p>
            <div className="mt-2 grid grid-cols-12 gap-1">
              {CANNES_2026_DAYS.map((d) => {
                const active = new Date(p.arrivalDate) <= d && new Date(p.departureDate) >= d;
                return <div key={d.toISOString()} className={`h-2 rounded ${active ? "bg-[#C8F285]" : "bg-[#F5EBE0]"}`} />;
              })}
            </div>
          </button>
        ))}
      </div>

      <Modal open={creatingPresence} title="Ajouter une presence talent" onClose={() => setCreatingPresence(false)}>
        <PresenceForm forcedType="talent" onClose={() => setCreatingPresence(false)} />
      </Modal>

      <Modal open={!!selectedPresence} title="Presence talent" onClose={() => setSelectedPresence(null)}>
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
