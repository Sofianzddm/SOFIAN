"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  RhTabBar,
  RhTopBar,
  type RhLang,
} from "@/components/rh/chrome/shell";
import {
  RhAvatar,
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { RhDataProvider, useRhData } from "@/components/rh/RhDataContext";
import { CP, LIME, RTT, SICK, TT } from "@/components/rh/mock/shared";
import { buildThreeMonths, LEAVE_LEGEND } from "@/lib/rh/calendar-ui";
import { isFrenchHoliday } from "@/lib/rh/holidays";

type PeopleScreen =
  | "home"
  | "absences"
  | "planning"
  | "remote"
  | "time"
  | "expenses"
  | "team"
  | "approvals"
  | "rh"
  | "manage"
  | "mobile";

const TABS: { id: PeopleScreen; label: string; count?: number }[] = [
  { id: "home", label: "Aperçu" },
  { id: "absences", label: "Absences" },
  { id: "planning", label: "Planning" },
  { id: "remote", label: "Présence" },
  { id: "time", label: "Feuilles de temps" },
  { id: "expenses", label: "Frais & TR" },
  { id: "team", label: "Effectif" },
  { id: "approvals", label: "Inbox" },
  { id: "rh", label: "RH" },
  { id: "manage", label: "Admin" },
];

const ROLE_META: Record<string, string> = {
  COLLAB: "EMPLOYEE",
  MANAGER: "MANAGER",
  HR: "HR ADMIN",
};

const KIND_COLOR: Record<string, string> = {
  CP,
  RTT,
  RECUP: RTT,
  SS: SICK,
  UNPAID: "#8B95A5",
  SCHOOL: "#B48CF0",
  AUTHORIZED: "#8ED98A",
  TT,
  OFFICE: "#8B95A5",
  TRAVEL: "#F2874E",
  SITE: "#F0C24E",
};

type PlanningEmp = {
  id: string;
  name: string;
  initials: string;
  color: string;
  department: string;
  matricule: string;
  events: Array<{ date: string; kind: string; halfDay: boolean }>;
};

function PeopleAppInner() {
  const router = useRouter();
  const { me, inbox, employees, loading, error, approve, refuse, refresh } =
    useRhData();
  const [screen, setScreen] = useState<PeopleScreen>("home");
  const [lang, setLang] = useState<RhLang>("fr");
  const [palette, setPalette] = useState(false);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState<{
    employees: PlanningEmp[];
    absentToday: Array<{
      id: string;
      name: string;
      initials: string;
      color: string;
      department: string;
      kind: string;
    }>;
    coverage: Array<{
      dept: string;
      pct: number;
      label: string;
      color: string;
    }>;
    from: string;
    to: string;
  } | null>(null);
  const [myCal, setMyCal] = useState<{
    leaveDays: Array<{ date: string; accountCode: string }>;
    remoteDates: string[];
  }>({ leaveDays: [], remoteDates: [] });
  const [salaries, setSalaries] = useState<{
    rows: Array<Record<string, unknown>>;
    masseSalariale: number;
  } | null>(null);
  const [forceForm, setForceForm] = useState({
    employeeId: "",
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    accountCode: "CP",
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (error === "NO_RH_PROFILE") router.replace("/rh/login");
    if (me?.employee.rhRole === "COLLAB") router.replace("/rh/espace");
  }, [error, me, router]);

  const loadPlanning = useCallback(async () => {
    const from = new Date();
    from.setDate(1);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 27);
    const res = await fetch(
      `/api/rh/planning?from=${from.toISOString()}&to=${to.toISOString()}`
    );
    if (res.ok) setPlanning(await res.json());
  }, []);

  const loadCal = useCallback(async () => {
    const start = new Date();
    start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    const res = await fetch(
      `/api/rh/leave/calendar?from=${start.toISOString()}&to=${end.toISOString()}`
    );
    if (res.ok) setMyCal(await res.json());
  }, []);

  const loadSalaries = useCallback(async () => {
    if (me?.employee.rhRole !== "HR") return;
    const res = await fetch("/api/rh/salaries");
    if (res.ok) setSalaries(await res.json());
  }, [me]);

  useEffect(() => {
    void loadPlanning();
    void loadCal();
    void loadSalaries();
  }, [loadPlanning, loadCal, loadSalaries]);

  const months = useMemo(
    () => buildThreeMonths(myCal.leaveDays, myCal.remoteDates),
    [myCal]
  );

  const inboxItems = inbox.map((item, idx) => ({
    idx,
    id: String(item.id),
    who: (item.employee as { name?: string })?.name || "—",
    initials: (item.employee as { initials?: string })?.initials || "??",
    color: (item.employee as { avatarColor?: string })?.avatarColor || LIME,
    kind: String(item.type),
    title: String(item.title),
    meta: String(item.reference || ""),
    detail: String(item.comment || item.title),
    status: String(item.status),
  }));

  const selected = inboxItems[sel] ?? inboxItems[0];
  const rhRole = me?.employee.rhRole || "MANAGER";

  const ganttDays = useMemo(() => {
    if (!planning) return [];
    const start = new Date(planning.from + "T12:00:00");
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [planning]);

  const byDept = useMemo(() => {
    const map = new Map<string, PlanningEmp[]>();
    for (const e of planning?.employees || []) {
      const list = map.get(e.department) || [];
      list.push(e);
      map.set(e.department, list);
    }
    return [...map.entries()];
  }, [planning]);

  async function forceLeave() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/rh/admin/force", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forceLeave", ...forceForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMsg(`Écriture ${data.request?.reference} créée`);
      await loadPlanning();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !me) {
    return (
      <div className="grid min-h-screen place-items-center rh-mono text-[12px]" style={{ background: "#08090C", color: "#8B95A5" }}>
        Chargement People…
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#08090C" }}>
      <RhTopBar
        badge="PEOPLE"
        showOrg
        showPayrollSync
        searchPlaceholder="Rechercher…"
        banner={{ text: "PLATEFORME EMPLOYEUR · GLOW UP RH", tone: "orange" }}
        profile={{
          name: me?.employee.name || "—",
          meta: ROLE_META[rhRole] || rhRole,
          initials: me?.employee.initials || "??",
          color: me?.employee.avatarColor || LIME,
        }}
        lang={lang}
        onLang={setLang}
        onOpenPalette={() => setPalette(true)}
      />
      <RhTabBar
        tabs={TABS.map((t) =>
          t.id === "approvals" ? { ...t, count: inboxItems.length || undefined } : t
        )}
        active={screen}
        onChange={(id) => setScreen(id as PeopleScreen)}
        right={
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rh-mono border-0 cursor-pointer rounded-[7px] px-2.5 py-1.5 text-[10px] font-bold tracking-[0.06em]"
              style={{
                background: "#12161C",
                color: "#8B95A5",
                border: "1px solid #232932",
              }}
              onClick={() => window.location.assign("/rh/espace")}
            >
              Mon espace salarié
            </button>
            <span className="rh-mono text-[9.5px] font-bold tracking-[0.1em]" style={{ color: "#7E8998" }}>
              RÔLE · {ROLE_META[rhRole]}
            </span>
          </div>
        }
      />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        sections={[
          {
            title: "NAVIGATION",
            items: TABS.map((t) => ({
              key: t.id,
              label: t.label,
              code: `screen.${t.id}`,
            })),
          },
        ]}
      />

      {msg ? (
        <div className="px-[18px] pt-3 text-[12.5px]" style={{ color: LIME }}>{msg}</div>
      ) : null}

      {screen === "home" && (
        <div className="rh-screen">
          <RhPageHero
            eyebrow="VUE D'ENSEMBLE"
            title="Pilotage RH"
            actions={
              <>
                <RhButton variant="secondary" onClick={() => setScreen("approvals")}>
                  Inbox ({inboxItems.length})
                </RhButton>
                <RhButton onClick={() => setScreen("absences")}>Absences</RhButton>
              </>
            }
          />
          <div className="grid gap-3" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
            <RhCard>
              <RhCardHead title="Absents aujourd'hui" />
              {(planning?.absentToday || []).length === 0 ? (
                <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>Personne</div>
              ) : (
                planning!.absentToday.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-4 py-[11px]" style={{ borderBottom: "1px solid #15191F" }}>
                    <RhAvatar initials={p.initials} color={p.color} size={26} />
                    <div className="flex-1">
                      <div className="text-[12.5px] font-medium">{p.name}</div>
                      <div className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>{p.department}</div>
                    </div>
                    <RhBadge bg="rgba(70,214,192,.13)" fg={CP}>{p.kind}</RhBadge>
                  </div>
                ))
              )}
            </RhCard>
            <RhCard>
              <RhCardHead title="Couverture" />
              <div className="p-4 space-y-3">
                {(planning?.coverage || []).map((c) => (
                  <div key={c.dept}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span>{c.dept}</span>
                      <span className="rh-mono" style={{ color: "#8B95A5" }}>{c.label}</span>
                    </div>
                    <div className="h-1.5 rounded-full relative" style={{ background: "#1D2530" }}>
                      <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                      <div className="absolute top-0 bottom-0 w-px" style={{ left: "60%", background: "rgba(242,96,78,.5)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </RhCard>
          </div>
        </div>
      )}

      {screen === "absences" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="ABSENCES" title="Calendrier & soldes" />
          <RhCard>
            <RhCardHead
              title="3 mois"
              right={
                <div className="flex gap-2">
                  {LEAVE_LEGEND.map((l) => (
                    <span key={l.label} className="flex items-center gap-1 rh-mono text-[9px]" style={{ color: "#7E8998" }}>
                      <i className="w-2 h-2 rounded-[2px]" style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              }
            />
            <div className="grid gap-4 p-4" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              {months.map((m) => (
                <div key={m.title}>
                  <div className="rh-mono text-[10px] mb-2" style={{ color: "#7E8998" }}>{m.title}</div>
                  <div className="grid grid-cols-7 gap-[3px]">
                    {m.days.map((d, i) => (
                      <div
                        key={i}
                        className="rh-mono aspect-square grid place-items-center rounded-[6px] text-[11px]"
                        style={{ background: d.bg, color: d.fg, fontWeight: d.fw as never, boxShadow: d.ring }}
                      >
                        {d.n}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </RhCard>
        </div>
      )}

      {screen === "planning" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="PLANNING" title="Gantt équipe" />
          {byDept.map(([dept, rows]) => (
            <RhCard key={dept} className="mb-3 overflow-x-auto">
              <RhCardHead title={dept} badge={<RhBadge bg="#1D2530" fg="#8B95A5">{rows.length}</RhBadge>} />
              <div className="p-3 min-w-[720px]">
                <div className="grid gap-1" style={{ gridTemplateColumns: `140px repeat(${ganttDays.length},minmax(0,1fr))` }}>
                  <div />
                  {ganttDays.map((d) => (
                    <div key={d} className="rh-mono text-center text-[9px]" style={{ color: "#5F6978" }}>
                      {d.slice(8)}
                    </div>
                  ))}
                  {rows.map((r) => (
                    <div key={r.id} className="contents">
                      <div className="flex items-center gap-2 pr-2">
                        <RhAvatar initials={r.initials} color={r.color} size={22} />
                        <span className="text-[11px] truncate">{r.name.split(" ")[0]}</span>
                      </div>
                      {ganttDays.map((d) => {
                        const ev = r.events.find((e) => e.date === d);
                        const weekend = new Date(d + "T12:00:00").getDay() % 6 === 0;
                        const ferie = isFrenchHoliday(d);
                        return (
                          <div
                            key={d}
                            className="h-6 rounded-[3px]"
                            style={{
                              background: ev
                                ? KIND_COLOR[ev.kind] || LIME
                                : ferie
                                  ? "rgba(167,139,250,.35)"
                                  : weekend
                                    ? "#12161C"
                                    : "transparent",
                              opacity: ev?.halfDay ? 0.55 : 1,
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </RhCard>
          ))}
        </div>
      )}

      {screen === "remote" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="PRÉSENCE" title="Bureau · TT · Déplacement · Site" />
          <RhCard>
            {(planning?.employees || []).map((e) => {
              const tt = e.events.filter((x) => x.kind === "TT").length;
              const office = e.events.filter((x) => x.kind === "OFFICE").length;
              const travel = e.events.filter((x) => x.kind === "TRAVEL").length;
              const site = e.events.filter((x) => x.kind === "SITE").length;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-[11px]" style={{ borderBottom: "1px solid #15191F" }}>
                  <RhAvatar initials={e.initials} color={e.color} size={26} />
                  <div className="flex-1">
                    <div className="text-[12.5px] font-medium">{e.name}</div>
                    <div className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>{e.department}</div>
                  </div>
                  <span className="rh-mono text-[11px]" style={{ color: "#8B95A5" }}>{office} bureau</span>
                  <span className="rh-mono text-[11px]" style={{ color: TT }}>{tt} TT</span>
                  <span className="rh-mono text-[11px]" style={{ color: "#F2874E" }}>{travel} dépl.</span>
                  <span className="rh-mono text-[11px]" style={{ color: "#F0C24E" }}>{site} site</span>
                </div>
              );
            })}
          </RhCard>
        </div>
      )}

      {screen === "time" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="TEMPS" title="Feuilles en attente" />
          <RhCard>
            {inboxItems.filter((i) => i.kind === "TIMESHEET").length === 0 ? (
              <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>Aucune feuille en attente</div>
            ) : (
              inboxItems
                .filter((i) => i.kind === "TIMESHEET")
                .map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid #15191F" }}>
                    <RhAvatar initials={i.initials} color={i.color} size={26} />
                    <div className="flex-1">
                      <div className="text-[12.5px] font-medium">{i.who}</div>
                      <div className="rh-mono text-[10px]" style={{ color: "#7E8998" }}>{i.meta} · {i.title}</div>
                    </div>
                    <RhButton variant="danger" disabled={busy} onClick={() => { setBusy(true); void refuse(i.id).finally(() => setBusy(false)); }}>Refuser</RhButton>
                    <RhButton disabled={busy} onClick={() => { setBusy(true); void approve(i.id).finally(() => setBusy(false)); }}>Approuver</RhButton>
                  </div>
                ))
            )}
          </RhCard>
        </div>
      )}

      {screen === "expenses" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="FRAIS" title="Notes de frais" />
          <RhCard>
            {inboxItems.filter((i) => i.kind === "EXPENSE").length === 0 ? (
              <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>Aucune note en attente</div>
            ) : (
              inboxItems
                .filter((i) => i.kind === "EXPENSE")
                .map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid #15191F" }}>
                    <RhAvatar initials={i.initials} color={i.color} size={26} />
                    <div className="flex-1">
                      <div className="text-[12.5px] font-medium">{i.who}</div>
                      <div className="rh-mono text-[10px]" style={{ color: "#7E8998" }}>{i.title}</div>
                    </div>
                    <RhButton variant="danger" disabled={busy} onClick={() => { setBusy(true); void refuse(i.id).finally(() => setBusy(false)); }}>Refuser</RhButton>
                    <RhButton disabled={busy} onClick={() => { setBusy(true); void approve(i.id).finally(() => setBusy(false)); }}>Approuver</RhButton>
                  </div>
                ))
            )}
          </RhCard>
        </div>
      )}

      {screen === "team" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="EFFECTIF" title={`${employees.length} collaborateurs`} />
          <RhCard>
            {employees.map((e) => (
              <div key={String(e.id)} className="grid items-center px-4 py-[11px]" style={{ gridTemplateColumns: "1.5fr 1.2fr 110px 90px", borderBottom: "1px solid #15191F" }}>
                <div className="flex items-center gap-2">
                  <RhAvatar initials={String(e.initials)} color={String(e.avatarColor || LIME)} size={26} />
                  <div>
                    <div className="text-[12.5px] font-medium">{String(e.name)}</div>
                    <div className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>{String(e.matricule)}</div>
                  </div>
                </div>
                <span className="text-[12px] truncate" style={{ color: "#B9C2CE" }}>{String(e.jobTitle)}</span>
                <span className="rh-mono text-[10px]">{String(e.department).slice(0, 14)}</span>
                <span className="rh-mono text-right text-[12px]">{Number(e.bookableSum || 0).toFixed(1)} j</span>
              </div>
            ))}
          </RhCard>
        </div>
      )}

      {screen === "approvals" && (
        <div className="rh-screen">
          <RhPageHero
            eyebrow="INBOX"
            title="Validations"
            actions={
              <RhButton
                disabled={busy || !inboxItems.length}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      for (const item of inboxItems) await approve(item.id);
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Tout approuver
              </RhButton>
            }
          />
          <div className="rh-layout-inspect-wide">
            <RhCard>
              {inboxItems.length === 0 ? (
                <div className="p-6 text-[12.5px]" style={{ color: "#8B95A5" }}>File vide</div>
              ) : (
                inboxItems.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSel(r.idx)}
                    className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-0 cursor-pointer"
                    style={{
                      background: r.idx === sel ? "#151C23" : "transparent",
                      borderBottom: "1px solid #15191F",
                      borderLeft: `2px solid ${r.idx === sel ? LIME : "transparent"}`,
                    }}
                  >
                    <RhAvatar initials={r.initials} color={r.color} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{r.who}</div>
                      <div className="rh-mono text-[9.5px]" style={{ color: "#7E8998" }}>{r.kind} · {r.meta}</div>
                    </div>
                    <span className="rh-mono text-[10px]" style={{ color: "#8B95A5" }}>{r.status}</span>
                  </button>
                ))
              )}
            </RhCard>
            {selected ? (
              <RhCard strong>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid #1B212A" }}>
                  <RhAvatar initials={selected.initials} color={selected.color} size={34} />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold">{selected.who}</div>
                    <div className="rh-mono text-[9.5px]" style={{ color: "#7E8998" }}>{selected.meta}</div>
                  </div>
                  <RhButton variant="danger" disabled={busy} onClick={() => { setBusy(true); void refuse(selected.id).finally(() => setBusy(false)); }}>
                    Refuser
                  </RhButton>
                  <RhButton disabled={busy} onClick={() => { setBusy(true); void approve(selected.id).finally(() => setBusy(false)); }}>
                    Approuver
                  </RhButton>
                </div>
                <div className="p-4 text-[12.5px]" style={{ color: "#B9C2CE" }}>{selected.detail}</div>
              </RhCard>
            ) : null}
          </div>
        </div>
      )}

      {screen === "rh" && (
        <div className="rh-screen">
          <RhPageHero
            eyebrow="RH"
            title="Paie & dossiers"
            actions={
              rhRole === "HR" ? (
                <RhButton
                  variant="secondary"
                  onClick={() => {
                    window.location.href = "/api/rh/payroll/export";
                  }}
                >
                  Export absences XLSX
                </RhButton>
              ) : null
            }
          />
          {rhRole !== "HR" ? (
            <div className="text-[12.5px]" style={{ color: "#8B95A5" }}>Réservé au rôle HR</div>
          ) : (
            <RhCard>
              <RhCardHead
                title="Masse salariale"
                right={
                  <span className="rh-mono text-[16px]" style={{ color: LIME }}>
                    {salaries ? `${Math.round(salaries.masseSalariale).toLocaleString("fr-FR")} €` : "…"}
                  </span>
                }
              />
              {(salaries?.rows || []).map((r) => (
                <div key={String(r.id)} className="grid items-center px-4 py-[10px]" style={{ gridTemplateColumns: "1.4fr 90px 90px 80px 70px", borderBottom: "1px solid #15191F" }}>
                  <span className="text-[12px] font-medium truncate">{String(r.name)}</span>
                  <span className="rh-mono text-[10px]">{String(r.matricule)}</span>
                  <span className="rh-mono text-right text-[12px]">{r.grossSalary != null ? `${r.grossSalary} €` : "—"}</span>
                  <span className="rh-mono text-[11px]">{String(r.healthCover)}</span>
                  <span className="rh-mono text-right text-[11px]" style={{ color: RTT }}>
                    {Number(r.ot25 || 0) + Number(r.ot50 || 0)} h
                  </span>
                </div>
              ))}
            </RhCard>
          )}
        </div>
      )}

      {screen === "manage" && (
        <div className="rh-screen">
          <RhPageHero eyebrow="ADMIN" title="Saisie forcée" />
          {rhRole !== "HR" ? (
            <div className="text-[12.5px]" style={{ color: "#8B95A5" }}>Réservé HR</div>
          ) : (
            <div className="rh-layout-inspect-wide">
              <RhCard className="p-4 flex flex-col gap-3">
                <select
                  className="rh-input"
                  value={forceForm.employeeId}
                  onChange={(e) => setForceForm({ ...forceForm, employeeId: e.target.value })}
                >
                  <option value="">Choisir un collaborateur</option>
                  {employees.map((e) => (
                    <option key={String(e.id)} value={String(e.id)}>
                      {String(e.name)} · {String(e.matricule)}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="rh-input" value={forceForm.from} onChange={(e) => setForceForm({ ...forceForm, from: e.target.value })} />
                  <input type="date" className="rh-input" value={forceForm.to} onChange={(e) => setForceForm({ ...forceForm, to: e.target.value })} />
                </div>
                <select
                  className="rh-input"
                  value={forceForm.accountCode}
                  onChange={(e) => setForceForm({ ...forceForm, accountCode: e.target.value })}
                >
                  <option value="CP">Congés payés</option>
                  <option value="RECUP">Récupération</option>
                  <option value="SS">Maladie</option>
                  <option value="SCHOOL">École</option>
                  <option value="AUTHORIZED">Absence autorisée</option>
                  <option value="UNPAID">Sans solde</option>
                  <option value="RTT">RTT</option>
                </select>
                <RhButton disabled={busy || !forceForm.employeeId} onClick={() => void forceLeave()}>
                  Enregistrer (tracé)
                </RhButton>
              </RhCard>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PeopleApp() {
  return (
    <RhDataProvider loadPeople>
      <PeopleAppInner />
    </RhDataProvider>
  );
}
