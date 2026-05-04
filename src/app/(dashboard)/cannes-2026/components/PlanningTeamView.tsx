"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CANNES_2026_DAYS, CANNES_2026_END, CANNES_2026_START, isUtcDayInIsoRange } from "@/lib/cannes/dates";
import { eachUtcDayFromMonday, getCannesFestivalMondayWeeks } from "@/lib/cannes/festivalWeeks";
import Modal from "./Modal";
import PresenceForm from "./forms/PresenceForm";
import TeamUnavailabilitiesEditor from "./TeamUnavailabilitiesEditor";
import PlanningPdfExportModal from "./PlanningPdfExportModal";
import type { CannesPresence, CannesTeamUnavailability } from "../types";

type Props = { presences: CannesPresence[]; talentPresences: CannesPresence[]; isAdmin: boolean };

/** Données drag natif (tableau par ligne). */
const MIME = "application/x-cannes-presence-id";
const OFFICIAL_WEEK_STORAGE_KEY = "cannes2026:team:officialHiddenByDay:v1";

const DOCK_ID = "dock" as const;

function utcDayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isoDayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function cellState(p: CannesPresence, day: Date) {
  const onPresenceWindow =
    new Date(p.arrivalDate) <= day && new Date(p.departureDate) >= day;
  const absenceDay = (p.teamUnavailabilities ?? []).some((u) =>
    isUtcDayInIsoRange(day, u.startDate, u.endDate)
  );
  const disponible = onPresenceWindow && !absenceDay;
  return { onPresenceWindow, absenceDay, disponible };
}

/** Barres : rose = disponible ; noir = indisponible (hors fenêtre ou absence), comme avant. */
function cellSurfaceClass(st: ReturnType<typeof cellState>) {
  if (st.disponible) return "bg-[#C08B8B]";
  return "bg-[#1A1110]";
}

function coveringUnavailability(
  p: CannesPresence,
  day: Date
): { kind: "single"; row: CannesTeamUnavailability } | { kind: "range"; row: CannesTeamUnavailability } | null {
  const list = p.teamUnavailabilities ?? [];
  const hit = list.find((u) => isUtcDayInIsoRange(day, u.startDate, u.endDate));
  if (!hit) return null;
  const k = utcDayKey(day);
  const s = isoDayKey(hit.startDate);
  const e = isoDayKey(hit.endDate);
  if (s === e && s === k) return { kind: "single", row: hit };
  return { kind: "range", row: hit };
}

function poolId(presenceId: string) {
  return `pool~${presenceId}` as UniqueIdentifier;
}

function chipId(presenceId: string, dayKey: string) {
  return `chip~${presenceId}~${dayKey}` as UniqueIdentifier;
}

function dayId(dayKey: string) {
  return `day~${dayKey}` as UniqueIdentifier;
}

function parsePoolId(id: string): string | null {
  if (!id.startsWith("pool~")) return null;
  return id.slice(5) || null;
}

function parseChipId(id: string): { presenceId: string; dayKey: string } | null {
  if (!id.startsWith("chip~")) return null;
  const rest = id.slice(5);
  const i = rest.indexOf("~");
  if (i <= 0) return null;
  return { presenceId: rest.slice(0, i), dayKey: rest.slice(i + 1) };
}

function parseDayId(id: string): string | null {
  if (!id.startsWith("day~")) return null;
  return id.slice(4) || null;
}

function dayFromKey(dayKey: string): Date | undefined {
  return CANNES_2026_DAYS.find((d) => utcDayKey(d) === dayKey);
}

