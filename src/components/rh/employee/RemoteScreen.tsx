"use client";

import { useCallback, useEffect, useState } from "react";
import { House, MapPin, Send } from "lucide-react";
import {
  RhButton,
  RhCard,
  RhCardHead,
  RhRuleBanner,
  RhSwitch,
} from "@/components/rh/ui/primitives";
import { EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";
import { frenchHolidayLabel } from "@/lib/rh/holidays";

type Week = {
  isoYear: number;
  isoWeek: number;
  weekStart: string;
  weekEnd: string;
  absenceDays: number;
  entitlement: number;
  declared: number;
  verdict: "compliant" | "over" | "none" | "undeclared";
  places: Record<string, "OFFICE" | "REMOTE" | "TRAVEL" | "SITE">;
};

const PLACE: Record<
  string,
  { label: string; bg: string; fg: string; border: string }
> = {
  OFFICE: { label: "BUREAU", bg: EMP_COLORS.inset, fg: EMP_COLORS.text, border: EMP_COLORS.borderControl },
  REMOTE: { label: "TÉLÉ", bg: "rgba(124,140,248,.18)", fg: "#A5B0FA", border: "#7C8CF8" },
  TRAVEL: { label: "DÉPL.", bg: "rgba(242,135,78,.16)", fg: "#F2874E", border: "#F2874E" },
  SITE: { label: "SITE", bg: "rgba(240,194,78,.16)", fg: "#F0C24E", border: "#F0C24E" },
};

const VERDICT: Record<string, { label: string; bg: string; fg: string }> = {
  compliant: { label: "CONFORME", bg: "rgba(70,214,192,.13)", fg: "#46D6C0" },
  over: { label: "DÉPASSEMENT", bg: "rgba(242,96,78,.15)", fg: "#F2604E" },
  none: { label: "AUCUN DROIT", bg: "rgba(242,96,78,.15)", fg: "#F2604E" },
  undeclared: { label: "À DÉCLARER", bg: "#1D2530", fg: "#8B95A5" },
};

function weekdays(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start.slice(0, 10) + "T12:00:00");
  const last = new Date(end.slice(0, 10) + "T12:00:00");
  while (cur <= last) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function RemoteScreen() {
  const { me, refresh } = useRhData();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [address, setAddress] = useState<{
    line1?: string | null;
    city?: string | null;
    postalCode?: string | null;
    insuranceExpiresOn?: string | null;
  }>({});
  const [agreement, setAgreement] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [excDate, setExcDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [motive, setMotive] = useState("");
  const [compensate, setCompensate] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rh/office/weeks");
      if (!res.ok) return;
      const data = await res.json();
      setWeeks(data.weeks || []);
      setAddress(data.address || {});
      setAgreement(data.agreement || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cycleDay(date: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/rh/office/weeks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await load();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function sendException() {
    if (!motive.trim()) {
      setMsg("Motif obligatoire");
      return;
    }
    const week = weeks[0];
    if (!week) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rh/remote/weeks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: excDate,
          compensateNextWeek: compensate,
          motive,
          isoYear: week.isoYear,
          isoWeek: week.isoWeek,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMsg(`Demande ${data.request.reference} envoyée`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rh-screen">
      <RhRuleBanner tag="ARTICLE 1.6" tagBg="#7C8CF8" tint="rgba(124,140,248,.06)">
        Avenant <strong style={{ color: EMP_COLORS.text }}>{agreement} j / semaine</strong>.
        0 absence → droit avenant · 1–2 absences → 1 j max · ≥3 → 0.
        Clique sur un jour pour cycler Bureau → Télétravail → Déplacement → Soleil du Sud.
      </RhRuleBanner>

      {msg ? (
        <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.accent }}>{msg}</p>
      ) : null}

      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="text-[12px]" style={{ color: EMP_COLORS.muted }}>Chargement…</div>
          ) : (
            weeks.map((w) => {
              const v = VERDICT[w.verdict] || VERDICT.undeclared;
              const days = weekdays(w.weekStart, w.weekEnd);
              return (
                <RhCard
                  key={`${w.isoYear}-${w.isoWeek}`}
                  className={w.verdict === "over" ? "border-[rgba(242,96,78,.35)]" : undefined}
                >
                  <RhCardHead
                    title={`S${w.isoWeek}`}
                    badge={<span className="rh-badge" style={{ background: v.bg, color: v.fg }}>{v.label}</span>}
                    right={
                      <span className="rh-mono text-[10px]" style={{ color: EMP_COLORS.dim }}>
                        Abs {w.absenceDays} · Droit {w.entitlement} · Déclaré {w.declared}
                      </span>
                    }
                  />
                  <div className="grid grid-cols-5 gap-2 p-4">
                    {days.map((date) => {
                      const holiday = frenchHolidayLabel(date);
                      const place = w.places?.[date] || "OFFICE";
                      const style = holiday
                        ? {
                            label: "FÉRIÉ",
                            bg: "rgba(167,139,250,.18)",
                            fg: "#C4B5FD",
                            border: "#A78BFA",
                          }
                        : PLACE[place] || PLACE.OFFICE;
                      const d = new Date(date + "T12:00:00");
                      return (
                        <button
                          key={date}
                          type="button"
                          disabled={busy || !!holiday}
                          title={holiday || undefined}
                          onClick={() => void cycleDay(date)}
                          className="rounded-[10px] p-3 text-center border-0 cursor-pointer disabled:cursor-default"
                          style={{
                            background: style.bg,
                            border: `1px solid ${style.border}`,
                          }}
                        >
                          <div className="rh-mono text-[9px]" style={{ color: EMP_COLORS.dim }}>
                            {d.toLocaleDateString("fr-FR", { weekday: "short" }).toUpperCase()}
                          </div>
                          <div className="rh-mono text-[16px] font-bold" style={{ color: style.fg }}>
                            {d.getDate()}
                          </div>
                          <div className="rh-mono text-[9px] mt-1" style={{ color: style.fg }}>
                            {style.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </RhCard>
              );
            })
          )}
        </div>

        <aside className="rh-inspector flex flex-col gap-3">
          <RhCard strong>
            <RhCardHead title="Jour exceptionnel" />
            <div className="flex flex-col gap-3 p-4">
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Date</EmpLabel>
                <input type="date" className="rh-input" value={excDate} onChange={(e) => setExcDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Motif</EmpLabel>
                <textarea className="rh-input min-h-[80px]" value={motive} onChange={(e) => setMotive(e.target.value)} />
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-[12px]" style={{ color: EMP_COLORS.body }}>
                  Compenser la semaine suivante
                </div>
                <RhSwitch on={compensate} onToggle={() => setCompensate((v) => !v)} />
              </div>
              <RhButton className="w-full" disabled={busy} onClick={() => void sendException()}>
                <Send size={13} />
                Envoyer à {me?.employee.manager?.name || "manager"}
              </RhButton>
            </div>
          </RhCard>

          <RhCard>
            <RhCardHead title="Adresse TT" badge={<House size={12} />} />
            <div className="p-4 text-[12.5px]" style={{ color: EMP_COLORS.body }}>
              <div className="flex gap-2 items-start">
                <MapPin size={14} style={{ color: EMP_COLORS.remote, marginTop: 2 }} />
                <div>
                  {address.line1 || "Non renseignée"}
                  <br />
                  {[address.postalCode, address.city].filter(Boolean).join(" ")}
                  <div className="rh-mono text-[10px] mt-2" style={{ color: EMP_COLORS.dim }}>
                    Assurance :{" "}
                    {address.insuranceExpiresOn
                      ? `expire ${new Date(address.insuranceExpiresOn).toLocaleDateString("fr-FR")}`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          </RhCard>
        </aside>
      </div>
    </div>
  );
}
