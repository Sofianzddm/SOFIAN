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
  ABSENCE_KINDS,
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
  /** leave = absences · remote = validation TT (semaine ciblée + présence) */
  variant?: "leave" | "remote";
};

type TeamScope = "all" | "tm" | "bd";

function mondayOf(iso: string) {
  return startOfWeek(new Date(iso + "T12:00:00"));
}

function buildLeaveRange(requestedDays: RequestedDay[]) {
  const sorted = [...requestedDays.map((d) => d.date)].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const from = mondayOf(first);
  from.setDate(from.getDate() - 7);
  const toMon = mondayOf(last);
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

/** Semaine ISO du 1er jour demandé — lun → ven uniquement. */
function buildRemoteWeek(requestedDays: RequestedDay[]) {
  const sorted = [...requestedDays.map((d) => d.date)].sort();
  const mon = mondayOf(sorted[0]!);
  const days: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    days.push(isoDate(d));
  }
  return { from: days[0]!, to: days[4]!, days, monday: mon };
}

function matchesTeamScope(
  department: string | null | undefined,
  scope: TeamScope
): boolean {
  if (scope === "all") return true;
  const d = String(department || "").toLowerCase();
  if (scope === "tm") return d.includes("talent");
  if (scope === "bd") {
    return (
      d.includes("business") ||
      d.includes("casting") ||
      d.includes("sales") ||
      d.includes("partenariat")
    );
  }
  return true;
}

type CellView = {
  kind: string;
  code: string;
  status?: string;
  label: string;
  isRequest?: boolean;
};

function cellForDay(params: {
  emp: PlanningEmp;
  date: string;
  isRequester: boolean;
  request?: RequestedDay;
  variant: "leave" | "remote";
}): CellView {
  const { emp, date, isRequester, request, variant } = params;
  const weekend = new Date(date + "T12:00:00").getDay() % 6 === 0;
  const ferie = isFrenchHoliday(date);

  if (isRequester && request) {
    return {
      kind: "REQUEST",
      code: request.halfDay ? "×½" : "×",
      // pas de status PENDING → évite le style orange pointillé sur la croix
      label: `Cette demande${request.halfDay ? " (½)" : ""}`,
      isRequest: true,
    };
  }

  const ev = emp.events.find((e) => e.date === date);
  if (ev) {
    const pending =
      ev.status === "PENDING" || ev.status === "PAUSED";
    const code =
      ev.kind === "TT" && pending
        ? "TT?"
        : KIND_SHORT[ev.kind] || ev.kind.slice(0, 3);
    return {
      kind: ev.kind,
      code,
      status: ev.status,
      label:
        ev.kind === "TT" && pending
          ? "TT en attente"
          : KIND_LABEL[ev.kind] || ev.kind,
    };
  }

  if (ferie) {
    return { kind: "HOLIDAY", code: "Fér", label: "Férié" };
  }
  if (weekend) {
    return { kind: "WE", code: "", label: "Week-end" };
  }
  // Validation TT : case vide = au bureau (présent)
  if (variant === "remote") {
    return { kind: "OFFICE", code: "Bur", label: "Bureau" };
  }
  return { kind: "", code: "", label: "" };
}

function dayPresenceSummary(
  rows: PlanningEmp[],
  date: string,
  requesterId: string,
  requestByDate: Map<string, RequestedDay>
) {
  let office = 0;
  let ttOk = 0;
  let ttPending = 0;
  let absent = 0;
  let thisRequest = 0;

  for (const emp of rows) {
    const isRequester = emp.id === requesterId;
    const req = isRequester ? requestByDate.get(date) : undefined;
    const cell = cellForDay({
      emp,
      date,
      isRequester,
      request: req,
      variant: "remote",
    });
    if (cell.isRequest) {
      thisRequest += 1;
      ttPending += 1;
      continue;
    }
    if (ABSENCE_KINDS.has(cell.kind) || cell.kind === "HOLIDAY") {
      absent += 1;
      continue;
    }
    if (cell.kind === "TT") {
      if (cell.status === "PENDING" || cell.status === "PAUSED") ttPending += 1;
      else ttOk += 1;
      continue;
    }
    if (cell.kind === "TRAVEL" || cell.kind === "SITE") {
      office += 1; // hors bureau mais « présents » côté couverture
      continue;
    }
    if (cell.kind === "OFFICE" || cell.kind === "WE" || !cell.kind) {
      if (cell.kind === "OFFICE") office += 1;
    }
  }

  return { office, ttOk, ttPending, absent, thisRequest, total: rows.length };
}

