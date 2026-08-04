"use client";

import { useEffect, useState } from "react";
import { Building2, CalendarPlus, Lock, MessageSquareWarning } from "lucide-react";
import {
  RhAvatar,
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

export type EmployeeScreenId =
  | "home"
  | "leave"
  | "remote"
  | "time"
  | "expenses"
  | "folder"
  | "requests"
  | "mobile";

type RemoteWeek = {
  isoWeek: number;
  weekStart: string;
  declaredDates: string[];
  entitlement: number;
  verdict: string;
};

export function HomeScreen({ onGo }: { onGo: (s: EmployeeScreenId) => void }) {
  const { me, home } = useRhData();
  const [remoteWeek, setRemoteWeek] = useState<RemoteWeek | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/rh/remote/weeks");
      if (!res.ok) return;
      const data = await res.json();
      setRemoteWeek(data.weeks?.[0] || null);
    })();
  }, []);

  const kpis = (home?.kpis as Array<{
    id: string;
    label: string;
    value: string;
    unit: string;
    sub: string;
    tone: string;
    locked?: boolean;
  }>) || [];
  const todos = (home?.todos as Array<{
    id: string;
    bar: string;
    tag: string;
    tagBg: string;
    title: string;
    meta: string;
    cta: string;
    target: EmployeeScreenId;
    urgent?: boolean;
  }>) || [];
  const awayToday = (home?.awayToday as Array<{
    name: string;
    initials: string;
    color: string;
    kind: string;
  }>) || [];

  const greeting = me ? `Bonjour ${me.employee.prenom}` : "Bonjour";
  const today = home?.today as { date?: string; isoWeek?: number } | undefined;
  const eyebrow = today?.date
    ? `${new Date(today.date).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "long",
      }).toUpperCase()} · SEMAINE ${today.isoWeek ?? "—"}`
    : "MON ESPACE";

  // Ma semaine = 5 jours ouvrés autour d'aujourd'hui + TT déclaré
  const weekDays = (() => {
    const base = today?.date ? new Date(today.date) : new Date();
    const dow = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - dow);
    const remoteSet = new Set(remoteWeek?.declaredDates || []);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const isToday = key === (today?.date || "").slice(0, 10);
      const tt = remoteSet.has(key);
      return {
        key,
        n: d.getDate(),
        label: d.toLocaleDateString("fr-FR", { weekday: "short" }).toUpperCase(),
        mode: tt ? "TÉLÉ" : "BUREAU",
        tt,
        isToday,
      };
    });
  })();

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow={eyebrow}
        title={greeting}
        actions={
          <>
            {me?.canAccessPeople ? (
              <RhButton
                onClick={() => {
                  window.location.assign("/rh/people");
                }}
              >
                <Building2 size={14} />
                Espace employeur
              </RhButton>
            ) : null}
            <RhButton variant="secondary" onClick={() => onGo("requests")}>
              <MessageSquareWarning size={14} />
              Mes demandes
            </RhButton>
            <RhButton
              variant={me?.canAccessPeople ? "secondary" : "primary"}
              shortcut="⌘N"
              onClick={() => onGo("leave")}
            >
              <CalendarPlus size={14} />
              Poser une absence
            </RhButton>
          </>
        }
      />

      <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(216px,1fr))]">
        {kpis.map((k) => (
          <RhCard key={k.id} className="p-[15px]">
            <div className="flex items-center gap-2">
              <EmpLabel>{k.label}</EmpLabel>
              {k.locked ? <Lock size={10} style={{ color: EMP_COLORS.dim }} /> : null}
            </div>
            <div className="mt-[10px] flex items-baseline gap-[5px]">
              <span
                className="rh-mono text-[27px] font-bold leading-none tracking-[-0.02em]"
                style={{ color: k.locked ? EMP_COLORS.muted : k.tone }}
              >
                {k.value}
              </span>
              <span className="rh-mono text-[12px]" style={{ color: EMP_COLORS.dim }}>
                {k.unit}
              </span>
            </div>
            <div className="mt-2 text-[11.5px]" style={{ color: EMP_COLORS.secondary }}>
              {k.sub}
            </div>
          </RhCard>
        ))}
      </div>

      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-3">
          <RhCard>
            <RhCardHead title="Ce que tu dois faire" />
            {todos.length === 0 ? (
              <div className="p-4 text-[12.5px]" style={{ color: EMP_COLORS.muted }}>
                Rien en attente
              </div>
            ) : (
              todos.map((t) => (
                <div
                  key={t.id}
                  className="flex gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <span className="w-[3px] rounded-full shrink-0" style={{ background: t.bar }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rh-badge" style={{ background: `${t.tagBg}22`, color: t.tagBg }}>
                        {t.tag}
                      </span>
                    </div>
                    <div className="text-[12.5px] font-medium" style={{ color: EMP_COLORS.text }}>
                      {t.title}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: EMP_COLORS.dim }}>
                      {t.meta}
                    </div>
                  </div>
                  <RhButton
                    variant="secondary"
                    style={{ fontSize: 12, padding: "7px 10px" }}
                    onClick={() => onGo(t.target)}
                  >
                    {t.cta}
                  </RhButton>
                </div>
              ))
            )}
          </RhCard>

          <RhCard>
            <RhCardHead
              title="Ma semaine"
              right={
                <span className="rh-mono text-[10px]" style={{ color: EMP_COLORS.dim }}>
                  TT {remoteWeek?.declaredDates?.length ?? 0}/{remoteWeek?.entitlement ?? "—"}
                  {remoteWeek ? ` · ${remoteWeek.verdict.toUpperCase()}` : ""}
                </span>
              }
            />
            <div className="grid grid-cols-5 gap-2 p-4">
              {weekDays.map((d) => (
                <div
                  key={d.key}
                  className="rounded-[10px] p-3 text-center"
                  style={{
                    background: d.tt ? "rgba(124,140,248,.18)" : EMP_COLORS.inset,
                    boxShadow: d.isToday ? `inset 0 0 0 1.4px ${EMP_COLORS.accent}` : undefined,
                  }}
                >
                  <div className="rh-mono text-[9px]" style={{ color: EMP_COLORS.dim }}>
                    {d.label}
                  </div>
                  <div
                    className="rh-mono text-[18px] font-bold my-1"
                    style={{ color: d.tt ? "#A5B0FA" : EMP_COLORS.text }}
                  >
                    {d.n}
                  </div>
                  <div className="rh-mono text-[9px]" style={{ color: d.tt ? "#A5B0FA" : EMP_COLORS.dim }}>
                    {d.mode}
                  </div>
                </div>
              ))}
            </div>
          </RhCard>
        </div>

        <aside className="rh-inspector">
          <RhCard>
            <RhCardHead title="Absents / TT aujourd'hui" />
            {awayToday.length === 0 ? (
              <div className="p-4 text-[12px]" style={{ color: EMP_COLORS.muted }}>
                Personne d&apos;absent
              </div>
            ) : (
              awayToday.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  className="flex items-center gap-2 px-4 py-2.5"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <RhAvatar initials={p.initials} color={p.color} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium truncate">{p.name}</div>
                  </div>
                  <span className="rh-mono text-[10px]" style={{ color: EMP_COLORS.dim }}>
                    {p.kind}
                  </span>
                </div>
              ))
            )}
          </RhCard>
        </aside>
      </div>
    </div>
  );
}
