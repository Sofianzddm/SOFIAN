"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Users } from "lucide-react";
import {
  RhButton,
  RhCard,
  RhCardHead,
  RhRuleBanner,
} from "@/components/rh/ui/primitives";
import {
  EmpAlert,
  EmpLabel,
  EMP_COLORS,
} from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";
import { buildThreeMonths, LEAVE_LEGEND } from "@/lib/rh/calendar-ui";

type Balance = {
  accountCode: string;
  label: string;
  accrued: number;
  remaining: number;
  bookable: number;
  expiresOn?: string | null;
};

const ACCOUNT_COLOR: Record<string, string> = {
  CP: "#46D6C0",
  RTT: "#F0C24E",
  RECUP: "#F2874E",
  SS: "#F2C24E",
  UNPAID: "#8B95A5",
  SCHOOL: "#B48CF0",
  AUTHORIZED: "#8ED98A",
};

export function LeaveScreen() {
  const { me, refresh } = useRhData();
  const [leaveDays, setLeaveDays] = useState<
    Array<{ date: string; accountCode: string; status?: string }>
  >([]);
  const [remoteDates, setRemoteDates] = useState<string[]>([]);
  const [coverage, setCoverage] = useState<{
    percent: number;
    presentAfter: number;
    teamSize: number;
    belowThreshold: boolean;
  } | null>(null);
  const [accountCode, setAccountCode] = useState<
    "RECUP" | "RTT" | "UNPAID" | "CP" | "SS" | "SCHOOL" | "AUTHORIZED"
  >("RECUP");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [halfDay, setHalfDay] = useState(false);
  const [half, setHalf] = useState<"AM" | "PM">("AM");
  const [minutes, setMinutes] = useState<number | "">(60);
  const [durationMode, setDurationMode] = useState<"days" | "half" | "hours">(
    "days"
  );
  const [showMoreTypes, setShowMoreTypes] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [comment, setComment] = useState("");
  const canHours =
    accountCode === "RECUP" || accountCode === "AUTHORIZED";
  const hourlyMode = canHours && durationMode === "hours";
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function setMode(mode: "days" | "half" | "hours") {
    setDurationMode(mode);
    setHalfDay(mode === "half");
    if (mode === "hours" && minutes === "") setMinutes(60);
    if (mode !== "hours") setMinutes("");
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
      const [calRes, covRes] = await Promise.all([
        fetch(
          `/api/rh/leave/calendar?from=${start.toISOString()}&to=${end.toISOString()}`
        ),
        fetch(
          `/api/rh/leave/coverage?from=${from}&to=${to}`
        ),
      ]);
      if (calRes.ok) {
        const cal = await calRes.json();
        setLeaveDays(cal.leaveDays || []);
        setRemoteDates(cal.remoteDates || []);
      }
      if (covRes.ok) {
        const cov = await covRes.json();
        setCoverage(cov.coverage);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(
    () => buildThreeMonths(leaveDays, remoteDates),
    [leaveDays, remoteDates]
  );

  const balances: Balance[] = (me?.balances as Balance[]) || [];
  const hire = me?.employee.hireDate ? new Date(me.employee.hireDate) : null;
  const unlock = hire
    ? new Date(hire.getFullYear() + 1, hire.getMonth(), hire.getDate())
    : null;
  const cpBalances = balances.filter((b) => b.accountCode === "CP");
  const cpBlocked =
    cpBalances.length > 0 && cpBalances.every((b) => b.bookable === 0);
  const bookableTotal = balances.reduce((s, b) => s + (b.bookable || 0), 0);
  const recup = balances.find((b) => b.accountCode === "RECUP");

  async function submitLeave() {
    setSubmitting(true);
    setMessage(null);
    try {
      if (accountCode === "SS" && !comment.trim()) {
        throw new Error(
          "Motif obligatoire pour un arrêt maladie (précise aussi le dépôt du justificatif)"
        );
      }
      const res = await fetch("/api/rh/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCode,
          from,
          to: hourlyMode || durationMode === "half" ? from : to,
          halfDay: durationMode === "half",
          half: durationMode === "half" ? half : undefined,
          minutes: hourlyMode ? Number(minutes || 60) : undefined,
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec");
      const ref = data.request?.reference || "";
      setMessage(`Demande ${ref} envoyée`);
      toast.success(ref ? `Demande ${ref} envoyée` : "Demande envoyée");
      await refresh();
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Erreur";
      setMessage(err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  const rtt = balances.find((b) => b.accountCode === "RTT");
  const typeHelp: Record<string, string> = {
    RECUP:
      "Pose en jours ou en minutes (15 min → 7 h). À utiliser avant expiration.",
    RTT: "Jours RTT de ton compteur (si ton contrat en prévoit).",
    CP: "Congés payés — posables après 1 an d’ancienneté.",
    SS: "Arrêt maladie — calendrier (week-ends inclus si besoin).",
    SCHOOL: "Absence école / formation hors CP.",
    AUTHORIZED: "Absence autorisée exceptionnelle (sans solde CP).",
    UNPAID: "Congé sans solde — n’utilise pas ton compteur CP.",
  };

  return (
    <div className="rh-screen">
      <div>
        <h1
          className="m-0 text-[26px] font-semibold tracking-[-0.03em]"
          style={{ color: EMP_COLORS.text }}
        >
          Poser une absence
        </h1>
        <p
          className="m-0 mt-2 text-[14px] leading-[1.5] max-w-[560px]"
          style={{ color: EMP_COLORS.muted }}
        >
          3 étapes : type → dates → envoi à{" "}
          {me?.employee.manager?.name || "ton manager"}.
        </p>
      </div>

      {cpBlocked ? (
        <RhRuleBanner tag="Info">
          <strong style={{ color: EMP_COLORS.text }}>
            Congés payés pas encore posables.
          </strong>{" "}
          Embauche le {hire?.toLocaleDateString("fr-FR") || "—"} → disponible le{" "}
          <span style={{ color: EMP_COLORS.warning }}>
            {unlock?.toLocaleDateString("fr-FR") || "—"}
          </span>
          . En attendant : RTT, récupération ou sans solde.
        </RhRuleBanner>
      ) : null}

      {recup?.expiresOn ? (
        <EmpAlert tone="warning" title="Récupération à utiliser">
          À poser avant le{" "}
          {new Date(recup.expiresOn).toLocaleDateString("fr-FR")} — il te reste{" "}
          {recup.bookable.toFixed(1).replace(".", ",")} j.
        </EmpAlert>
      ) : null}

      <RhCard strong>
        <RhCardHead title="Nouvelle demande" />
        <div className="flex flex-col gap-5 p-5">
          {/* Étape 1 — type */}
          <div>
            <EmpLabel>1 · Qu’est-ce que tu poses ?</EmpLabel>
            <div data-tour="leave-types" className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["RECUP", "Récup"],
                  ["CP", "Congés payés"],
                  ["RTT", "RTT"],
                ] as const
              ).map(([id, label]) => {
                const disabled =
                  (id === "CP" && !!cpBlocked) ||
                  (id === "RTT" && (!rtt || rtt.bookable <= 0));
                const on = accountCode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setAccountCode(id);
                      if (id !== "RECUP" && durationMode === "hours") {
                        setMode("days");
                      }
                    }}
                    className="border-0 cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-default"
                    style={{
                      background: on
                        ? "rgba(229,242,181,.16)"
                        : EMP_COLORS.inset,
                      color: on ? EMP_COLORS.accent : EMP_COLORS.muted,
                      outline: on
                        ? `2px solid ${EMP_COLORS.accent}`
                        : `1px solid ${EMP_COLORS.borderControl}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowMoreTypes((v) => !v)}
                className="border-0 cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-medium"
                style={{
                  background: "transparent",
                  color: EMP_COLORS.dim,
                  outline: `1px dashed ${EMP_COLORS.borderControl}`,
                }}
              >
                {showMoreTypes ? "Moins" : "Autre…"}
              </button>
            </div>
            {showMoreTypes ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["SS", "Maladie"],
                    ["SCHOOL", "École"],
                    ["AUTHORIZED", "Autorisée"],
                    ["UNPAID", "Sans solde"],
                  ] as const
                ).map(([id, label]) => {
                  const on = accountCode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setAccountCode(id);
                        if (id !== "AUTHORIZED" && durationMode === "hours") {
                          setMode("days");
                        }
                      }}
                      className="border-0 cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                      style={{
                        background: on
                          ? "rgba(229,242,181,.12)"
                          : EMP_COLORS.inset,
                        color: on ? EMP_COLORS.accent : EMP_COLORS.muted,
                        outline: on
                          ? `1.5px solid ${EMP_COLORS.accent}`
                          : `1px solid ${EMP_COLORS.borderControl}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p
              className="m-0 mt-2 text-[12.5px]"
              style={{ color: EMP_COLORS.dim }}
            >
              {typeHelp[accountCode]}
            </p>
          </div>

          {/* Étape 2 — durée */}
          <div>
            <EmpLabel>2 · Quelle durée ?</EmpLabel>
            <div data-tour="leave-duration" className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["days", "Une ou plusieurs journées"],
                  ["half", "Une demi-journée"],
                  ...(canHours
                    ? ([["hours", "Quelques heures"]] as const)
                    : []),
                ] as const
              ).map(([id, label]) => {
                const on = durationMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className="border-0 cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-semibold"
                    style={{
                      background: on
                        ? "rgba(124,140,248,.18)"
                        : EMP_COLORS.inset,
                      color: on ? "#A5B0FA" : EMP_COLORS.muted,
                      outline: on
                        ? "2px solid #7C8CF8"
                        : `1px solid ${EMP_COLORS.borderControl}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Étape 3 — dates */}
          <div data-tour="leave-dates">
            <EmpLabel>3 · Quand ?</EmpLabel>
            <div className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
              <label className="flex flex-col gap-1.5">
                <EmpLabel>
                  {hourlyMode || durationMode === "half" ? "Le" : "Du"}
                </EmpLabel>
                <input
                  type="date"
                  className="rh-input"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    if (hourlyMode || durationMode === "half") {
                      setTo(e.target.value);
                    }
                  }}
                />
              </label>
              {durationMode === "days" ? (
                <label className="flex flex-col gap-1.5">
                  <EmpLabel>Au</EmpLabel>
                  <input
                    type="date"
                    className="rh-input"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              ) : null}
              {durationMode === "half" ? (
                <label className="flex flex-col gap-1.5">
                  <EmpLabel>Matin ou après-midi</EmpLabel>
                  <select
                    className="rh-input"
                    value={half}
                    onChange={(e) => setHalf(e.target.value as "AM" | "PM")}
                  >
                    <option value="AM">Matin</option>
                    <option value="PM">Après-midi</option>
                  </select>
                </label>
              ) : null}
              {hourlyMode ? (
                <label className="flex flex-col gap-1.5">
                  <EmpLabel>Combien de temps</EmpLabel>
                  <select
                    className="rh-input"
                    value={String(minutes || 60)}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  >
                    {[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420].map(
                      (m) => (
                        <option key={m} value={m}>
                          {m < 60
                            ? `${m} min`
                            : `${Math.floor(m / 60)} h${
                                m % 60 ? ` ${m % 60}` : ""
                              }`}
                        </option>
                      )
                    )}
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          <details>
            <summary
              className="cursor-pointer text-[12.5px] font-medium"
              style={{ color: EMP_COLORS.dim }}
            >
              Commentaire (optionnel)
            </summary>
            <textarea
              className="rh-input min-h-[72px] mt-2 w-full"
              placeholder="Ex. vacances familiales…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <RhButton
              data-tour="leave-send"
              disabled={submitting}
              onClick={() => void submitLeave()}
            >
              <CalendarPlus size={16} />
              {submitting
                ? "Envoi…"
                : `Envoyer à ${me?.employee.manager?.name || "mon manager"}`}
            </RhButton>
            {coverage ? (
              <span
                className="flex items-center gap-2 text-[13px]"
                style={{
                  color: coverage.belowThreshold
                    ? EMP_COLORS.danger
                    : EMP_COLORS.muted,
                }}
              >
                <Users size={14} />
                Équipe : {coverage.presentAfter}/{coverage.teamSize} présents
                {coverage.belowThreshold ? " (sous 60 %)" : ""}
              </span>
            ) : null}
            {message ? (
              <span className="text-[13px]" style={{ color: EMP_COLORS.accent }}>
                {message}
              </span>
            ) : null}
          </div>
        </div>
      </RhCard>

      <RhCard>
        <RhCardHead
          title="Tes soldes"
          right={
            <span className="text-[12.5px]" style={{ color: EMP_COLORS.accent }}>
              {bookableTotal.toFixed(1).replace(".", ",")} j posables
            </span>
          }
        />
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {loading ? (
            <span className="text-[12px]" style={{ color: EMP_COLORS.muted }}>
              …
            </span>
          ) : (
            balances.map((b) => (
              <span
                key={`${b.accountCode}-${b.label}`}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: EMP_COLORS.inset,
                  border: `1px solid ${EMP_COLORS.borderControl}`,
                  color: EMP_COLORS.body,
                }}
              >
                <span
                  style={{
                    color: ACCOUNT_COLOR[b.accountCode] || EMP_COLORS.muted,
                  }}
                >
                  {b.label}
                </span>
                {" · "}
                {b.bookable.toFixed(1).replace(".", ",")} j
              </span>
            ))
          )}
        </div>
      </RhCard>

      <button
        type="button"
        onClick={() => setShowCalendar((v) => !v)}
        className="border-0 bg-transparent cursor-pointer self-start text-[13px] font-medium px-0"
        style={{ color: EMP_COLORS.dim }}
      >
        {showCalendar ? "Masquer le calendrier" : "Voir mon calendrier"}
      </button>

      {showCalendar ? (
      <div className="rh-layout-inspect">
        <RhCard>
          <RhCardHead
            title="Ton calendrier"
            right={
              <div className="flex flex-wrap items-center gap-2.5">
                {LEAVE_LEGEND.map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5">
                    <span
                      className="block rounded-full"
                      style={{ width: 8, height: 8, background: l.color }}
                    />
                    <span
                      className="text-[11.5px]"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      {l.label}
                    </span>
                  </span>
                ))}
              </div>
            }
          />
          {loading ? (
            <div className="p-6 text-[13px]" style={{ color: EMP_COLORS.muted }}>
              Chargement…
            </div>
          ) : (
            <div className="grid gap-4 p-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              {months.map((m) => (
                <div key={m.title}>
                  <div
                    className="mb-2 text-[13px] font-semibold"
                    style={{ color: EMP_COLORS.muted }}
                  >
                    {m.title}
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {m.dows.map((d, i) => (
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
                    {m.days.map((d, i) => (
                      <div
                        key={i}
                        className="aspect-square grid place-items-center rounded-[8px] text-[12px]"
                        style={{
                          background: d.bg,
                          color: d.fg,
                          fontWeight: d.fw as never,
                          boxShadow: d.ring,
                        }}
                      >
                        {d.n}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </RhCard>
      </div>
      ) : null}
    </div>
  );
}
