"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isNomCampagneGateAllowedPath } from "@/lib/nom-campagne-gate-paths";

type PendingItem = {
  id: string;
  reference: string;
  marqueNom: string;
};

type NomCampagneGateValue = {
  loading: boolean;
  locked: boolean;
  count: number;
  items: PendingItem[];
  refresh: () => Promise<{ locked: boolean; count: number }>;
};

const NomCampagneGateContext = createContext<NomCampagneGateValue>({
  loading: true,
  locked: false,
  count: 0,
  items: [],
  refresh: async () => ({ locked: false, count: 0 }),
});

export function useNomCampagneGate() {
  return useContext(NomCampagneGateContext);
}

const GATE_ROLES = new Set(["TM", "HEAD_OF_SALES"]);

export function NomCampagneGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  // Rôle effectif via /api/auth/me (prend en compte l'impersonation admin)
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.role) setEffectiveRole(d.role);
      })
      .catch(() => {});
  }, [status, pathname]);

  const role = effectiveRole || "";
  const shouldGate = GATE_ROLES.has(role);

  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<PendingItem[]>([]);

  const refresh = useCallback(async () => {
    if (!shouldGate) {
      setLoading(false);
      setLocked(false);
      setCount(0);
      setItems([]);
      return { locked: false, count: 0 };
    }
    try {
      const res = await fetch("/api/collaborations/pending-nom-campagne", {
        cache: "no-store",
      });
      if (!res.ok) {
        setLocked(true);
        return { locked: true, count: 1 };
      }
      const data = await res.json();
      const list = Array.isArray(data.items) ? data.items : [];
      const nextCount = typeof data.count === "number" ? data.count : list.length;
      const nextLocked = list.length > 0;
      setItems(list);
      setCount(nextCount);
      setLocked(nextLocked);
      return { locked: nextLocked, count: nextCount };
    } catch {
      setLocked(true);
      return { locked: true, count: 1 };
    } finally {
      setLoading(false);
    }
  }, [shouldGate]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (effectiveRole === null) return; // attendre le rôle effectif
    void refresh();
  }, [status, pathname, shouldGate, effectiveRole, refresh]);

  // Fail-closed tant que le rôle TM/HoS n'est pas encore résolu
  const awaitingRole =
    status === "authenticated" && effectiveRole === null;
  const effectivelyLocked =
    awaitingRole || (shouldGate && (loading || locked));

  useEffect(() => {
    if (!effectivelyLocked) return;
    if (!pathname) return;
    // Pendant la résolution du rôle, ne pas encore rediriger (évite flash)
    if (awaitingRole) return;
    if (isNomCampagneGateAllowedPath(pathname)) return;
    router.replace("/collaborations/rattrapage-marques");
  }, [effectivelyLocked, awaitingRole, pathname, router]);

  const value = useMemo(
    () => ({
      loading: loading || awaitingRole,
      locked: effectivelyLocked,
      count,
      items,
      refresh,
    }),
    [loading, awaitingRole, effectivelyLocked, count, items, refresh]
  );

  return (
    <NomCampagneGateContext.Provider value={value}>
      {children}
    </NomCampagneGateContext.Provider>
  );
}
