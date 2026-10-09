"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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

type Place = "OFFICE" | "REMOTE" | "TRAVEL" | "SITE";

type Week = {
  isoYear: number;
  isoWeek: number;
  weekStart: string;
  weekEnd: string;
  absenceDays: number;
  entitlement: number;
  declared: number;
  pendingRemote?: string[];
  pendingRequestRef?: string | null;
  verdict: "compliant" | "over" | "none" | "undeclared" | "pending";
  places: Record<string, Place>;
};

const PLACE: Record<
  Place,
  { label: string; short: string; bg: string; fg: string; border: string }
> = {
  OFFICE: {
    label: "Bureau",
    short: "Bureau",
    bg: EMP_COLORS.inset,
    fg: EMP_COLORS.text,
    border: EMP_COLORS.borderControl,
  },
  REMOTE: {
    label: "Télétravail",
    short: "TT",
    bg: "rgba(124,140,248,.18)",
    fg: "#A5B0FA",
    border: "#7C8CF8",
  },
  TRAVEL: {
    label: "Déplacement",
    short: "Dépl.",
    bg: "rgba(242,135,78,.16)",
    fg: "#F2874E",
    border: "#F2874E",
  },
  SITE: {
    label: "Site",
    short: "Site",
    bg: "rgba(240,194,78,.16)",
    fg: "#F0C24E",
    border: "#F0C24E",
  },
};

