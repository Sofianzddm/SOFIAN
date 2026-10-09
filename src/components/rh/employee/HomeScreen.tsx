"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  FileText,
  Home,
  Laptop,
  Receipt,
} from "lucide-react";
import {
  RhAvatar,
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

export type EmployeeScreenId =
  | "home"
  | "leave"
  | "remote"
  | "time"
  | "expenses"
  | "folder"
  | "requests";

type RemoteWeek = {
  isoWeek: number;
  weekStart: string;
  declaredDates: string[];
  entitlement: number;
  verdict: string;
};

const QUICK: Array<{
  id: EmployeeScreenId;
  title: string;
  desc: string;
  icon: typeof CalendarDays;
}> = [
  {
    id: "leave",
    title: "Poser une absence",
    desc: "Congés, RTT, récup, maladie…",
    icon: CalendarDays,
  },
  {
    id: "remote",
    title: "Ma présence",
    desc: "Bureau, télétravail, déplacement",
    icon: Laptop,
  },
  {
    id: "time",
    title: "Mon temps",
    desc: "Feuille de la semaine + heures supp.",
    icon: Clock3,
  },
  {
    id: "expenses",
    title: "Mes frais",
    desc: "Notes de frais et justificatifs",
    icon: Receipt,
  },
];

export function HomeScreen({ onGo }: { onGo: (s: EmployeeScreenId) => void }) {
  const { me, home } = useRhData();
  const [remoteWeek, setRemoteWeek] = useState<RemoteWeek | null>(null);

  // Synchro présence depuis /api/rh/home (rafraîchi après chaque action)
  useEffect(() => {
    const presence = home?.presence as
      | {
          isoWeek?: number;
          weekStart?: string;
          places?: Record<string, string>;
          pendingRemote?: string[];
          remoteAgreement?: number;
        }
      | undefined;
    if (!presence) return;
    const approved = Object.entries(presence.places || {})
      .filter(([, p]) => p === "REMOTE")
      .map(([d]) => d);
    const pending = presence.pendingRemote || [];
    const declared = [...new Set([...approved, ...pending])];
    setRemoteWeek({
      isoWeek: presence.isoWeek || 0,
      weekStart: presence.weekStart || "",
      declaredDates: declared,
      entitlement: presence.remoteAgreement || 0,
      verdict: pending.length
        ? "pending"
        : declared.length
          ? "compliant"
          : "undeclared",
    });
  }, [home]);

  // Fallback si home.presence absent (ancien cache)
  useEffect(() => {
    if (remoteWeek || !home) return;
    void (async () => {
      const res = await fetch("/api/rh/office/weeks", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const w = data.weeks?.[0];
      if (!w) return;
      const approved = Object.entries(w.places || {})
        .filter(([, p]) => p === "REMOTE")
        .map(([d]) => d as string);
      const pending = (w.pendingRemote || []) as string[];
      setRemoteWeek({
        isoWeek: w.isoWeek,
        weekStart: w.weekStart,
        declaredDates: [...new Set([...approved, ...pending])],
        entitlement: w.entitlement,
        verdict: w.verdict,
      });
    })();
  }, [home, remoteWeek]);

  const todos =
    (home?.todos as Array<{
      id: string;
      bar: string;
      tag: string;
      tagBg: string;
      title: string;
      meta: string;
      cta: string;
    target: EmployeeScreenId | string;
    urgent?: boolean;
  }>) || [];
  const awayToday =
    (home?.awayToday as Array<{
      name: string;
      initials: string;
      color: string;
      kind: string;
    }>) || [];

  const greeting = me ? `Bonjour ${me.employee.prenom}` : "Bonjour";
  const today = home?.today as { date?: string; isoWeek?: number } | undefined;
  const dateLabel = today?.date
    ? new Date(today.date).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const weekDays = (() => {
    const base = today?.date ? new Date(today.date) : new Date();
    const dow = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - dow);
    const presence = home?.presence as
      | { pendingRemote?: string[]; places?: Record<string, string> }
      | undefined;
    const pendingSet = new Set(presence?.pendingRemote || []);
    const remoteSet = new Set(remoteWeek?.declaredDates || []);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const isToday = key === (today?.date || "").slice(0, 10);
      const pending = pendingSet.has(key);
      const tt = remoteSet.has(key) || pending;
      return {
        key,
        n: d.getDate(),
        label: d
          .toLocaleDateString("fr-FR", { weekday: "short" })
          .replace(".", ""),
        mode: pending ? "TT · attente" : tt ? "Télétravail" : "Bureau",
        tt,
        pending,
        isToday,
      };
    });
  })();

  const ttUsed = remoteWeek?.declaredDates?.length ?? 0;
  const ttMax = remoteWeek?.entitlement ?? 0;
  const ttPending = remoteWeek?.verdict === "pending";

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow={dateLabel ? dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) : "Mon espace"}
        title={greeting}
        subtitle={
          todos.length > 0
            ? `${todos.length} action${todos.length > 1 ? "s" : ""} à traiter — commence par la première.`
            : "Rien d’urgent. Présence, temps ou absence quand tu veux."
        }
        actions={
          todos[0] ? (
            <RhButton
              onClick={() =>
                onGo(
                  ([
                    "leave",
                    "remote",
                    "time",
                    "expenses",
                    "folder",
                    "requests",
                  ].includes(String(todos[0].target))
                    ? todos[0].target
                    : "requests") as EmployeeScreenId
                )
              }
            >
              {todos[0].cta || "Voir"}
            </RhButton>
          ) : (
            <RhButton onClick={() => onGo("remote")}>
              <Laptop size={16} />
              Déclarer ma présence
            </RhButton>
          )
        }
      />

      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-4">
          <RhCard strong>
            <RhCardHead
              title={todos.length > 0 ? "Parcours du jour" : "À faire"}
              right={
                todos.length === 0 ? (
                  <span
                    className="text-[12.5px]"
                    style={{ color: EMP_COLORS.success }}
                  >
                    Tout est à jour
                  </span>
                ) : null
              }
            />
            {todos.length === 0 ? (
              <div
                className="px-5 py-6 text-[14px]"
                style={{ color: EMP_COLORS.muted }}
              >
                Rien en attente.
              </div>
            ) : (
              todos.map((t, i) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <span
                    className="grid place-items-center rounded-full text-[12px] font-semibold shrink-0"
                    style={{
                      width: 24,
                      height: 24,
                      background: i === 0 ? "rgba(229,242,181,.18)" : EMP_COLORS.inset,
                      color: i === 0 ? EMP_COLORS.accent : EMP_COLORS.dim,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 sm:min-w-[180px]">
                    <div
                      className="text-[14px] font-semibold"
                      style={{ color: EMP_COLORS.text }}
                    >
                      {t.title}
                    </div>
                    <div
                      className="mt-1 text-[12.5px]"
                      style={{ color: EMP_COLORS.muted }}
                    >
                      {t.meta}
                    </div>
                  </div>
                  <RhButton
                    variant={i === 0 ? undefined : "secondary"}
                    onClick={() =>
                      onGo(
                        (["home", "leave", "remote", "time", "expenses", "folder", "requests"].includes(
                          String(t.target)
                        )
                          ? t.target
                          : "requests") as EmployeeScreenId
                      )
                    }
                  >
                    {t.cta}
                  </RhButton>
                </div>
              ))
            )}
          </RhCard>

          <div
            data-tour="home-quick"
            className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]"
          >
            {QUICK.map((q, i) => {
              const Icon = q.icon;
              return (
                <button
                  key={q.id}
                  type="button"
                  className="rh-action-tile"
                  style={{ padding: "14px 14px" }}
                  onClick={() => onGo(q.id)}
                >
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: EMP_COLORS.dim }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="grid place-items-center rounded-[10px]"
                    style={{
                      width: 28,
                      height: 28,
                      background: "rgba(229,242,181,.12)",
                      color: EMP_COLORS.accent,
                    }}
                  >
                    <Icon size={15} />
                  </span>
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: EMP_COLORS.text }}
                  >
                    {q.title}
                  </div>
                </button>
              );
            })}
          </div>

          <RhCard>
            <RhCardHead
              title="Cette semaine"
              right={
                <button
                  type="button"
                  className="border-0 bg-transparent cursor-pointer text-[12.5px] font-medium"
                  style={{ color: EMP_COLORS.accent }}
                  onClick={() => onGo("remote")}
                >
                  Modifier
                </button>
              }
            />
            <div className="px-4 pb-2 text-[12.5px]" style={{ color: EMP_COLORS.muted }}>
              Télétravail {ttUsed}/{ttMax || "—"} jour
              {ttMax > 1 ? "s" : ""} autorisé{ttMax > 1 ? "s" : ""}
              {ttPending ? " · en validation" : ""}
            </div>
            <div className="grid grid-cols-5 gap-2 p-4 pt-1">
              {weekDays.map((d) => (
                <div
                  key={d.key}
                  className="rounded-[14px] p-3 text-center"
                  style={{
                    background: d.tt
                      ? "rgba(124,140,248,.16)"
                      : EMP_COLORS.inset,
                    outline: d.isToday
                      ? `2px solid ${EMP_COLORS.accent}`
                      : d.pending
                        ? `1.5px dashed #7C8CF8`
                        : undefined,
                    outlineOffset: 0,
                  }}
                >
                  <div
                    className="text-[11px] font-medium capitalize"
                    style={{ color: EMP_COLORS.dim }}
                  >
                    {d.label}
                  </div>
                  <div
                    className="text-[20px] font-semibold my-1"
                    style={{ color: d.tt ? "#A5B0FA" : EMP_COLORS.text }}
                  >
                    {d.n}
                  </div>
                  <div
                    className="text-[10.5px] leading-tight"
                    style={{ color: d.tt ? "#A5B0FA" : EMP_COLORS.dim }}
                  >
                    {d.mode}
                  </div>
                </div>
              ))}
            </div>
          </RhCard>
        </div>

        <aside className="rh-inspector">
          <RhCard>
            <RhCardHead title="Équipe aujourd’hui" />
            {awayToday.length === 0 ? (
              <div
                className="flex items-center gap-3 px-5 py-6 text-[13.5px]"
                style={{ color: EMP_COLORS.muted }}
              >
                <Home size={16} />
                Tout le monde est là
              </div>
            ) : (
              awayToday.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <RhAvatar initials={p.initials} color={p.color} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium truncate">
                      {p.name}
                    </div>
                    <div
                      className="text-[12px]"
                      style={{ color: EMP_COLORS.muted }}
                    >
                      {p.kind}
                    </div>
                  </div>
                </div>
              ))
            )}
          </RhCard>

          <RhCard>
            <RhCardHead title="Raccourcis" />
            <div className="flex flex-col gap-1 p-2">
              <RhButton
                variant="ghost"
                className="justify-start px-3 py-2.5 text-[13px]"
                onClick={() => onGo("requests")}
              >
                <FileText size={14} />
                Suivre mes demandes
              </RhButton>
              <RhButton
                variant="ghost"
                className="justify-start px-3 py-2.5 text-[13px]"
                onClick={() => onGo("folder")}
              >
                <FileText size={14} />
                Mon dossier RH
              </RhButton>
            </div>
          </RhCard>
        </aside>
      </div>
    </div>
  );
}
