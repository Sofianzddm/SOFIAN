"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RhAvatar,
  RhBadge,
  RhCard,
  RhCardHead,
} from "@/components/rh/ui/primitives";
import { isFrenchHoliday } from "@/lib/rh/holidays";
import {
  KIND_LABEL,
  KIND_SHORT,
  LIME,
  isoDate,
  startOfWeek,
  type PlanningData,
  type PlanningEmp,
} from "@/components/rh/people/people-utils";

export type RequestedDay = {
  date: string;
  halfDay?: boolean;
};

type Props = {
  employeeId: string;
  employeeName: string;
  requestedDays: RequestedDay[];
  onOpenFiche: (employeeId: string) => void;
};

function mondayOf(iso: string) {
  return startOfWeek(new Date(iso + "T12:00:00"));
}

function buildRange(requestedDays: RequestedDay[]) {
  const sorted = [...requestedDays.map((d) => d.date)].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const from = mondayOf(first);
  from.setDate(from.getDate() - 7);
  const toMon = mondayOf(last);
  // cover through end of the week of last day, plus one week buffer
  const to = new Date(toMon);
  to.setDate(to.getDate() + 13);
  const days: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { from: days[0]!, to: days[days.length - 1]!, days };
}

export function ApprovalPlanningCompare({
  employeeId,
  employeeName,
  requestedDays,
  onOpenFiche,
}: Props) {
  const [planning, setPlanning] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (!requestedDays.length) return null;
    return buildRange(requestedDays);
  }, [requestedDays]);

  const requestByDate = useMemo(() => {
    const map = new Map<string, RequestedDay>();
    for (const d of requestedDays) map.set(d.date, d);
    return map;
  }, [requestedDays]);

  useEffect(() => {
    if (!range) {
      setPlanning(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/rh/planning?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
        );
        if (!res.ok) throw new Error("Planning indisponible");
        const data = (await res.json()) as PlanningData;
        if (!cancelled) setPlanning(data);
      } catch (e) {
        if (!cancelled) {
          setPlanning(null);
          setError(e instanceof Error ? e.message : "Erreur planning");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range?.from, range?.to]);

  const requester = useMemo(
    () => planning?.employees.find((e) => e.id === employeeId) ?? null,
    [planning, employeeId]
  );

  const dept = requester?.department;

  const rows = useMemo(() => {
    if (!planning) return [] as PlanningEmp[];
    const list = planning.employees.filter((e) =>
      dept ? e.department === dept : true
    );
    // Demandeur en tête pour comparer facilement
    return [...list].sort((a, b) => {
      if (a.id === employeeId) return -1;
      if (b.id === employeeId) return 1;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [planning, dept, employeeId]);

  if (!requestedDays.length || !range) return null;

  return (
    <RhCard className="rh-gantt-card rh-approval-planning">
      <RhCardHead
        title="Planning équipe"
        badge={
          <RhBadge bg="#1D2530" fg="#8B95A5">
            {dept || "Tous"} · comparer
          </RhBadge>
        }
      />
      <div className="px-4 pb-2 text-[12px]" style={{ color: "#8B95A5" }}>
        Croix{" "}
        <span className="rh-mono" style={{ color: LIME }}>
          ×
        </span>{" "}
        = jours demandés par {employeeName.split(" ")[0]}
        {loading ? " · chargement…" : null}
        {error ? ` · ${error}` : null}
      </div>
      {rows.length === 0 && !loading ? (
        <div className="px-4 pb-4 text-[12.5px]" style={{ color: "#8B95A5" }}>
          Aucun collaborateur sur cette période.
        </div>
      ) : (
        <div className="rh-gantt-scroll">
          <div
            className="rh-gantt-grid"
            style={{
              gridTemplateColumns: `var(--rh-gantt-name) repeat(${range.days.length}, minmax(var(--rh-gantt-cell), 1fr))`,
            }}
          >
            <div className="rh-gantt-corner" />
            {range.days.map((d) => {
              const dt = new Date(d + "T12:00:00");
              const weekend = dt.getDay() % 6 === 0;
              const mon = dt.getDay() === 1;
              const isReq = requestByDate.has(d);
              return (
                <div
                  key={d}
                  className="rh-gantt-dayhead"
                  data-weekend={weekend ? "1" : "0"}
                  data-mon={mon ? "1" : "0"}
                  data-request={isReq ? "1" : "0"}
                  title={d}
                >
                  <span className="rh-gantt-dow">
                    {dt
                      .toLocaleDateString("fr-FR", { weekday: "narrow" })
                      .toUpperCase()}
                  </span>
                  <span className="rh-mono">{d.slice(8)}</span>
                </div>
              );
            })}
            {rows.map((r) => {
              const isRequester = r.id === employeeId;
              return (
                <div key={r.id} className="contents">
                  <button
                    type="button"
                    className="rh-gantt-name"
                    data-requester={isRequester ? "1" : "0"}
                    onClick={() => onOpenFiche(r.id)}
                  >
                    <RhAvatar
                      initials={r.initials}
                      color={r.color}
                      size={22}
                    />
                    <span className="truncate">{r.name.split(" ")[0]}</span>
                  </button>
                  {range.days.map((d) => {
                    const ev = r.events.find((e) => e.date === d);
                    const weekend =
                      new Date(d + "T12:00:00").getDay() % 6 === 0;
                    const ferie = isFrenchHoliday(d);
                    const req = isRequester ? requestByDate.get(d) : undefined;
                    const code = req
                      ? req.halfDay
                        ? "×½"
                        : "×"
                      : ev
                        ? KIND_SHORT[ev.kind] || ev.kind.slice(0, 3)
                        : ferie
                          ? "Fér"
                          : "";
                    return (
                      <div
                        key={d}
                        className="rh-gantt-cell"
                        data-kind={
                          req
                            ? "REQUEST"
                            : ev?.kind ||
                              (ferie ? "HOLIDAY" : weekend ? "WE" : "")
                        }
                        data-empty={!code ? "1" : "0"}
                        data-request={req ? "1" : "0"}
                        data-col-request={requestByDate.has(d) ? "1" : "0"}
                        title={
                          req
                            ? `${r.name} · demandé${req.halfDay ? " (½)" : ""} · ${d}`
                            : ev
                              ? `${r.name} · ${KIND_LABEL[ev.kind] || ev.kind} · ${d}`
                              : ferie
                                ? `Férié · ${d}`
                                : d
                        }
                        style={{
                          opacity: !req && ev?.halfDay ? 0.65 : 1,
                        }}
                      >
                        {code}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </RhCard>
  );
}
