"use client";

import { useMemo, useState } from "react";
import {
  RhAvatar,
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { isFrenchHoliday } from "@/lib/rh/holidays";
import {
  ABSENCE_KINDS,
  CP,
  KIND_LABEL,
  KIND_SHORT,
  LIME,
  RTT,
  SICK,
  TT,
  type PlanningData,
  type PlanningEmp,
} from "@/components/rh/people/people-utils";

type Props = {
  planning: PlanningData | null;
  onOpenFiche: (employeeId: string) => void;
};

export function PlanningGanttScreen({ planning, onOpenFiche }: Props) {
  const [ganttQuery, setGanttQuery] = useState("");
  const [ganttDept, setGanttDept] = useState<string>("all");
  const [ganttFocus, setGanttFocus] = useState<"all" | "absence" | "presence">(
    "all"
  );
  const [ganttWeeks, setGanttWeeks] = useState<1 | 2 | 4>(4);
  const [ganttOffset, setGanttOffset] = useState(0);

  const ganttDays = useMemo(() => {
    if (!planning) return [];
    const start = new Date(planning.from + "T12:00:00");
    start.setDate(start.getDate() + ganttOffset * 7);
    const len = ganttWeeks * 7;
    return Array.from({ length: len }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [planning, ganttWeeks, ganttOffset]);

  const planningDepts = useMemo(() => {
    const set = new Set<string>();
    for (const e of planning?.employees || []) {
      if (e.department) set.add(e.department);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [planning]);

  const byDept = useMemo(() => {
    const q = ganttQuery.trim().toLowerCase();
    const map = new Map<string, PlanningEmp[]>();
    for (const e of planning?.employees || []) {
      if (ganttDept !== "all" && e.department !== ganttDept) continue;
      if (
        q &&
        !e.name.toLowerCase().includes(q) &&
        !e.department.toLowerCase().includes(q) &&
        !e.matricule.toLowerCase().includes(q)
      ) {
        continue;
      }
      let events = e.events;
      if (ganttFocus === "absence") {
        events = e.events.filter((ev) => ABSENCE_KINDS.has(ev.kind));
      } else if (ganttFocus === "presence") {
        events = e.events.filter((ev) =>
          ["OFFICE", "TT", "TRAVEL", "SITE"].includes(ev.kind)
        );
      }
      if (ganttFocus !== "all" && events.length === 0 && q) {
        // keep person if name matched even without events in focus
      }
      const list = map.get(e.department) || [];
      list.push({ ...e, events });
      map.set(e.department, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [planning, ganttDept, ganttQuery, ganttFocus]);

  const ganttPeopleCount = useMemo(
    () => byDept.reduce((s, [, rows]) => s + rows.length, 0),
    [byDept]
  );

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow="PLANNING"
        title="Gantt équipe"
        subtitle="Vue calendaire pour anticiper absences et présence — filtre par pôle, personne ou type."
      />

      <RhCard className="rh-gantt-filters">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="rh-input flex-1"
              placeholder="Rechercher un nom, pôle, matricule…"
              value={ganttQuery}
              onChange={(e) => setGanttQuery(e.target.value)}
              aria-label="Filtrer le planning"
            />
            <div className="flex items-center gap-2 shrink-0">
              <RhButton
                variant="secondary"
                disabled={ganttOffset <= 0}
                onClick={() => setGanttOffset((v) => Math.max(0, v - 1))}
                aria-label="Semaine précédente"
              >
                ‹
              </RhButton>
              <span
                className="rh-mono text-[11px] whitespace-nowrap px-1"
                style={{ color: "#8B95A5" }}
              >
                {ganttDays[0]?.slice(5) || "—"} →{" "}
                {ganttDays[ganttDays.length - 1]?.slice(5) || "—"}
              </span>
              <RhButton
                variant="secondary"
                disabled={ganttOffset >= 3}
                onClick={() => setGanttOffset((v) => Math.min(3, v + 1))}
                aria-label="Semaine suivante"
              >
                ›
              </RhButton>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                [1, "1 sem."],
                [2, "2 sem."],
                [4, "4 sem."],
              ] as const
            ).map(([n, label]) => (
              <button
                key={n}
                type="button"
                className="rh-gantt-chip"
                data-active={ganttWeeks === n ? "1" : "0"}
                onClick={() => {
                  setGanttWeeks(n);
                  setGanttOffset(0);
                }}
              >
                {label}
              </button>
            ))}
            <span className="rh-gantt-chip-sep" />
            {(
              [
                ["all", "Tout"],
                ["absence", "Absences"],
                ["presence", "Présence"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="rh-gantt-chip"
                data-active={ganttFocus === id ? "1" : "0"}
                onClick={() => setGanttFocus(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rh-gantt-chip"
              data-active={ganttDept === "all" ? "1" : "0"}
              onClick={() => setGanttDept("all")}
            >
              Tous les pôles
            </button>
            {planningDepts.map((d) => (
              <button
                key={d}
                type="button"
                className="rh-gantt-chip"
                data-active={ganttDept === d ? "1" : "0"}
                onClick={() => setGanttDept(d)}
              >
                {d}
              </button>
            ))}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2 text-[12px]"
            style={{ color: "#8B95A5" }}
          >
            <span>
              {ganttPeopleCount} collab.
              {ganttDept !== "all" || ganttQuery || ganttFocus !== "all"
                ? " (filtrés)"
                : ""}
            </span>
            {(ganttDept !== "all" ||
              ganttQuery ||
              ganttFocus !== "all" ||
              ganttWeeks !== 4 ||
              ganttOffset !== 0) && (
              <button
                type="button"
                className="border-0 bg-transparent cursor-pointer text-[12px] underline"
                style={{ color: LIME }}
                onClick={() => {
                  setGanttDept("all");
                  setGanttQuery("");
                  setGanttFocus("all");
                  setGanttWeeks(4);
                  setGanttOffset(0);
                }}
              >
                Réinitialiser
              </button>
            )}
          </div>

          <div className="rh-gantt-legend">
            {(
              [
                ["CP", "Congés payés", CP],
                ["RTT", "RTT", RTT],
                ["Réc", "Récup", RTT],
                ["CNP", "Sans solde", "#8B95A5"],
                ["Mal", "Maladie", SICK],
                ["TT", "Télétravail", TT],
                ["Bur", "Bureau", "#8B95A5"],
                ["Dép", "Déplacement", "#F2874E"],
                ["Fér", "Férié", "#A78BFA"],
              ] as const
            ).map(([code, label, color]) => (
              <span key={code} className="rh-gantt-legend-item">
                <b
                  className="rh-gantt-legend-code"
                  style={{
                    background: color,
                    color: "#0E1116",
                    borderColor: color,
                  }}
                >
                  {code}
                </b>
                {label}
              </span>
            ))}
          </div>
        </div>
      </RhCard>

      {byDept.length === 0 ? (
        <RhCard>
          <div className="p-6 text-[13px]" style={{ color: "#8B95A5" }}>
            Aucun collaborateur pour ces filtres.
          </div>
        </RhCard>
      ) : (
        byDept.map(([dept, rows]) => (
          <RhCard key={dept} className="rh-gantt-card">
            <RhCardHead
              title={dept}
              badge={
                <RhBadge bg="#1D2530" fg="#8B95A5">
                  {rows.length}
                </RhBadge>
              }
            />
            <div className="rh-gantt-scroll">
              <div
                className="rh-gantt-grid"
                style={{
                  gridTemplateColumns: `var(--rh-gantt-name) repeat(${ganttDays.length}, minmax(var(--rh-gantt-cell), 1fr))`,
                }}
              >
                <div className="rh-gantt-corner" />
                {ganttDays.map((d) => {
                  const dt = new Date(d + "T12:00:00");
                  const weekend = dt.getDay() % 6 === 0;
                  const mon = dt.getDay() === 1;
                  return (
                    <div
                      key={d}
                      className="rh-gantt-dayhead"
                      data-weekend={weekend ? "1" : "0"}
                      data-mon={mon ? "1" : "0"}
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
                {rows.map((r) => (
                  <div key={r.id} className="contents">
                    <button
                      type="button"
                      className="rh-gantt-name"
                      onClick={() => onOpenFiche(r.id)}
                    >
                      <RhAvatar
                        initials={r.initials}
                        color={r.color}
                        size={22}
                      />
                      <span className="truncate">{r.name.split(" ")[0]}</span>
                    </button>
                    {ganttDays.map((d) => {
                      const ev = r.events.find((e) => e.date === d);
                      const weekend =
                        new Date(d + "T12:00:00").getDay() % 6 === 0;
                      const ferie = isFrenchHoliday(d);
                      const code = ev
                        ? KIND_SHORT[ev.kind] || ev.kind.slice(0, 3)
                        : ferie
                          ? "Fér"
                          : "";
                      return (
                        <div
                          key={d}
                          className="rh-gantt-cell"
                          data-kind={
                            ev?.kind || (ferie ? "HOLIDAY" : weekend ? "WE" : "")
                          }
                          data-empty={!code ? "1" : "0"}
                          title={
                            ev
                              ? `${r.name} · ${KIND_LABEL[ev.kind] || ev.kind} · ${d}`
                              : ferie
                                ? `Férié · ${d}`
                                : d
                          }
                          style={{
                            opacity: ev?.halfDay ? 0.65 : 1,
                          }}
                        >
                          {code}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </RhCard>
        ))
      )}
    </div>
  );
}
