"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { PRIME_TYPE_LABELS, type PrimeLigne } from "@/lib/primes";

type PrimeStatut = "BROUILLON" | "SOUMIS" | "VALIDE" | "REFUSE";
type PrimeRow = {
  id: string;
  mois: number;
  annee: number;
  lignes: PrimeLigne[];
  primeCA: number;
  statut: PrimeStatut;
  commentaireAdmin: string | null;
  user: { prenom: string; nom: string; email: string };
};

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function eur(v: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`;
}

export default function AdminPrimesPage() {
  const { status, data: session } = useSession();
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primes, setPrimes] = useState<PrimeRow[]>([]);
  const [tab, setTab] = useState<"TOUTES" | "SOUMIS" | "VALIDE" | "REFUSE">("TOUTES");

  const [refuseId, setRefuseId] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");

  const isAdmin = effectiveRole === "ADMIN";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/primes", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Chargement impossible.");
      setPrimes(Array.isArray(d.primes) ? d.primes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setEffectiveRole(typeof m?.role === "string" ? m.role : null))
      .catch(() => setEffectiveRole((session?.user as { role?: string } | undefined)?.role ?? null));
  }, [status, session?.user]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const pendingCount = useMemo(() => primes.filter((p) => p.statut === "SOUMIS").length, [primes]);
  const filtered = useMemo(() => {
    if (tab === "TOUTES") return primes;
    return primes.filter((p) => p.statut === tab);
  }, [primes, tab]);

  const decide = async (id: string, action: "validate" | "refuse", commentaireAdmin?: string) => {
    const r = await fetch(`/api/primes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, commentaireAdmin }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(typeof d.error === "string" ? d.error : "Action impossible.");
      return;
    }
    await load();
  };

  if (status === "loading" || !effectiveRole) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} /></div>;
  }
  if (!isAdmin) return <div className="p-6 text-sm">Accès refusé.</div>;

  return (
    <div className="space-y-5" style={{ fontFamily: "Switzer, sans-serif" }}>
      <h1 className="text-3xl font-semibold" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>Validation des primes</h1>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "TOUTES", label: "Toutes" },
          { id: "SOUMIS", label: "À valider" },
          { id: "VALIDE", label: "Validées" },
          { id: "REFUSE", label: "Refusées" },
        ].map((t) => (
          <button
            key={t.id}
            className="px-3 py-1.5 rounded-full border text-sm"
            style={{
              borderColor: tab === t.id ? OLD_ROSE : "#D1D5DB",
              color: LICORICE,
              backgroundColor: tab === t.id ? "#F5EBE0" : "white",
            }}
            onClick={() => setTab(t.id as typeof tab)}
          >
            {t.label} {t.id === "SOUMIS" && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-red-600 text-white">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: OLD_ROSE }} /></div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => {
            const lignesTotal = (p.lignes || []).reduce((s, l) => s + Number(l.montant || 0), 0);
            const total = lignesTotal + Number(p.primeCA || 0);
            return (
              <div key={p.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "#EEDFD1" }}>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="font-semibold" style={{ color: LICORICE }}>{p.user.prenom} {p.user.nom}</p>
                    <p className="text-sm" style={{ color: OLD_ROSE }}>{MONTHS[p.mois - 1]} {p.annee}</p>
                  </div>
                  <span className="text-xs rounded-full px-2 py-1" style={{ background: p.statut === "SOUMIS" ? "#FEF3C7" : p.statut === "VALIDE" ? "#DCFCE7" : p.statut === "REFUSE" ? "#FEE2E2" : "#F3F4F6", color: p.statut === "SOUMIS" ? "#92400E" : p.statut === "VALIDE" ? "#166534" : p.statut === "REFUSE" ? "#991B1B" : "#374151" }}>
                    {p.statut}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ color: OLD_ROSE }}><th className="py-2">Type</th><th className="py-2">Description</th><th className="py-2">Talent</th><th className="py-2 text-right">Montant</th></tr></thead>
                  <tbody>
                    {(p.lignes || []).map((l) => (
                      <tr key={l.id} className="border-t" style={{ borderColor: "#F2E9DD" }}>
                        <td className="py-2">{PRIME_TYPE_LABELS[l.type]}</td>
                        <td className="py-2">{l.description}</td>
                        <td className="py-2">{l.talentNom || "—"}</td>
                        <td className="py-2 text-right">{eur(Number(l.montant || 0))}</td>
                      </tr>
                    ))}
                    <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                      <td colSpan={3} className="py-2 italic" style={{ color: OLD_ROSE }}>Prime CA (5% marge pôle management)</td>
                      <td className="py-2 text-right italic">{eur(Number(p.primeCA || 0))}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                      <td colSpan={3} className="py-2 font-semibold" style={{ color: LICORICE }}>Total</td>
                      <td className="py-2 text-right font-semibold">{eur(total)}</td>
                    </tr>
                  </tbody>
                </table>

                {p.commentaireAdmin && <p className="mt-2 text-sm text-red-700">{p.commentaireAdmin}</p>}

                {p.statut === "SOUMIS" && (
                  <div className="mt-3 flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: TEA_GREEN, color: LICORICE }} onClick={() => { if (window.confirm("Valider cette soumission ?")) void decide(p.id, "validate"); }}>
                      Valider
                    </button>
                    <button className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white" onClick={() => { setRefuseId(p.id); setCommentaire(""); }}>
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {refuseId && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4" style={{ borderColor: "#EEDFD1" }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: LICORICE }}>Motif du refus</h3>
            <textarea
              className="w-full border rounded-lg px-3 py-2 min-h-[120px]"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Commentaire obligatoire..."
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className="px-3 py-2 border rounded-lg" onClick={() => setRefuseId(null)}>Annuler</button>
              <button
                className="px-3 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
                disabled={!commentaire.trim()}
                onClick={async () => {
                  await decide(refuseId, "refuse", commentaire.trim());
                  setRefuseId(null);
                }}
              >
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

