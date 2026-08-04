"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Lock, Users } from "lucide-react";
import {
  RhButton,
  RhCard,
  RhCardHead,
  RhRuleBanner,
  RhSwitch,
} from "@/components/rh/ui/primitives";
import {
  EmpAlert,
  EmpLabel,
  EmpTd,
  EmpTh,
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
};

export function LeaveScreen() {
  const { me, refresh } = useRhData();
  const [leaveDays, setLeaveDays] = useState<
    Array<{ date: string; accountCode: string }>
  >([]);
  const [remoteDates, setRemoteDates] = useState<string[]>([]);
  const [coverage, setCoverage] = useState<{
    percent: number;
    presentAfter: number;
    teamSize: number;
    belowThreshold: boolean;
  } | null>(null);
  const [accountCode, setAccountCode] = useState<"RECUP" | "RTT" | "UNPAID" | "CP">(
    "RTT"
  );
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [halfDay, setHalfDay] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  const cpBlocked = balances.find((b) => b.accountCode === "CP")?.bookable === 0;
  const bookableTotal = balances.reduce((s, b) => s + (b.bookable || 0), 0);
  const recup = balances.find((b) => b.accountCode === "RECUP");

  async function submitLeave() {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rh/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCode,
          from,
          to,
          halfDay,
          half: "AM",
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec");
      setMessage(`Demande ${data.request.reference} envoyée`);
      await refresh();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rh-screen">
      {cpBlocked ? (
        <RhRuleBanner tag="RÈGLE · 1 AN">
          <strong style={{ color: EMP_COLORS.text }}>
            Congés payés acquis mais non posables.
          </strong>{" "}
          Embauche le {hire?.toLocaleDateString("fr-FR") || "—"} → déblocage le{" "}
          <span className="rh-mono" style={{ color: EMP_COLORS.warning }}>
            {unlock?.toLocaleDateString("fr-FR") || "—"}
          </span>
          . Utilise RTT, récupération ou congé sans solde.
        </RhRuleBanner>
      ) : null}

      {recup?.expiresOn ? (
        <EmpAlert tone="warning" title="Récupération à échéance">
          À poser avant le{" "}
          <span className="rh-mono">
            {new Date(recup.expiresOn).toLocaleDateString("fr-FR")}
          </span>{" "}
          — reste {recup.bookable.toFixed(1).replace(".", ",")} j
        </EmpAlert>
      ) : null}

      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-[12px]">
          <RhCard>
            <RhCardHead
              title="Calendrier"
              right={
                <div className="flex flex-wrap items-center gap-[10px]">
                  {LEAVE_LEGEND.map((l) => (
                    <span key={l.label} className="flex items-center gap-[5px]">
                      <span
                        className="block rounded-[3px]"
                        style={{ width: 9, height: 9, background: l.color }}
                      />
                      <span className="rh-mono text-[9px] uppercase" style={{ color: EMP_COLORS.dim }}>
                        {l.label}
                      </span>
                    </span>
                  ))}
                </div>
              }
            />
            {loading ? (
              <div className="p-6 text-[12px]" style={{ color: EMP_COLORS.muted }}>
                Chargement…
              </div>
            ) : (
              <div className="grid gap-[14px] p-[15px] [grid-template-columns:repeat(auto-fit,minmax(196px,1fr))]">
                {months.map((m) => (
                  <div key={m.title}>
                    <div className="rh-mono mb-2 text-[10px] tracking-[0.1em]" style={{ color: EMP_COLORS.muted }}>
                      {m.title}
                    </div>
                    <div className="grid grid-cols-7 gap-[3px] mb-1">
                      {m.dows.map((d, i) => (
                        <div key={`${d}-${i}`} className="rh-mono text-center text-[9px]" style={{ color: EMP_COLORS.dim }}>
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-[3px]">
                      {m.days.map((d, i) => (
                        <div
                          key={i}
                          className="rh-mono aspect-square grid place-items-center rounded-[6px] text-[11px]"
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

          <RhCard>
            <RhCardHead title="Mes compteurs" />
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    <EmpTh>Compte</EmpTh>
                    <EmpTh align="right">Acquis</EmpTh>
                    <EmpTh align="right">Restant</EmpTh>
                    <EmpTh align="right">Posable</EmpTh>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.accountCode}>
                      <td className="px-[14px] py-[10px]" style={{ borderBottom: "1px solid #15191F" }}>
                        <div className="flex items-center gap-[9px]">
                          <span
                            className="block shrink-0 rounded-[3px]"
                            style={{
                              width: 3,
                              height: 22,
                              background: ACCOUNT_COLOR[b.accountCode] || "#8B95A5",
                            }}
                          />
                          <div>
                            <div className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: EMP_COLORS.text }}>
                              {b.label}
                              {b.accountCode === "CP" && b.bookable === 0 ? (
                                <span className="rh-badge" style={{ background: "rgba(240,194,78,.14)", color: EMP_COLORS.warning }}>
                                  <Lock size={8} /> BLOQUÉ
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <EmpTd align="right" mono>
                        {b.accrued.toFixed(2).replace(".", ",")}
                      </EmpTd>
                      <EmpTd align="right" mono>
                        {b.remaining.toFixed(2).replace(".", ",")}
                      </EmpTd>
                      <EmpTd
                        align="right"
                        mono
                        bold
                        color={b.bookable > 0 ? EMP_COLORS.accent : EMP_COLORS.faint}
                      >
                        {b.bookable.toFixed(2).replace(".", ",")}
                      </EmpTd>
                    </tr>
                  ))}
                  <tr>
                    <EmpTd bold>Total posable</EmpTd>
                    <EmpTd align="right">—</EmpTd>
                    <EmpTd align="right">—</EmpTd>
                    <EmpTd align="right" mono bold color={EMP_COLORS.accent}>
                      {bookableTotal.toFixed(2).replace(".", ",")} j
                    </EmpTd>
                  </tr>
                </tbody>
              </table>
            </div>
          </RhCard>
        </div>

        <aside className="rh-inspector">
          <RhCard strong>
            <RhCardHead title="Nouvelle demande" />
            <div className="flex flex-col gap-[12px] p-[14px]">
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Type</EmpLabel>
                <select
                  className="rh-input"
                  value={accountCode}
                  onChange={(e) =>
                    setAccountCode(e.target.value as typeof accountCode)
                  }
                >
                  <option value="RTT">RTT</option>
                  <option value="RECUP">Récupération</option>
                  <option value="UNPAID">Congé sans solde</option>
                  <option value="CP" disabled={!!cpBlocked}>
                    Congés payés{cpBlocked ? " (bloqués)" : ""}
                  </option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Du</EmpLabel>
                <input type="date" className="rh-input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Au</EmpLabel>
                <input type="date" className="rh-input" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <div
                className="flex items-center gap-[10px] rounded-[10px] px-[13px] py-[11px]"
                style={{ background: EMP_COLORS.inset, border: `1px solid ${EMP_COLORS.borderControl}` }}
              >
                <div className="flex-1 text-[12.5px]" style={{ color: EMP_COLORS.text }}>
                  Demi-journée
                </div>
                <RhSwitch on={halfDay} onToggle={() => setHalfDay((v) => !v)} />
              </div>
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Commentaire</EmpLabel>
                <textarea
                  className="rh-input min-h-[72px]"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              {message ? (
                <p className="m-0 text-[12px]" style={{ color: EMP_COLORS.accent }}>{message}</p>
              ) : null}
              <RhButton className="w-full" disabled={submitting} onClick={() => void submitLeave()}>
                <CalendarPlus size={14} />
                {submitting
                  ? "Envoi…"
                  : `Envoyer à ${me?.employee.manager?.name || "manager"}`}
              </RhButton>
            </div>
          </RhCard>

          <RhCard>
            <RhCardHead
              title="Couverture équipe"
              badge={
                coverage ? (
                  <span
                    className="rh-badge"
                    style={{
                      background: coverage.belowThreshold
                        ? "rgba(242,96,78,.15)"
                        : "rgba(70,214,192,.14)",
                      color: coverage.belowThreshold ? EMP_COLORS.danger : EMP_COLORS.success,
                    }}
                  >
                    {coverage.percent} %
                  </span>
                ) : null
              }
            />
            <div className="p-[14px] flex gap-2 items-start">
              <Users size={14} style={{ color: EMP_COLORS.success, marginTop: 2 }} />
              <div className="text-[12.5px]" style={{ color: EMP_COLORS.body }}>
                {coverage
                  ? `${coverage.presentAfter}/${coverage.teamSize} présents après pose · seuil 60 %`
                  : "Calcul…"}
              </div>
            </div>
          </RhCard>
        </aside>
      </div>
    </div>
  );
}
