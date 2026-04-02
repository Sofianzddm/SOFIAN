"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, RefreshCw } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

type HubSpotListOption = { id: string; name: string; contactCount: number | null };

type CastingListConfig = {
  hubspotListId: string;
  listName: string;
  isActive: boolean;
};

export default function CastingListsSettingsPage() {
  const { data: session, status } = useSession();
  const [authReady, setAuthReady] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  const [lists, setLists] = useState<HubSpotListOption[]>([]);
  const [configs, setConfigs] = useState<CastingListConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isAdmin = effectiveRole === "ADMIN";

  useEffect(() => {
    if (status === "loading" || status === "unauthenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { role?: string };
          if (!cancelled && typeof data.role === "string") {
            setEffectiveRole(data.role);
            return;
          }
        }
      } catch {
        /* fallback session */
      }
      if (!cancelled) {
        const r = (session?.user as { role?: string } | undefined)?.role;
        setEffectiveRole(typeof r === "string" ? r : null);
      }
    })().finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user]);

  useEffect(() => {
    if (status === "unauthenticated" && typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, [status]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAdmin && typeof window !== "undefined") {
      window.location.assign("/dashboard");
    }
  }, [authReady, isAdmin]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadConfigs = useCallback(async () => {
    const res = await fetch("/api/settings/casting-lists", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Chargement impossible.");
    }
    setConfigs(
      Array.isArray((data as { configs?: unknown }).configs)
        ? ((data as { configs: CastingListConfig[] }).configs as CastingListConfig[])
        : []
    );
  }, []);

  const syncFromHubSpot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listsRes] = await Promise.all([
        fetch("/api/hubspot/casting/lists", { credentials: "include" }),
        loadConfigs(),
      ]);
      const listsData = await listsRes.json().catch(() => ({}));
      if (!listsRes.ok) {
        throw new Error(
          typeof listsData.error === "string" ? listsData.error : "Sync HubSpot impossible."
        );
      }
      setLists(Array.isArray(listsData.lists) ? listsData.lists : []);
      showToast("Listes synchronisées");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, [loadConfigs, showToast]);

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    void loadConfigs().catch(() => {
      /* handled by UI actions */
    });
  }, [authReady, isAdmin, loadConfigs]);

  const configById = useMemo(() => {
    const m = new Map<string, CastingListConfig>();
    for (const c of configs) m.set(c.hubspotListId, c);
    return m;
  }, [configs]);

  const rows = useMemo(() => {
    return lists.map((l) => {
      const existing = configById.get(l.id);
      return {
        ...l,
        isActive: existing ? existing.isActive : false, // nouvelle liste = OFF par défaut
      };
    });
  }, [lists, configById]);

  const toggle = useCallback(
    async (hubspotListId: string, listName: string, next: boolean) => {
      setSavingId(hubspotListId);
      setError(null);
      try {
        const res = await fetch("/api/settings/casting-lists", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hubspotListId, listName, isActive: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Sauvegarde impossible.");
        }
        setConfigs((prev) => {
          const nextArr = prev.filter((c) => c.hubspotListId !== hubspotListId);
          nextArr.push({ hubspotListId, listName, isActive: next });
          nextArr.sort((a, b) => a.listName.localeCompare(b.listName, "fr", { sensitivity: "base" }));
          return nextArr;
        });
        showToast("Sauvegardé");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erreur réseau.");
      } finally {
        setSavingId(null);
      }
    },
    [showToast]
  );

  if (
    status === "loading" ||
    (status === "authenticated" && !authReady) ||
    (authReady && status === "authenticated" && !isAdmin)
  ) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
        {authReady && !isAdmin && <p className="text-sm text-gray-500">Redirection…</p>}
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl shadow-lg text-sm max-w-md border"
          style={{
            backgroundColor: TEA_GREEN,
            color: LICORICE,
            borderColor: LICORICE,
          }}
        >
          {toast}
        </div>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "Spectral, serif", color: LICORICE }}
          >
            Listes Casting autorisées
          </h1>
          <p className="text-sm mt-1 opacity-80" style={{ color: OLD_ROSE }}>
            Choisissez les listes HubSpot visibles par le rôle Casting Manager.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void syncFromHubSpot()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: OLD_LACE, color: LICORICE, border: `1px solid ${OLD_ROSE}` }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Synchroniser depuis HubSpot
        </button>
      </header>

      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B" }}
        >
          {error}
        </div>
      )}

      <section
        className="rounded-2xl border bg-white overflow-hidden"
        style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
      >
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`, backgroundColor: OLD_LACE }}
        >
          <p className="text-sm font-medium" style={{ color: LICORICE }}>
            {lists.length === 0 ? "Synchronisez pour afficher les listes HubSpot." : `${lists.length} liste(s)`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: OLD_ROSE }}>
                <th className="px-5 py-3 font-medium">Nom de la liste</th>
                <th className="px-5 py-3 font-medium">Contacts</th>
                <th className="px-5 py-3 font-medium text-right">Actif</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const busy = savingId === l.id;
                return (
                  <tr
                    key={l.id}
                    className="border-t"
                    style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 18%, transparent)` }}
                  >
                    <td className="px-5 py-3" style={{ color: LICORICE }}>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs opacity-60">{l.id}</div>
                    </td>
                    <td className="px-5 py-3" style={{ color: LICORICE }}>
                      {l.contactCount ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggle(l.id, l.name, !l.isActive)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors disabled:opacity-50"
                        style={{
                          borderColor: l.isActive ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`,
                          backgroundColor: l.isActive ? "rgba(200, 242, 133, 0.18)" : "white",
                          color: LICORICE,
                        }}
                        title={l.isActive ? "Désactiver" : "Activer"}
                      >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span className="text-xs font-medium">{l.isActive ? "Actif" : "Inactif"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-5 py-10 text-center text-sm opacity-70" colSpan={3} style={{ color: OLD_ROSE }}>
                    Aucune liste chargée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