export function ApprovalPlanningCompare({
  employeeId,
  employeeName,
  requestedDays,
  onOpenFiche,
  variant = "leave",
}: Props) {
  const [planning, setPlanning] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamScope, setTeamScope] = useState<TeamScope>("all");

  const range = useMemo(() => {
    if (!requestedDays.length) return null;
    return variant === "remote"
      ? buildRemoteWeek(requestedDays)
      : buildLeaveRange(requestedDays);
  }, [requestedDays, variant]);

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

  const scopeLabel =
    teamScope === "tm" ? "TM" : teamScope === "bd" ? "BD" : "Toute l'équipe";

  const rows = useMemo(() => {
    if (!planning) return [] as PlanningEmp[];
    const list = planning.employees.filter(
      (e) => e.id === employeeId || matchesTeamScope(e.department, teamScope)
    );
    return [...list].sort((a, b) => {
      if (a.id === employeeId) return -1;
      if (b.id === employeeId) return 1;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [planning, teamScope, employeeId]);

  const weekLabel = useMemo(() => {
    if (!range || variant !== "remote") return null;
    const mon = new Date(range.from + "T12:00:00");
    const fri = new Date(range.to + "T12:00:00");
    const fmt = (d: Date) =>
      d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${fmt(mon)} → ${fmt(fri)}`;
  }, [range, variant]);

  const daySummaries = useMemo(() => {
    if (variant !== "remote" || !range) return [];
    return range.days.map((date) => ({
      date,
      ...dayPresenceSummary(rows, date, employeeId, requestByDate),
    }));
  }, [variant, range, rows, employeeId, requestByDate]);

  if (!requestedDays.length || !range) return null;

  const firstName = employeeName.split(" ")[0] || employeeName;

  return (
    <RhCard className="rh-gantt-card rh-approval-planning">
      <RhCardHead
        title={
          variant === "remote"
            ? "Qui est là cette semaine ?"
            : "Planning équipe"
        }
        badge={
          <RhBadge bg="#1D2530" fg="#8B95A5">
            {variant === "remote"
              ? `${weekLabel || "Semaine"} · ${scopeLabel}`
              : `${scopeLabel} · comparer`}
          </RhBadge>
        }
      />

      <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "Toute l'équipe"],
            ["tm", "TM"],
            ["bd", "BD"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="rh-gantt-chip"
            data-active={teamScope === id ? "1" : "0"}
            onClick={() => setTeamScope(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {variant === "remote" ? (
        <>
          <div className="rh-tt-plan-legend px-4 pb-3">
            <span className="rh-tt-plan-legend-item" data-swatch="request">
              × {firstName} (cette demande)
            </span>
            <span className="rh-tt-plan-legend-item" data-swatch="tt">
              TT validé
            </span>
            <span className="rh-tt-plan-legend-item" data-swatch="pending">
              TT en attente
            </span>
            <span className="rh-tt-plan-legend-item" data-swatch="office">
              Bureau
            </span>
            <span className="rh-tt-plan-legend-item" data-swatch="absent">
              Absent
            </span>
          </div>

          {daySummaries.length > 0 ? (
            <div className="rh-tt-day-strip px-4 pb-3">
              {daySummaries.map((s) => {
                const dt = new Date(s.date + "T12:00:00");
                const isReq = requestByDate.has(s.date);
                const present = s.office + s.ttOk + s.ttPending;
                return (
                  <div
                    key={s.date}
                    className="rh-tt-day-chip"
                    data-request={isReq ? "1" : "0"}
                  >
                    <div className="rh-tt-day-chip-head">
                      <span className="rh-tt-day-chip-dow">
                        {dt
                          .toLocaleDateString("fr-FR", { weekday: "short" })
                          .replace(".", "")}
                      </span>
                      <span className="rh-mono">{s.date.slice(8)}</span>
                      {isReq ? (
                        <span className="rh-tt-day-chip-tag">demande</span>
                      ) : null}
                    </div>
                    <div className="rh-tt-day-chip-stats">
                      <span title="Au bureau / déplacement">
                        {s.office} bur
                      </span>
                      <span title="TT déjà validé">{s.ttOk} TT</span>
                      <span title="TT en attente (dont cette demande)">
                        {s.ttPending} att.
                      </span>
                      <span title="Absents">{s.absent} abs</span>
                    </div>
                    <div
                      className="rh-tt-day-chip-bar"
                      title={`${present}/${s.total} « présents » (bureau + TT)`}
                    >
                      <i
                        style={{
                          width: s.total
                            ? `${Math.round((s.office / s.total) * 100)}%`
                            : "0%",
                          background: "#8B95A5",
                        }}
                      />
                      <i
                        style={{
                          width: s.total
                            ? `${Math.round((s.ttOk / s.total) * 100)}%`
                            : "0%",
                          background: "#7C8CF8",
                        }}
                      />
                      <i
                        style={{
                          width: s.total
                            ? `${Math.round((s.ttPending / s.total) * 100)}%`
                            : "0%",
                          background: "#F2874E",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-4 pb-2 text-[12px]" style={{ color: "#8B95A5" }}>
          Croix{" "}
          <span className="rh-mono" style={{ color: LIME }}>
            ×
          </span>{" "}
          = jours demandés par {firstName}
          {loading ? " · chargement…" : null}
          {error ? ` · ${error}` : null}
        </div>
      )}

      {variant === "remote" && (loading || error) ? (
        <div className="px-4 pb-2 text-[12px]" style={{ color: "#8B95A5" }}>
          {loading ? "Chargement du planning…" : null}
          {error ? error : null}
        </div>
      ) : null}

      {rows.length === 0 && !loading ? (
        <div className="px-4 pb-4 text-[12.5px]" style={{ color: "#8B95A5" }}>
          Aucun collaborateur sur cette période.
        </div>
      ) : (
        <div className="rh-gantt-scroll">
          <div
            className="rh-gantt-grid"
            style={{
              gridTemplateColumns: `var(--rh-gantt-name) repeat(${range.days.length}, minmax(${variant === "remote" ? "52px" : "var(--rh-gantt-cell)"}, 1fr))`,
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
                    const req = isRequester
                      ? requestByDate.get(d)
                      : undefined;
                    const cell = cellForDay({
                      emp: r,
                      date: d,
                      isRequester,
                      request: req,
                      variant,
                    });
                    return (
                      <div
                        key={d}
                        className="rh-gantt-cell"
                        data-kind={
                          cell.kind ||
                          (isFrenchHoliday(d)
                            ? "HOLIDAY"
                            : new Date(d + "T12:00:00").getDay() % 6 === 0
                              ? "WE"
                              : "")
                        }
                        data-status={cell.status || ""}
                        data-empty={!cell.code ? "1" : "0"}
                        data-request={cell.isRequest ? "1" : "0"}
                        data-col-request={requestByDate.has(d) ? "1" : "0"}
                        title={`${r.name} · ${cell.label} · ${d}`}
                        style={{
                          opacity:
                            !cell.isRequest &&
                            r.events.find((e) => e.date === d)?.halfDay
                              ? 0.65
                              : 1,
                        }}
                      >
                        {cell.code}
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
