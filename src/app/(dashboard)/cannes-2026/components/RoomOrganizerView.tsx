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

function getDayKeysInRange(startDate: string, endDate: string) {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  return CANNES_2026_DAYS.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    .filter((d) => d >= start && d <= end)
    .map((d) => d.toISOString().slice(0, 10));
}

function computeSmartAssignments(
  rows: CannesPresence[],
  baseAssignments: Record<string, string>
) {
  const occupancy: Record<string, Record<string, number>> = {};
  const byPriority = [...rows].sort((a, b) => {
    const delta = toDateOnly(a.arrivalDate).getTime() - toDateOnly(b.arrivalDate).getTime();
    if (delta !== 0) return delta;
    return toDateOnly(b.departureDate).getTime() - toDateOnly(a.departureDate).getTime();
  });
  const result: Record<string, string> = {};

  const ensureDay = (dayKey: string) => {
    if (!occupancy[dayKey]) {
      occupancy[dayKey] = Object.fromEntries(ROOM_CONFIG.map((r) => [r.id, 0]));
    }
  };

  for (const presence of byPriority) {
    const dayKeys = getDayKeysInRange(presence.arrivalDate, presence.departureDate);
    const currentRoom = baseAssignments[presence.id] || presence.roomNumber || "";

    const feasibleRooms = ROOM_CONFIG.filter((room) =>
      dayKeys.every((dayKey) => {
        ensureDay(dayKey);
        return occupancy[dayKey][room.id] + 1 <= room.capacity;
      })
    );

    let chosenRoomId = "";

    if (feasibleRooms.length > 0) {
      const scored = feasibleRooms.map((room) => {
        const continuityBonus = currentRoom === room.id ? 30 : 0;
        const roomTypePenalty = room.capacity > 1 ? 4 : 0;
        const loadScore = dayKeys.reduce((acc, dayKey) => {
          ensureDay(dayKey);
          return acc + (room.capacity - occupancy[dayKey][room.id]);
        }, 0);
        return {
          roomId: room.id,
          score: continuityBonus + loadScore - roomTypePenalty,
        };
      });
      scored.sort((a, b) => b.score - a.score);
      chosenRoomId = scored[0]?.roomId || "";
    } else {
      // Fallback: minimiser la surcharge quand toutes les options sont pleines.
      const withOverflow = ROOM_CONFIG.map((room) => {
        const overflowCost = dayKeys.reduce((acc, dayKey) => {
          ensureDay(dayKey);
          const next = occupancy[dayKey][room.id] + 1;
          return acc + Math.max(0, next - room.capacity);
        }, 0);
        return { roomId: room.id, overflowCost };
      }).sort((a, b) => a.overflowCost - b.overflowCost);
      chosenRoomId = withOverflow[0]?.roomId || "";
    }

    result[presence.id] = chosenRoomId;
    if (chosenRoomId) {
      for (const dayKey of dayKeys) {
        ensureDay(dayKey);
        occupancy[dayKey][chosenRoomId] += 1;
      }
    }
  }

  return result;
}

export default function RoomOrganizerView({ presences, isAdmin }: Props) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
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

  function applySmartSuggestion() {
    const suggested = computeSmartAssignments(talentRows, draftRooms);
    setDraftRooms((prev) => ({ ...prev, ...suggested }));
    toast.success("Suggestion intelligente appliquee");
  }

  async function saveAllAssignments() {
    if (!isAdmin) return;
    const changed = talentRows.filter((p) => {
      const nextRoom = draftRooms[p.id] || "";
      const currentRoom = p.roomNumber || "";
      return nextRoom !== currentRoom;
    });
    if (changed.length === 0) {
      toast.message("Aucun changement a enregistrer");
      return;
    }

    setSavingAll(true);
    try {
      await Promise.all(
        changed.map(async (p) => {
          const res = await fetch(`/api/cannes/presences/${p.id}`, {
            method: "PATCH",
            body: JSON.stringify({ roomNumber: draftRooms[p.id] || null }),
          });
          if (!res.ok) throw new Error(`Echec sur ${p.id}`);
        })
      );
      toast.success(`${changed.length} affectation(s) enregistree(s)`);
      router.refresh();
    } catch {
      toast.error("Erreur pendant l'enregistrement en masse");
    } finally {
      setSavingAll(false);
    }
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
        {isAdmin && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={applySmartSuggestion}
              className="rounded border border-[#1A1110] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]"
            >
              Suggestion intelligente (2 semaines)
            </button>
            <button
              onClick={() => void saveAllAssignments()}
              disabled={savingAll}
              className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-50"
            >
              {savingAll ? "Enregistrement..." : "Enregistrer toutes les affectations"}
            </button>
          </div>
        )}
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
