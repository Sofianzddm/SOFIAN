"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, FileText, Send } from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import { EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { minutesToLabel, splitOvertime } from "@/lib/rh/calculations";
import { frenchHolidayLabel, isFrenchHoliday } from "@/lib/rh/holidays";
import { useRhData } from "@/components/rh/RhDataContext";

type Slot = { from: string; to: string };
type DayRow = {
  id?: string;
  date: string;
  slots: Slot[];
  breakMinutes: number;
  totalMinutes: number;
};

const FALLBACK_WEEKDAY: Slot[] = [
  { from: "09:30", to: "12:00" },
  { from: "14:00", to: "18:30" },
];
const FALLBACK_FRIDAY: Slot[] = [
  { from: "09:30", to: "12:00" },
  { from: "13:00", to: "17:30" },
];

function hm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

function dayMinutes(slots: Slot[], breakMinutes: number): number {
  let total = 0;
  for (const s of slots) {
    total += Math.max(0, hm(s.to) - hm(s.from));
  }
  return Math.max(0, total - breakMinutes);
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
  const [pauseReply, setPauseReply] = useState("");
  const [amendDate, setAmendDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [amendFrom, setAmendFrom] = useState("12:00");
  const [amendTo, setAmendTo] = useState("13:00");
  const [amendMotive, setAmendMotive] = useState("");
  const [showWeekend, setShowWeekend] = useState(false);
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
      const breakMin = d.slots.length ? d.breakMinutes ?? 0 : 0;
      const mins = dayMinutes(slots, breakMin);
      totalMinutes += mins;
      if (weekendOrHoliday || exceedsSchedule(d.date, slots, breakMin)) {
        overDates.add(d.date);
      }
    }
    const { at25, at50 } = splitOvertime(totalMinutes, weeklyHours * 60);
    const hasOt = at25 + at50 > 0 || overDates.size > 0;
    return { totalMinutes, at25, at50, hasOt, overDates };
  }, [days, weeklyHours]);

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
              const slots = (d.slots || []).filter((s) => s.from && s.to);
              return {
                date: d.date,
                slots,
                breakMinutes: slots.length ? d.breakMinutes : 0,
              };
            }
            return {
              date: d.date,
              slots: d.slots.length
                ? d.slots
                : defaultSlotsForDate(d.date),
              breakMinutes: d.breakMinutes,
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
        body: JSON.stringify({ action: "submit", overtimeNote: otNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMsg("Semaine soumise au manager");
      toast.success("Semaine envoyée à ton manager");
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
          return { ...d, slots: [], breakMinutes: 0, totalMinutes: 0 };
        }
        return {
          ...d,
          slots: defaultSlotsForDate(d.date),
          breakMinutes: 0,
          totalMinutes: schedule.workdayMinutes,
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
          onClick={() => setRefDate(addDays(refDate, -7))}
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
          disabled={!editable || busy || (live.hasOt && !otNote.trim())}
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
            ? ` (${live.overDates.size} jour${live.overDates.size > 1 ? "s" : ""} > 7 h)`
            : ""}
          {live.at25 + live.at50 > 0
            ? ` · ${minutesToLabel(live.at25 + live.at50)} HS`
            : ""}
          . Une justification est obligatoire avant envoi.
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
                  placeholder="Précisions pour le manager…"
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
              onClick={() => setShowWeekend((v) => !v)}
            >
              {showWeekend ? "Masquer week-end / fériés" : "Week-end / férié ?"}
            </button>
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
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
            {days.filter((d) => {
              if (showWeekend) return true;
              const dow = new Date(d.date + "T12:00:00").getDay();
              return dow !== 0 && dow !== 6 && !isFrenchHoliday(d.date);
            }).map((d) => {
              const holiday = frenchHolidayLabel(d.date);
              const dow = new Date(d.date + "T12:00:00").getDay();
              const special = !!holiday || dow === 0 || dow === 6;
              const label = new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
              });
              const slots = d.slots.length
                ? d.slots
                : special
                  ? []
                  : defaultSlotsForDate(d.date);
              const breakMin = d.slots.length ? d.breakMinutes ?? 0 : 0;
              const mins = slots.length ? dayMinutes(slots, breakMin) : 0;
              const overDay =
                special && slots.length > 0
                  ? true
                  : slots.length > 0 && exceedsSchedule(d.date, slots, breakMin);
              return (
                <RhCard
                  key={d.date}
                  className="p-3"
                  style={
                    overDay
                      ? { borderColor: "rgba(240,194,78,.45)" }
                      : special
                        ? { opacity: 0.92 }
                        : undefined
                  }
                >
                  <div className="text-[12.5px] font-semibold mb-2" style={{ color: EMP_COLORS.text }}>
                    {label}
                  </div>
                  {holiday ? (
                    <div className="rh-mono text-[11px] mb-2" style={{ color: "#C4B5FD" }}>
                      Férié · {holiday}
                    </div>
                  ) : special ? (
                    <div className="rh-mono text-[11px] mb-2" style={{ color: EMP_COLORS.warning }}>
                      Week-end — saisie = alerte RH
                    </div>
                  ) : null}
                  <div
                    className="rh-mono text-[11px] mb-2"
                    style={{ color: overDay ? EMP_COLORS.warning : EMP_COLORS.accent }}
                  >
                    {minutesToLabel(mins)}
                    {!special
                      ? ` / ${minutesToLabel(schedule.workdayMinutes)}`
                      : ""}
                    {overDay ? " · dépassement" : ""}
                  </div>
                  {(slots.length ? slots : special ? [{ from: "", to: "" }] : slots).map((s, i) => (
                    <div key={i} className="flex items-center gap-1 mb-1.5">
                      <input
                        type="time"
                        className="rh-input rh-mono text-[11px] px-1 py-1"
                        disabled={!editable}
                        value={s.from}
                        onChange={(e) => {
                          const base = d.slots.length
                            ? [...d.slots]
                            : special
                              ? [{ from: "", to: "" }]
                              : defaultSlotsForDate(d.date);
                          base[i] = { ...(base[i] || { from: "", to: "" }), from: e.target.value };
                          updateDay(d.date, { slots: base });
                        }}
                      />
                      <span className="rh-mono text-[10px]" style={{ color: EMP_COLORS.dim }}>→</span>
                      <input
                        type="time"
                        className="rh-input rh-mono text-[11px] px-1 py-1"
                        disabled={!editable}
                        value={s.to}
                        onChange={(e) => {
                          const base = d.slots.length
                            ? [...d.slots]
                            : special
                              ? [{ from: "", to: "" }]
                              : defaultSlotsForDate(d.date);
                          base[i] = { ...(base[i] || { from: "", to: "" }), to: e.target.value };
                          updateDay(d.date, { slots: base });
                        }}
                      />
                    </div>
                  ))}
                  {!special || d.slots.length > 0 ? (
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
                  ) : null}
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
              <label className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[220px]">
                <EmpLabel>
                  Justification {live.hasOt ? "(obligatoire)" : ""}
                </EmpLabel>
                <input
                  className="rh-input"
                  disabled={!editable}
                  required={live.hasOt}
                  value={otNote}
                  onChange={(e) => setOtNote(e.target.value)}
                  placeholder={
                    live.hasOt
                      ? "Motif du dépassement (client, event, deadline…)"
                      : `Contrat ${weeklyHours} h`
                  }
                  style={
                    live.hasOt && !otNote.trim()
                      ? { borderColor: "rgba(240,194,78,.55)" }
                      : undefined
                  }
                />
              </label>
            </div>
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
                  Envoyer au manager
                </RhButton>
              </div>
            </RhCard>
          ) : null}
        </>
      )}
    </div>
  );
}
