"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  FolderOpen,
  Home,
  Inbox,
  Laptop,
  Receipt,
} from "lucide-react";
import {
  CommandPalette,
  RhTabBar,
  RhTopBar,
  type PaletteItem,
  type RhTab,
} from "@/components/rh/chrome/shell";
import {
  HomeScreen,
  type EmployeeScreenId,
} from "@/components/rh/employee/HomeScreen";
import { LeaveScreen } from "@/components/rh/employee/LeaveScreen";
import { RemoteScreen } from "@/components/rh/employee/RemoteScreen";
import { TimeScreen } from "@/components/rh/employee/TimeScreen";
import { ExpensesScreen } from "@/components/rh/employee/ExpensesScreen";
import { FolderScreen } from "@/components/rh/employee/FolderScreen";
import { RequestsScreen } from "@/components/rh/employee/RequestsScreen";
import { OnboardingWizard } from "@/components/rh/employee/OnboardingWizard";
import { RhDataProvider, useRhData } from "@/components/rh/RhDataContext";

function tab(
  id: EmployeeScreenId,
  label: string,
  icon: ReactNode,
  count?: number
): RhTab {
  return { id, label, icon, count };
}

const PALETTE: { title: string; items: PaletteItem[] }[] = [
  {
    title: "Aller à",
    items: [
      { key: "A", label: "Poser une absence", code: "leave" },
      { key: "P", label: "Ma présence", code: "remote" },
      { key: "T", label: "Mon temps", code: "time" },
      { key: "F", label: "Mes frais", code: "expenses" },
      { key: "D", label: "Mes demandes", code: "requests" },
      { key: "O", label: "Mon dossier", code: "folder" },
    ],
  },
];

const VALID_SCREENS: EmployeeScreenId[] = [
  "home",
  "leave",
  "remote",
  "time",
  "expenses",
  "folder",
  "requests",
];

function EmployeeAppInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { me, home, loading, error } = useRhData();
  const tabParam = searchParams.get("tab") as EmployeeScreenId | null;
  const [screen, setScreen] = useState<EmployeeScreenId>(
    tabParam && VALID_SCREENS.includes(tabParam) ? tabParam : "home"
  );
  const [palette, setPalette] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (error === "NO_RH_PROFILE") router.replace("/rh/login");
  }, [error, router]);

  const go = useCallback(
    (next: EmployeeScreenId) => {
      setScreen(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "home") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (tabParam && VALID_SCREENS.includes(tabParam) && tabParam !== screen) {
      setScreen(tabParam);
    }
    // sync from URL only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

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
        go("leave");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const pending = Number(home?.pendingCount ?? 0);
  const tabs = useMemo(
    () => [
      tab("home", "Accueil", <Home size={14} />),
      tab("leave", "Absences", <CalendarDays size={14} />),
      tab("remote", "Présence", <Laptop size={14} />),
      tab("time", "Temps", <Clock3 size={14} />),
      tab("expenses", "Frais", <Receipt size={14} />),
      tab("folder", "Dossier", <FolderOpen size={14} />),
      tab(
        "requests",
        "Demandes",
        <Inbox size={14} />,
        pending > 0 ? pending : undefined
      ),
    ],
    [pending]
  );

  if (loading && !me) {
    return (
      <div
        className="min-h-screen px-6 py-10"
        style={{ background: "#08090C" }}
      >
        <div className="mx-auto max-w-[720px] flex flex-col gap-4">
          <div className="rh-skeleton" style={{ height: 28, width: "40%" }} />
          <div className="rh-skeleton" style={{ height: 18, width: "70%" }} />
          <div className="grid gap-3 [grid-template-columns:repeat(2,1fr)] mt-4">
            <div className="rh-skeleton" style={{ height: 96 }} />
            <div className="rh-skeleton" style={{ height: 96 }} />
            <div className="rh-skeleton" style={{ height: 96 }} />
            <div className="rh-skeleton" style={{ height: 96 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div
        className="grid min-h-screen place-items-center text-[14px]"
        style={{ background: "#08090C", color: "#8B95A5" }}
      >
        {error || "Session RH requise"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#08090C" }}>
      <RhTopBar
        badge="Mon espace RH"
        searchPlaceholder="Rechercher une action…"
        banner={
          pending > 0
            ? {
                text:
                  pending === 1
                    ? "1 demande en attente"
                    : `${pending} demandes en attente`,
                tone: "warning",
              }
            : {
                text: me.employee.jobTitle || "Collaborateur",
                tone: "warning",
              }
        }
        headerAction={
          me.canAccessPeople
            ? {
                label: "Console RH",
                onClick: () => router.push("/rh/people"),
              }
            : undefined
        }
        profile={{
          name: me.employee.name,
          meta: me.employee.department,
          initials: me.employee.initials,
          color: me.employee.avatarColor,
          avatarUrl: me.employee.avatarUrl,
        }}
        onOpenPalette={() => setPalette(true)}
      />

      <RhTabBar
        tabs={tabs}
        active={screen}
        onChange={(id) => go(id as EmployeeScreenId)}
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
      </main>

      <OnboardingWizard onGo={go} />

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        sections={PALETTE}
        onSelect={(item) => {
          const id = item.code as EmployeeScreenId;
          if (
            [
              "home",
              "leave",
              "remote",
              "time",
              "expenses",
              "folder",
              "requests",
            ].includes(id)
          ) {
            go(id);
          }
        }}
      />
    </div>
  );
}

export function EmployeeApp() {
  return (
    <RhDataProvider>
      <Suspense
        fallback={
          <div
            className="grid min-h-screen place-items-center text-[14px]"
            style={{ background: "#08090C", color: "#8B95A5" }}
          >
            Chargement…
          </div>
        }
      >
        <EmployeeAppInner />
      </Suspense>
    </RhDataProvider>
  );
}