function weekRangeLabel(start: Date, end: Date): string {
  const s = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const e = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${s} -> ${e}`;
}

function personLabel(p: CannesPresence) {
  return `${p.user?.prenom ?? ""} ${p.user?.nom ?? ""}`.trim() || "Sans nom";
}

function personInitials(p: CannesPresence) {
  return `${p.user?.prenom?.[0] ?? ""}${p.user?.nom?.[0] ?? ""}`.toUpperCase() || "?";
}

function PoolCard({
  presence,
  disabled,
  onOpen,
}: {
  presence: CannesPresence;
  disabled: boolean;
  onOpen: () => void;
}) {
  const id = poolId(presence.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  const style = transform ? { transform: CSS.Transform.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} className={`${isDragging ? "opacity-40" : "opacity-100"}`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2 rounded-lg border border-[#E5E0D8] bg-white p-2 text-left shadow-sm transition hover:border-[#C08B8B]/60 hover:bg-[#F5EBE0]/50"
      >
        <span
          {...(disabled ? {} : listeners)}
          {...(disabled ? {} : attributes)}
          className={`flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full border-2 text-xs font-bold ${
            disabled
              ? "cursor-default border-[#E5E0D8] bg-[#F5EBE0]/50 text-[#1A1110]/50"
              : "touch-none cursor-grab border-[#C08B8B] bg-[#C08B8B]/25 text-[#1A1110] active:cursor-grabbing"
          }`}
          title={disabled ? undefined : "Glisser vers un jour"}
        >
          {personInitials(presence)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[#1A1110]">{personLabel(presence)}</span>
          <span className="block truncate text-[10px] text-[#1A1110]/55">
            {new Date(presence.arrivalDate).toLocaleDateString("fr-FR")} –{" "}
            {new Date(presence.departureDate).toLocaleDateString("fr-FR")}
          </span>
        </span>
      </button>
    </div>
  );
}

function DayColumn({
  dayKey,
  day,
  isAdmin,
  busyKey,
  children,
}: {
  dayKey: string;
  day: Date;
  isAdmin: boolean;
  busyKey: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId(dayKey), disabled: !isAdmin });
  const busy = busyKey === `col:${dayKey}`;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[220px] w-[100px] shrink-0 flex-col rounded-lg border-2 border-dashed p-1.5 transition-colors sm:w-[110px] ${
        isOver && isAdmin
          ? "border-[#C08B8B] bg-[#C08B8B]/15"
          : "border-[#E5E0D8] bg-[#F5EBE0]/30"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="mb-2 border-b border-[#E5E0D8]/80 pb-1.5 text-center">
        <div className="text-[10px] font-medium uppercase tracking-wide text-[#1A1110]/60">
          {day.toLocaleDateString("fr-FR", { weekday: "short" })}
        </div>
        <div className="text-xs font-semibold text-[#1A1110]">
          {day.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">{children}</div>
    </div>
  );
}

function ColumnChip({
  presence,
  dayKey,
  kind,
  disabled,
  onOpen,
}: {
  presence: CannesPresence;
  dayKey: string;
  kind: "single" | "range";
  disabled: boolean;
  onOpen: () => void;
}) {
  const id = chipId(presence.id, dayKey);
  const draggable = kind === "single" && !disabled;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: !draggable,
  });
  const style = transform ? { transform: CSS.Transform.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : undefined}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${
          kind === "single"
            ? "border-[#1A1110]/30 bg-[#1A1110] text-[#F5EBE0]"
            : "border-[#1A1110]/20 bg-[#1A1110]/85 text-[#F5EBE0]/90"
        }`}
      >
        <span
          {...(draggable ? listeners : {})}
          {...(draggable ? attributes : {})}
          className={`shrink-0 rounded px-0.5 text-[10px] font-bold ${
            draggable ? "touch-none cursor-grab active:cursor-grabbing" : "cursor-default opacity-90"
          }`}
          title={
            draggable
              ? "Vers la piscine = retirer ce jour · vers autre jour = déplacer"
              : "Créneau multi-jours — modifier dans la fiche"
          }
        >
          {personInitials(presence)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{presence.user?.prenom ?? "·"}</span>
        {kind === "range" ? <span className="shrink-0 text-[9px] opacity-80">↔</span> : null}
      </button>
    </div>
  );
}

function DockColumn({
  isAdmin,
  busyKey,
  children,
}: {
  isAdmin: boolean;
  busyKey: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DOCK_ID, disabled: !isAdmin });
  const busy = busyKey === "dock";

  return (
    <div
      ref={setNodeRef}
      className={`sticky left-0 z-10 flex w-[168px] shrink-0 flex-col rounded-lg border-2 border-dashed p-2 transition-colors sm:w-[188px] ${
        isOver && isAdmin ? "border-[#C08B8B] bg-[#C08B8B]/12" : "border-[#E5E0D8] bg-[#F5EBE0]/40"
      } ${busy ? "opacity-60" : ""}`}
    >
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#1A1110]/70">
        Piscine équipe
      </p>
      <p className="mb-2 text-center text-[10px] leading-snug text-[#1A1110]/55">
        {isAdmin ? "Dépose ici une carte jour pour la retirer" : "Lecture seule"}
      </p>
      <div className="flex max-h-[min(52vh,420px)] flex-col gap-2 overflow-y-auto pr-0.5">{children}</div>
    </div>
  );
}

