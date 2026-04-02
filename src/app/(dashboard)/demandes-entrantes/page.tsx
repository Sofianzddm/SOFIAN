"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import DemandeModal, { type DemandeEntrante } from "./DemandeModal";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

type StatusCol = "a_traiter" | "en_cours" | "pret";

function colTitle(col: StatusCol): string {
  if (col === "a_traiter") return "🔴 À traiter";
  if (col === "en_cours") return "🟡 En cours";
  return "🟢 Prêt";
}

function colColor(col: StatusCol): string {
  if (col === "a_traiter") return OLD_ROSE;
  if (col === "en_cours") return "#D1B070";
  return TEA_GREEN;
}

export default function DemandesEntrantesPage() {
  const { data: session, status } = useSession();
  const [authReady, setAuthReady] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  const [demandes, setDemandes] = useState<DemandeEntrante[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [active, setActive] = useState<DemandeEntrante | null>(null);
  const [open, setOpen] = useState(false);

  const allowed =
    effectiveRole !== null && (ALLOWED_ROLES as readonly string[]).includes(effectiveRole);

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
        /* fallback */
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
    if (!allowed && typeof window !== "undefined") {
      window.location.assign("/dashboard");
    }
  }, [authReady, allowed]);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demandes-entrantes", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Impossible de charger les demandes."
        );
      }
      setDemandes(Array.isArray(data.demandes) ? data.demandes : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setDemandes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !allowed) return;
    void load();
  }, [authReady, allowed, load]);

  const cols = useMemo(() => {
    const a_traiter = demandes.filter((d) => d.status === "a_traiter");
    const en_cours = demandes.filter((d) => d.status === "en_cours");
    const pret = demandes.filter((d) => d.status === "pret");
    return { a_traiter, en_cours, pret };
  }, [demandes]);

  const totalATraiter = cols.a_traiter.length;

  if (
    status === "loading" ||
    (status === "authenticated" && !authReady) ||
    (authReady && status === "authenticated" && !allowed)
  ) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="space-y-6" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[220] px-4 py-3 rounded-xl shadow-lg text-sm border"
          style={{
            backgroundColor: toast.type === "success" ? TEA_GREEN : "#FEE2E2",
            borderColor: toast.type === "success" ? LICORICE : "#FCA5A5",
            color: LICORICE,
          }}
        >
          {toast.message}
        </div>
      )}

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
          >
            Demandes Entrantes
          </h1>
        </div>
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
          style={{ backgroundColor: OLD_LACE, color: LICORICE, border: `1px solid ${OLD_ROSE}` }}
        >
          {totalATraiter} à traiter
        </span>
      </header>

      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B" }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(["a_traiter", "en_cours", "pret"] as StatusCol[]).map((col) => {
          const items = cols[col];
          return (
            <section
              key={col}
              className="rounded-2xl border min-h-[300px] max-h-[calc(100vh-220px)] flex flex-col"
              style={{
                backgroundColor: OLD_LACE,
                borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
              }}
            >
              <div
                className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
              >
                <h2 className="text-lg font-semibold" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>
                  {colTitle(col)}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white">{items.length}</span>
              </div>
              <div className="p-3 space-y-3 overflow-y-auto">
                {loading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: OLD_ROSE }} />
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-xs text-center py-8 opacity-70" style={{ color: OLD_ROSE }}>
                    Aucune demande.
                  </p>
                ) : (
                  items.map((d) => (
                    <article
                      key={d.id}
                      className="bg-white rounded-xl border shadow-sm p-3"
                      style={{
                        borderColor: `color-mix(in srgb, ${OLD_ROSE} 30%, transparent)`,
                        borderLeft: `4px solid ${colColor(col)}`,
                      }}
                    >
                      <p className="text-sm font-semibold truncate" style={{ color: LICORICE }}>
                        {d.from}
                      </p>
                      <p className="text-sm truncate mt-0.5" style={{ color: LICORICE }}>
                        {d.subject}
                      </p>
                      <p className="text-xs mt-1" style={{ color: OLD_ROSE }}>
                        {new Date(d.date).toLocaleString("fr-FR")}
                      </p>
                      <p className="text-xs mt-2 opacity-90" style={{ color: LICORICE }}>
                        {(d.body || "").slice(0, 50)}
                        {(d.body || "").length > 50 ? "…" : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setActive(d);
                          setOpen(true);
                        }}
                        className="mt-3 text-xs font-medium px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: OLD_LACE, color: LICORICE }}
                      >
                        Traiter →
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <DemandeModal
        open={open}
        demande={active}
        onClose={() => {
          setOpen(false);
          setActive(null);
        }}
        onSaved={() => {
          void load();
        }}
        onSuccess={(msg) => showToast(msg, "success")}
        onError={(msg) => showToast(msg, "error")}
      />
    </div>
  );
}

