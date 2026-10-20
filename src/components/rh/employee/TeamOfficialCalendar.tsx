"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RhAvatar,
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
} from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";
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
  type PlanningEmp,
} from "@/components/rh/people/people-utils";

export type TeamCalKind = "ABSENCE" | "TT";

function mondayOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function ymd(d: Date) {
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
  const [employees, setEmployees] = useState<PlanningEmp[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [weeks, setWeeks] = useState<1 | 2 | 4>(4);
  const [offset, setOffset] = useState(0);

  const range = useMemo(() => {
    const start = mondayOf();
    start.setDate(start.getDate() + offset * 7);
    const from = ymd(start);
    const end = new Date(start);
    end.setDate(start.getDate() + weeks * 7 - 1);
    const to = ymd(end);
    const days = Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return ymd(d);
    });
    return { from, to, days };
  }, [weeks, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/rh/team-calendar?kind=${kind}&from=${range.from}&to=${range.to}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setEmployees((data.employees || []) as PlanningEmp[]);
    } finally {
      setLoading(false);
    }
  }, [kind, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const depts = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) if (e.department) set.add(e.department);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [employees]);

  const byDept = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, PlanningEmp[]>();
    for (const e of employees) {
      if (dept !== "all" && e.department !== dept) continue;
      if (
        q &&
        !e.name.toLowerCase().includes(q) &&
        !e.department.toLowerCase().includes(q) &&
        !e.matricule.toLowerCase().includes(q)
      ) {
        continue;
      }
      // Absences : ne garder que les lignes avec au moins une absence dans la fenêtre
      // (sinon le Gantt est énorme). TT : idem, seulement ceux en TT.
      const events =
        kind === "ABSENCE"
          ? e.events.filter((ev) => ABSENCE_KINDS.has(ev.kind))
          : e.events.filter((ev) => ev.kind === "TT");
      const inWindow = events.some((ev) =>
        range.days.includes(ev.date)
      );
      if (!inWindow && !q) continue;
      const list = map.get(e.department) || [];
      list.push({ ...e, events });
      map.set(e.department, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [employees, dept, query, kind, range.days]);

  const peopleCount = useMemo(
    () => byDept.reduce((s, [, rows]) => s + rows.length, 0),
    [byDept]
  );

  const legend =
    kind === "TT"
      ? ([["TT", "Télétravail", TT]] as const)
      : ([
          ["CP", "Congés payés", CP],
          ["RTT", "RTT", RTT],
          ["Réc", "Récup", RTT],
          ["CNP", "Sans solde", "#8B95A5"],
          ["Mal", "Maladie", SICK],
          ["Éco", "École", "#B48CF0"],
          ["Aut", "Autorisée", "#8ED98A"],
          ["…", "En attente", "#F2874E"],
          ["Fér", "Férié", "#A78BFA"],
        ] as const);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2
          className="m-0 text-[16px] font-semibold tracking-[-0.02em]"
          style={{ color: EMP_COLORS.text }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            className="m-0 mt-1 text-[12.5px] leading-[1.45]"
            style={{ color: EMP_COLORS.muted }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      <RhCard className="rh-gantt-filters">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="rh-input flex-1"
              placeholder="Rechercher un nom, pôle, matricule…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filtrer le planning"
            />
            <div className="flex shrink-0 items-center gap-2">
              <RhButton
                variant="secondary"
                disabled={offset <= -2}
                onClick={() => setOffset((v) => v - 1)}
                aria-label="Semaine précédente"
              >
                ‹
              </RhButton>
              <span
                className="rh-mono whitespace-nowrap px-1 text-[11px]"
                style={{ color: "#8B95A5" }}
              >
                {range.days[0]?.slice(5) || "—"} →{" "}
                {range.days[range.days.length - 1]?.slice(5) || "—"}
              </span>
              <RhButton
                variant="secondary"
                disabled={offset >= 8}
                onClick={() => setOffset((v) => v + 1)}
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
                data-active={weeks === n ? "1" : "0"}
                onClick={() => {
                  setWeeks(n);
                  setOffset(0);
                }}
              >
                {label}
              </button>
            ))}
            <span className="rh-gantt-chip-sep" />
            <button
              type="button"
              className="rh-gantt-chip"
              data-active={dept === "all" ? "1" : "0"}
              onClick={() => setDept("all")}
            >
              Tous les pôles
            </button>
            {depts.map((d) => (
              <button
                key={d}
                type="button"
                className="rh-gantt-chip"
                data-active={dept === d ? "1" : "0"}
                onClick={() => setDept(d)}
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
              {loading
                ? "Chargement…"
                : `${peopleCount} collab.${dept !== "all" || query ? " (filtrés)" : ""}`}
            </span>
            {(dept !== "all" || query || weeks !== 4 || offset !== 0) && (
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-[12px] underline"
                style={{ color: LIME }}
                onClick={() => {
                  setDept("all");
                  setQuery("");
                  setWeeks(4);
                  setOffset(0);
                }}
              >
                Réinitialiser
              </button>
            )}
          </div>

          <div className="rh-gantt-legend">
            {legend.map(([code, label, color]) => (
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

      {loading && byDept.length === 0 ? (
        <RhCard>
          <div className="p-6 text-[13px]" style={{ color: "#8B95A5" }}>
            Chargement du planning…
          </div>
        </RhCard>
      ) : byDept.length === 0 ? (
        <RhCard>
          <div className="p-6 text-[13px]" style={{ color: "#8B95A5" }}>
            {kind === "TT"
              ? "Personne en télétravail sur cette période."
              : "Aucune absence sur cette période."}
          </div>
        </RhCard>
      ) : (
        byDept.map(([pole, rows]) => (
          <RhCard key={pole} className="rh-gantt-card">
            <RhCardHead
              title={pole}
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
                  gridTemplateColumns: `var(--rh-gantt-name) repeat(${range.days.length}, minmax(var(--rh-gantt-cell), 1fr))`,
                }}
              >
                <div className="rh-gantt-corner" />
                {range.days.map((d) => {
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
                    <div className="rh-gantt-name" style={{ cursor: "default" }}>
                      <RhAvatar
                        initials={r.initials}
                        color={r.color}
                        size={22}
                      />
                      <span className="truncate">{r.name.split(" ")[0]}</span>
                    </div>
                    {range.days.map((d) => {
                      const ev = r.events.find((e) => e.date === d);
                      const weekend =
                        new Date(d + "T12:00:00").getDay() % 6 === 0;
                      const ferie = isFrenchHoliday(d);
                      const pending =
                        ev?.status === "PENDING" || ev?.status === "PAUSED";
                      const code = ev
                        ? pending
                          ? "…"
                          : KIND_SHORT[ev.kind] || ev.kind.slice(0, 3)
                        : ferie && kind === "ABSENCE"
                          ? "Fér"
                          : "";
                      return (
                        <div
                          key={d}
                          className="rh-gantt-cell"
                          data-kind={
                            ev?.kind ||
                            (ferie && kind === "ABSENCE"
                              ? "HOLIDAY"
                              : weekend
                                ? "WE"
                                : "")
                          }
                          data-status={
                            pending ? ev?.status || "PENDING" : undefined
                          }
                          data-empty={!code ? "1" : "0"}
                          title={
                            ev
                              ? `${r.name} · ${KIND_LABEL[ev.kind] || ev.kind}${
                                  pending ? " · en attente" : ""
                                } · ${d}`
                              : ferie
                                ? `Férié · ${d}`
                                : d
                          }
                          style={{ opacity: ev?.halfDay ? 0.65 : 1 }}
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