function OverlayCard({ presence }: { presence: CannesPresence }) {
  return (
    <div className="flex w-[180px] cursor-grabbing items-center gap-2 rounded-lg border-2 border-[#C08B8B] bg-white p-2 shadow-lg">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#C08B8B] bg-[#C08B8B]/25 text-xs font-bold text-[#1A1110]">
        {personInitials(presence)}
      </span>
      <span className="truncate text-sm font-medium text-[#1A1110]">{personLabel(presence)}</span>
    </div>
  );
}

function TeamKanbanBoard({
  rows,
  isAdmin,
  busyKey,
  presenceById,
  addSingleDay,
  removeSingleDayIfExact,
  router,
  runWithBusyKanban,
  onOpenPresence,
  sensors,
  overlay,
  setOverlay,
}: {
  rows: CannesPresence[];
  isAdmin: boolean;
  busyKey: string | null;
  presenceById: Map<string, CannesPresence>;
  addSingleDay: (presence: CannesPresence, day: Date) => Promise<boolean>;
  removeSingleDayIfExact: (presence: CannesPresence, day: Date) => Promise<boolean>;
  router: ReturnType<typeof useRouter>;
  runWithBusyKanban: (key: string, fn: () => Promise<void>) => Promise<void>;
  onOpenPresence: (id: string) => void;
  sensors: ReturnType<typeof useSensors>;
  overlay: null | { mode: "pool" | "chip"; presence: CannesPresence; dayKey?: string };
  setOverlay: React.Dispatch<
    React.SetStateAction<
      null | { mode: "pool"; presence: CannesPresence } | { mode: "chip"; presence: CannesPresence; dayKey: string }
    >
  >;
}) {
  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      const pid = parsePoolId(id);
      if (pid) {
        const p = presenceById.get(pid);
        if (p) setOverlay({ mode: "pool", presence: p });
        return;
      }
      const chip = parseChipId(id);
      if (chip) {
        const p = presenceById.get(chip.presenceId);
        if (p) setOverlay({ mode: "chip", presence: p, dayKey: chip.dayKey });
      }
    },
    [presenceById, setOverlay]
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setOverlay(null);
      const { active, over } = e;
      if (!over || !isAdmin) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const overDayKey = parseDayId(overId);
      const overDock = overId === DOCK_ID;
      const pidPool = parsePoolId(activeId);
      const chip = parseChipId(activeId);

      void runWithBusyKanban(overDayKey ? `col:${overDayKey}` : "dock", async () => {
        if (pidPool) {
          const presence = presenceById.get(pidPool);
          if (!presence) return;
          if (overDock) return;
          if (overDayKey) {
            const day = dayFromKey(overDayKey);
            if (!day) return;
            const ok = await addSingleDay(presence, day);
            if (ok) router.refresh();
          }
          return;
        }

        if (chip) {
          const presence = presenceById.get(chip.presenceId);
          if (!presence) return;
          const fromDay = dayFromKey(chip.dayKey);
          if (!fromDay) return;

          if (overDock) {
            const changed = await removeSingleDayIfExact(presence, fromDay);
            if (changed) router.refresh();
            return;
          }

          if (overDayKey) {
            if (overDayKey === chip.dayKey) return;
            const toDay = dayFromKey(overDayKey);
            if (!toDay) return;

            const toState = cellState(presence, toDay);
            if (!toState.onPresenceWindow) {
              toast.error("Impossible — pas sur place ce jour-là");
              return;
            }
            if (!toState.disponible) {
              toast.error("Impossible — déjà indisponible sur ce jour");
              return;
            }

            const removed = await removeSingleDayIfExact(presence, fromDay);
            if (!removed) return;
            const ok = await addSingleDay(presence, toDay);
            if (ok) router.refresh();
            else router.refresh();
          }
        }
      });
    },
    [addSingleDay, isAdmin, presenceById, removeSingleDayIfExact, router, runWithBusyKanban, setOverlay]
  );

  const board = (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <DockColumn isAdmin={isAdmin} busyKey={busyKey}>
        {rows.map((p) => (
          <PoolCard
            key={p.id}
            presence={p}
            disabled={!isAdmin}
            onOpen={() => onOpenPresence(p.id)}
          />
        ))}
      </DockColumn>

      {CANNES_2026_DAYS.map((d) => {
        const dayKey = utcDayKey(d);
        const entries = rows
          .map((p) => {
            const st = cellState(p, d);
            if (!st.onPresenceWindow || !st.absenceDay) return null;
            const cov = coveringUnavailability(p, d);
            if (!cov) return null;
            return { presence: p, kind: cov.kind as "single" | "range" };
          })
          .filter(Boolean) as { presence: CannesPresence; kind: "single" | "range" }[];

        return (
          <DayColumn key={dayKey} dayKey={dayKey} day={d} isAdmin={isAdmin} busyKey={busyKey}>
            {entries.length === 0 ? (
              <p className="py-4 text-center text-[10px] text-[#1A1110]/40">—</p>
            ) : (
              entries.map(({ presence, kind }) => (
                <ColumnChip
                  key={`${presence.id}-${dayKey}`}
                  presence={presence}
                  dayKey={dayKey}
                  kind={kind}
                  disabled={!isAdmin}
                  onOpen={() => onOpenPresence(presence.id)}
                />
              ))
            )}
          </DayColumn>
        );
      })}
    </div>
  );

  return isAdmin ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {board}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.25,1,0.5,1)" }}>
        {overlay ? <OverlayCard presence={overlay.presence} /> : null}
      </DragOverlay>
    </DndContext>
  ) : (
    board
  );
}

