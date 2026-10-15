"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";
import { frenchHolidayLabel, isFrenchHoliday } from "@/lib/rh/holidays";
import {
  KIND_COLOR,
  KIND_LABEL,
  KIND_SHORT,
} from "@/components/rh/people/people-utils";
import { TT } from "@/components/rh/mock/shared";

export type TeamCalKind = "ABSENCE" | "TT";

type Entry = {
  date: string;
  employeeId: string;
  name: string;
  initials: string;
  color: string;
  department: string;
  kind: string;
  halfDay: boolean;
  status: string;
};

const DOWS = ["L", "M", "M", "J", "V", "S", "D"];

function monthBounds(cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    title: cursor
      .toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
      .replace(/^\w/, (c) => c.toUpperCase()),
    year: y,
    month: m,
    daysInMonth: new Date(y, m + 1, 0).getDate(),
    startDow: (new Date(y, m, 1).getDay() + 6) % 7,
  };
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TeamOfficialCalendar({
  kind,
  title,
  subtitle,
}: {
  kind: TeamCalKind;
  title: string;
  subtitle?: string;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [byDate, setByDate] = useState<Record<string, Entry[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(() => todayYmd());

  const bounds = useMemo(() => monthBounds(cursor), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/rh/team-calendar?kind=${kind}&from=${bounds.from}&to=${bounds.to}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setByDate(data.byDate || {});
    } finally {
      setLoading(false);
    }
  }, [kind, bounds.from, bounds.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Reselect today when month contains it, else 1st of month
    const t = todayYmd();
    if (t >= bounds.from && t <= bounds.to) setSelected(t);
    else setSelected(bounds.from);
  }, [bounds.from, bounds.to]);

  const selectedEntries = selected ? byDate[selected] || [] : [];
  const accent = kind === "TT" ? TT : "#46D6C0";

  const cells = useMemo(() => {
    const out: Array<{
      key: string;
      n: number | null;
      iso: string | null;
      count: number;
      isWeekend: boolean;
      isToday: boolean;
      isHoliday: boolean;
    }> = [];
    for (let i = 0; i < bounds.startDow; i++) {
      out.push({
        key: `pad-${i}`,
        n: null,
        iso: null,
        count: 0,
        isWeekend: false,
        isToday: false,
        isHoliday: false,
      });
    }
    const today = todayYmd();
    for (let d = 1; d <= bounds.daysInMonth; d++) {
      const iso = `${bounds.year}-${String(bounds.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = (bounds.startDow + d - 1) % 7;
      out.push({
        key: iso,
        n: d,
        iso,
        count: (byDate[iso] || []).length,
        isWeekend: dow >= 5,
        isToday: iso === today,
        isHoliday: isFrenchHoliday(iso),
      });
    }
    return out;
  }, [bounds, byDate]);

  return (
    <RhCard>
      <RhCardHead
        title={title}
        right={
          <div className="flex items-center gap-1.5">
            <RhButton
              variant="secondary"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
                )
              }
            >
              <ChevronLeft size={14} />
            </RhButton>
            <span
              className="min-w-[120px] text-center text-[12.5px] font-medium"
              style={{ color: EMP_COLORS.text }}
            >
              {bounds.title}
            </span>
            <RhButton
              variant="secondary"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
                )
              }
            >
              <ChevronRight size={14} />
            </RhButton>
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {subtitle ? (
            <p
              className="m-0 mb-3 text-[12.5px] leading-[1.45]"
              style={{ color: EMP_COLORS.muted }}
            >
              {subtitle}
            </p>
          ) : null}
          <div className="mb-1.5 grid grid-cols-7 gap-1">
            {DOWS.map((d, i) => (
              <div
                key={`${d}-${i}`}
                className="text-center text-[10.5px] font-medium"
                style={{ color: EMP_COLORS.dim }}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => {
              if (c.n == null) {
                return <div key={c.key} className="aspect-square" />;
              }
              const on = selected === c.iso;
              const holiday = c.iso ? frenchHolidayLabel(c.iso) : null;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelected(c.iso)}
                  className="relative aspect-square cursor-pointer rounded-[10px] border-0 text-[12.5px] font-medium"
                  style={{
                    background: on
                      ? "rgba(229,242,181,.14)"
                      : c.count > 0
                        ? kind === "TT"
                          ? "rgba(124,140,248,.14)"
                          : "rgba(70,214,192,.12)"
                        : c.isWeekend || c.isHoliday
                          ? "#12161C"
                          : "#0E1116",
                    color: on
                      ? EMP_COLORS.accent
                      : c.count > 0
                        ? accent
                        : c.isWeekend
                          ? "#4C5563"
                          : EMP_COLORS.body,
                    outline: on
                      ? `1.5px solid ${EMP_COLORS.accent}`
                      : c.isToday
                        ? "1px solid rgba(229,242,181,.35)"
                        : "1px solid transparent",
                  }}
                  title={holiday || undefined}
                >
                  {c.n}
                  {c.count > 0 ? (
                    <span
                      className="absolute bottom-1 left-1/2 block h-1 w-1 -translate-x-1/2 rounded-full"
                      style={{ background: accent }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex min-h-[220px] w-full flex-col gap-2 rounded-[14px] p-3 lg:w-[320px] lg:shrink-0"
          style={{
            background: "#0E1116",
            border: "1px solid #1B212A",
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div
              className="text-[13px] font-semibold capitalize"
              style={{ color: EMP_COLORS.text }}
            >
              {selected
                ? new Date(selected + "T12:00:00").toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "—"}
            </div>
            <span
              className="rh-mono text-[11px]"
              style={{ color: EMP_COLORS.dim }}
            >
              {selectedEntries.length}
            </span>
          </div>
          {selected && frenchHolidayLabel(selected) ? (
            <div
              className="text-[11.5px]"
              style={{ color: "#C4B5FD" }}
            >
              Férié · {frenchHolidayLabel(selected)}
            </div>
          ) : null}
          {loading ? (
            <div className="text-[12.5px]" style={{ color: EMP_COLORS.muted }}>
              Chargement…
            </div>
          ) : selectedEntries.length === 0 ? (
            <div className="text-[12.5px]" style={{ color: EMP_COLORS.dim }}>
              {kind === "TT"
                ? "Personne en télétravail ce jour."
                : "Aucune absence ce jour."}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 overflow-y-auto">
              {selectedEntries.map((e) => (
                <div
                  key={`${e.employeeId}-${e.kind}-${e.date}`}
                  className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
                  style={{ background: "rgba(255,255,255,.03)" }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                    style={{
                      background: e.color || "#1D2530",
                      color: "#0A0C0F",
                    }}
                  >
                    {e.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[12.5px] font-medium"
                      style={{ color: EMP_COLORS.text }}
                    >
                      {e.name}
                    </div>
                    <div
                      className="truncate text-[11px]"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      {e.department}
                      {e.halfDay ? " · ½ j" : ""}
                      {e.status === "PENDING" || e.status === "PAUSED"
                        ? " · en attente"
                        : ""}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{
                      background:
                        kind === "TT"
                          ? "rgba(124,140,248,.18)"
                          : `${KIND_COLOR[e.kind] || accent}22`,
                      color:
                        kind === "TT"
                          ? TT
                          : KIND_COLOR[e.kind] || accent,
                    }}
                  >
                    {kind === "TT"
                      ? "TT"
                      : KIND_SHORT[e.kind] ||
                        KIND_LABEL[e.kind] ||
                        e.kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RhCard>
  );
}
