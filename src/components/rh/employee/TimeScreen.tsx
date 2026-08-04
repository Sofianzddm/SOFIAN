"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import { EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { minutesToLabel } from "@/lib/rh/calculations";
import { useRhData } from "@/components/rh/RhDataContext";

type Slot = { from: string; to: string };
type DayRow = {
  id?: string;
  date: string;
  slots: Slot[];
  breakMinutes: number;
  totalMinutes: number;
};

type Timesheet = {
  id: string;
  status: string;
  isoWeek: number;
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  ot25Minutes: number;
  ot50Minutes: number;
  overtimeNote?: string | null;
  pauseNote?: string | null;
  days: DayRow[];
};

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function TimeScreen() {
  const { me, refresh } = useRhData();
  const [refDate, setRefDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ts, setTs] = useState<Timesheet | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [otNote, setOtNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rh/timesheets/${refDate}`);
      if (!res.ok) return;
      const data = await res.json();
      const sheet = data.timesheet as Timesheet;
      setTs(sheet);
      setDays(
        (sheet.days || []).map((d) => ({
          ...d,
          date: typeof d.date === "string" ? d.date.slice(0, 10) : new Date(d.date).toISOString().slice(0, 10),
          slots: (Array.isArray(d.slots) ? d.slots : []) as Slot[],
        }))
      );
      setOtNote(sheet.overtimeNote || "");
    } finally {
      setLoading(false);
    }
  }, [refDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = ts?.status === "DRAFT" || ts?.status === "PAUSED";
  const hasOt = (ts?.ot25Minutes || 0) + (ts?.ot50Minutes || 0) > 0;

  const weekdayDays = useMemo(
    () => days.filter((d) => {
      const dow = new Date(d.date + "T12:00:00").getDay();
      return dow !== 0 && dow !== 6;
    }),
    [days]
  );

  function updateDay(date: string, patch: Partial<DayRow>) {
    setDays((prev) =>
      prev.map((d) => (d.date === date ? { ...d, ...patch } : d))
    );
  }

  async function save() {
    if (!ts || !editable) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rh/timesheets/${refDate}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: days.map((d) => ({
            date: d.date,
            slots: d.slots.length ? d.slots : [{ from: "09:00", to: "12:30" }, { from: "13:30", to: "18:00" }],
            breakMinutes: d.breakMinutes,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTs(data.timesheet);
      setMsg("Enregistré");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!ts) return;
    setBusy(true);
    setMsg(null);
    try {
      await save();
      const res = await fetch(`/api/rh/timesheets/${refDate}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", overtimeNote: otNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMsg("Semaine soumise au manager");
      await load();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function applyDefaultWeek() {
    setDays((prev) =>
      prev.map((d) => {
        const dow = new Date(d.date + "T12:00:00").getDay();
        if (dow === 0 || dow === 6) {
          return { ...d, slots: [], breakMinutes: 0 };
        }
        return {
          ...d,
          slots: [
            { from: "09:00", to: "12:30" },
            { from: "13:30", to: "18:00" },
          ],
          breakMinutes: 60,
        };
      })
    );
  }

  return (
    <div className="rh-screen">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <RhButton
          variant="secondary"
          onClick={() => setRefDate(addDays(refDate, -7))}
        >
          <ChevronLeft size={14} />
        </RhButton>
        <RhButton variant="secondary" onClick={() => setRefDate(new Date().toISOString().slice(0, 10))}>
          Aujourd&apos;hui
        </RhButton>
        <RhButton
          variant="secondary"
          onClick={() => setRefDate(addDays(refDate, 7))}
        >
          <ChevronRight size={14} />
        </RhButton>
        <span className="rh-mono text-[12px]" style={{ color: EMP_COLORS.text }}>
          {ts
            ? `S${ts.isoWeek} · ${new Date(ts.weekStart).toLocaleDateString("fr-FR")} → ${new Date(ts.weekEnd).toLocaleDateString("fr-FR")}`
            : "…"}
        </span>
        <span className="rh-badge" style={{ background: EMP_COLORS.chip, color: EMP_COLORS.secondary }}>
          {ts?.status || "—"}
        </span>
        <span className="flex-1" />
        <RhButton variant="secondary" disabled={!editable || busy} onClick={() => void applyDefaultWeek()}>
          Semaine type 35h
        </RhButton>
        <RhButton variant="secondary" disabled={!editable || busy} onClick={() => void save()}>
          Enregistrer
        </RhButton>
        <RhButton
          disabled={!editable || busy || (hasOt && !otNote.trim())}
          onClick={() => void submit()}
        >
          <Send size={13} />
          Soumettre
        </RhButton>
      </div>

      {msg ? (
        <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.accent }}>{msg}</p>
      ) : null}

      {ts?.pauseNote ? (
        <div
          className="rounded-[13px] p-4 text-[12.5px]"
          style={{ background: "rgba(242,96,78,.06)", border: "1px solid rgba(242,96,78,.35)", color: EMP_COLORS.body }}
        >
          En pause RH : {ts.pauseNote}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[12px]" style={{ color: EMP_COLORS.muted }}>Chargement…</div>
      ) : (
        <>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
            {weekdayDays.map((d) => {
              const label = new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
              });
              const slots = d.slots.length
                ? d.slots
                : [{ from: "09:00", to: "12:30" }, { from: "13:30", to: "18:00" }];
              return (
                <RhCard key={d.date} className="p-3">
                  <div className="text-[12.5px] font-semibold mb-2" style={{ color: EMP_COLORS.text }}>
                    {label}
                  </div>
                  <div className="rh-mono text-[11px] mb-2" style={{ color: EMP_COLORS.accent }}>
                    {minutesToLabel(d.totalMinutes || 0)} / 7 h 00
                  </div>
                  {slots.map((s, i) => (
                    <div key={i} className="flex items-center gap-1 mb-1.5">
                      <input
                        type="time"
                        className="rh-input rh-mono text-[11px] px-1 py-1"
                        disabled={!editable}
                        value={s.from}
                        onChange={(e) => {
                          const next = [...slots];
                          next[i] = { ...next[i], from: e.target.value };
                          updateDay(d.date, { slots: next });
                        }}
                      />
                      <span className="rh-mono text-[10px]" style={{ color: EMP_COLORS.dim }}>→</span>
                      <input
                        type="time"
                        className="rh-input rh-mono text-[11px] px-1 py-1"
                        disabled={!editable}
                        value={s.to}
                        onChange={(e) => {
                          const next = [...slots];
                          next[i] = { ...next[i], to: e.target.value };
                          updateDay(d.date, { slots: next });
                        }}
                      />
                    </div>
                  ))}
                  <label className="flex flex-col gap-1 mt-2">
                    <EmpLabel>Pause (min)</EmpLabel>
                    <input
                      type="number"
                      className="rh-input rh-mono"
                      disabled={!editable}
                      value={d.breakMinutes}
                      onChange={(e) =>
                        updateDay(d.date, { breakMinutes: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                </RhCard>
              );
            })}
          </div>

          <RhCard className="mt-3 p-4">
            <RhCardHead title="Heures supplémentaires" />
            <div className="p-4 flex flex-wrap gap-4 items-end">
              <div>
                <EmpLabel>Total</EmpLabel>
                <div className="rh-mono text-[22px]" style={{ color: EMP_COLORS.text }}>
                  {minutesToLabel(ts?.totalMinutes || 0)}
                </div>
              </div>
              <div>
                <EmpLabel>25 %</EmpLabel>
                <div className="rh-mono text-[18px]" style={{ color: EMP_COLORS.warning }}>
                  {minutesToLabel(ts?.ot25Minutes || 0)}
                </div>
              </div>
              <div>
                <EmpLabel>50 %</EmpLabel>
                <div className="rh-mono text-[18px]" style={{ color: EMP_COLORS.orange }}>
                  {minutesToLabel(ts?.ot50Minutes || 0)}
                </div>
              </div>
              <label className="flex-1 min-w-[220px] flex flex-col gap-1">
                <EmpLabel>Motif HS {hasOt ? "(obligatoire)" : ""}</EmpLabel>
                <input
                  className="rh-input"
                  disabled={!editable}
                  value={otNote}
                  onChange={(e) => setOtNote(e.target.value)}
                  placeholder={`Contrat ${me?.employee.weeklyHours || 35} h`}
                />
              </label>
            </div>
          </RhCard>
        </>
      )}
    </div>
  );
}
