"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CANNES_2026_DAYS,
  formatParisDate,
  occupiesHotelNightUtcDay,
  parisDayKey,
} from "@/lib/cannes/dates";
import type { CannesPresence } from "../types";

type Props = {
  presences: CannesPresence[];
  isAdmin: boolean;
};

const ROOM_CONFIG = [
  { id: "chambre-1", label: "Chambre 1 (x2)", capacity: 2 },
  { id: "chambre-2", label: "Chambre 2 (x2)", capacity: 2 },
  { id: "chambre-3", label: "Chambre 3 (x2)", capacity: 2 },
  { id: "chambre-4", label: "Chambre 4 (x2)", capacity: 2 },
  { id: "chambre-5", label: "Chambre 5 (x4)", capacity: 4 },
] as const;
const DAILY_OVERRIDES_STORAGE_KEY = "cannes-2026:rooms:daily-overrides:v1";
const DAILY_OVERRIDES_SERVER_KEY = "room-daily-overrides";

function formatShortDate(dateStr: string) {
  return formatParisDate(dateStr, { day: "2-digit", month: "2-digit" });
}

function isRecordOfRoomOverrides(value: unknown): value is Record<string, Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((dayMap) => {
    if (!dayMap || typeof dayMap !== "object" || Array.isArray(dayMap)) return false;
    return Object.values(dayMap).every((roomId) => typeof roomId === "string");
  });
}

function mergeDailyOverrides(
  base: Record<string, Record<string, string>>,
  local: Record<string, Record<string, string>>
) {
  const merged: Record<string, Record<string, string>> = { ...base };
  for (const [dayKey, dayMap] of Object.entries(local)) {
    merged[dayKey] = { ...(merged[dayKey] || {}), ...dayMap };
  }
  return merged;
}

/**
 * Jours du festival où le talent occupe une nuit d’hôtel (jour d’arrivée inclus,
 * jour de départ exclu — aligné PDF / organisateur).
 */
function getHotelNightDayKeys(arrivalDate: string, departureDate: string): string[] {
  return CANNES_2026_DAYS.filter((d) => occupiesHotelNightUtcDay(d, arrivalDate, departureDate)).map(
    (d) => parisDayKey(d)
  );
}