export default function PlanningTeamView({ presences, talentPresences, isAdmin }: Props) {
  const router = useRouter();
  const [creatingPresence, setCreatingPresence] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const festivalWeeks = useMemo(() => getCannesFestivalMondayWeeks(), []);
  const [officialWeekIndex, setOfficialWeekIndex] = useState(0);
  const [officialHiddenByDay, setOfficialHiddenByDay] = useState<Record<string, true>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OFFICIAL_WEEK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, true>;
      if (!parsed || typeof parsed !== "object") return;
      setOfficialHiddenByDay(parsed);
    } catch {
      // ignore parsing/localStorage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        OFFICIAL_WEEK_STORAGE_KEY,
        JSON.stringify(officialHiddenByDay)
      );
    } catch {
      // ignore quota/localStorage errors
    }
  }, [officialHiddenByDay]);

  /** Tableau principal (HTML5) */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverDrop, setHoverDrop] = useState<{ presenceId: string; dayKey: string } | null>(null);
  const [tableBusyKey, setTableBusyKey] = useState<string | null>(null);

  /** Kanban (@dnd-kit) */
  const [kanbanBusyKey, setKanbanBusyKey] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<
    | null
    | { mode: "pool"; presence: CannesPresence }
    | { mode: "chip"; presence: CannesPresence; dayKey: string }
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  const rows = useMemo(() => presences.filter((p) => p.user), [presences]);
  const selectedPresence = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  const presenceById = useMemo(() => {
    const m = new Map<string, CannesPresence>();
    for (const p of rows) m.set(p.id, p);
    return m;
  }, [rows]);

  const officialWeekDays = useMemo(() => {
    const weekStart = festivalWeeks[officialWeekIndex] ?? festivalWeeks[0];
    return weekStart ? eachUtcDayFromMonday(weekStart) : [];
  }, [festivalWeeks, officialWeekIndex]);

  const toggleOfficialPerson = useCallback((presenceId: string, dayKey: string) => {
    const key = `${presenceId}:${dayKey}`;
    setOfficialHiddenByDay((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  const resetOfficialWeek = useCallback(() => {
    const daySet = new Set(officialWeekDays.map((d) => utcDayKey(d)));
    setOfficialHiddenByDay((prev) => {
      const next: Record<string, true> = {};
      for (const k of Object.keys(prev)) {
        const dayKey = k.split(":")[1] ?? "";
        if (!daySet.has(dayKey)) next[k] = true;
      }
      return next;
    });
  }, [officialWeekDays]);

  const officialWeekRecap = useMemo(() => {
    const perDay = officialWeekDays.map((day) => {
      const dayKey = utcDayKey(day);
      const talentsPresents = talentPresences.filter((p) => {
        const st = cellState(p, day);
        return st.onPresenceWindow;
      }).length;
      const hausLabsBoost = dayKey === "2026-05-17" ? 1 : 0;
      const targetTeam = Math.ceil(talentsPresents / 4) + hausLabsBoost;
      const availableCount = rows.filter((p) => {
        const st = cellState(p, day);
        return st.disponible && !officialHiddenByDay[`${p.id}:${dayKey}`];
      }).length;
      return {
        day,
        dayKey,
        targetTeam,
        availableCount,
        missing: Math.max(0, targetTeam - availableCount),
      };
    });

    const underStaffed = perDay.filter((d) => d.missing > 0);
    return {
      totalDays: perDay.length,
      underStaffedCount: underStaffed.length,
      totalMissing: underStaffed.reduce((acc, d) => acc + d.missing, 0),
      worst: underStaffed.sort((a, b) => b.missing - a.missing)[0] ?? null,
    };
  }, [officialWeekDays, officialHiddenByDay, rows, talentPresences]);

  const presenceDaysLegend = useMemo(() => {
    return rows
      .map((p) => {
        const days = CANNES_2026_DAYS.filter((d) => cellState(p, d).onPresenceWindow).length;
        return { id: p.id, label: personLabel(p), days };
      })
      .sort((a, b) => b.days - a.days || a.label.localeCompare(b.label, "fr"));
  }, [rows]);

  const addSingleDay = useCallback(async (presence: CannesPresence, day: Date) => {
    const dayKey = utcDayKey(day);
    const { onPresenceWindow, disponible } = cellState(presence, day);
    if (!onPresenceWindow) {
      toast.error("Impossible — pas sur place ce jour-là", {
        description: "Indispo uniquement dans la fenêtre arrivée / départ.",
      });
      return false;
    }
    if (!disponible) {
      toast.message("Déjà indisponible ce jour-là");
      return false;
    }
    const res = await fetch(`/api/cannes/presences/${presence.id}/team-unavailabilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: dayKey, endDate: dayKey, label: null }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || "Erreur");
    }
    toast.success("Journée marquée indisponible");
    return true;
  }, []);

  const removeSingleDayIfExact = useCallback(async (presence: CannesPresence, day: Date) => {
    const dayKey = utcDayKey(day);
    const list = presence.teamUnavailabilities ?? [];
    const exact = list.find((u) => isoDayKey(u.startDate) === dayKey && isoDayKey(u.endDate) === dayKey);
    if (exact) {
      const res = await fetch(`/api/cannes/team-unavailabilities/${exact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Indispo retirée");
      return true;
    }
    const spanning = list.find((u) => isUtcDayInIsoRange(day, u.startDate, u.endDate));
    if (spanning) {
      toast.error("Impossible", {
        description: "Créneau multi-jours : ouvre la fiche pour l’ajuster.",
      });
      return false;
    }
    return false;
  }, []);

  const runWithBusyKanban = useCallback(async (key: string, fn: () => Promise<void>) => {
    setKanbanBusyKey(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setKanbanBusyKey(null);
    }
  }, []);

  const applyDropTable = useCallback(
    async (presence: CannesPresence, day: Date) => {
      const dayKey = utcDayKey(day);
      const lock = `${presence.id}:${dayKey}`;
      setTableBusyKey(lock);
      try {
        const { onPresenceWindow, absenceDay, disponible } = cellState(presence, day);

        if (!onPresenceWindow) {
          toast.error("Impossible — pas sur place ce jour-là", {
            description: "Tu ne peux marquer une indispo que dans la fenêtre d’arrivée / départ.",
          });
          return;
        }

        if (disponible) {
          const res = await fetch(`/api/cannes/presences/${presence.id}/team-unavailabilities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ startDate: dayKey, endDate: dayKey, label: null }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error((j as { error?: string }).error || "Erreur");
          }
          toast.success("Journée marquée indisponible");
          router.refresh();
          return;
        }

        if (absenceDay) {
          const list = presence.teamUnavailabilities ?? [];
          const exact = list.find((u) => isoDayKey(u.startDate) === dayKey && isoDayKey(u.endDate) === dayKey);
          if (exact) {
            const res = await fetch(`/api/cannes/team-unavailabilities/${exact.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            toast.success("Indispo retirée pour ce jour");
            router.refresh();
            return;
          }
          const spanning = list.find((u) => isUtcDayInIsoRange(day, u.startDate, u.endDate));
          if (spanning) {
            toast.error("Impossible ici", {
              description:
                "Ce jour fait partie d’un créneau multi-jours. Ouvre la fiche pour l’ajuster ou le retirer.",
            });
            return;
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        setTableBusyKey(null);
      }
    },
    [router]
  );

  const onDragStartNative = useCallback(
    (e: React.DragEvent, presenceId: string) => {
      if (!isAdmin) return;
      e.dataTransfer.setData(MIME, presenceId);
      e.dataTransfer.setData("text/plain", presenceId);
      e.dataTransfer.effectAllowed = "copyMove";
      setDraggingId(presenceId);
    },
    [isAdmin]
  );

  const onDragEndNative = useCallback(() => {
    setDraggingId(null);
    setHoverDrop(null);
  }, []);

  const onDropCell = useCallback(
    (e: React.DragEvent, presence: CannesPresence, day: Date) => {
      e.preventDefault();
      if (!isAdmin) return;
      const raw = e.dataTransfer.getData(MIME) || e.dataTransfer.getData("text/plain");
      if (raw !== presence.id) {
        toast.message("Glisse sur la même carte collaborateur", {
          description: "Dépose sur un des petits carrés de la bande colorée de cette personne.",
        });
        return;
      }
      void applyDropTable(presence, day);
      onDragEndNative();
    },
    [applyDropTable, isAdmin, onDragEndNative]
  );

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium text-[#1A1110]">{rows.length} collaborateurs sur place</p>
        <div className="flex flex-wrap items-center gap-2">
          <PlanningPdfExportModal
            defaults={{ team: true, talents: false, events: false }}
            buttonLabel="Exporter PDF…"
          />
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

      {officialWeekDays.length > 0 && (
        <div className="mb-5 rounded-xl border border-[#E5E0D8] bg-[#FCFAF8] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOfficialWeekIndex((i) => Math.max(0, i - 1))}
                disabled={officialWeekIndex <= 0}
                className="rounded-full border border-[#E5E0D8] px-2 py-1 text-xs disabled:opacity-40"
              >
                ←
              </button>
              <p className="text-sm font-semibold text-[#1A1110]">
                Vue semaine officielle ·{" "}
                {weekRangeLabel(officialWeekDays[0], officialWeekDays[officialWeekDays.length - 1])}
              </p>
              <button
                type="button"
                onClick={() => setOfficialWeekIndex((i) => Math.min(festivalWeeks.length - 1, i + 1))}
                disabled={officialWeekIndex >= festivalWeeks.length - 1}
                className="rounded-full border border-[#E5E0D8] px-2 py-1 text-xs disabled:opacity-40"
              >
                →
              </button>
            </div>
            <button
              type="button"
              onClick={resetOfficialWeek}
              className="rounded border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110]/70 hover:bg-white"
            >
              Tout remettre (semaine)
            </button>
          </div>
          <div className="mb-3 rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-xs text-[#1A1110]/80">
            {officialWeekRecap.underStaffedCount === 0 ? (
              <p>
                Semaine couverte: aucun jour en sous-effectif (ratio 1/4, avec renfort Haus Labs le 17).
              </p>
            ) : (
              <p>
                {officialWeekRecap.underStaffedCount} jour(s) en sous-effectif · manque total:{" "}
                {officialWeekRecap.totalMissing} collab
                {officialWeekRecap.worst
                  ? ` · plus critique: ${officialWeekRecap.worst.day.toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })} (-${officialWeekRecap.worst.missing})`
                  : ""}
              </p>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-7">
            {officialWeekDays.map((day) => {
              const dayKey = utcDayKey(day);
              const inFestival = day >= CANNES_2026_START && day <= CANNES_2026_END;
              const talentsPresents = talentPresences.filter((p) => {
                const st = cellState(p, day);
                return st.onPresenceWindow;
              }).length;
              const hausLabsBoost = dayKey === "2026-05-17" ? 1 : 0;
              const targetTeam = Math.ceil(talentsPresents / 4) + hausLabsBoost;
              const available = rows.filter((p) => {
                const st = cellState(p, day);
                return st.disponible && !officialHiddenByDay[`${p.id}:${dayKey}`];
              });
              const removed = rows.filter((p) => {
                const st = cellState(p, day);
                return st.disponible && !!officialHiddenByDay[`${p.id}:${dayKey}`];
              });
              return (
                <div
                  key={dayKey}
                  className={`rounded-lg border p-2 ${inFestival ? "border-[#E5E0D8] bg-[#FBF5F2]" : "border-[#EFEAE3] bg-white"}`}
                >
                  <p className="text-xs font-semibold text-[#1A1110]">
                    {day.toLocaleDateString("fr-FR", { weekday: "long" })}
                  </p>
                  <p className="mb-2 text-[11px] text-[#1A1110]/60">
                    {day.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </p>
                  <p className="mb-1 text-[11px] text-[#1A1110]/70">
                    Talents: <strong>{talentsPresents}</strong> · Cible équipe: <strong>{targetTeam}</strong>
                  </p>
                  <p
                    className={`mb-2 text-[10px] ${
                      available.length < targetTeam ? "text-red-600" : "text-[#1A1110]/55"
                    }`}
                  >
                    {available.length < targetTeam
                      ? `Il manque ${targetTeam - available.length} collab`
                      : `Couverture OK (${available.length}/${targetTeam})`}
                    {hausLabsBoost > 0 ? " · +1 Haus Labs" : ""}
                  </p>
                  <div className="space-y-1">
                    {available.length === 0 ? (
                      <p className="text-[11px] text-[#1A1110]/45">—</p>
                    ) : (
                      available.map((p) => (
                        <button
                          key={`${dayKey}-${p.id}-on`}
                          type="button"
                          onClick={() => toggleOfficialPerson(p.id, dayKey)}
                          className="flex w-full items-center justify-between rounded border border-[#E5E0D8] bg-white px-2 py-1 text-left text-[11px] hover:bg-[#F5EBE0]/50"
                        >
                          <span className="truncate">{personLabel(p)}</span>
                          <span className="ml-2 text-[#1A1110]/55">Retirer</span>
                        </button>
                      ))
                    )}
                    {removed.length > 0 && (
                      <div className="pt-1">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-[#1A1110]/45">Retirés</p>
                        {removed.map((p) => (
                          <button
                            key={`${dayKey}-${p.id}-off`}
                            type="button"
                            onClick={() => toggleOfficialPerson(p.id, dayKey)}
                            className="mb-1 flex w-full items-center justify-between rounded border border-dashed border-[#E5E0D8] bg-[#F8F4EF] px-2 py-1 text-left text-[11px] text-[#1A1110]/70 hover:bg-white"
                          >
                            <span className="truncate">{personLabel(p)}</span>
                            <span className="ml-2">Remettre</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-[#1A1110]/70">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded bg-[#C08B8B]" /> Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded bg-[#1A1110]" /> Indisponible
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((p) => {
          const label = personLabel(p);
          const initials = personInitials(p);

          if (!isAdmin) {
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="w-full rounded-lg border border-[#E5E0D8] p-3 text-left transition hover:bg-[#F5EBE0]/50"
              >
                <p className="font-medium text-[#1A1110]">{label}</p>
                <p className="text-sm text-[#1A1110]/70">
                  {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} -{" "}
                  {new Date(p.departureDate).toLocaleDateString("fr-FR")} · {p.hotel || "Hotel non renseigne"}
                </p>
                <div className="mt-2 grid grid-cols-12 gap-1">
                  {CANNES_2026_DAYS.map((d) => (
                    <div
                      key={utcDayKey(d)}
                      title={utcDayKey(d)}
                      className={`h-2 rounded ${cellSurfaceClass(cellState(p, d))}`}
                    />
                  ))}
                </div>
              </button>
            );
          }

          const dayStrip = (
            <div className="mt-2 grid grid-cols-12 gap-1">
              {CANNES_2026_DAYS.map((d) => {
                const st = cellState(p, d);
                const { onPresenceWindow } = st;
                const dayKey = utcDayKey(d);
                const isHover =
                  hoverDrop?.presenceId === p.id && hoverDrop.dayKey === dayKey && draggingId === p.id;
                const invalidHover = isHover && draggingId === p.id && !onPresenceWindow && isAdmin;
                const busy = tableBusyKey === `${p.id}:${dayKey}`;
                const cls = cellSurfaceClass(st);
                return (
                  <div
                    key={dayKey}
                    role="button"
                    aria-label={`${label} ${dayKey}`}
                    onDragOver={(e) => {
                      if (draggingId !== p.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      setHoverDrop({ presenceId: p.id, dayKey });
                    }}
                    onDragLeave={(e) => {
                      const next = e.relatedTarget as Node | null;
                      if (!next || !e.currentTarget.contains(next)) {
                        setHoverDrop((h) => (h?.presenceId === p.id && h.dayKey === dayKey ? null : h));
                      }
                    }}
                    onDrop={(e) => onDropCell(e, p, d)}
                    title={dayKey}
                    className={`relative min-h-[12px] rounded transition ${cls} ${
                      draggingId === p.id ? "ring-1 ring-offset-1" : ""
                    } ${invalidHover ? "ring-2 ring-red-600 ring-offset-1" : ""} ${
                      isHover && !invalidHover ? "ring-2 ring-[#1A1110]/35 ring-offset-1" : ""
                    } ${busy ? "opacity-60" : ""}`}
                  >
                    {busy ? (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-[#1A1110]/50">
                        …
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );

          return (
            <div
              key={p.id}
              className="flex gap-3 rounded-lg border border-[#E5E0D8] p-3 transition hover:bg-[#F5EBE0]/30"
            >
              <span
                draggable
                onDragStart={(e) => onDragStartNative(e, p.id)}
                onDragEnd={onDragEndNative}
                className="mt-0.5 flex h-10 w-10 shrink-0 cursor-grab select-none items-center justify-center rounded-full border-2 border-[#C08B8B] bg-[#C08B8B]/25 text-xs font-bold text-[#1A1110] active:cursor-grabbing"
                title="Glisser vers un jour sur la bande à droite (même personne)"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="w-full rounded-md text-left transition hover:bg-[#F5EBE0]/60"
                >
                  <p className="font-medium text-[#1A1110]">{label}</p>
                  <p className="text-sm text-[#1A1110]/70">
                    {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} -{" "}
                    {new Date(p.departureDate).toLocaleDateString("fr-FR")} · {p.hotel || "Hotel non renseigne"}
                  </p>
                </button>
                {dayStrip}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-[#1A1110]/50">
        Clic sur une carte pour ouvrir la fiche (vol, hôtel, créneaux longs).
      </p>
      <div className="mt-3 rounded-lg border border-[#E5E0D8] bg-[#FCFAF8] p-3">
        <p className="mb-2 text-xs font-semibold text-[#1A1110]/75">
          Légende · Jours de présence par collaborateur
        </p>
        <div className="flex flex-wrap gap-1.5">
          {presenceDaysLegend.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-[#E5E0D8] bg-white px-2 py-1 text-[11px] text-[#1A1110]/80"
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-[#1A1110]/55">· {item.days} j</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 border-t border-[#E5E0D8] pt-6">
        <h3 className="mb-3 text-sm font-semibold text-[#1A1110]">Kanban</h3>
        {isAdmin && (
          <p className="mb-4 text-xs text-[#1A1110]/60">
            Glisser-déposer : piscine → jour (indispo), carte → piscine (retirer), carte → autre jour (déplacer).
            Créneaux sur plusieurs jours : fiche collaborateur.
          </p>
        )}
        <TeamKanbanBoard
          rows={rows}
          isAdmin={isAdmin}
          busyKey={kanbanBusyKey}
          presenceById={presenceById}
          addSingleDay={addSingleDay}
          removeSingleDayIfExact={removeSingleDayIfExact}
          router={router}
          runWithBusyKanban={runWithBusyKanban}
          onOpenPresence={setSelectedId}
          sensors={sensors}
          overlay={overlay}
          setOverlay={setOverlay}
        />
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
