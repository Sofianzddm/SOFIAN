"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  RhTabBar,
  RhTopBar,
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
import {
  CP,
  KIND_COLOR,
  KIND_LABEL,
  LIME,
  ROLE_META,
  TABS,
  TT,
  buildTeamAbsences,
  endOfWeek,
  formatFr,
  isoDate,
  startOfWeek,
  type EmployeeFiche,
  type ForceForm,
  type InboxItem,
  type PeopleScreen,
  type PlanningData,
  type SigItem,
} from "@/components/rh/people/people-utils";
import { PlanningGanttScreen } from "@/components/rh/people/screens/PlanningGanttScreen";
import { ApprovalsInboxScreen } from "@/components/rh/people/screens/ApprovalsInboxScreen";
import { PayrollScreen } from "@/components/rh/people/screens/PayrollScreen";
import { ManageAdminScreen } from "@/components/rh/people/screens/ManageAdminScreen";

function PeopleAppInner() {
  const router = useRouter();
  const { me, inbox, employees, loading, error, approve, refuse, refresh } =
    useRhData();
  const [screen, setScreen] = useState<PeopleScreen>("home");
  const [palette, setPalette] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState<PlanningData | null>(null);
  const [salaries, setSalaries] = useState<{
    rows: Array<Record<string, unknown>>;
    masseSalariale: number;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "err">("ok");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );
  const [fiche, setFiche] = useState<EmployeeFiche | null>(null);
  const [ficheLoading, setFicheLoading] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    accountCode: "CP",
    remaining: "",
  });
  const [sigItems, setSigItems] = useState<SigItem[]>([]);
  const [sigLoading, setSigLoading] = useState(false);

  useEffect(() => {
    if (error === "NO_RH_PROFILE") router.replace("/rh/login");
    // Collabs / managers → espace salarié ; ADMIN → console employeur
    if (me && !me.canAccessPeople) {
      router.replace("/rh/espace");
    }
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

  const loadSalaries = useCallback(async () => {
    if (me?.employee.rhRole !== "HR") return;
    const res = await fetch("/api/rh/salaries");
    if (res.ok) setSalaries(await res.json());
  }, [me]);

  const loadSignatures = useCallback(async () => {
    setSigLoading(true);
    try {
      const res = await fetch("/api/rh/timesheets/signatures");
      if (res.ok) {
        const data = await res.json();
        setSigItems(data.items || []);
      }
    } finally {
      setSigLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlanning();
    void loadSalaries();
  }, [loadPlanning, loadSalaries]);

  useEffect(() => {
    if (screen === "time") void loadSignatures();
  }, [screen, loadSignatures]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setFiche(null);
      return;
    }
    let cancelled = false;
    setFicheLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/rh/employees/${selectedEmployeeId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Impossible de charger la fiche");
        if (!cancelled) {
          setFiche(data as EmployeeFiche);
          const firstBal = (data.balances as EmployeeFiche["balances"])?.find(
            (b) => ["CP", "RTT", "RECUP"].includes(b.accountCode)
          );
          setAdjustForm({
            accountCode: firstBal?.accountCode || "CP",
            remaining: firstBal != null ? String(firstBal.remaining) : "",
          });
        }
      } catch (e) {
        if (!cancelled) {
          setMsg(e instanceof Error ? e.message : "Erreur de chargement fiche");
          setMsgTone("err");
          setSelectedEmployeeId(null);
        }
      } finally {
        if (!cancelled) setFicheLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEmployeeId]);

  const inboxItems: InboxItem[] = inbox.map((item, idx) => ({
    idx,
    id: String(item.id),
    who: (item.employee as { name?: string })?.name || "—",
    initials: (item.employee as { initials?: string })?.initials || "??",
    color: (item.employee as { avatarColor?: string })?.avatarColor || LIME,
    avatarUrl: (item.employee as { avatarUrl?: string | null })?.avatarUrl || null,
    employeeId: (item.employee as { id?: string })?.id || "",
    kind: String(item.type),
    title: String(item.title),
    meta: String(item.reference || ""),
    comment: String(item.comment || ""),
    detailRaw: (item.detail as Record<string, unknown>) || {},
    status: String(item.status),
  }));

  const rhRole = me?.employee.rhRole || "MANAGER";

  const teamAbsences = useMemo(
    () => buildTeamAbsences(planning?.employees || []),
    [planning]
  );

  const { thisWeekAbsences, upcomingAbsences } = useMemo(() => {
    const today = new Date();
    const w0 = isoDate(startOfWeek(today));
    const w1 = isoDate(endOfWeek(today));
    const thisWeek = teamAbsences.filter((a) => a.from <= w1 && a.to >= w0);
    const upcoming = teamAbsences.filter((a) => a.from > w1);
    return { thisWeekAbsences: thisWeek, upcomingAbsences: upcoming };
  }, [teamAbsences]);

  function flash(text: string, tone: "ok" | "err" = "ok") {
    setMsg(text);
    setMsgTone(tone);
  }

  async function handleApprove(id: string, who: string) {
    if (!window.confirm(`Approuver la demande de ${who} ?`)) return;
    setBusy(true);
    flash("");
    try {
      await approve(id);
      flash("Demande approuvée");
      void loadSignatures();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur d'approbation", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefuse(id: string, who: string) {
    if (!window.confirm(`Refuser la demande de ${who} ?`)) return;
    const motif = window.prompt("Motif du refus (obligatoire) :");
    if (motif == null) return;
    const trimmed = motif.trim();
    if (!trimmed) {
      flash("Indique un motif de refus — le collaborateur le verra sur son accueil", "err");
      return;
    }
    setBusy(true);
    flash("");
    try {
      await refuse(id, trimmed);
      flash("Demande refusée");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur de refus", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveAll() {
    const n = inboxItems.length;
    if (!n) return;
    if (!window.confirm(`Approuver ${n} demande${n > 1 ? "s" : ""} ?`)) return;
    setBusy(true);
    flash("");
    try {
      for (const item of inboxItems) await approve(item.id);
      flash(`${n} demande${n > 1 ? "s" : ""} approuvée${n > 1 ? "s" : ""}`);
      void loadSignatures();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur lors de l'approbation groupée", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestSignature(timesheetId: string, who: string) {
    if (!window.confirm(`Envoyer la feuille de ${who} en signature électronique ?`))
      return;
    setBusy(true);
    flash("");
    try {
      const res = await fetch("/api/rh/timesheets/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", timesheetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      flash(`Signature demandée à ${who}`);
      await loadSignatures();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur signature", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleMonthlySignatures() {
    const now = new Date();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    if (
      !window.confirm(
        `Envoyer via DocuSeal les feuilles validées de ${String(month).padStart(2, "0")}/${year} ?\nChaque collab reçoit ~4 semaines en un seul lien de signature.`
      )
    )
      return;
    setBusy(true);
    flash("");
    try {
      const res = await fetch("/api/rh/timesheets/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "monthly", year, month }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      flash(
        `${data.packages ?? 0} collab · ${data.weeks ?? 0} feuille(s) envoyée(s) DocuSeal`
      );
      await loadSignatures();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur batch", "err");
    } finally {
      setBusy(false);
    }
  }

  async function forceLeave(form: ForceForm) {
    setBusy(true);
    flash("");
    try {
      const res = await fetch("/api/rh/admin/force", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forceLeave",
          employeeId: form.employeeId,
          from: form.from,
          to: form.minutes !== "" ? form.from : form.to,
          accountCode: form.accountCode,
          minutes: form.minutes !== "" ? form.minutes : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      flash(`Écriture ${data.request?.reference} créée`);
      await loadPlanning();
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur", "err");
    } finally {
      setBusy(false);
    }
  }

  async function adjustBalance() {
    if (!selectedEmployeeId || !fiche) return;
    const remaining = Number(adjustForm.remaining);
    if (Number.isNaN(remaining)) {
      flash("Solde restant invalide", "err");
      return;
    }
    if (
      !window.confirm(
        `Ajuster le solde ${adjustForm.accountCode} de ${fiche.employee.name} à ${remaining} j restants ?`
      )
    ) {
      return;
    }
    setBusy(true);
    flash("");
    try {
      const res = await fetch("/api/rh/admin/force", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjustBalance",
          employeeId: selectedEmployeeId,
          accountCode: adjustForm.accountCode,
          remaining,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      flash(`Solde ${adjustForm.accountCode} ajusté`);
      const reload = await fetch(`/api/rh/employees/${selectedEmployeeId}`);
      if (reload.ok) setFiche((await reload.json()) as EmployeeFiche);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur d'ajustement", "err");
    } finally {
      setBusy(false);
    }
  }

  function openFiche(employeeId: string) {
    setSelectedEmployeeId(employeeId);
  }

  function closeFiche() {
    setSelectedEmployeeId(null);
    setFiche(null);
  }

  if (loading && !me) {
    return (
      <div
        className="grid min-h-screen place-items-center text-[14px]"
        style={{ background: "#08090C", color: "#8B95A5" }}
      >
        Chargement de l’espace manager…
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => {
    if (t.id === "rh" || t.id === "manage") return rhRole === "HR";
    return true;
  });

  return (
    <div className="min-h-screen" style={{ background: "#08090C" }}>
      <RhTopBar
        badge="Console RH"
        searchPlaceholder="Aller à Absences, Planning…"
        banner={{
          text:
            inboxItems.length > 0
              ? `${inboxItems.length} demande${inboxItems.length > 1 ? "s" : ""} à valider`
              : ROLE_META[rhRole] || rhRole,
          tone: "orange",
        }}
        headerAction={{
          label: "Mon espace",
          variant: "ghost",
          onClick: () => router.push("/rh/espace"),
        }}
        profile={{
          name: me?.employee.name || "—",
          meta: ROLE_META[rhRole] || rhRole,
          initials: me?.employee.initials || "??",
          color: me?.employee.avatarColor || LIME,
          avatarUrl: me?.employee.avatarUrl,
        }}
        onOpenPalette={() => setPalette(true)}
      />
      <RhTabBar
        tabs={visibleTabs.map((t) =>
          t.id === "approvals"
            ? { ...t, count: inboxItems.length || undefined }
            : t
        )}
        active={screen}
        onChange={(id) => setScreen(id as PeopleScreen)}
      />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        sections={[
          {
            title: "Aller à",
            items: visibleTabs.map((t, i) => ({
              key: String(i + 1),
              label: t.label,
              code: t.id,
            })),
          },
        ]}
        onSelect={(item) => setScreen(item.code as PeopleScreen)}
      />

      {msg ? (
        <div
          className="px-[18px] pt-3 text-[12.5px]"
          style={{ color: msgTone === "err" ? "#F2604E" : LIME }}
        >
          {msg}
        </div>
      ) : null}

      {screen === "home" && (
        <div className="rh-screen">
          <RhPageHero
            eyebrow="VUE D'ENSEMBLE"
            title="Pilotage RH"
            subtitle="Vue d'ensemble de votre équipe : absents du jour et couverture par service."
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
          <RhPageHero
            eyebrow="ABSENCES ÉQUIPE"
            title="Qui est absent ?"
            subtitle="Absences en cours et à venir de votre périmètre, avec les jours encore posables par collaborateur."
          />
          <div className="grid gap-3" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
            <div className="space-y-3">
              <RhCard>
                <RhCardHead
                  title="Qui est absent cette semaine ?"
                  badge={
                    <RhBadge bg="#1D2530" fg="#8B95A5">
                      {thisWeekAbsences.length}
                    </RhBadge>
                  }
                />
                {thisWeekAbsences.length === 0 ? (
                  <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
                    Personne n&apos;est absent sur la semaine en cours.
                  </div>
                ) : (
                  thisWeekAbsences.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => openFiche(a.employeeId)}
                      className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-0 cursor-pointer"
                      style={{
                        background: "transparent",
                        borderBottom: "1px solid #15191F",
                      }}
                    >
                      <RhAvatar initials={a.initials} color={a.color} size={26} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                        <div className="rh-mono text-[9.5px]" style={{ color: "#7E8998" }}>
                          {a.department} · {formatFr(a.from)}
                          {a.from !== a.to ? ` → ${formatFr(a.to)}` : ""} · {a.days} j
                        </div>
                      </div>
                      <RhBadge
                        bg="rgba(70,214,192,.13)"
                        fg={KIND_COLOR[a.kind] || CP}
                      >
                        {KIND_LABEL[a.kind] || a.kind}
                      </RhBadge>
                    </button>
                  ))
                )}
              </RhCard>

              <RhCard>
                <RhCardHead
                  title="À venir"
                  badge={
                    <RhBadge bg="#1D2530" fg="#8B95A5">
                      {upcomingAbsences.length}
                    </RhBadge>
                  }
                />
                {upcomingAbsences.length === 0 ? (
                  <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
                    Aucune absence planifiée après cette semaine.
                  </div>
                ) : (
                  upcomingAbsences.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => openFiche(a.employeeId)}
                      className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-0 cursor-pointer"
                      style={{
                        background: "transparent",
                        borderBottom: "1px solid #15191F",
                      }}
                    >
                      <RhAvatar initials={a.initials} color={a.color} size={26} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                        <div className="rh-mono text-[9.5px]" style={{ color: "#7E8998" }}>
                          {formatFr(a.from)}
                          {a.from !== a.to ? ` → ${formatFr(a.to)}` : ""} · {a.days} j
                        </div>
                      </div>
                      <RhBadge
                        bg="rgba(70,214,192,.13)"
                        fg={KIND_COLOR[a.kind] || CP}
                      >
                        {KIND_LABEL[a.kind] || a.kind}
                      </RhBadge>
                    </button>
                  ))
                )}
              </RhCard>
            </div>

            <RhCard>
              <RhCardHead title="Soldes posables" />
              {employees.length === 0 ? (
                <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
                  Aucun collaborateur
                </div>
              ) : (
                employees.map((e) => {
                  const balances = (Array.isArray(e.balances) ? e.balances : []) as Array<{
                    accountCode: string;
                    bookable: number;
                  }>;
                  const byCode = ["CP", "RTT", "RECUP"]
                    .map((code) => {
                      const sum = balances
                        .filter((b) => b.accountCode === code)
                        .reduce((s, b) => s + Number(b.bookable || 0), 0);
                      return { code, sum };
                    })
                    .filter((x) => x.sum > 0);
                  return (
                    <button
                      key={String(e.id)}
                      type="button"
                      onClick={() => openFiche(String(e.id))}
                      className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-0 cursor-pointer"
                      style={{
                        background: "transparent",
                        borderBottom: "1px solid #15191F",
                      }}
                    >
                      <RhAvatar
                        initials={String(e.initials)}
                        color={String(e.avatarColor || LIME)}
                        size={26}
                        src={e.avatarUrl as string | null | undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">
                          {String(e.name)}
                        </div>
                        <div className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>
                          {byCode.length
                            ? byCode
                                .map((x) => `${x.code} ${x.sum.toFixed(1)}`)
                                .join(" · ")
                            : "Aucun jour posable"}
                        </div>
                      </div>
                      <span
                        className="rh-mono text-[12px] font-bold"
                        style={{ color: LIME }}
                      >
                        {Number(e.bookableSum || 0).toFixed(1)} j
                      </span>
                    </button>
                  );
                })
              )}
            </RhCard>
          </div>
        </div>
      )}

      {screen === "planning" && (
        <PlanningGanttScreen planning={planning} onOpenFiche={openFiche} />
      )}

      {screen === "remote" && (
        <div className="rh-screen">
          <RhPageHero
            eyebrow="PRÉSENCE"
            title="Bureau · TT · Déplacement · Site"
            subtitle="Répartition des modes de présence de l'équipe sur la période chargée."
          />
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
          <RhPageHero
            eyebrow="TEMPS"
            title="Feuilles de temps"
            subtitle="Valider, puis envoyer en signature électronique au collaborateur."
            actions={
              me?.employee.rhRole === "HR" ? (
                <RhButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleMonthlySignatures()}
                >
                  Envoyer le mois (≈4 feuilles / collab)
                </RhButton>
              ) : undefined
            }
          />
          <RhCard>
            <RhCardHead title="À valider" />
            {inboxItems.filter((i) => i.kind === "TIMESHEET").length === 0 ? (
              <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>Aucune feuille en attente</div>
            ) : (
              inboxItems
                .filter((i) => i.kind === "TIMESHEET")
                .map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid #15191F" }}>
                    <RhAvatar initials={i.initials} color={i.color} size={26} />
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-[12.5px] font-medium">{i.who}</div>
                      <div className="rh-mono text-[10px]" style={{ color: "#7E8998" }}>{i.meta} · {i.title}</div>
                    </div>
                    <RhButton variant="danger" disabled={busy} onClick={() => void handleRefuse(i.id, i.who)}>Refuser</RhButton>
                    <RhButton disabled={busy} onClick={() => void handleApprove(i.id, i.who)}>Approuver</RhButton>
                  </div>
                ))
            )}
          </RhCard>
          <RhCard>
            <RhCardHead
              title="Signature électronique"
              right={
                <RhButton
                  variant="secondary"
                  disabled={sigLoading}
                  onClick={() => void loadSignatures()}
                >
                  Actualiser
                </RhButton>
              }
            />
            {sigLoading && !sigItems.length ? (
              <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>Chargement…</div>
            ) : sigItems.length === 0 ? (
              <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
                Aucune feuille validée en attente de signature
              </div>
            ) : (
              sigItems.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-[12.5px] font-medium">{t.name}</div>
                    <div className="rh-mono text-[10px]" style={{ color: "#7E8998" }}>
                      S{t.isoWeek} {t.isoYear} · {Math.round(t.totalMinutes / 60)} h
                      {t.signatureRequestedAt ? " · envoyée" : ""}
                    </div>
                  </div>
                  {(t.pdfUrl || t.signedPdfUrl) && (
                    <RhButton
                      variant="secondary"
                      onClick={() =>
                        window.open(
                          t.signedPdfUrl || t.pdfUrl || "",
                          "_blank",
                          "noopener"
                        )
                      }
                    >
                      PDF
                    </RhButton>
                  )}
                  {t.signatureRequestedAt ? (
                    <RhBadge bg="rgba(70,214,192,.13)" fg="#46D6C0">
                      DocuSeal · en attente
                    </RhBadge>
                  ) : (
                    <RhButton
                      disabled={busy}
                      onClick={() => void handleRequestSignature(t.id, t.name)}
                    >
                      Envoyer via DocuSeal
                    </RhButton>
                  )}
                </div>
              ))
            )}
          </RhCard>
        </div>
      )}

      {screen === "expenses" && (
        <div className="flex flex-col gap-4">
          <ApprovalsInboxScreen
            inboxItems={inboxItems.filter((i) => i.kind === "EXPENSE")}
            busy={busy}
            onApprove={handleApprove}
            onRefuse={handleRefuse}
            onApproveAll={handleApproveAll}
            onOpenFiche={openFiche}
          />
          {rhRole === "HR" ? (
            <ExpensesToPayPanel
              busy={busy}
              onFlash={flash}
              onOpenFiche={openFiche}
            />
          ) : null}
        </div>
      )}

      {screen === "team" && (
        <div className="rh-screen">
          <RhPageHero
            eyebrow="EFFECTIF"
            title={`${employees.length} collaborateurs`}
            subtitle="Annuaire de votre périmètre avec le total de jours encore posables."
          />
          <RhCard>
            {employees.map((e) => {
              const mgr = e.managerId
                ? employees.find((x) => String(x.id) === String(e.managerId))
                : null;
              return (
              <button
                key={String(e.id)}
                type="button"
                onClick={() => openFiche(String(e.id))}
                className="w-full grid items-center px-4 py-[11px] border-0 cursor-pointer text-left"
                style={{
                  gridTemplateColumns: "1.5fr 1.1fr 1fr 90px 70px",
                  background: "transparent",
                  borderBottom: "1px solid #15191F",
                  color: "inherit",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <RhAvatar
                    initials={String(e.initials)}
                    color={String(e.avatarColor || LIME)}
                    size={26}
                    src={e.avatarUrl as string | null | undefined}
                  />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium truncate">{String(e.name)}</div>
                    <div className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>{String(e.matricule)}</div>
                  </div>
                </div>
                <span className="text-[12px] truncate" style={{ color: "#B9C2CE" }}>{String(e.jobTitle)}</span>
                <span className="text-[12px] truncate" style={{ color: "#8B95A5" }}>
                  {mgr ? String(mgr.name) : "—"}
                </span>
                <span className="rh-mono text-[10px]">{String(e.department).slice(0, 14)}</span>
                <span className="rh-mono text-right text-[12px]">{Number(e.bookableSum || 0).toFixed(1)} j</span>
              </button>
              );
            })}
          </RhCard>
        </div>
      )}

      {screen === "approvals" && (
        <ApprovalsInboxScreen
          inboxItems={inboxItems}
          busy={busy}
          onApprove={handleApprove}
          onRefuse={handleRefuse}
          onApproveAll={handleApproveAll}
          onOpenFiche={openFiche}
        />
      )}

      {screen === "rh" && (
        <PayrollScreen rhRole={rhRole} salaries={salaries} />
      )}

      {screen === "manage" && (
        <ManageAdminScreen
          rhRole={rhRole}
          employees={employees}
          busy={busy}
          onForceLeave={forceLeave}
        />
      )}

      {selectedEmployeeId ? (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          style={{ background: "rgba(0,0,0,.55)" }}
          onClick={closeFiche}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeFiche();
          }}
          role="presentation"
        >
          <aside
            className="h-full w-full max-w-[420px] overflow-y-auto"
            style={{
              background: "#0C0F14",
              borderLeft: "1px solid #1B212A",
              boxShadow: "-12px 0 40px rgba(0,0,0,.4)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Fiche collaborateur"
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: "#0C0F14",
                borderBottom: "1px solid #1B212A",
              }}
            >
              <div className="text-[11px] font-semibold tracking-wide" style={{ color: "#8B95A5" }}>
                FICHE COLLABORATEUR
              </div>
              <RhButton variant="ghost" onClick={closeFiche}>
                Fermer
              </RhButton>
            </div>

            {ficheLoading || !fiche ? (
              <div className="p-6 text-[12.5px]" style={{ color: "#8B95A5" }}>
                Chargement…
              </div>
            ) : (
              <div className="p-4 space-y-5">
                <div className="flex items-center gap-3">
                  <RhAvatar
                    initials={fiche.employee.initials}
                    color={fiche.employee.avatarColor || LIME}
                    size={40}
                    src={fiche.employee.avatarUrl}
                  />
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold truncate">
                      {fiche.employee.name}
                    </div>
                    <div className="text-[12.5px]" style={{ color: "#B9C2CE" }}>
                      {fiche.employee.jobTitle}
                    </div>
                    <div className="rh-mono text-[10px]" style={{ color: "#5F6978" }}>
                      {fiche.employee.department} · {fiche.employee.matricule}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: "#8B95A5" }}>
                      Manager :{" "}
                      <span style={{ color: "#E7ECF2" }}>
                        {fiche.employee.managerName || "non assigné"}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div
                    className="mb-2 text-[10px] font-semibold tracking-wide"
                    style={{ color: "#8B95A5" }}
                  >
                    SOLDES POSABLES
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {["CP", "RTT", "RECUP"].map((code) => {
                      const sum = fiche.balances
                        .filter((b) => b.accountCode === code)
                        .reduce((s, b) => s + Number(b.bookable || 0), 0);
                      return (
                        <div
                          key={code}
                          className="rounded-md px-3 py-2"
                          style={{ background: "#15191F" }}
                        >
                          <div className="rh-mono text-[9px]" style={{ color: "#7E8998" }}>
                            {code}
                          </div>
                          <div
                            className="rh-mono text-[15px] font-bold"
                            style={{ color: KIND_COLOR[code] || LIME }}
                          >
                            {sum.toFixed(1)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div
                    className="mb-2 text-[10px] font-semibold tracking-wide"
                    style={{ color: "#8B95A5" }}
                  >
                    DEMANDES RÉCENTES
                  </div>
                  {fiche.requests.length === 0 ? (
                    <div className="text-[12px]" style={{ color: "#8B95A5" }}>
                      Aucune demande
                    </div>
                  ) : (
                    <div
                      className="rounded-md overflow-hidden"
                      style={{ border: "1px solid #1B212A" }}
                    >
                      {fiche.requests.slice(0, 8).map((r) => (
                        <div
                          key={r.id}
                          className="px-3 py-2"
                          style={{ borderBottom: "1px solid #15191F" }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium truncate">
                              {r.title}
                            </span>
                            <span
                              className="rh-mono text-[9.5px] shrink-0"
                              style={{ color: "#8B95A5" }}
                            >
                              {r.status}
                            </span>
                          </div>
                          <div
                            className="rh-mono text-[9.5px]"
                            style={{ color: "#5F6978" }}
                          >
                            {r.type}
                            {r.days != null ? ` · ${r.days} j` : ""} ·{" "}
                            {formatFr(r.createdAt.slice(0, 10))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {rhRole === "HR" && selectedEmployeeId ? (
                  <div
                    className="rounded-md p-3 space-y-3"
                    style={{ background: "#12161C", border: "1px solid #1B212A" }}
                  >
                    <div
                      className="text-[12px] font-semibold"
                      style={{ color: "#8B95A5" }}
                    >
                      Contrat (par collab)
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "#7E8998" }}>
                        Heures / semaine
                      </span>
                      <input
                        type="number"
                        className="rh-input"
                        step={0.5}
                        defaultValue={fiche.employee.weeklyHours ?? 35}
                        id="fiche-weeklyHours"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "#7E8998" }}>
                        Avenant TT
                      </span>
                      <select
                        className="rh-input"
                        defaultValue={String(fiche.employee.remoteAgreement ?? 0)}
                        id="fiche-remoteAgreement"
                      >
                        <option value="0">0 j</option>
                        <option value="2">2 j</option>
                        <option value="3">3 j</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "#7E8998" }}>
                        Mutuelle
                      </span>
                      <select
                        className="rh-input"
                        defaultValue={fiche.employee.healthCover || "ENROLLED"}
                        id="fiche-healthCover"
                      >
                        <option value="ENROLLED">Adhérent</option>
                        <option value="WAIVED">Dispense</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "#7E8998" }}>
                        Rôle RH
                      </span>
                      <select
                        className="rh-input"
                        defaultValue={fiche.employee.rhRole || "COLLAB"}
                        id="fiche-rhRole"
                        key={`role-${fiche.employee.id}-${fiche.employee.rhRole || "COLLAB"}`}
                      >
                        <option value="COLLAB">Collaborateur</option>
                        <option value="MANAGER">Manager</option>
                        <option value="HR">RH</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-[11px]" style={{ color: "#7E8998" }}>
                        Manager N+1
                      </span>
                      <select
                        className="rh-input"
                        defaultValue={fiche.employee.managerId || ""}
                        id="fiche-managerId"
                        key={`mgr-${fiche.employee.id}-${fiche.employee.managerId || "none"}`}
                      >
                        <option value="">— Aucun —</option>
                        {employees
                          .filter((e) => {
                            const id = String(e.id);
                            if (id === selectedEmployeeId) return false;
                            const role = String(e.rhRole || "");
                            return (
                              role === "MANAGER" ||
                              role === "HR" ||
                              id === fiche.employee.managerId
                            );
                          })
                          .map((e) => (
                            <option key={String(e.id)} value={String(e.id)}>
                              {String(e.name)}
                              {e.rhRole === "HR"
                                ? " (RH)"
                                : e.rhRole === "MANAGER"
                                  ? " (Manager)"
                                  : ""}
                            </option>
                          ))}
                      </select>
                      <span
                        className="text-[11px] leading-[1.4]"
                        style={{ color: "#7E8998" }}
                      >
                        Reçoit les validations (congés, temps, NDF, TT) de cette
                        personne. Passe d’abord le N+1 en rôle Manager si besoin.
                      </span>
                    </label>
                    <RhButton
                      disabled={busy}
                      onClick={() => {
                        const weekly = Number(
                          (document.getElementById("fiche-weeklyHours") as HTMLInputElement)
                            ?.value
                        );
                        const agreement = Number(
                          (document.getElementById("fiche-remoteAgreement") as HTMLSelectElement)
                            ?.value
                        );
                        const health = (
                          document.getElementById("fiche-healthCover") as HTMLSelectElement
                        )?.value;
                        const role = (
                          document.getElementById("fiche-rhRole") as HTMLSelectElement
                        )?.value;
                        const managerId = (
                          document.getElementById("fiche-managerId") as HTMLSelectElement
                        )?.value;
                        void (async () => {
                          setBusy(true);
                          try {
                            const res = await fetch(
                              `/api/rh/employees/${selectedEmployeeId}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  weeklyHours: weekly,
                                  remoteAgreement: agreement,
                                  healthCover: health,
                                  rhRole: role,
                                  managerId: managerId || null,
                                }),
                              }
                            );
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "Erreur");
                            flash("Contrat mis à jour");
                            const reload = await fetch(
                              `/api/rh/employees/${selectedEmployeeId}`
                            );
                            if (reload.ok) {
                              setFiche((await reload.json()) as EmployeeFiche);
                            }
                            void refresh();
                          } catch (err) {
                            flash(
                              err instanceof Error ? err.message : "Erreur",
                              "err"
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Enregistrer le contrat
                    </RhButton>
                  </div>
                ) : null}

                {rhRole === "HR" && selectedEmployeeId ? (
                  <div
                    className="rounded-md p-3 space-y-3"
                    style={{ background: "#12161C", border: "1px solid #1B212A" }}
                  >
                    <div
                      className="text-[12px] font-semibold"
                      style={{ color: "#8B95A5" }}
                    >
                      Véhicule IK (admin)
                    </div>
                    <p
                      className="m-0 text-[11.5px] leading-[1.4]"
                      style={{ color: "#7E8998" }}
                    >
                      CV fiscaux + validité permis (renouvellement annuel).
                      Requis pour débloquer les indemnités kilométriques.
                    </p>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "#7E8998" }}>
                        Libellé
                      </span>
                      <input
                        className="rh-input"
                        id="fiche-vehicle-label"
                        defaultValue={fiche.vehicle?.label || "Véhicule perso"}
                        key={`v-label-${fiche.vehicle?.id || "new"}`}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: "#7E8998" }}>
                          CV fiscaux
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          className="rh-input rh-mono"
                          id="fiche-vehicle-hp"
                          defaultValue={fiche.vehicle?.fiscalHorsepower ?? 5}
                          key={`v-hp-${fiche.vehicle?.id || "new"}`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: "#7E8998" }}>
                          Permis valide jusqu’au
                        </span>
                        <input
                          type="date"
                          className="rh-input"
                          id="fiche-vehicle-license"
                          defaultValue={fiche.vehicle?.licenseExpiresOn || ""}
                          key={`v-lic-${fiche.vehicle?.id || "new"}-${fiche.vehicle?.licenseExpiresOn || ""}`}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: "#7E8998" }}>
                          Assurance jusqu’au
                        </span>
                        <input
                          type="date"
                          className="rh-input"
                          id="fiche-vehicle-insurance"
                          defaultValue={fiche.vehicle?.insuranceExpiresOn || ""}
                          key={`v-ins-${fiche.vehicle?.id || "new"}`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: "#7E8998" }}>
                          Carte grise jusqu’au
                        </span>
                        <input
                          type="date"
                          className="rh-input"
                          id="fiche-vehicle-carte"
                          defaultValue={fiche.vehicle?.carteGriseExpiresOn || ""}
                          key={`v-cg-${fiche.vehicle?.id || "new"}`}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <RhButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          const input = document.getElementById(
                            "fiche-vehicle-license"
                          ) as HTMLInputElement | null;
                          if (!input) return;
                          const base = input.value
                            ? new Date(input.value + "T12:00:00")
                            : new Date();
                          base.setFullYear(base.getFullYear() + 1);
                          const y = base.getFullYear();
                          const m = String(base.getMonth() + 1).padStart(2, "0");
                          const d = String(base.getDate()).padStart(2, "0");
                          input.value = `${y}-${m}-${d}`;
                        }}
                      >
                        +1 an permis
                      </RhButton>
                      <RhButton
                        disabled={busy}
                        onClick={() => {
                          const label = (
                            document.getElementById(
                              "fiche-vehicle-label"
                            ) as HTMLInputElement
                          )?.value;
                          const hp = Number(
                            (
                              document.getElementById(
                                "fiche-vehicle-hp"
                              ) as HTMLInputElement
                            )?.value
                          );
                          const licenseExpiresOn = (
                            document.getElementById(
                              "fiche-vehicle-license"
                            ) as HTMLInputElement
                          )?.value;
                          const insuranceExpiresOn = (
                            document.getElementById(
                              "fiche-vehicle-insurance"
                            ) as HTMLInputElement
                          )?.value;
                          const carteGriseExpiresOn = (
                            document.getElementById(
                              "fiche-vehicle-carte"
                            ) as HTMLInputElement
                          )?.value;
                          void (async () => {
                            setBusy(true);
                            try {
                              const res = await fetch(
                                `/api/rh/employees/${selectedEmployeeId}`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    vehicle: {
                                      label,
                                      fiscalHorsepower: hp,
                                      licenseExpiresOn:
                                        licenseExpiresOn || null,
                                      insuranceExpiresOn:
                                        insuranceExpiresOn || null,
                                      carteGriseExpiresOn:
                                        carteGriseExpiresOn || null,
                                    },
                                  }),
                                }
                              );
                              const data = await res.json();
                              if (!res.ok) {
                                throw new Error(data.error || "Erreur");
                              }
                              flash("Véhicule enregistré");
                              const reload = await fetch(
                                `/api/rh/employees/${selectedEmployeeId}`
                              );
                              if (reload.ok) {
                                setFiche(
                                  (await reload.json()) as EmployeeFiche
                                );
                              }
                            } catch (err) {
                              flash(
                                err instanceof Error ? err.message : "Erreur",
                                "err"
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Enregistrer véhicule
                      </RhButton>
                    </div>
                    {fiche.vehicle?.yearKm != null ? (
                      <div
                        className="rh-mono text-[11px]"
                        style={{ color: "#7E8998" }}
                      >
                        Km année en cours : {fiche.vehicle.yearKm}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {rhRole === "HR" && selectedEmployeeId ? (
                  <div
                    className="rounded-md p-3 space-y-3"
                    style={{ background: "#12161C", border: "1px solid #1B212A" }}
                  >
                    <div
                      className="text-[12px] font-semibold"
                      style={{ color: "#8B95A5" }}
                    >
                      Déposer un document
                    </div>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="text-[12px] w-full"
                      style={{ color: "#B9C2CE" }}
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedEmployeeId) return;
                        void (async () => {
                          setBusy(true);
                          try {
                            const fd = new FormData();
                            fd.set("file", file);
                            fd.set("employeeId", selectedEmployeeId);
                            fd.set("kind", "OTHER");
                            fd.set("title", file.name);
                            const res = await fetch("/api/rh/folder/document", {
                              method: "POST",
                              body: fd,
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              throw new Error(
                                typeof data.error === "string"
                                  ? data.error
                                  : "Upload impossible"
                              );
                            }
                            flash("Document déposé");
                            const reload = await fetch(
                              `/api/rh/employees/${selectedEmployeeId}`
                            );
                            if (reload.ok) {
                              setFiche((await reload.json()) as EmployeeFiche);
                            }
                          } catch (err) {
                            flash(
                              err instanceof Error ? err.message : "Erreur",
                              "err"
                            );
                          } finally {
                            setBusy(false);
                            e.target.value = "";
                          }
                        })();
                      }}
                    />
                  </div>
                ) : null}

                {rhRole === "HR" ? (
                  <div
                    className="rounded-md p-3 space-y-3"
                    style={{ background: "#12161C", border: "1px solid #1B212A" }}
                  >
                    <div
                      className="text-[12px] font-semibold"
                      style={{ color: "#8B95A5" }}
                    >
                      Ajuster un solde
                    </div>
                    <select
                      className="rh-input w-full"
                      value={adjustForm.accountCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const bal = fiche.balances.find(
                          (b) => b.accountCode === code
                        );
                        setAdjustForm({
                          accountCode: code,
                          remaining:
                            bal != null ? String(bal.remaining) : adjustForm.remaining,
                        });
                      }}
                    >
                      <option value="CP">CP</option>
                      <option value="RTT">RTT</option>
                      <option value="RECUP">RECUP</option>
                    </select>
                    <input
                      type="number"
                      step="0.5"
                      className="rh-input w-full"
                      placeholder="Remaining"
                      value={adjustForm.remaining}
                      onChange={(e) =>
                        setAdjustForm({ ...adjustForm, remaining: e.target.value })
                      }
                    />
                    <RhButton
                      disabled={busy || adjustForm.remaining === ""}
                      onClick={() => void adjustBalance()}
                    >
                      Ajuster le solde
                    </RhButton>
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ExpensesToPayPanel({
  busy,
  onFlash,
  onOpenFiche,
}: {
  busy: boolean;
  onFlash: (text: string, tone?: "ok" | "err") => void;
  onOpenFiche: (employeeId: string) => void;
}) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      number: number;
      label: string;
      totalAmount: number;
      employeeName: string;
      employeeId: string;
      linesCount: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rh/expenses?toPay=1", { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de charger les NDF à rembourser");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Erreur", "err");
    } finally {
      setLoading(false);
    }
    // onFlash volontairement omis : flashParent n’est pas mémoïsé
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(reportId: string) {
    if (!window.confirm("Marquer cette note comme remboursée (Payée) ?")) return;
    setMarking(reportId);
    try {
      const res = await fetch("/api/rh/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markPaid", reportId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Échec"
        );
      }
      onFlash("Note marquée payée");
      await load();
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Erreur", "err");
    } finally {
      setMarking(null);
    }
  }

  return (
    <div className="rh-screen" style={{ paddingTop: 0 }}>
      <RhCard>
        <div
          className="px-4 pt-4 pb-2 flex flex-col gap-0.5"
          style={{ borderBottom: "1px solid #15191F" }}
        >
          <div className="text-[13.5px] font-semibold">À rembourser</div>
          <div className="text-[12px]" style={{ color: "#8B95A5" }}>
            Notes approuvées — marque-les payées après virement.
          </div>
        </div>
        {loading ? (
          <div className="p-4 text-[12.5px]" style={{ color: "#8B95A5" }}>
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-[12.5px]" style={{ color: "#8B95A5" }}>
            Aucune note approuvée en attente de paiement.
          </div>
        ) : (
          items.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderTop: "1px solid #15191F" }}
            >
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  className="border-0 bg-transparent cursor-pointer p-0 text-left text-[12.5px] font-medium"
                  style={{ color: "#E7ECF2" }}
                  onClick={() => onOpenFiche(r.employeeId)}
                >
                  {r.employeeName}
                </button>
                <div
                  className="rh-mono text-[10px]"
                  style={{ color: "#7E8998" }}
                >
                  N° {r.number} · {r.label} · {r.linesCount} ligne
                  {r.linesCount > 1 ? "s" : ""}
                </div>
              </div>
              <span
                className="rh-mono text-[12px] font-semibold shrink-0"
                style={{ color: LIME }}
              >
                {r.totalAmount.toFixed(2)} €
              </span>
              <RhButton
                disabled={busy || marking === r.id}
                onClick={() => void markPaid(r.id)}
              >
                {marking === r.id ? "…" : "Marquer payée"}
              </RhButton>
            </div>
          ))
        )}
      </RhCard>
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