function getFestivalDayByKey(dayKey: string): Date | undefined {
  return CANNES_2026_DAYS.find((d) => parisDayKey(d) === dayKey);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function presenceLabel(p: CannesPresence) {
  return `${p.talent?.prenom ?? ""} ${p.talent?.nom ?? ""}`.trim() || p.id;
}

function computeSmartAssignments(
  rows: CannesPresence[],
  baseAssignments: Record<string, string>
) {
  const occupancy: Record<string, Record<string, number>> = {};
  const byPriority = [...rows].sort((a, b) => {
    const aArr = parisDayKey(a.arrivalDate);
    const bArr = parisDayKey(b.arrivalDate);
    if (aArr !== bArr) return aArr < bArr ? -1 : 1;
    const aDep = parisDayKey(a.departureDate);
    const bDep = parisDayKey(b.departureDate);
    if (aDep !== bDep) return aDep > bDep ? -1 : 1;
    return 0;
  });
  const result: Record<string, string> = {};

  const ensureDay = (dayKey: string) => {
    if (!occupancy[dayKey]) {
      occupancy[dayKey] = Object.fromEntries(ROOM_CONFIG.map((r) => [r.id, 0]));
    }
  };

  for (const presence of byPriority) {
    const dayKeys = getHotelNightDayKeys(presence.arrivalDate, presence.departureDate);
    if (dayKeys.length === 0) {
      result[presence.id] = "";
      continue;
    }
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
  const [dailyRoomOverrides, setDailyRoomOverrides] = useState<Record<string, Record<string, string>>>({});
  const [dailyOverridesHydrated, setDailyOverridesHydrated] = useState(false);
  const [dailyDrag, setDailyDrag] = useState<{ presenceId: string; dayKey: string } | null>(null);
  const [dailyDropTarget, setDailyDropTarget] = useState<string | null>(null);

  const talentRows = useMemo(() => presences.filter((p) => p.talent), [presences]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let localState: Record<string, Record<string, string>> = {};
      try {
        const raw = window.localStorage.getItem(DAILY_OVERRIDES_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isRecordOfRoomOverrides(parsed)) localState = parsed;
        }
      } catch {
        // ignore localStorage parsing errors
      }
      if (!cancelled) setDailyRoomOverrides(localState);

      let remoteState: Record<string, Record<string, string>> = {};
      try {
        const res = await fetch(`/api/cannes/shared-settings/${DAILY_OVERRIDES_SERVER_KEY}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as { value?: unknown };
          if (isRecordOfRoomOverrides(json.value)) remoteState = json.value;
        }
      } catch {
        // ignore remote load errors
      }

      const merged = mergeDailyOverrides(remoteState, localState);
      if (!cancelled) setDailyRoomOverrides(merged);

      const shouldBackfillRemote =
        Object.keys(merged).length > 0 &&
        JSON.stringify(merged) !== JSON.stringify(remoteState);
      if (shouldBackfillRemote) {
        try {
          await fetch(`/api/cannes/shared-settings/${DAILY_OVERRIDES_SERVER_KEY}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: merged }),
          });
        } catch {
          // local state remains fallback if server sync fails
        }
      }

      if (!cancelled) setDailyOverridesHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DAILY_OVERRIDES_STORAGE_KEY, JSON.stringify(dailyRoomOverrides));
    } catch {
      // ignore localStorage quota errors
    }
  }, [dailyRoomOverrides]);

  useEffect(() => {
    if (!dailyOverridesHydrated) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/cannes/shared-settings/${DAILY_OVERRIDES_SERVER_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: dailyRoomOverrides }),
      }).catch(() => {
        // keep local state available if remote save fails
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dailyOverridesHydrated, dailyRoomOverrides]);

  const occupancyByDay = useMemo(() => {
    return CANNES_2026_DAYS.map((day) => {
      const dayKey = parisDayKey(day);
      const roomOccupancy = ROOM_CONFIG.map((room) => {
        const occupants = talentRows.filter((p) => {
          const assignedRoom = getEffectiveRoomForDay(p.id, dayKey);
          if (assignedRoom !== room.id) return false;
          return occupiesHotelNightUtcDay(day, p.arrivalDate, p.departureDate);
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
        dayKey,
        roomOccupancy,
      };
    });
  }, [dailyRoomOverrides, draftRooms, talentRows, presences]);

  const overbookedDaysCount = useMemo(() => {
    return occupancyByDay.filter((entry) =>
      entry.roomOccupancy.some((room) => room.occupants.length > room.capacity)
    ).length;
  }, [occupancyByDay]);

  const roomOccupancyByDayKey = useMemo(() => {
    return new Map(
      occupancyByDay.map((entry) => [
        entry.dayKey,
        new Map(entry.roomOccupancy.map((room) => [room.roomId, room.occupants])),
      ])
    );
  }, [occupancyByDay]);

  const unassignedCount = useMemo(() => {
    return talentRows.filter((p) => !(draftRooms[p.id] || p.roomNumber)).length;
  }, [draftRooms, talentRows]);

  function getAssignedRoomId(presenceId: string) {
    return draftRooms[presenceId] || presences.find((p) => p.id === presenceId)?.roomNumber || "";
  }

  function getEffectiveRoomForDay(presenceId: string, dayKey: string) {
    const dayOverride = dailyRoomOverrides[dayKey]?.[presenceId];
    if (dayOverride !== undefined) return dayOverride;
    return getAssignedRoomId(presenceId);
  }

  function moveRoomForSingleDay(presenceId: string, dayKey: string, roomId: string) {
    const presence = presences.find((p) => p.id === presenceId);
    const festivalDay = getFestivalDayByKey(dayKey);
    if (!presence || !festivalDay) return;
    if (!occupiesHotelNightUtcDay(festivalDay, presence.arrivalDate, presence.departureDate)) {
      toast.error(
        "Ce talent ne passe pas la nuit à ce jour-là (check-out ou hors séjour). Affectation impossible."
      );
      return;
    }
    setDailyRoomOverrides((prev) => ({
      ...prev,
      [dayKey]: {
        ...(prev[dayKey] || {}),
        [presenceId]: roomId,
      },
    }));
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

  function exportRoomsReportCsv() {
    const rows: string[] = [];
    rows.push(
      [
        "date",
        "chambre",
        "capacite",
        "occupation",
        "composition",
        "arrivees",
        "departs",
        "retours",
        "restent",
        "menage_statut",
        "menage_detail",
      ]
        .map(csvEscape)
        .join(",")
    );

    const seenByRoom = new Map<string, Set<string>>();

    occupancyByDay.forEach((entry, index) => {
      const prevEntry = index > 0 ? occupancyByDay[index - 1] : null;

      entry.roomOccupancy.forEach((room) => {
        const roomSeen = seenByRoom.get(room.roomId) || new Set<string>();
        seenByRoom.set(room.roomId, roomSeen);

        const prevOccupants = prevEntry
          ? roomOccupancyByDayKey.get(prevEntry.dayKey)?.get(room.roomId) || []
          : [];
        const prevIds = new Set(prevOccupants.map((p) => p.id));
        const currIds = new Set(room.occupants.map((p) => p.id));

        const arrivals = room.occupants.filter((p) => !prevIds.has(p.id));
        const departures = prevOccupants.filter((p) => !currIds.has(p.id));
        const stays = room.occupants.filter((p) => prevIds.has(p.id));
        const returns = arrivals.filter((p) => roomSeen.has(p.id));

        room.occupants.forEach((p) => roomSeen.add(p.id));

        const prevWasFull =
          prevEntry != null &&
          prevOccupants.length >= ROOM_CONFIG.find((r) => r.id === room.roomId)!.capacity;
        const hasTurnover = arrivals.length > 0 || departures.length > 0;
        const fullCleaning = prevWasFull && stays.length === 0 && hasTurnover;
        const partialCleaning = departures.length > 0 && stays.length > 0;

        const cleaningStatus = fullCleaning
          ? "MENAGE_COMPLET"
          : partialCleaning
            ? "PAS_MENAGE_COMPLET"
            : "STABLE";
        const cleaningDetail = fullCleaning
          ? "Chambre pleine veille + changement 100% occupants"
          : partialCleaning
            ? "Changement partiel (au moins 1 occupant reste)"
            : "Aucun changement necessitant menage complet";

        rows.push(
          [
            formatParisDate(entry.day, { weekday: "long", day: "2-digit", month: "2-digit" }),
            room.label,
            String(room.capacity),
            `${room.occupants.length}/${room.capacity}`,
            room.occupants.map(presenceLabel).join(" | "),
            arrivals.map(presenceLabel).join(" | "),
            departures.map(presenceLabel).join(" | "),
            returns.map(presenceLabel).join(" | "),
            stays.map(presenceLabel).join(" | "),
            cleaningStatus,
            cleaningDetail,
          ]
            .map(csvEscape)
            .join(",")
        );
      });
    });

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cannes-2026-chambres-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Export chambres genere");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
        <p className="font-medium text-[#1A1110]">Organisateur villa Cannes 2026</p>
        <p className="mt-1 text-sm text-[#1A1110]/70">
          5 chambres disponibles (4 chambres de 2 places + 1 chambre de 4 places). Assigne les talents puis controle les surcharges par date.
          <span className="mt-1 block text-[#1A1110]/80">
            Règle hôtel (comme le PDF) : la <strong>nuit</strong> du jour J compte si le talent est là ce soir — jour
            d&apos;arrivée inclus, <strong>jour de départ exclu</strong> (check-out). On ne peut pas placer quelqu&apos;un
            en chambre un jour où il ne dort pas sur place.
          </span>
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
            <button
              onClick={exportRoomsReportCsv}
              className="rounded border border-[#1A1110] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]"
            >
              Export chambres (arrivees/departs/retours/menage)
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
        {isAdmin && (
          <p className="mb-3 text-xs text-[#1A1110]/60">
            Drag & drop actif par jour : déplace un talent d&apos;une chambre à l&apos;autre sans changer son
            affectation globale. Bloqué les jours de check-out (pas de nuit ce soir-là).
          </p>
        )}
        <div className="space-y-3">
          {occupancyByDay.map((entry) => {
            const hasOverflow = entry.roomOccupancy.some((r) => r.occupants.length > r.capacity);
            return (
              <div
                key={entry.day.toISOString()}
                className={`rounded border p-3 ${hasOverflow ? "border-[#F2AAAA] bg-[#FFF4F4]" : "border-[#E5E0D8]"}`}
              >
                <p className="mb-2 text-sm font-medium text-[#1A1110]">
                  {formatParisDate(entry.day, { weekday: "long", day: "2-digit", month: "2-digit" })}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {entry.roomOccupancy.map((room) => {
                    const overflow = room.occupants.length > room.capacity;
                    return (
                      <div
                        key={room.roomId}
                        onDragOver={(e) => {
                          if (!isAdmin) return;
                          e.preventDefault();
                          setDailyDropTarget(`${entry.dayKey}:${room.roomId}`);
                        }}
                        onDrop={() => {
                          if (!isAdmin || !dailyDrag || dailyDrag.dayKey !== entry.dayKey) return;
                          moveRoomForSingleDay(dailyDrag.presenceId, entry.dayKey, room.roomId);
                          setDailyDrag(null);
                          setDailyDropTarget(null);
                          toast.success("Affectation jour mise a jour");
                        }}
                        onDragLeave={() =>
                          setDailyDropTarget((prev) =>
                            prev === `${entry.dayKey}:${room.roomId}` ? null : prev
                          )
                        }
                        className={`rounded border px-3 py-2 text-sm ${
                          dailyDropTarget === `${entry.dayKey}:${room.roomId}`
                            ? "border-[#1A1110] bg-[#F5EBE0]"
                            : overflow
                              ? "border-[#E87878] bg-[#FDE4E4]"
                              : "border-[#E5E0D8] bg-white"
                        }`}
                      >
                        <p className="font-medium text-[#1A1110]">
                          {room.label} - {room.occupants.length}/{room.capacity}
                        </p>
                        <div className="mt-1 space-y-1">
                          {room.occupants.length > 0 ? (
                            room.occupants.map((p) => (
                              <button
                                key={`${entry.dayKey}:${room.roomId}:${p.id}`}
                                draggable={isAdmin}
                                onDragStart={() => setDailyDrag({ presenceId: p.id, dayKey: entry.dayKey })}
                                onDragEnd={() => {
                                  setDailyDrag(null);
                                  setDailyDropTarget(null);
                                }}
                                className="block w-full rounded border border-[#E5E0D8] bg-white px-2 py-1 text-left text-xs text-[#1A1110]/80 hover:bg-[#F5EBE0]"
                              >
                                {`${p.talent?.prenom ?? ""} ${p.talent?.nom ?? ""}`.trim()}
                              </button>
                            ))
                          ) : (
                            <p className="text-[#1A1110]/70">Aucun talent</p>
                          )}
                        </div>
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
