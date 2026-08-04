"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RhMe = {
  employee: {
    id: string;
    name: string;
    prenom: string;
    nom: string;
    initials: string;
    matricule: string;
    jobTitle: string;
    department: string;
    avatarColor: string;
    rhRole: "COLLAB" | "MANAGER" | "HR";
    hireDate: string;
    weeklyHours: number;
    remoteAgreement: number;
    manager: { id: string; name: string; initials: string } | null;
  };
  balances: Array<{
    accountCode: string;
    label: string;
    accrued: number;
    remaining: number;
    bookable: number;
    expiresOn?: string | null;
  }>;
  bookableTotal: number;
  homePath: string;
  canAccessPeople: boolean;
};

type RhDataCtx = {
  me: RhMe | null;
  home: Record<string, unknown> | null;
  inbox: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  approve: (id: string, note?: string) => Promise<void>;
  refuse: (id: string, note?: string) => Promise<void>;
};

const Ctx = createContext<RhDataCtx | null>(null);

export function RhDataProvider({
  children,
  loadPeople = false,
}: {
  children: ReactNode;
  loadPeople?: boolean;
}) {
  const [me, setMe] = useState<RhMe | null>(null);
  const [home, setHome] = useState<Record<string, unknown> | null>(null);
  const [inbox, setInbox] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/rh/me");
      if (meRes.status === 403) {
        setError("NO_RH_PROFILE");
        setMe(null);
        return;
      }
      if (!meRes.ok) throw new Error("Session RH indisponible");
      const meData = (await meRes.json()) as RhMe;
      setMe(meData);

      const [homeRes, inboxRes] = await Promise.all([
        fetch("/api/rh/home"),
        fetch("/api/rh/inbox"),
      ]);
      if (homeRes.ok) setHome(await homeRes.json());
      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setInbox(data.items || []);
      }
      if (loadPeople || meData.canAccessPeople) {
        const empRes = await fetch("/api/rh/employees");
        if (empRes.ok) {
          const data = await empRes.json();
          setEmployees(data.employees || []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [loadPeople]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = useCallback(
    async (id: string, note?: string) => {
      await fetch(`/api/rh/requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      await refresh();
    },
    [refresh]
  );

  const refuse = useCallback(
    async (id: string, note?: string) => {
      await fetch(`/api/rh/requests/${id}/refuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      me,
      home,
      inbox,
      employees,
      loading,
      error,
      refresh,
      approve,
      refuse,
    }),
    [me, home, inbox, employees, loading, error, refresh, approve, refuse]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRhData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRhData hors RhDataProvider");
  return ctx;
}
