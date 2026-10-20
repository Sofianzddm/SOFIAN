"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, FileText, Send } from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import { EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import {
  breakRangeMinutes,
  dayNetMinutes,
  hhmmToMinutes,
  minutesToHhmm,
  minutesToLabel,
  slotsBreakMinutes,
  slotsBreakWindow,
  splitOvertime,
} from "@/lib/rh/calculations";
import { frenchHolidayLabel, isFrenchHoliday } from "@/lib/rh/holidays";
import { useRhData } from "@/components/rh/RhDataContext";
import {
  isRhDateAllowed,
  RH_MIN_ISO_WEEK,
  RH_MIN_ISO_YEAR,
} from "@/lib/rh/constants";

type Slot = { from: string; to: string };
type DayRow = {
  id?: string;
  date: string;
  slots: Slot[];
  breakMinutes: number;
  /** Horaires de pause (créneau unique sans trou auto) */
  breakFrom?: string | null;
  breakTo?: string | null;
  totalMinutes: number;
  /** Week-end / férié : obligatoire pour saisir des heures */
  exception?: boolean;
  /** Justification HS / exception pour ce jour */
  note?: string | null;
};

/** Défaut UI si durée connue mais pas d’horaires (ex. anciennes feuilles). */
function defaultBreakWindow(breakMinutes: number): { from: string; to: string } {
  const mins = Math.max(0, breakMinutes || 60);
  const from = 12 * 60;
  return { from: minutesToHhmm(from), to: minutesToHhmm(from + mins) };
}

const FALLBACK_WEEKDAY: Slot[] = [
  { from: "09:30", to: "12:00" },
  { from: "14:00", to: "18:30" },
];
const FALLBACK_FRIDAY: Slot[] = [
  { from: "09:30", to: "12:00" },
  { from: "13:00", to: "17:30" },
];

function hm(value: string): number {
  return hhmmToMinutes(value) || 0;
}

/** Pause = trou entre créneaux ; sinon valeur manuelle / défaut. */
function effectiveBreak(slots: Slot[], breakMinutes: number): number {
  const gaps = slotsBreakMinutes(slots);
  return gaps > 0 ? gaps : Math.max(0, breakMinutes);
}

function dayMinutes(slots: Slot[], breakMinutes: number): number {
  return dayNetMinutes(slots, breakMinutes);
}

type ScheduleCfg = {
  slotsWeekday: Slot[];
  slotsFriday: Slot[];
  workdayMinutes: number;
};

type Timesheet = {
  id: string;
  status: string;
  isoWeek: number;
  isoYear?: number;
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  ot25Minutes: number;
  ot50Minutes: number;
  overtimeNote?: string | null;
  pauseNote?: string | null;
  signatureRequestedAt?: string | null;
  signedAt?: string | null;
  pdfUrl?: string | null;
  signedPdfUrl?: string | null;
  signatureName?: string | null;
  docusealSigningUrl?: string | null;
  docusealSubmissionId?: string | null;
  days: DayRow[];
};

/** Date calendaire YYYY-MM-DD (évite le décalage UTC de toISOString). */
function ymd(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Ordre ISO : lundi → dimanche. */
function isoDow(date: string): number {
  return (new Date(date + "T12:00:00").getDay() + 6) % 7;
}

function isSpecialDay(date: string): boolean {
  const dow = new Date(date + "T12:00:00").getDay();
  return dow === 0 || dow === 6 || isFrenchHoliday(date);
}

function pauseLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return minutesToLabel(minutes).replace(" h ", " h ");
}

