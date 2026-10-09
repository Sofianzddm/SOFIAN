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
    // Console People réservée aux HR — managers / collabs → espace salarié
    if (me && me.employee.rhRole !== "HR") router.replace("/rh/espace");
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
    const motif = window.prompt("Motif du refus (optionnel) :") ?? undefined;
    setBusy(true);
    flash("");
    try {
      await refuse(id, motif?.trim() || undefined);
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
        <div className="rh-screen">
          <RhPageHero
            eyebrow="FRAIS"
            title="Notes de frais"
            subtitle="Notes de frais en attente de validation manager ou RH."
          />
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
                    <RhButton variant="danger" disabled={busy} onClick={() => void handleRefuse(i.id, i.who)}>Refuser</RhButton>
                    <RhButton disabled={busy} onClick={() => void handleApprove(i.id, i.who)}>Approuver</RhButton>
                  </div>
                ))
            )}
          </RhCard>
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
            {employees.map((e) => (
              <button
                key={String(e.id)}
                type="button"
                onClick={() => openFiche(String(e.id))}
                className="w-full grid items-center px-4 py-[11px] border-0 cursor-pointer text-left"
                style={{
                  gridTemplateColumns: "1.5fr 1.2fr 110px 90px",
                  background: "transparent",
                  borderBottom: "1px solid #15191F",
                  color: "inherit",
                }}
              >
                <div className="flex items-center gap-2">
                  <RhAvatar
                    initials={String(e.initials)}
                    color={String(e.avatarColor || LIME)}
                    size={26}
                    src={e.avatarUrl as string | null | undefined}
                  />
                  <div>
                    <div className="text-[12.5px] font-medium">{String(e.name)}</div>
                    <div className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>{String(e.matricule)}</div>
                  </div>
                </div>
                <span className="text-[12px] truncate" style={{ color: "#B9C2CE" }}>{String(e.jobTitle)}</span>
                <span className="rh-mono text-[10px]">{String(e.department).slice(0, 14)}</span>
                <span className="rh-mono text-right text-[12px]">{Number(e.bookableSum || 0).toFixed(1)} j</span>
              </button>
            ))}
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
                      >
                        <option value="COLLAB">Collaborateur</option>
                        <option value="MANAGER">Manager</option>
                        <option value="HR">RH</option>
                      </select>
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

export function PeopleApp() {
  return (
    <RhDataProvider loadPeople>
      <PeopleAppInner />
    </RhDataProvider>
  );
}