const VERDICT: Record<string, { label: string; bg: string; fg: string }> = {
  compliant: { label: "OK", bg: "rgba(70,214,192,.13)", fg: "#46D6C0" },
  over: { label: "Trop de TT", bg: "rgba(242,96,78,.15)", fg: "#F2604E" },
  none: { label: "Pas de droit", bg: "rgba(242,96,78,.15)", fg: "#F2604E" },
  undeclared: { label: "À déclarer", bg: "#1D2530", fg: "#8B95A5" },
  pending: { label: "En validation", bg: "rgba(124,140,248,.18)", fg: "#A5B0FA" },
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

function recountWeek(w: Week): Week {
  const remoteDays = Object.values(w.places).filter((p) => p === "REMOTE").length;
  let verdict: Week["verdict"] = "undeclared";
  if (remoteDays === 0 && w.entitlement === 0) verdict = "none";
  else if (remoteDays === 0) verdict = "undeclared";
  else if (remoteDays > w.entitlement) verdict = "over";
  else verdict = "compliant";
  return { ...w, declared: remoteDays, verdict };
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
  const [addrForm, setAddrForm] = useState({
    addressLine1: "",
    city: "",
    postalCode: "",
  });
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [agreement, setAgreement] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [brush, setBrush] = useState<Place>("REMOTE");
  const [showMorePlaces, setShowMorePlaces] = useState(false);
  const [showException, setShowException] = useState(false);
  /** Déplacement : SELF = déj perso (TR) · COMPANY/REIMBURSED = pas de TR */
  const [travelMeal, setTravelMeal] = useState<"SELF" | "COMPANY" | "REIMBURSED">(
    "SELF"
  );
  const [travelPortion, setTravelPortion] = useState<"FULL" | "AM" | "PM">("FULL");
  const [excDate, setExcDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [motive, setMotive] = useState("");
  const [compensate, setCompensate] = useState(true);
  const primaryPlaces: Place[] = ["OFFICE", "REMOTE"];
  const extraPlaces: Place[] = ["TRAVEL", "SITE"];
  const visiblePlaces = showMorePlaces
    ? [...primaryPlaces, ...extraPlaces]
    : primaryPlaces.includes(brush)
      ? primaryPlaces
      : [...primaryPlaces, brush];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rh/office/weeks");
      if (!res.ok) return;
      const data = await res.json();
      setWeeks(data.weeks || []);
      const addr = data.address || {};
      setAddress(addr);
      setAddrForm({
        addressLine1: addr.line1 || "",
        city: addr.city || "",
        postalCode: addr.postalCode || "",
      });
      setAgreement(data.agreement || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyPlaces(dates: string[], place: Place) {
    if (dates.length === 0) return;
    setBusy(true);
    // Optimistic — TT = pending, autres = places
    setWeeks((prev) =>
      prev.map((w) => {
        const days = weekdays(w.weekStart, w.weekEnd);
        const hit = dates.some((d) => days.includes(d));
        if (!hit) return w;
        if (place === "REMOTE") {
          const pending = new Set([...(w.pendingRemote || []), ...dates.filter((d) => days.includes(d))]);
          return {
            ...w,
            pendingRemote: [...pending],
            verdict: "pending" as const,
          };
        }
        const places = { ...w.places };
        const pending = new Set(w.pendingRemote || []);
        for (const d of dates) {
          if (!days.includes(d)) continue;
          places[d] = place;
          pending.delete(d);
        }
        return recountWeek({
          ...w,
          places,
          pendingRemote: [...pending],
        });
      })
    );
    try {
      const res = await fetch("/api/rh/office/weeks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates,
          place,
          ...(place === "TRAVEL"
            ? { travelMeal, portion: travelPortion }
            : { portion: "FULL", travelMeal: null }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      if (data.pending) {
        const ref = data.plans?.[0]?.reference;
        toast.success(
          ref
            ? `TT envoyé pour validation (${ref})`
            : "TT mis à jour — en attente de validation"
        );
      } else if (data.errors?.length) {
        toast.message(String(data.errors[0]));
      }
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function paintDay(
    date: string,
    holiday: string | null,
    current: Place,
    isPending: boolean
  ) {
    if (holiday || busy) return;
    if (brush === "REMOTE") {
      const next =
        current === "REMOTE" || isPending ? "OFFICE" : "REMOTE";
      void applyPlaces([date], next);
      return;
    }
    const next = current === brush ? "OFFICE" : brush;
    void applyPlaces([date], next);
  }

  async function submitAddress() {
    if (!addrForm.addressLine1.trim() || !addrForm.city.trim()) {
      toast.error("Adresse et ville obligatoires");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rh/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addressChange",
          comment: "Demande d’adresse de télétravail",
          proposed: addrForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast.success(
        `Demande ${data.request?.reference || ""} envoyée — validation RH`
      );
      setShowAddrForm(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  function fillWeek(w: Week, place: Place) {
    const days = weekdays(w.weekStart, w.weekEnd).filter(
      (d) => !frenchHolidayLabel(d)
    );
    void applyPlaces(days, place);
  }

  function fillRemoteQuota(w: Week) {
    const days = weekdays(w.weekStart, w.weekEnd).filter(
      (d) => !frenchHolidayLabel(d)
    );
    const already = days.filter((d) => w.places[d] === "REMOTE");
    const need = Math.max(0, w.entitlement - already.length);
    if (need === 0) {
      toast.message(
        w.entitlement === 0
          ? "Pas de droit TT cette semaine"
          : "Quota TT déjà rempli"
      );
      return;
    }
    const candidates = days.filter((d) => (w.places[d] || "OFFICE") !== "REMOTE");
    void applyPlaces(candidates.slice(0, need), "REMOTE");
  }

  function clearRemote(w: Week) {
    const days = weekdays(w.weekStart, w.weekEnd).filter(
      (d) => w.places[d] === "REMOTE" || (w.pendingRemote || []).includes(d)
    );
    if (days.length === 0) {
      toast.message("Aucun TT à enlever cette semaine");
      return;
    }
    void applyPlaces(days, "OFFICE");
  }

  async function sendException() {
    if (!motive.trim()) {
      toast.error("Indique un motif");
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
      toast.success(`Demande ${data.request.reference} envoyée`);
      setMotive("");
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
          Ma présence
        </h1>
        <p
          className="m-0 mt-2 text-[14px] leading-[1.5] max-w-[560px]"
          style={{ color: EMP_COLORS.muted }}
        >
          Choisis Bureau ou TT, puis clique les jours. Le TT part toujours en
          validation manager.
        </p>
      </div>

      <RhRuleBanner tag="TT" tagBg="#7C8CF8" tint="rgba(124,140,248,.06)">
        Droit :{" "}
        <strong style={{ color: EMP_COLORS.text }}>
          {agreement} j / semaine
        </strong>
        {" "}
        (réduit si absences dans la semaine).
      </RhRuleBanner>

      {/* Palette sticky */}
      <div
        data-tour="remote-brush"
        className="sticky top-[122px] z-10 flex flex-wrap items-center gap-2 rounded-[14px] px-3 py-2.5"
        style={{
          background: "rgba(16,20,26,.94)",
          border: "1px solid #232932",
          backdropFilter: "blur(10px)",
        }}
      >
        <span
          className="text-[12.5px] font-medium mr-1"
          style={{ color: EMP_COLORS.muted }}
        >
          Lieu :
        </span>
        {visiblePlaces.map((id) => {
          const on = brush === id;
          const s = PLACE[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setBrush(id);
                if (id === "TRAVEL" || id === "SITE") setShowMorePlaces(true);
              }}
              className="border-0 cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-semibold"
              style={{
                background: on ? s.bg : "transparent",
                color: on ? s.fg : EMP_COLORS.muted,
                outline: on ? `2px solid ${s.border}` : "1px solid #232932",
              }}
            >
              {s.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowMorePlaces((v) => !v)}
          className="border-0 cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: "transparent",
            color: EMP_COLORS.dim,
            outline: "1px dashed #232932",
          }}
        >
          {showMorePlaces ? "Moins" : "Dépl. / Site…"}
        </button>
        {brush === "TRAVEL" ? (
          <>
            <span className="text-[12px] ml-1" style={{ color: EMP_COLORS.dim }}>
              Repas :
            </span>
            {(
              [
                ["SELF", "Déj. perso (TR)"],
                ["COMPANY", "Pris en charge"],
                ["REIMBURSED", "Remboursé"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTravelMeal(id)}
                className="border-0 cursor-pointer rounded-full px-2.5 py-1.5 text-[12px] font-medium"
                style={{
                  background:
                    travelMeal === id ? "rgba(242,135,78,.2)" : "transparent",
                  color:
                    travelMeal === id ? "#F2874E" : EMP_COLORS.muted,
                  outline:
                    travelMeal === id
                      ? "1.5px solid #F2874E"
                      : "1px solid #232932",
                }}
              >
                {label}
              </button>
            ))}
            <span className="text-[12px] ml-1" style={{ color: EMP_COLORS.dim }}>
              Durée :
            </span>
            {(
              [
                ["FULL", "Journée"],
                ["AM", "Matin"],
                ["PM", "Aprem"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTravelPortion(id)}
                className="border-0 cursor-pointer rounded-full px-2.5 py-1.5 text-[12px] font-medium"
                style={{
                  background:
                    travelPortion === id ? "rgba(242,135,78,.2)" : "transparent",
                  color:
                    travelPortion === id ? "#F2874E" : EMP_COLORS.muted,
                  outline:
                    travelPortion === id
                      ? "1.5px solid #F2874E"
                      : "1px solid #232932",
                }}
              >
                {label}
              </button>
            ))}
          </>
        ) : null}
      </div>

      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="text-[13px]" style={{ color: EMP_COLORS.muted }}>
              Chargement…
            </div>
          ) : (
            weeks.map((w) => {
              const v = VERDICT[w.verdict] || VERDICT.undeclared;
              const days = weekdays(w.weekStart, w.weekEnd);
              return (
                <RhCard
                  key={`${w.isoYear}-${w.isoWeek}`}
                  className={
                    w.verdict === "over"
                      ? "border-[rgba(242,96,78,.35)]"
                      : undefined
                  }
                >
                  <RhCardHead
                    title={`Semaine ${w.isoWeek}`}
                    badge={
                      <span
                        className="rh-badge"
                        style={{ background: v.bg, color: v.fg }}
                      >
                        {v.label}
                      </span>
                    }
                    right={
                      <span
                        className="text-[12.5px]"
                        style={{ color: EMP_COLORS.dim }}
                      >
                        {w.declared + (w.pendingRemote?.length || 0)}/
                        {w.entitlement} TT
                        {w.pendingRequestRef
                          ? ` · ${w.pendingRequestRef}`
                          : ""}{" "}
                        · {w.absenceDays} abs.
                      </span>
                    }
                  />

                  <div
                    data-tour="remote-actions"
                    className="flex flex-wrap gap-2 px-4 pt-3"
                  >
                    {w.entitlement > 0 ? (
                      <RhButton
                        data-tour="remote-fill-tt"
                        variant="secondary"
                        style={{ fontSize: 12, padding: "7px 12px" }}
                        disabled={busy}
                        onClick={() => fillRemoteQuota(w)}
                      >
                        Remplir mon TT ({w.entitlement} j)
                      </RhButton>
                    ) : null}
                    {w.declared > 0 ? (
                      <RhButton
                        data-tour="remote-clear-tt"
                        variant="secondary"
                        style={{ fontSize: 12, padding: "7px 12px" }}
                        disabled={busy}
                        onClick={() => clearRemote(w)}
                      >
                        Enlever le TT
                      </RhButton>
                    ) : null}
                    <RhButton
                      data-tour="remote-all-office"
                      variant="secondary"
                      style={{ fontSize: 12, padding: "7px 12px" }}
                      disabled={busy}
                      onClick={() => fillWeek(w, "OFFICE")}
                    >
                      Tout bureau
                    </RhButton>
                  </div>

                  <div data-tour="remote-days" className="grid grid-cols-5 gap-2 p-4">
                    {days.map((date) => {
                      const holiday = frenchHolidayLabel(date);
                      const place = (w.places?.[date] || "OFFICE") as Place;
                      const isPending = (w.pendingRemote || []).includes(date);
                      const style = holiday
                        ? {
                            label: "Férié",
                            bg: "rgba(167,139,250,.18)",
                            fg: "#C4B5FD",
                            border: "#A78BFA",
                          }
                        : isPending
                          ? {
                              label: "TT · attente",
                              bg: "rgba(124,140,248,.12)",
                              fg: "#A5B0FA",
                              border: "#7C8CF8",
                            }
                          : PLACE[place];
                      const d = new Date(date + "T12:00:00");
                      return (
                        <button
                          key={date}
                          type="button"
                          disabled={busy || !!holiday}
                          title={
                            holiday ||
                            (isPending
                              ? "TT en attente de validation — recliquer pour retirer"
                              : `Appliquer ${PLACE[brush].label}`)
                          }
                          onClick={() =>
                            paintDay(date, holiday, place, isPending)
                          }
                          className="rounded-[12px] p-3 text-center border-0 cursor-pointer disabled:cursor-default transition-transform active:scale-[0.97]"
                          style={{
                            background: style.bg,
                            border: isPending
                              ? `1.5px dashed ${style.border}`
                              : `1.5px solid ${style.border}`,
                          }}
                        >
                          <div
                            className="text-[11px] font-medium capitalize"
                            style={{ color: EMP_COLORS.dim }}
                          >
                            {d.toLocaleDateString("fr-FR", {
                              weekday: "short",
                            })}
                          </div>
                          <div
                            className="text-[18px] font-semibold my-0.5"
                            style={{ color: style.fg }}
                          >
                            {d.getDate()}
                          </div>
                          <div
                            className="text-[11px] font-medium"
                            style={{ color: style.fg }}
                          >
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
            <RhCardHead title="Besoin d’un TT en plus ?" />
            <div className="flex flex-col gap-3 p-4">
              {!showException ? (
                <>
                  <p
                    className="m-0 text-[12.5px] leading-[1.4]"
                    style={{ color: EMP_COLORS.muted }}
                  >
                    Hors quota : demande une exception à ton manager.
                  </p>
                  <RhButton
                    data-tour="remote-exception"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowException(true)}
                  >
                    Demander une exception
                  </RhButton>
                </>
              ) : (
                <>
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Date</EmpLabel>
                <input
                  type="date"
                  className="rh-input"
                  value={excDate}
                  onChange={(e) => setExcDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <EmpLabel>Motif</EmpLabel>
                <textarea
                  className="rh-input min-h-[80px]"
                  placeholder="Pourquoi ce jour TT exceptionnel ?"
                  value={motive}
                  onChange={(e) => setMotive(e.target.value)}
                />
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 text-[13px]"
                  style={{ color: EMP_COLORS.body }}
                >
                  Compenser la semaine suivante
                </div>
                <RhSwitch
                  on={compensate}
                  onToggle={() => setCompensate((v) => !v)}
                />
              </div>
              <RhButton
                className="w-full"
                disabled={busy}
                onClick={() => void sendException()}
              >
                <Send size={13} />
                Envoyer à {me?.employee.manager?.name || "manager"}
              </RhButton>
              <button
                type="button"
                className="border-0 bg-transparent cursor-pointer text-[12px]"
                style={{ color: EMP_COLORS.dim }}
                onClick={() => setShowException(false)}
              >
                Annuler
              </button>
                </>
              )}
            </div>
          </RhCard>

          <RhCard>
            <RhCardHead title="Adresse TT" badge={<House size={12} />} />
            <div
              className="p-4 text-[13px]"
              style={{ color: EMP_COLORS.body }}
            >
              {!showAddrForm ? (
                <div className="flex gap-2 items-start">
                  <MapPin
                    size={14}
                    style={{ color: EMP_COLORS.remote, marginTop: 2 }}
                  />
                  <div className="flex-1">
                    {address.line1 || "Non renseignée"}
                    <br />
                    {[address.postalCode, address.city]
                      .filter(Boolean)
                      .join(" ")}
                    <div
                      className="text-[12px] mt-2"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      Toute modification part en validation RH / admin.
                    </div>
                    <RhButton
                      variant="secondary"
                      className="mt-3 w-full"
                      style={{ fontSize: 12 }}
                      onClick={() => setShowAddrForm(true)}
                    >
                      {address.line1
                        ? "Demander une modification"
                        : "Renseigner mon adresse TT"}
                    </RhButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    className="rh-input"
                    placeholder="Adresse"
                    value={addrForm.addressLine1}
                    onChange={(e) =>
                      setAddrForm({ ...addrForm, addressLine1: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="rh-input"
                      placeholder="CP"
                      value={addrForm.postalCode}
                      onChange={(e) =>
                        setAddrForm({
                          ...addrForm,
                          postalCode: e.target.value,
                        })
                      }
                    />
                    <input
                      className="rh-input"
                      placeholder="Ville"
                      value={addrForm.city}
                      onChange={(e) =>
                        setAddrForm({ ...addrForm, city: e.target.value })
                      }
                    />
                  </div>
                  <RhButton
                    className="w-full"
                    disabled={busy}
                    onClick={() => void submitAddress()}
                  >
                    <Send size={13} />
                    Envoyer pour validation
                  </RhButton>
                  <button
                    type="button"
                    className="border-0 bg-transparent cursor-pointer text-[12px]"
                    style={{ color: EMP_COLORS.dim }}
                    onClick={() => setShowAddrForm(false)}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </RhCard>
        </aside>
      </div>
    </div>
  );
}