export function TimeScreen() {
  const { me, refresh } = useRhData();
  const [refDate, setRefDate] = useState(() => ymd(new Date()));
  const [ts, setTs] = useState<Timesheet | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pauseReply, setPauseReply] = useState("");
  const [weekOtNote, setWeekOtNote] = useState("");
  const [amendDate, setAmendDate] = useState(() => ymd(new Date()));
  const [amendFrom, setAmendFrom] = useState("12:00");
  const [amendTo, setAmendTo] = useState("13:00");
  const [amendMotive, setAmendMotive] = useState("");
  const [showAmend, setShowAmend] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleCfg>({
    slotsWeekday: FALLBACK_WEEKDAY,
    slotsFriday: FALLBACK_FRIDAY,
    workdayMinutes: 7 * 60,
  });

  function defaultSlotsForDate(date: string): Slot[] {
    const dow = new Date(date + "T12:00:00").getDay();
    const base = dow === 5 ? schedule.slotsFriday : schedule.slotsWeekday;
    return base.map((s) => ({ ...s }));
  }

  function exceedsSchedule(
    date: string,
    slots: Slot[],
    breakMinutes: number
  ): boolean {
    if (dayMinutes(slots, breakMinutes) > schedule.workdayMinutes) return true;
    const dow = new Date(date + "T12:00:00").getDay();
    const daySlots = dow === 5 ? schedule.slotsFriday : schedule.slotsWeekday;
    const start = hm(
      daySlots.reduce((m, s) => (s.from < m ? s.from : m), daySlots[0]?.from || "09:30")
    );
    const end = hm(
      daySlots.reduce((m, s) => (s.to > m ? s.to : m), daySlots[0]?.to || "18:30")
    );
    return slots.some((s) => hm(s.from) < start || hm(s.to) > end);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, setRes] = await Promise.all([
        fetch(`/api/rh/timesheets/${refDate}`),
        fetch("/api/rh/settings"),
      ]);
      if (setRes.ok) {
        const s = await setRes.json();
        if (s.settings) {
          setSchedule({
            slotsWeekday: s.settings.slotsWeekday?.length
              ? s.settings.slotsWeekday
              : FALLBACK_WEEKDAY,
            slotsFriday: s.settings.slotsFriday?.length
              ? s.settings.slotsFriday
              : FALLBACK_FRIDAY,
            workdayMinutes: s.settings.workdayMinutes || 7 * 60,
          });
        }
      }
      if (!res.ok) return;
      const data = await res.json();
      const sheet = data.timesheet as Timesheet;
      setTs(sheet);
      setWeekOtNote(sheet.overtimeNote || "");
      setDays(
        (sheet.days || [])
          .map((d) => ({
            ...d,
            date: ymd(d.date as string | Date),
            slots: (Array.isArray(d.slots) ? d.slots : []) as Slot[],
            breakFrom: d.breakFrom || null,
            breakTo: d.breakTo || null,
            exception: !!d.exception,
            note: d.note || "",
          }))
          .sort((a, b) => isoDow(a.date) - isoDow(b.date))
      );
    } finally {
      setLoading(false);
    }
  }, [refDate]);

  useEffect(() => {
    void load();
  }, [load]);

  // Soft-launch : ne jamais rester sur une semaine < S36 2026
  useEffect(() => {
    if (!isRhDateAllowed(refDate)) {
      // Lundi de la semaine ISO 36 · 2026
      setRefDate("2026-08-31");
    }
  }, [refDate]);

  const editable = ts?.status === "DRAFT" || ts?.status === "PAUSED";
  const weeklyHours = me?.employee.weeklyHours || 35;

  const live = useMemo(() => {
    let totalMinutes = 0;
    const overDates = new Set<string>();
    for (const d of days) {
      const dow = new Date(d.date + "T12:00:00").getDay();
      const weekendOrHoliday =
        dow === 0 || dow === 6 || isFrenchHoliday(d.date);
      const slots = d.slots.length
        ? d.slots
        : weekendOrHoliday
          ? []
          : defaultSlotsForDate(d.date);
      if (!slots.length) continue;
      const rangeMin =
        d.breakFrom && d.breakTo
          ? breakRangeMinutes(d.breakFrom, d.breakTo)
          : 0;
      const breakMin = d.slots.length
        ? effectiveBreak(slots, rangeMin > 0 ? rangeMin : d.breakMinutes ?? 0)
        : 0;
      const mins = dayMinutes(slots, breakMin);
      totalMinutes += mins;
      if (weekendOrHoliday || exceedsSchedule(d.date, slots, breakMin)) {
        overDates.add(d.date);
      }
    }
    const { at25, at50 } = splitOvertime(totalMinutes, weeklyHours * 60);
    const hasOt = at25 + at50 > 0 || overDates.size > 0;
    const missingOtNotes = [...overDates].filter((date) => {
      const row = days.find((d) => d.date === date);
      return !row?.note?.trim();
    });
    // HS purement hebdo (pas de jour « hors plage ») → motif semaine requis
    const needsWeekOtNote =
      at25 + at50 > 0 &&
      overDates.size === 0 &&
      !weekOtNote.trim();
    return {
      totalMinutes,
      at25,
      at50,
      hasOt,
      overDates,
      missingOtNotes,
      needsWeekOtNote,
    };
  }, [days, weeklyHours, schedule.workdayMinutes, weekOtNote]);

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
          days: days.map((d) => {
            const holiday = isFrenchHoliday(d.date);
            const weekend = (() => {
              const dow = new Date(d.date + "T12:00:00").getDay();
              return dow === 0 || dow === 6;
            })();
            const special = holiday || weekend;
            // Week-end / férié : uniquement si l'utilisateur a saisi des créneaux
            if (special) {
              const exception = !!d.exception;
              const slots = exception
                ? (d.slots || []).filter((s) => s.from && s.to)
                : [];
              const auto = slotsBreakWindow(slots);
              const rangeMin =
                d.breakFrom && d.breakTo
                  ? breakRangeMinutes(d.breakFrom, d.breakTo)
                  : 0;
              return {
                date: d.date,
                slots,
                breakMinutes: slots.length
                  ? effectiveBreak(
                      slots,
                      rangeMin > 0 ? rangeMin : d.breakMinutes
                    )
                  : 0,
                breakFrom: slots.length
                  ? auto?.from || d.breakFrom || null
                  : null,
                breakTo: slots.length ? auto?.to || d.breakTo || null : null,
                exception,
                note: d.note || null,
              };
            }
            const slots = d.slots.length
              ? d.slots
              : defaultSlotsForDate(d.date);
            const auto = slotsBreakWindow(slots);
            const rangeMin =
              d.breakFrom && d.breakTo
                ? breakRangeMinutes(d.breakFrom, d.breakTo)
                : 0;
            return {
              date: d.date,
              slots,
              breakMinutes: effectiveBreak(
                slots,
                rangeMin > 0 ? rangeMin : d.breakMinutes
              ),
              breakFrom: auto?.from || d.breakFrom || null,
              breakTo: auto?.to || d.breakTo || null,
              exception: false,
              note: d.note || null,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTs(data.timesheet);
      setMsg("Enregistré");
      toast.success("Semaine enregistrée");
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Erreur";
      setMsg(err);
      toast.error(err);
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
        body: JSON.stringify({
          action: "submit",
          overtimeNote: weekOtNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMsg("Semaine soumise pour validation");
      toast.success("Semaine envoyée pour validation");
      await load();
      await refresh();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Erreur";
      setMsg(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function applyDefaultWeek() {
    setDays((prev) =>
      prev.map((d) => {
        const dow = new Date(d.date + "T12:00:00").getDay();
        if (dow === 0 || dow === 6 || isFrenchHoliday(d.date)) {
          return {
            ...d,
            slots: [],
            breakMinutes: 0,
            breakFrom: null,
            breakTo: null,
            totalMinutes: 0,
            exception: false,
          };
        }
        const slots = defaultSlotsForDate(d.date);
        const auto = slotsBreakWindow(slots);
        return {
          ...d,
          slots,
          breakMinutes: effectiveBreak(slots, 0),
          breakFrom: auto?.from || null,
          breakTo: auto?.to || null,
          totalMinutes: dayMinutes(slots, 0),
          exception: false,
        };
      })
    );
  }

  const pdfHref =
    ts?.signedPdfUrl ||
    ts?.pdfUrl ||
    (ts && ts.status !== "DRAFT"
      ? `/api/rh/timesheets/${refDate}/pdf`
      : null);

  function renderDayCard(d: DayRow, special: boolean) {
    const holiday = frenchHolidayLabel(d.date);
    const exceptionOn = special && !!d.exception;
    const canEditSlots = editable && (!special || exceptionOn);
    const label = new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
    });
    const slots = d.slots.length
      ? d.slots
      : special
        ? exceptionOn
          ? [{ from: "", to: "" }]
          : []
        : defaultSlotsForDate(d.date);
    const filledSlots = slots.filter((s) => s.from && s.to);
    const autoWindow = filledSlots.length
      ? slotsBreakWindow(filledSlots)
      : null;
    const autoBreak = filledSlots.length ? slotsBreakMinutes(filledSlots) : 0;
    const manualWindow =
      d.breakFrom && d.breakTo
        ? { from: d.breakFrom, to: d.breakTo }
        : defaultBreakWindow(d.breakMinutes || 60);
    const manualBreak = breakRangeMinutes(manualWindow.from, manualWindow.to);
    const breakMin = filledSlots.length
      ? effectiveBreak(
          filledSlots,
          autoBreak > 0 ? autoBreak : manualBreak || d.breakMinutes || 0
        )
      : 0;
    const mins = filledSlots.length ? dayMinutes(filledSlots, breakMin) : 0;
    const overDay =
      special && filledSlots.length > 0
        ? true
        : filledSlots.length > 0 &&
          exceedsSchedule(d.date, filledSlots, breakMin);

    function patchSlots(next: Slot[]) {
      const clean = next.filter((s) => s.from || s.to);
      const filled = clean.filter((s) => s.from && s.to);
      const gap = slotsBreakWindow(filled);
      const rangeMin =
        d.breakFrom && d.breakTo
          ? breakRangeMinutes(d.breakFrom, d.breakTo)
          : 0;
      updateDay(d.date, {
        slots: clean,
        breakMinutes: effectiveBreak(
          filled,
          gap ? slotsBreakMinutes(filled) : rangeMin || d.breakMinutes || 0
        ),
        breakFrom: gap?.from || d.breakFrom || null,
        breakTo: gap?.to || d.breakTo || null,
      });
    }

    function patchBreak(from: string, to: string) {
      const range = breakRangeMinutes(from, to);
      updateDay(d.date, {
        breakFrom: from || null,
        breakTo: to || null,
        breakMinutes: range,
      });
    }

    function baseSlots(): Slot[] {
      if (d.slots.length) return [...d.slots];
      if (special) return [{ from: "", to: "" }];
      return defaultSlotsForDate(d.date);
    }

    return (
      <RhCard
        key={d.date}
        className="p-3.5"
        style={
          overDay
            ? { borderColor: "rgba(240,194,78,.45)" }
            : special && exceptionOn
              ? { borderColor: "rgba(240,194,78,.35)" }
              : undefined
        }
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <div
            className="text-[13px] font-semibold capitalize"
            style={{ color: EMP_COLORS.text }}
          >
            {label}
          </div>
          <div
            className="rh-mono shrink-0 text-[11px]"
            style={{
              color: overDay ? EMP_COLORS.warning : EMP_COLORS.accent,
            }}
          >
            {minutesToLabel(mins)}
            {!special ? ` / ${minutesToLabel(schedule.workdayMinutes)}` : ""}
          </div>
        </div>

        {holiday ? (
          <div
            className="rh-mono mb-2 text-[11px]"
            style={{ color: "#C4B5FD" }}
          >
            Férié · {holiday}
          </div>
        ) : special ? (
          <div
            className="rh-mono mb-2 text-[11px]"
            style={{ color: EMP_COLORS.warning }}
          >
            Week-end
          </div>
        ) : null}

        {special ? (
          <label
            className="mb-3 flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-[12.5px] font-medium"
            style={{
              color: EMP_COLORS.body,
              background: exceptionOn
                ? "rgba(240,194,78,.1)"
                : "rgba(255,255,255,.03)",
              border: `1px solid ${
                exceptionOn ? "rgba(240,194,78,.35)" : "#1B212A"
              }`,
            }}
          >
            <input
              type="checkbox"
              disabled={!editable}
              checked={!!d.exception}
              onChange={(e) => {
                const on = e.target.checked;
                const defBreak = defaultBreakWindow(60);
                updateDay(d.date, {
                  exception: on,
                  slots: on
                    ? d.slots.length
                      ? d.slots
                      : [{ from: "", to: "" }]
                    : [],
                  breakMinutes: on ? 60 : 0,
                  breakFrom: on ? defBreak.from : null,
                  breakTo: on ? defBreak.to : null,
                  totalMinutes: 0,
                });
              }}
            />
            Exception — je travaille ce jour
          </label>
        ) : null}

        {special && !exceptionOn ? (
          <p
            className="m-0 text-[11.5px] leading-[1.4]"
            style={{ color: EMP_COLORS.dim }}
          >
            Aucune heure tant que Exception n’est pas cochée.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(slots.length ? slots : [{ from: "", to: "" }]).map((s, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                {(slots.length > 1 || i > 0) && (
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="rh-mono text-[10px] uppercase tracking-[0.04em]"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      Créneau {i + 1}
                    </span>
                    {canEditSlots && slots.length > 1 ? (
                      <button
                        type="button"
                        className="border-0 bg-transparent cursor-pointer p-0 text-[11px]"
                        style={{ color: EMP_COLORS.dim }}
                        onClick={() => {
                          const base = baseSlots();
                          base.splice(i, 1);
                          patchSlots(base.length ? base : [{ from: "", to: "" }]);
                        }}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
                )}
                <label className="flex flex-col gap-1">
                  <EmpLabel>Début</EmpLabel>
                  <input
                    type="time"
                    className="rh-input rh-mono w-full px-2.5 py-2 text-[13px]"
                    disabled={!canEditSlots}
                    value={s.from}
                    onChange={(e) => {
                      const base = baseSlots();
                      base[i] = {
                        ...(base[i] || { from: "", to: "" }),
                        from: e.target.value,
                      };
                      patchSlots(base);
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <EmpLabel>Fin</EmpLabel>
                  <input
                    type="time"
                    className="rh-input rh-mono w-full px-2.5 py-2 text-[13px]"
                    disabled={!canEditSlots}
                    value={s.to}
                    onChange={(e) => {
                      const base = baseSlots();
                      base[i] = {
                        ...(base[i] || { from: "", to: "" }),
                        to: e.target.value,
                      };
                      patchSlots(base);
                    }}
                  />
                </label>
              </div>
            ))}

            {canEditSlots && (slots.length ? slots : []).length < 3 ? (
              <button
                type="button"
                className="self-start border-0 bg-transparent cursor-pointer p-0 text-[12px] font-medium"
                style={{ color: EMP_COLORS.secondary }}
                onClick={() => {
                  const base = baseSlots();
                  patchSlots([...base, { from: "", to: "" }]);
                }}
              >
                + Ajouter un créneau
              </button>
            ) : null}

            {autoBreak > 0 && autoWindow ? (
              <div
                className="mt-0.5 flex flex-col gap-0.5 rounded-[10px] px-2.5 py-2"
                style={{
                  color: EMP_COLORS.dim,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid #1B212A",
                }}
              >
                <span className="text-[11px]">Pause (auto)</span>
                <span
                  className="rh-mono text-[13px] leading-tight"
                  style={{ color: EMP_COLORS.body }}
                >
                  {autoWindow.from} → {autoWindow.to}
                </span>
                <span className="rh-mono text-[11px]">
                  {pauseLabel(autoBreak)}
                </span>
              </div>
            ) : (
              <div className="mt-0.5 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <EmpLabel>Pause</EmpLabel>
                  {manualBreak > 0 ? (
                    <span
                      className="rh-mono text-[11px]"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      {pauseLabel(manualBreak)}
                    </span>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1">
                  <EmpLabel>Début</EmpLabel>
                  <input
                    type="time"
                    className="rh-input rh-mono w-full px-2.5 py-2 text-[13px]"
                    disabled={!canEditSlots}
                    value={manualWindow.from}
                    onChange={(e) =>
                      patchBreak(e.target.value, manualWindow.to)
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <EmpLabel>Fin</EmpLabel>
                  <input
                    type="time"
                    className="rh-input rh-mono w-full px-2.5 py-2 text-[13px]"
                    disabled={!canEditSlots}
                    value={manualWindow.to}
                    onChange={(e) =>
                      patchBreak(manualWindow.from, e.target.value)
                    }
                  />
                </label>
              </div>
            )}

            {overDay ? (
              <label className="mt-2 flex flex-col gap-1">
                <EmpLabel>Justification HS (obligatoire)</EmpLabel>
                <input
                  className="rh-input text-[12px]"
                  disabled={!canEditSlots}
                  value={d.note || ""}
                  onChange={(e) =>
                    updateDay(d.date, { note: e.target.value })
                  }
                  placeholder="Motif (client, event, deadline…)"
                  style={
                    !d.note?.trim()
                      ? { borderColor: "rgba(240,194,78,.55)" }
                      : undefined
                  }
                />
              </label>
            ) : null}
          </div>
        )}
      </RhCard>
    );
  }

  const canGoPrev = isRhDateAllowed(addDays(refDate, -7));

  async function replyPause() {
    if (!ts || !pauseReply.trim()) {
      toast.error("Écris une réponse");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/rh/timesheets/${refDate}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", reply: pauseReply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast.success("Réponse envoyée — feuille resoumise");
      setPauseReply("");
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function sendAmend() {
    if (!amendMotive.trim()) {
      toast.error("Indique un motif");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rh/schedule-amend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: amendDate,
          fromBreak: amendFrom,
          toBreak: amendTo,
          motive: amendMotive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast.success(`Demande ${data.request?.reference || ""} envoyée`);
      setAmendMotive("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rh-screen">
      <div>
        <h1
          className="m-0 text-[26px] font-semibold tracking-[-0.03em]"
          style={{ color: EMP_COLORS.text }}
        >
          Mon temps
        </h1>
        <p
          className="m-0 mt-2 text-[14px] leading-[1.5] max-w-[560px]"
          style={{ color: EMP_COLORS.muted }}
        >
          1 · Remplir la semaine type · 2 · Ajuster si besoin · 3 · Envoyer.
        </p>
      </div>

      <div data-tour="time-toolbar" className="flex flex-wrap items-center gap-2">
        <RhButton
          data-tour="time-prev"
          variant="secondary"
          disabled={!canGoPrev}
          onClick={() => {
            const prev = addDays(refDate, -7);
            if (isRhDateAllowed(prev)) setRefDate(prev);
          }}
        >
          <ChevronLeft size={14} />
        </RhButton>
        <span
          data-tour="time-week"
          className="text-[13.5px] font-medium"
          style={{ color: EMP_COLORS.text }}
        >
          {ts
            ? `Semaine ${ts.isoWeek}`
            : "…"}
          <span
            className="ml-1.5 text-[11px] font-normal"
            style={{ color: EMP_COLORS.dim }}
          >
            (à partir de S{RH_MIN_ISO_WEEK} {RH_MIN_ISO_YEAR})
          </span>
        </span>
        <RhButton
          data-tour="time-next"
          variant="secondary"
          onClick={() => setRefDate(addDays(refDate, 7))}
        >
          <ChevronRight size={14} />
        </RhButton>
        <span
          data-tour="time-status"
          className="rh-badge"
          style={{ background: EMP_COLORS.chip, color: EMP_COLORS.secondary }}
        >
          {ts?.status || "—"}
        </span>
        <span className="flex-1" />
        {editable ? (
          <RhButton
            data-tour="time-default"
            variant="secondary"
            disabled={busy}
            onClick={() => void applyDefaultWeek()}
          >
            1 · Semaine type
          </RhButton>
        ) : null}
        <RhButton
          data-tour="time-send"
          disabled={
            !editable ||
            busy ||
            (live.hasOt && live.missingOtNotes.length > 0) ||
            live.needsWeekOtNote
          }
          onClick={() => void submit()}
        >
          <Send size={13} />
          3 · Envoyer
        </RhButton>
        {pdfHref ? (
          <RhButton
            data-tour="time-pdf"
            variant="secondary"
            onClick={() => window.open(pdfHref, "_blank", "noopener")}
          >
            <FileText size={13} />
            PDF
          </RhButton>
        ) : null}
        {ts?.status === "APPROVED" &&
        ts.signatureRequestedAt &&
        !ts.signedAt &&
        ts.docusealSigningUrl ? (
          <RhButton
            data-tour="time-sign"
            disabled={busy}
            onClick={() =>
              window.open(ts.docusealSigningUrl!, "_blank", "noopener")
            }
          >
            Signer sur DocuSeal
          </RhButton>
        ) : null}
        {ts?.status === "SIGNED" ? (
          <span
            className="rh-badge"
            style={{
              background: "rgba(70,214,192,.13)",
              color: EMP_COLORS.success,
            }}
          >
            Signée
          </span>
        ) : null}
        {ts?.status === "APPROVED" && !ts.signatureRequestedAt ? (
          <span
            className="text-[12.5px]"
            style={{ color: EMP_COLORS.dim }}
          >
            Validée — en attente d’envoi en signature
          </span>
        ) : null}
      </div>

      {ts?.status === "APPROVED" &&
      ts.signatureRequestedAt &&
      !ts.signedAt ? (
        <div
          className="rounded-[13px] px-4 py-3 text-[13px] leading-[1.45] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          style={{
            background: "rgba(229,242,181,.1)",
            border: `1px solid ${EMP_COLORS.accent}`,
            color: EMP_COLORS.text,
          }}
        >
          <span>
            Ta feuille S{ts.isoWeek} est envoyée en signature DocuSeal.
          </span>
          {ts.docusealSigningUrl ? (
            <RhButton
              disabled={busy}
              onClick={() =>
                window.open(ts.docusealSigningUrl!, "_blank", "noopener")
              }
            >
              Ouvrir DocuSeal
            </RhButton>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.accent }}>{msg}</p>
      ) : null}

      {live.hasOt && editable ? (
        <div
          className="rounded-[13px] px-4 py-3 text-[12.5px] leading-[1.45]"
          style={{
            background: "rgba(240,194,78,.08)",
            border: "1px solid rgba(240,194,78,.35)",
            color: EMP_COLORS.body,
          }}
        >
          Horaires dépassés
          {live.overDates.size > 0
            ? ` (${live.overDates.size} jour${live.overDates.size > 1 ? "s" : ""})`
            : ""}
          {live.at25 + live.at50 > 0
            ? ` · ${minutesToLabel(live.at25 + live.at50)} HS`
            : ""}
          . Justifie <strong>chaque</strong> jour concerné avant envoi
          {live.missingOtNotes.length
            ? ` (${live.missingOtNotes.length} manquante${live.missingOtNotes.length > 1 ? "s" : ""})`
            : ""}
          .
        </div>
      ) : null}

      {ts?.pauseNote ? (
        <div
          className="rounded-[13px] p-4 text-[12.5px] flex flex-col gap-2"
          style={{ background: "rgba(242,96,78,.06)", border: "1px solid rgba(242,96,78,.35)", color: EMP_COLORS.body }}
        >
          <div>En pause RH : {ts.pauseNote}</div>
          {ts.status === "PAUSED" ? (
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[200px]">
                <EmpLabel>Ta réponse</EmpLabel>
                <input
                  className="rh-input"
                  value={pauseReply}
                  onChange={(e) => setPauseReply(e.target.value)}
                  placeholder="Précisions pour la validation…"
                />
              </label>
              <RhButton disabled={busy} onClick={() => void replyPause()}>
                Répondre
              </RhButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[12px]" style={{ color: EMP_COLORS.muted }}>Chargement…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <span className="text-[12.5px] font-medium" style={{ color: EMP_COLORS.dim }}>
              2 · Ajuste les créneaux si besoin
            </span>
            <button
              type="button"
              className="border-0 bg-transparent cursor-pointer text-[12.5px] font-medium"
              style={{ color: EMP_COLORS.dim }}
              onClick={() => void save()}
              disabled={!editable || busy}
            >
              Enregistrer sans envoyer
            </button>
          </div>

          <div
            className="-mx-1 overflow-x-auto px-1 pb-1"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div
              className="grid gap-2.5"
              style={{
                gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
                minWidth: 860,
              }}
            >
              {days
                .filter((d) => isoDow(d.date) < 5)
                .map((d) => renderDayCard(d, isSpecialDay(d.date)))}
            </div>
          </div>

          <div className="mt-4">
            <div
              className="mb-2 text-[12.5px] font-medium"
              style={{ color: EMP_COLORS.dim }}
            >
              Week-end — coche Exception pour saisir
            </div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
            >
              {days
                .filter((d) => isoDow(d.date) >= 5)
                .map((d) => renderDayCard(d, true))}
            </div>
          </div>

          <RhCard className="mt-3 p-4">
            <RhCardHead title="Heures supplémentaires" />
            <div className="flex flex-wrap gap-6 p-4">
              <div>
                <EmpLabel>Total</EmpLabel>
                <div className="rh-mono text-[22px]" style={{ color: EMP_COLORS.text }}>
                  {minutesToLabel(live.totalMinutes)}
                </div>
              </div>
              <div>
                <EmpLabel>25 %</EmpLabel>
                <div className="rh-mono text-[18px]" style={{ color: EMP_COLORS.warning }}>
                  {minutesToLabel(live.at25)}
                </div>
              </div>
              <div>
                <EmpLabel>50 %</EmpLabel>
                <div className="rh-mono text-[18px]" style={{ color: EMP_COLORS.orange }}>
                  {minutesToLabel(live.at50)}
                </div>
              </div>
              <p
                className="m-0 max-w-[320px] self-center text-[12.5px] leading-[1.45]"
                style={{ color: EMP_COLORS.dim }}
              >
                Contrat {weeklyHours} h · chaque jour en dépassement a sa propre
                justification sur la carte du jour.
              </p>
            </div>
            {editable && live.at25 + live.at50 > 0 ? (
              <label className="flex flex-col gap-1 px-4 pb-4">
                <EmpLabel>
                  Motif HS semaine
                  {live.overDates.size === 0 ? " (obligatoire)" : " (optionnel)"}
                </EmpLabel>
                <input
                  className="rh-input text-[12.5px]"
                  value={weekOtNote}
                  onChange={(e) => setWeekOtNote(e.target.value)}
                  placeholder="Ex. rush client, event, deadline…"
                  style={
                    live.needsWeekOtNote
                      ? { borderColor: "rgba(240,194,78,.55)" }
                      : undefined
                  }
                />
              </label>
            ) : null}
          </RhCard>

          <button
            type="button"
            className="border-0 bg-transparent cursor-pointer self-start text-[12.5px] font-medium mt-2"
            style={{ color: EMP_COLORS.dim }}
            onClick={() => setShowAmend((v) => !v)}
          >
            {showAmend
              ? "Masquer aménagement horaire"
              : "Décaler une pause ? (aménagement)"}
          </button>
          {showAmend ? (
            <RhCard className="mt-2 p-4">
              <RhCardHead title="Aménagement horaire" />
              <div className="p-4 flex flex-wrap gap-3 items-end">
                <label className="flex flex-col gap-1">
                  <EmpLabel>Date</EmpLabel>
                  <input
                    type="date"
                    className="rh-input"
                    value={amendDate}
                    onChange={(e) => setAmendDate(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <EmpLabel>Pause de</EmpLabel>
                  <input
                    type="time"
                    className="rh-input rh-mono"
                    value={amendFrom}
                    onChange={(e) => setAmendFrom(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <EmpLabel>à</EmpLabel>
                  <input
                    type="time"
                    className="rh-input rh-mono"
                    value={amendTo}
                    onChange={(e) => setAmendTo(e.target.value)}
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[200px]">
                  <EmpLabel>Motif</EmpLabel>
                  <input
                    className="rh-input"
                    value={amendMotive}
                    onChange={(e) => setAmendMotive(e.target.value)}
                    placeholder="Ex. décalage pause pour client…"
                  />
                </label>
                <RhButton disabled={busy} onClick={() => void sendAmend()}>
                  Envoyer pour validation
                </RhButton>
              </div>
            </RhCard>
          ) : null}
        </>
      )}
    </div>
  );
}
