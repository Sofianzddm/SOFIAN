"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CANNES_2026_DAYS } from "@/lib/cannes/dates";
import type { CannesPresence } from "../types";

type Props = {
  presences: CannesPresence[];
  isAdmin: boolean;
};

const ROOM_CONFIG = [
  { id: "chambre-1", label: "Chambre 1", capacity: 1 },
  { id: "chambre-2", label: "Chambre 2", capacity: 1 },
  { id: "chambre-3", label: "Chambre 3", capacity: 1 },
  { id: "chambre-4", label: "Chambre 4", capacity: 1 },
  { id: "chambre-5", label: "Chambre 5 (x4)", capacity: 4 },
] as const;

function toDateOnly(dateStr: string) {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export default function RoomOrganizerView({ presences, isAdmin }: Props) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggedPresenceId, setDraggedPresenceId] = useState<string | null>(null);
  const [dropTargetRoom, setDropTargetRoom] = useState<string | null>(null);
  const [draftRooms, setDraftRooms] = useState<Record<string, string>>(() =>
    Object.fromEntries(presences.map((p) => [p.id, p.roomNumber || ""]))
  );

  const talentRows = useMemo(() => presences.filter((p) => p.talent), [presences]);

  const occupancyByDay = useMemo(() => {
    return CANNES_2026_DAYS.map((day) => {
      const dayOnly = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const roomOccupancy = ROOM_CONFIG.map((room) => {
        const occupants = talentRows.filter((p) => {
          const assignedRoom = draftRooms[p.id] || p.roomNumber || "";
          if (assignedRoom !== room.id) return false;
          const start = toDateOnly(p.arrivalDate);
          const end = toDateOnly(p.departureDate);
          return dayOnly >= start && dayOnly <= end;
        });
        return {
          roomId: room.id,
          label: room.label,
          capacity: room.capacity,
          occupants,
        };
      });

      return {
        day,
        roomOccupancy,
      };
    });
  }, [draftRooms, talentRows]);

  const overbookedDaysCount = useMemo(() => {
    return occupancyByDay.filter((entry) =>
      entry.roomOccupancy.some((room) => room.occupants.length > room.capacity)
    ).length;
  }, [occupancyByDay]);

  const unassignedCount = useMemo(() => {
    return talentRows.filter((p) => !(draftRooms[p.id] || p.roomNumber)).length;
  }, [draftRooms, talentRows]);

  function getAssignedRoomId(presenceId: string) {
    return draftRooms[presenceId] || presences.find((p) => p.id === presenceId)?.roomNumber || "";
  }

  async function saveRoom(presenceId: string, roomId?: string) {
    try {
      setSavingId(presenceId);
      const nextRoom = roomId === undefined ? draftRooms[presenceId] : roomId;
      setDraftRooms((prev) => ({ ...prev, [presenceId]: nextRoom || "" }));
      const res = await fetch(`/api/cannes/presences/${presenceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          roomNumber: nextRoom || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Chambre mise a jour");
      router.refresh();
    } catch {
      toast.error("Impossible d'enregistrer la chambre");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDropToRoom(roomId: string) {
    if (!isAdmin || !draggedPresenceId) return;
    await saveRoom(draggedPresenceId, roomId);
    setDraggedPresenceId(null);
    setDropTargetRoom(null);
  }

  async function handleDropToUnassigned() {
    if (!isAdmin || !draggedPresenceId) return;
    await saveRoom(draggedPresenceId, "");
    setDraggedPresenceId(null);
    setDropTargetRoom(null);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
        <p className="font-medium text-[#1A1110]">Organisateur villa Cannes 2026</p>
        <p className="mt-1 text-sm text-[#1A1110]/70">
          5 chambres disponibles dont 1 chambre de 4 places. Assigne les talents puis controle les surcharges par date.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-[#F5EBE0] px-3 py-1 text-[#1A1110]">{talentRows.length} talents</span>
          <span className="rounded-full bg-[#F5EBE0] px-3 py-1 text-[#1A1110]">{unassignedCount} non assignes</span>
          <span
            className={`rounded-full px-3 py-1 ${
              overbookedDaysCount > 0 ? "bg-[#F9D2D2] text-[#8B1E1E]" : "bg-[#DDF5C2] text-[#2E5B0F]"
            }`}
          >
            {overbookedDaysCount > 0
              ? `${overbookedDaysCount} jour(s) en surcharge`
              : "Aucune surcharge detectee"}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
        <p className="mb-3 font-medium text-[#1A1110]">Board drag & drop</p>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div
            onDragOver={(e) => {
              if (!isAdmin) return;
              e.preventDefault();
              setDropTargetRoom("unassigned");
            }}
            onDrop={() => void handleDropToUnassigned()}
            onDragLeave={() => setDropTargetRoom((prev) => (prev === "unassigned" ? null : prev))}
            className={`rounded-lg border p-3 ${
              dropTargetRoom === "unassigned" ? "border-[#1A1110] bg-[#F5EBE0]" : "border-[#E5E0D8] bg-white"
            }`}
          >
            <p className="text-sm font-medium text-[#1A1110]">Non assignes</p>
            <div className="mt-2 space-y-2">
              {talentRows
                .filter((p) => !getAssignedRoomId(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    draggable={isAdmin}
                    onDragStart={() => setDraggedPresenceId(p.id)}
                    onDragEnd={() => {
                      setDraggedPresenceId(null);
                      setDropTargetRoom(null);
                    }}
                    onClick={() => {
                      if (!isAdmin) return;
                      void saveRoom(p.id, "");
                    }}
                    className="w-full rounded border border-[#E5E0D8] px-2 py-1 text-left text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                  >
                    {p.talent?.prenom} {p.talent?.nom}
                  </button>
                ))}
            </div>
          </div>
          {ROOM_CONFIG.map((room) => {
            const occupants = talentRows.filter((p) => getAssignedRoomId(p.id) === room.id);
            const isOver = occupants.length > room.capacity;
            return (
              <div
                key={room.id}
                onDragOver={(e) => {
                  if (!isAdmin) return;
                  e.preventDefault();
                  setDropTargetRoom(room.id);
                }}
                onDrop={() => void handleDropToRoom(room.id)}
                onDragLeave={() => setDropTargetRoom((prev) => (prev === room.id ? null : prev))}
                className={`rounded-lg border p-3 ${
                  dropTargetRoom === room.id
                    ? "border-[#1A1110] bg-[#F5EBE0]"
                    : isOver
                      ? "border-[#E87878] bg-[#FFF4F4]"
                      : "border-[#E5E0D8] bg-white"
                }`}
              >
                <p className="text-sm font-medium text-[#1A1110]">
                  {room.label} ({occupants.length}/{room.capacity})
                </p>
                <div className="mt-2 space-y-2">
                  {occupants.map((p) => (
                    <button
                      key={p.id}
                      draggable={isAdmin}
                      onDragStart={() => setDraggedPresenceId(p.id)}
                      onDragEnd={() => {
                        setDraggedPresenceId(null);
                        setDropTargetRoom(null);
                      }}
                      className="w-full rounded border border-[#E5E0D8] px-2 py-1 text-left text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      {p.talent?.prenom} {p.talent?.nom}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
        <p className="mb-3 font-medium text-[#1A1110]">Affectation des talents</p>
        <div className="space-y-2">
          {talentRows.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-1 items-center gap-2 rounded border border-[#E5E0D8] p-3 md:grid-cols-[minmax(0,1fr)_220px_110px]"
            >
              <div>
                <p className="font-medium text-[#1A1110]">
                  {p.talent?.prenom} {p.talent?.nom}
                </p>
                <p className="text-sm text-[#1A1110]/70">
                  {formatShortDate(p.arrivalDate)} - {formatShortDate(p.departureDate)}
                </p>
              </div>
              <select
                value={getAssignedRoomId(p.id)}
                onChange={(e) => setDraftRooms((prev) => ({ ...prev, [p.id]: e.target.value }))}
                className="rounded border border-[#E5E0D8] p-2 text-sm"
                disabled={!isAdmin}
              >
                <option value="">Non assigne</option>
                {ROOM_CONFIG.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.label}
                  </option>
                ))}
              </select>
              {isAdmin ? (
                <button
                  onClick={() => void saveRoom(p.id)}
                  disabled={savingId === p.id}
                  className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-50"
                >
                  {savingId === p.id ? "..." : "Sauver"}
                </button>
              ) : (
                <div className="text-sm text-[#1A1110]/50">Lecture seule</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
        <p className="mb-3 font-medium text-[#1A1110]">Occupation par jour</p>
        <div className="space-y-3">
          {occupancyByDay.map((entry) => {
            const hasOverflow = entry.roomOccupancy.some((r) => r.occupants.length > r.capacity);
            return (
              <div
                key={entry.day.toISOString()}
                className={`rounded border p-3 ${hasOverflow ? "border-[#F2AAAA] bg-[#FFF4F4]" : "border-[#E5E0D8]"}`}
              >
                <p className="mb-2 text-sm font-medium text-[#1A1110]">
                  {entry.day.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" })}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {entry.roomOccupancy.map((room) => {
                    const overflow = room.occupants.length > room.capacity;
                    return (
                      <div
                        key={room.roomId}
                        className={`rounded border px-3 py-2 text-sm ${
                          overflow ? "border-[#E87878] bg-[#FDE4E4]" : "border-[#E5E0D8] bg-white"
                        }`}
                      >
                        <p className="font-medium text-[#1A1110]">
                          {room.label} - {room.occupants.length}/{room.capacity}
                        </p>
                        <p className="mt-1 text-[#1A1110]/70">
                          {room.occupants.length > 0
                            ? room.occupants
                                .map((p) => `${p.talent?.prenom ?? ""} ${p.talent?.nom ?? ""}`.trim())
                                .join(", ")
                            : "Aucun talent"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
