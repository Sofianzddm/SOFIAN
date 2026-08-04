"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  RhTabBar,
  RhTopBar,
  type RhLang,
  type RhTab,
  type PaletteItem,
} from "@/components/rh/chrome/shell";
import { EMP_COLORS } from "@/components/rh/employee/parts";
import { HomeScreen, type EmployeeScreenId } from "@/components/rh/employee/HomeScreen";
import { LeaveScreen } from "@/components/rh/employee/LeaveScreen";
import { RemoteScreen } from "@/components/rh/employee/RemoteScreen";
import { TimeScreen } from "@/components/rh/employee/TimeScreen";
import { ExpensesScreen } from "@/components/rh/employee/ExpensesScreen";
import { FolderScreen } from "@/components/rh/employee/FolderScreen";
import { RequestsScreen } from "@/components/rh/employee/RequestsScreen";
import { MobileScreen } from "@/components/rh/employee/MobileScreen";
import { RhDataProvider, useRhData } from "@/components/rh/RhDataContext";

const BASE_TABS: RhTab[] = [
  { id: "home", label: "Accueil" },
  { id: "leave", label: "Mes absences" },
  { id: "remote", label: "Mon télétravail" },
  { id: "time", label: "Mon temps" },
  { id: "expenses", label: "Mes frais" },
  { id: "folder", label: "Mon dossier" },
  { id: "requests", label: "Mes demandes" },
  { id: "mobile", label: "Mobile" },
];

const PALETTE: { title: string; items: PaletteItem[] }[] = [
  {
    title: "ACTIONS",
    items: [
      { key: "leave", label: "Poser une absence", code: "leave.create" },
      { key: "remote", label: "Déclarer mon télétravail", code: "remote.declare" },
      { key: "time", label: "Saisir ma semaine", code: "timesheet.edit" },
      { key: "expenses", label: "Note de frais", code: "expense.create" },
    ],
  },
];

function EmployeeAppInner() {
  const router = useRouter();
  const { me, home, inbox, loading, error } = useRhData();
  const [screen, setScreen] = useState<EmployeeScreenId>("home");
  const [lang, setLang] = useState<RhLang>("fr");
  const [palette, setPalette] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (error === "NO_RH_PROFILE") router.replace("/rh/login");
  }, [error, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.key === "Escape") setPalette(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setPalette(false);
        setScreen("leave");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback((next: EmployeeScreenId) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const pending = (home?.pendingCount as number) || inbox.length;
  const urgent = inbox.filter((i) => i.status === "PAUSED").length;
  const tabs = useMemo(
    () =>
      BASE_TABS.map((t) =>
        t.id === "requests" && pending > 0 ? { ...t, count: pending } : t
      ),
    [pending]
  );

  if (loading && !me) {
    return (
      <div
        className="grid min-h-screen place-items-center rh-mono text-[12px]"
        style={{ background: "#08090C", color: "#8B95A5" }}
      >
        Chargement de mon espace…
      </div>
    );
  }

  if (!me) {
    return (
      <div
        className="grid min-h-screen place-items-center text-[13px]"
        style={{ background: "#08090C", color: "#8B95A5" }}
      >
        {error || "Session RH requise"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#08090C" }}>
      <RhTopBar
        badge="MON ESPACE"
        searchPlaceholder="Poser une absence, déclarer mon télétravail…"
        banner={
          me.canAccessPeople
            ? undefined
            : pending > 0
              ? {
                  text: `À FAIRE · ${pending} ACTIONS${urgent ? ` · ${urgent} URGENTE` : ""}`,
                  tone: "warning" as const,
                }
              : {
                  text: "ESPACE SALARIÉ · GLOW UP RH",
                  tone: "warning" as const,
                }
        }
        headerAction={
          me.canAccessPeople
            ? {
                label: "ESPACE EMPLOYEUR →",
                // Navigation dure : évite le double-clic qui relance le bouton retour People
                onClick: () => {
                  window.location.assign("/rh/people");
                },
              }
            : undefined
        }
        showOrg={false}
        showPayrollSync={false}
        profile={{
          name: me.employee.name,
          meta: me.employee.matricule,
          initials: me.employee.initials,
          color: me.employee.avatarColor,
        }}
        lang={lang}
        onLang={setLang}
        onOpenPalette={() => setPalette(true)}
      />

      <RhTabBar
        tabs={tabs}
        active={screen}
        onChange={(id) => go(id as EmployeeScreenId)}
        right={
          <span
            className="rh-mono hidden shrink-0 text-[9.5px] font-bold uppercase tracking-[0.1em] md:inline"
            style={{ color: EMP_COLORS.dim }}
          >
            {me.employee.rhRole === "HR"
              ? "RÔLE · HR ADMIN"
              : me.employee.manager
                ? `MANAGER · ${me.employee.manager.name.toUpperCase()}`
                : me.employee.rhRole}
          </span>
        }
      />

      <main>
        {screen === "home" ? <HomeScreen onGo={go} /> : null}
        {screen === "leave" ? <LeaveScreen /> : null}
        {screen === "remote" ? <RemoteScreen /> : null}
        {screen === "time" ? <TimeScreen /> : null}
        {screen === "expenses" ? <ExpensesScreen /> : null}
        {screen === "folder" ? <FolderScreen /> : null}
        {screen === "requests" ? (
          <RequestsScreen sel={sel} onSelect={setSel} />
        ) : null}
        {screen === "mobile" ? <MobileScreen /> : null}
      </main>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        sections={PALETTE}
      />
    </div>
  );
}

export function EmployeeApp() {
  return (
    <RhDataProvider>
      <EmployeeAppInner />
    </RhDataProvider>
  );
}
