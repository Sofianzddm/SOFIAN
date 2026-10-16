"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  ACTIVITY_LOG_RETENTION_DAYS,
  type PulseRangeDays,
} from "@/lib/user-activity-constants";

type StaffUser = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
};

type LogRow = {
  id: string;
  action: string;
  module: string;
  summary: string;
  meta: Record<string, unknown> | null;
  path: string | null;
  method: string | null;
  createdAt: string;
  user: StaffUser;
};

type ByUser = {
  userId: string;
  count: number;
  firstAt: string;
  lastAt: string;
  activeMinutes?: number;
  user: StaffUser | null;
};

type ByUserDay = {
  userId: string;
  day: string;
  count: number;
  firstAt: string;
  lastAt: string;
  activeMinutes?: number;
  user: StaffUser | null;
};

type ByMinute = {
  minute: string;
  count: number;
  users: number;
};

type GapRow = {
  from: string;
  to: string;
  minutes: number;
};

type PeriodMode = "day" | PulseRangeDays;

const HEAT_START_H = 5;
const HEAT_END_H = 23; // exclusif → jusqu'à 22:59

function todayParisYmd(): string {
  return new Date().toLocaleString("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  return d.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function actionColor(action: string): string {
  if (action === "PAGE_VIEW") return "bg-slate-100 text-slate-800";
  if (action === "HEARTBEAT") return "bg-slate-50 text-slate-500";
  if (action.startsWith("API_")) return "bg-indigo-50 text-indigo-800";
  if (action.includes("DRAFT")) return "bg-amber-100 text-amber-900";
  if (action.includes("VALIDATION") || action.includes("SUBMITTED"))
    return "bg-violet-100 text-violet-900";
  if (action.includes("SENT") || action.includes("SCHEDULED"))
    return "bg-emerald-100 text-emerald-900";
  if (action.includes("STATUS") || action.includes("STAGE"))
    return "bg-sky-100 text-sky-900";
  return "bg-gray-100 text-gray-800";
}

export function PulseClient() {
  const [day, setDay] = useState(todayParisYmd);
  const [period, setPeriod] = useState<PeriodMode>("day");
  const [userId, setUserId] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [hideNoise, setHideNoise] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [byUser, setByUser] = useState<ByUser[]>([]);
  const [byUserDay, setByUserDay] = useState<ByUserDay[]>([]);
  const [byMinute, setByMinute] = useState<ByMinute[]>([]);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [activeMinuteCount, setActiveMinuteCount] = useState(0);
  const [selectedMinute, setSelectedMinute] = useState<string | null>(null);
  const [byAction, setByAction] = useState<{ action: string; count: number }[]>(
    []
  );
  const [byModule, setByModule] = useState<{ module: string; count: number }[]>(
    []
  );
  const [inactiveToday, setInactiveToday] = useState<
    { userId: string; user: StaffUser; count: number }[]
  >([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [totalDay, setTotalDay] = useState(0);
  const [retentionDays, setRetentionDays] = useState(ACTIVITY_LOG_RETENTION_DAYS);
  const [mode, setMode] = useState<"day" | "range">("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  const isRange = period !== "day";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ day, limit: "1000" });
      if (userId) qs.set("userId", userId);
      if (period !== "day") qs.set("range", String(period));
      const res = await fetch(`/api/ops/pulse?${qs.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setError("Accès refusé");
        return;
      }
      if (!res.ok) {
        setError("Erreur chargement");
        return;
      }
      const data = await res.json();
      setMode(data.mode === "range" ? "range" : "day");
      setLogs(data.logs || []);
      setByUser(data.byUser || []);
      setByUserDay(data.byUserDay || []);
      setByMinute(data.byMinute || []);
      setGaps(data.gaps || []);
      setActiveMinuteCount(data.activeMinuteCount || 0);
      setByAction(data.byAction || []);
      setByModule(data.byModule || []);
      setInactiveToday(data.inactiveToday || []);
      setStaff(data.staff || []);
      setTotalDay(data.totalDay || 0);
      setRetentionDays(data.retentionDays || ACTIVITY_LOG_RETENTION_DAYS);
      setSelectedMinute(null);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [day, userId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto || isRange) return;
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [auto, load, isRange]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (hideNoise && (log.action === "HEARTBEAT" || log.action === "PAGE_VIEW")) {
        return false;
      }
      if (actionFilter && log.action !== actionFilter) return false;
      return true;
    });
  }, [logs, hideNoise, actionFilter]);

  const minuteKey = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const groupedByMinute = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const log of filteredLogs) {
      const key = minuteKey(log.createdAt);
      if (selectedMinute && key !== selectedMinute) continue;
      const arr = map.get(key) || [];
      arr.push(log);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLogs, selectedMinute]);

  const minuteCountMap = useMemo(() => {
    const m = new Map<string, ByMinute>();
    for (const row of byMinute) m.set(row.minute, row);
    return m;
  }, [byMinute]);

  const maxMinuteCount = useMemo(
    () => byMinute.reduce((max, m) => Math.max(max, m.count), 0),
    [byMinute]
  );

  const heatHours = useMemo(() => {
    const hours: number[] = [];
    for (let h = HEAT_START_H; h < HEAT_END_H; h++) hours.push(h);
    return hours;
  }, []);

  const openDayDetail = (ymd: string, uid?: string) => {
    setDay(ymd);
    setPeriod("day");
    if (uid) setUserId(uid);
    setAuto(false);
  };

  const scrollToMinute = (minute: string) => {
    setSelectedMinute((prev) => (prev === minute ? null : minute));
    requestAnimationFrame(() => {
      document
        .getElementById(`pulse-min-${minute.replace(":", "")}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const intensityClass = (count: number) => {
    if (count <= 0) return "bg-slate-100";
    if (!maxMinuteCount) return "bg-emerald-200";
    const ratio = count / maxMinuteCount;
    if (ratio > 0.66) return "bg-emerald-700";
    if (ratio > 0.33) return "bg-emerald-500";
    return "bg-emerald-300";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Interne · non listé · toi seul · 404 pour les autres
          </p>
          <h1 className="text-2xl font-semibold text-gray-900">Pulse activité</h1>
          <p className="mt-1 text-sm text-gray-500">
            {mode === "range"
              ? `${totalDay} événement${totalDay > 1 ? "s" : ""} sur ${period} jours (fin ${day}).`
              : `${totalDay} événement${totalDay > 1 ? "s" : ""} · ${activeMinuteCount} minute${activeMinuteCount > 1 ? "s" : ""} active${activeMinuteCount > 1 ? "s" : ""} (analyse minute par minute).`}
          </p>
          <p className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            Conservé {retentionDays} jours · secret
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Période
            <select
              value={String(period)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "day") setPeriod("day");
                else setPeriod(Number(v) as PulseRangeDays);
                setAuto(false);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="day">Jour</option>
              <option value="7">7 jours</option>
              <option value="30">30 jours</option>
              <option value="365">12 mois</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {isRange ? "Jusqu’au" : "Jour"}
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Salarié
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="max-w-[220px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Tous</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.prenom} {u.nom}
                </option>
              ))}
            </select>
          </label>
          {!isRange && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Action
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="max-w-[200px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="">Toutes</option>
                  {byAction.map((a) => (
                    <option key={a.action} value={a.action}>
                      {a.action} ({a.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={hideNoise}
                  onChange={(e) => setHideNoise(e.target.checked)}
                />
                Masquer bruit navigation
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                Auto 20s
              </label>
            </>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {(byModule.length > 0 || byAction.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Par module
            </h2>
            <ul className="mt-2 space-y-1">
              {byModule.slice(0, 8).map((m) => (
                <li
                  key={m.module}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-700">{m.module}</span>
                  <span className="font-mono text-gray-500">{m.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Par type d&apos;action
            </h2>
            <ul className="mt-2 space-y-1">
              {byAction.slice(0, 10).map((a) => (
                <li key={a.action}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRange) return;
                      setActionFilter(actionFilter === a.action ? "" : a.action);
                    }}
                    className="flex w-full items-center justify-between text-sm hover:text-gray-900"
                  >
                    <span className="text-gray-700">{a.action}</span>
                    <span className="font-mono text-gray-500">{a.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {byUser.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {isRange ? "Actifs sur la période" : "Actifs aujourd'hui"}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {byUser.map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => setUserId(u.userId === userId ? "" : u.userId)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  userId === u.userId
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="font-medium">
                  {u.user
                    ? `${u.user.prenom} ${u.user.nom}`
                    : u.userId.slice(0, 8)}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    userId === u.userId ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {u.count} evt · ~{u.activeMinutes ?? "?"} min ·{" "}
                  {formatTime(u.firstAt)} → {formatTime(u.lastAt)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isRange && byMinute.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Analyse minute par minute
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {activeMinuteCount} min avec activité
                {gaps.length > 0
                  ? ` · ${gaps.length} trou${gaps.length > 1 ? "x" : ""} ≥ 5 min`
                  : ""}
                {selectedMinute ? ` · filtre ${selectedMinute}` : ""}
              </p>
            </div>
            {selectedMinute && (
              <button
                type="button"
                onClick={() => setSelectedMinute(null)}
                className="text-xs text-gray-500 underline hover:text-gray-800"
              >
                Voir toutes les minutes
              </button>
            )}
          </div>

          <div className="space-y-1">
            {heatHours.map((h) => {
              const label = `${String(h).padStart(2, "0")}h`;
              return (
                <div key={h} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 font-mono text-[10px] text-gray-400">
                    {label}
                  </span>
                  <div className="grid flex-1 grid-cols-[repeat(60,minmax(0,1fr))] gap-px">
                    {Array.from({ length: 60 }, (_, mi) => {
                      const minute = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
                      const row = minuteCountMap.get(minute);
                      const count = row?.count ?? 0;
                      const selected = selectedMinute === minute;
                      return (
                        <button
                          key={minute}
                          type="button"
                          title={
                            count
                              ? `${minute} · ${count} evt · ${row?.users ?? 0} pers.`
                              : `${minute} · inactif`
                          }
                          onClick={() => count > 0 && scrollToMinute(minute)}
                          className={`h-3.5 rounded-[1px] transition ${intensityClass(count)} ${
                            selected ? "ring-2 ring-gray-900 ring-offset-1" : ""
                          } ${count ? "cursor-pointer" : "cursor-default"}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {gaps.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Trous d&apos;inactivité (≥ 5 min)
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {gaps.slice(0, 24).map((g) => (
                  <li
                    key={`${g.from}-${g.to}`}
                    className="rounded-md bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-900"
                  >
                    {g.from} → {g.to} ({g.minutes} min)
                  </li>
                ))}
                {gaps.length > 24 && (
                  <li className="text-[11px] text-gray-400">
                    +{gaps.length - 24} autres
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {inactiveToday.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Aucune trace {isRange ? "sur la période" : "aujourd'hui"} (
            {inactiveToday.length})
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {inactiveToday
              .slice(0, 20)
              .map((u) => `${u.user.prenom} ${u.user.nom}`)
              .join(" · ")}
            {inactiveToday.length > 20 ? "…" : ""}
          </p>
        </div>
      )}

      {loading && (isRange ? byUserDay.length === 0 : logs.length === 0) ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : isRange ? (
        byUserDay.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Aucune activité sur cette période.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Jour</th>
                  <th className="px-3 py-2 font-semibold">Salarié</th>
                  <th className="px-3 py-2 font-semibold">Début → fin</th>
                  <th className="px-3 py-2 font-semibold">Evt</th>
                  <th className="px-3 py-2 font-semibold">~ min</th>
                </tr>
              </thead>
              <tbody>
                {byUserDay.map((row) => (
                  <tr
                    key={`${row.userId}-${row.day}`}
                    className="cursor-pointer border-b border-gray-50 hover:bg-slate-50"
                    onClick={() => openDayDetail(row.day, row.userId)}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {formatDayLabel(row.day)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {row.user
                        ? `${row.user.prenom} ${row.user.nom}`
                        : row.userId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {formatTimeShort(row.firstAt)} →{" "}
                      {formatTimeShort(row.lastAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">
                      {row.count}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">
                      {row.activeMinutes ?? "?"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
              Clic sur une ligne → détail minute du jour (toi seul).
            </p>
          </div>
        )
      ) : filteredLogs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Aucune activité pour ce filtre.
          <br />
          Navigue / utilise l&apos;app : pages + appels API apparaissent ici.
        </p>
      ) : (
        <div className="space-y-6">
          {groupedByMinute.map(([minute, rows]) => (
            <div key={minute} id={`pulse-min-${minute.replace(":", "")}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-gray-900 px-2 py-0.5 font-mono text-xs text-white">
                  {minute}
                </span>
                <span className="text-xs text-gray-400">
                  {rows.length} événement{rows.length > 1 ? "s" : ""}
                  {minuteCountMap.get(minute)
                    ? ` · ${minuteCountMap.get(minute)!.count} au total cette minute`
                    : ""}
                </span>
              </div>
              <ul className="space-y-2 border-l-2 border-gray-100 pl-4">
                {rows.map((log) => {
                  const meta = (log.meta || {}) as Record<string, unknown>;
                  const subject =
                    typeof meta.subject === "string" ? meta.subject : null;
                  const preview =
                    typeof meta.bodyPreview === "string"
                      ? meta.bodyPreview
                      : null;
                  return (
                    <li
                      key={log.id}
                      className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">
                          {formatTime(log.createdAt)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${actionColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
                          {log.module}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {log.user.prenom} {log.user.nom}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{log.summary}</p>
                      {log.path && log.action.startsWith("API_") && (
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                          {log.method} {log.path}
                        </p>
                      )}
                      {(subject || preview) && (
                        <div className="mt-1.5 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
                          {subject && (
                            <div>
                              <span className="font-medium">Objet :</span>{" "}
                              {subject}
                            </div>
                          )}
                          {preview && (
                            <div className="mt-0.5 line-clamp-2 opacity-80">
                              {preview}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
