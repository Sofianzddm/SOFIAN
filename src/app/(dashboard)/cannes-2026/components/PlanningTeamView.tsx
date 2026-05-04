"use client";

import { useMemo, useState } from "react";
import { CANNES_2026_DAYS, isUtcDayInIsoRange } from "@/lib/cannes/dates";
import Modal from "./Modal";
import PresenceForm from "./forms/PresenceForm";
import TeamUnavailabilitiesEditor from "./TeamUnavailabilitiesEditor";
import { downloadCannesPlanningPdf } from "../downloadPlanningPdf";
import type { CannesPresence } from "../types";
type Props = { presences: CannesPresence[]; isAdmin: boolean };

export default function PlanningTeamView({ presences, isAdmin }: Props) {
  const [creatingPresence, setCreatingPresence] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => presences.filter((p) => p.user), [presences]);
  const selectedPresence = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium text-[#1A1110]">{rows.length} collaborateurs sur place</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadCannesPlanningPdf()}
            className="rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]"
          >
            Exporter PDF (equipe + talents)
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCreatingPresence(true)}
              className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B]"
            >
              + Ajouter une presence
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-[#1A1110]/70">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded bg-[#C08B8B]" /> Sur place et disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded bg-[#1A1110]" /> Absent (hors dates presence ou absence declaree)
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className="w-full rounded border border-[#E5E0D8] p-3 text-left"
          >
            <p className="font-medium text-[#1A1110]">
              {p.user?.prenom} {p.user?.nom}
            </p>
            <p className="text-sm text-[#1A1110]/70">
              {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} -{" "}
              {new Date(p.departureDate).toLocaleDateString("fr-FR")} · {p.hotel || "Hotel non renseigne"}
            </p>
            <div className="mt-2 grid grid-cols-12 gap-1">
              {CANNES_2026_DAYS.map((d) => {
                const onPresenceWindow =
                  new Date(p.arrivalDate) <= d && new Date(p.departureDate) >= d;
                const absenceDay = (p.teamUnavailabilities ?? []).some((u) =>
                  isUtcDayInIsoRange(d, u.startDate, u.endDate)
                );
                const disponible = onPresenceWindow && !absenceDay;
                const cls = disponible ? "h-2 rounded bg-[#C08B8B]" : "h-2 rounded bg-[#1A1110]";
                return <div key={d.toISOString()} className={cls} />;
              })}
            </div>
          </button>
        ))}
      </div>

      <Modal open={creatingPresence} title="Ajouter une presence collaborateur" onClose={() => setCreatingPresence(false)}>
        <PresenceForm forcedType="user" onClose={() => setCreatingPresence(false)} />
      </Modal>

      <Modal open={!!selectedPresence} title="Presence collaborateur" onClose={() => setSelectedId(null)}>
        {selectedPresence && (
          <>
            {isAdmin ? (
              <>
                <PresenceForm initialData={selectedPresence} onClose={() => setSelectedId(null)} />
                <TeamUnavailabilitiesEditor presence={selectedPresence} />
              </>
            ) : (
              <div className="space-y-3 text-sm text-[#1A1110]/80">
                <p>Hotel : {selectedPresence.hotel || "-"}</p>
                <p>Vol arrivee : {selectedPresence.flightArrival || "-"}</p>
                <p>Vol depart : {selectedPresence.flightDeparture || "-"}</p>
                <p>Notes : {selectedPresence.notes || "-"}</p>
                {(selectedPresence.teamUnavailabilities?.length ?? 0) > 0 && (
                  <div>
                    <p className="font-medium text-[#1A1110]">Indisponibilités</p>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {selectedPresence.teamUnavailabilities!.map((u) => (
                        <li key={u.id}>
                          {new Date(u.startDate).toLocaleDateString("fr-FR")} →{" "}
                          {new Date(u.endDate).toLocaleDateString("fr-FR")}
                          {u.label ? ` — ${u.label}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
