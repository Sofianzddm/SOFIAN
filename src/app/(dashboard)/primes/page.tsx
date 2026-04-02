"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useSession } from "next-auth/react";
import { Loader2, Plus } from "lucide-react";
import { PRIME_TYPE_LABELS, type PrimeLigne, type PrimeLigneType } from "@/lib/primes";

type PrimeStatut = "BROUILLON" | "SOUMIS" | "VALIDE" | "REFUSE";
type PrimeRow = {
  id: string;
  userId: string;
  mois: number;
  annee: number;
  lignes: PrimeLigne[];
  primeCA: number;
  statut: PrimeStatut;
  commentaireAdmin: string | null;
};

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function eur(v: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`;
}

function calcFivePercent(value: number): number {
  return Math.round(value * 0.05 * 100) / 100;
}



function parseAmountInput(value: string, fallback = 0): number {
  const n = Number(String(value).trim().replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 100) / 100;
}

function statutStyle(statut: PrimeStatut): { label: string; bg: string; color: string } {
  if (statut === "SOUMIS") return { label: "SOUMIS", bg: "#FEF3C7", color: "#92400E" };
  if (statut === "VALIDE") return { label: "VALIDÉ", bg: "#DCFCE7", color: "#166534" };
  if (statut === "REFUSE") return { label: "REFUSÉ", bg: "#FEE2E2", color: "#991B1B" };
  return { label: "BROUILLON", bg: "#F3F4F6", color: "#374151" };
}

export default function PrimesPage() {
  const { status, data: session } = useSession();
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [primes, setPrimes] = useState<PrimeRow[]>([]);
  const [primeCAMois, setPrimeCAMois] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [createMois, setCreateMois] = useState<number>(new Date().getMonth() + 1);
  const [createAnnee, setCreateAnnee] = useState<number>(new Date().getFullYear());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLignes, setDraftLignes] = useState<Record<string, PrimeLigne[]>>({});
  const [draftPrimeCA, setDraftPrimeCA] = useState<Record<string, string>>({});

  const isAllowed = effectiveRole === "HEAD_OF_INFLUENCE" || effectiveRole === "HEAD_OF";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, ca] = await Promise.all([
        fetch("/api/primes", { credentials: "include" }),
        fetch(`/api/primes/ca?mois=${new Date().getMonth() + 1}&annee=${new Date().getFullYear()}`, {
          credentials: "include",
        }),
      ]);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Chargement impossible.");
      const rows = Array.isArray(d.primes) ? (d.primes as PrimeRow[]) : [];
      setPrimes(rows.map((p) => ({ ...p, lignes: Array.isArray(p.lignes) ? p.lignes : [] })));
      const caJson = await ca.json().catch(() => ({}));
      if (ca.ok) setPrimeCAMois(typeof caJson.primeCA === "number" ? caJson.primeCA : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setEffectiveRole(typeof m?.role === "string" ? m.role : null))
      .catch(() => setEffectiveRole((session?.user as { role?: string } | undefined)?.role ?? null));
  }, [status, session?.user]);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const createPrime = async () => {
    setError(null);
    const res = await fetch("/api/primes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mois: createMois, annee: createAnnee }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof d.error === "string" ? d.error : "Création impossible.");
      return;
    }
    setOpenCreate(false);
    await load();
  };

  const total = useCallback((p: PrimeRow) => {
    const lignes = (p.lignes || []).reduce((s, l) => s + Number(l.montant || 0), 0);
    return lignes + Number(p.primeCA || 0);
  }, []);

  const addLine = (primeId: string) => {
    setDraftLignes((prev) => {
      const lines = prev[primeId] ?? [];
      return {
        ...prev,
        [primeId]: [
          ...lines,
          { id: nanoid(), type: "AUTRE", description: "", talentNom: "", montant: 0 },
        ],
      };
    });
  };

  const saveDraft = async (primeId: string) => {
    const lignes = draftLignes[primeId] ?? [];
    const primeInput = (draftPrimeCA[primeId] ?? "").trim();
    const lignesTotalLocal = lignes.reduce((sum, l) => sum + Number(l.montant || 0), 0);
    const primeCA = primeInput ? parseAmountInput(primeInput, 0) : calcFivePercent(lignesTotalLocal);
    const res = await fetch(`/api/primes/${primeId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", lignes, primeCA }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof d.error === "string" ? d.error : "Sauvegarde impossible.");
      return;
    }
    setEditingId(null);
    await load();
  };

  const submitPrime = async (primeId: string) => {
    const lignes = draftLignes[primeId] ?? primes.find((p) => p.id === primeId)?.lignes ?? [];
    const primeInput = (draftPrimeCA[primeId] ?? "").trim();
    const lignesTotalLocal = lignes.reduce((sum, l) => sum + Number(l.montant || 0), 0);
    const primeCA = primeInput ? parseAmountInput(primeInput, 0) : calcFivePercent(lignesTotalLocal);
    const res = await fetch(`/api/primes/${primeId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", lignes, primeCA }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof d.error === "string" ? d.error : "Soumission impossible.");
      return;
    }
    setEditingId(null);
    await load();
  };

  const primesView = useMemo(
    () =>
      primes.map((p) => ({
        ...p,
        editLignes: editingId === p.id ? draftLignes[p.id] ?? p.lignes : p.lignes,
        editPrimeCA: editingId === p.id ? draftPrimeCA[p.id] ?? String(p.primeCA ?? 0) : String(p.primeCA ?? 0),
      })),
    [primes, editingId, draftLignes, draftPrimeCA]
  );

  if (status === "loading" || !effectiveRole) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
      </div>
    );
  }
  if (!isAllowed) return <div className="p-6 text-sm">Accès refusé.</div>;

  return (
    <div className="space-y-5" style={{ fontFamily: "Switzer, sans-serif" }}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>
          Mes primes
        </h1>
        <button
          type="button"
          onClick={() => setOpenCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border"
          style={{ borderColor: OLD_ROSE, color: LICORICE }}
        >
          <Plus className="w-4 h-4" /> Nouveau mois
        </button>
      </div>

      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "#F3F4F6", color: LICORICE }}>
        Prime CA du mois en cours : <strong>{eur(primeCAMois)}</strong>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: OLD_ROSE }} /></div>
      ) : (
        <div className="space-y-4">
          {primesView.map((p) => {
            const s = statutStyle(p.statut);
            const lignes = p.editLignes;
            const lignesTotal = lignes.reduce((sum, l) => sum + Number(l.montant || 0), 0);
            const parsedPrime = editingId === p.id ? parseAmountInput(p.editPrimeCA, Number(p.primeCA || 0)) : Number(p.primeCA || 0);
            const primeCAValue = parsedPrime > 0 ? parsedPrime : calcFivePercent(lignesTotal);
            return (
              <div key={p.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "#EEDFD1" }}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold" style={{ color: LICORICE }}>{MONTHS[p.mois - 1]} {p.annee}</p>
                    <p className="text-sm" style={{ color: OLD_ROSE }}>Total : {eur(total({ ...p, lignes }))}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ color: OLD_ROSE }}>
                        <th className="py-2">Type</th><th className="py-2">Description</th><th className="py-2">Talent</th><th className="py-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l, i) => (
                        <tr key={l.id} className="border-t" style={{ borderColor: "#F2E9DD" }}>
                          <td className="py-2">
                            {editingId === p.id ? (
                              <select
                                className="border rounded px-2 py-1 text-xs"
                                value={l.type}
                                onChange={(e) => setDraftLignes((prev) => {
                                  const next = [...(prev[p.id] ?? p.lignes)];
                                  next[i] = { ...next[i], type: e.target.value as PrimeLigneType };
                                  return { ...prev, [p.id]: next };
                                })}
                              >
                                <option value="RECRUTEMENT_TALENT">Recrutement talent</option>
                                <option value="PREMIERE_COLLAB">Première collaboration (500 €)</option>
                                <option value="PREMIERE_SIGNATURE_TALENT">Première signature talent</option>
                                <option value="AUTRE">Autre</option>
                              </select>
                            ) : (
                              PRIME_TYPE_LABELS[l.type]
                            )}
                          </td>
                          <td className="py-2">
                            {editingId === p.id ? (
                              <input
                                className="border rounded px-2 py-1 w-full"
                                value={l.description}
                                onChange={(e) => setDraftLignes((prev) => {
                                  const next = [...(prev[p.id] ?? p.lignes)];
                                  next[i] = { ...next[i], description: e.target.value };
                                  return { ...prev, [p.id]: next };
                                })}
                              />
                            ) : l.description}
                          </td>
                          <td className="py-2">
                            {editingId === p.id ? (
                              <input
                                className="border rounded px-2 py-1 w-full"
                                value={l.talentNom ?? ""}
                                onChange={(e) => setDraftLignes((prev) => {
                                  const next = [...(prev[p.id] ?? p.lignes)];
                                  next[i] = { ...next[i], talentNom: e.target.value };
                                  return { ...prev, [p.id]: next };
                                })}
                              />
                            ) : (l.talentNom || "—")}
                          </td>
                          <td className="py-2 text-right">
                            {editingId === p.id ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="border rounded px-2 py-1 w-28 text-right"
                                value={l.montant}
                                onChange={(e) => setDraftLignes((prev) => {
                                  const next = [...(prev[p.id] ?? p.lignes)];
                                  const raw = String(e.target.value || "0").replace(",", ".");
                                  next[i] = { ...next[i], montant: Number(raw || 0) };
                                  return { ...prev, [p.id]: next };
                                })}
                              />
                            ) : eur(Number(l.montant || 0))}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                        <td className="py-2 italic" colSpan={3} style={{ color: OLD_ROSE }}>
                          Prime CA (5% commission)
                        </td>
                        <td className="py-2 text-right italic">{editingId === p.id ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            className="border rounded px-2 py-1 w-28 text-right"
                            value={p.editPrimeCA}
                            onChange={(e) => setDraftPrimeCA((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          />
                        ) : eur(primeCAValue)}</td>
                      </tr>
                      <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                        <td className="py-2 font-semibold" colSpan={3} style={{ color: LICORICE }}>Total général</td>
                        <td className="py-2 text-right font-semibold">{eur(lignesTotal + primeCAValue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {p.statut === "REFUSE" && p.commentaireAdmin && (
                  <p className="text-sm mt-2 text-red-700">{p.commentaireAdmin}</p>
                )}

                {p.statut === "BROUILLON" && (
                  <div className="mt-3 flex gap-2">
                    {editingId !== p.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id);
                          setDraftLignes((prev) => ({ ...prev, [p.id]: [...p.lignes] }));
                          setDraftPrimeCA((prev) => ({ ...prev, [p.id]: String(p.primeCA ?? 0) }));
                        }}
                        className="px-3 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: OLD_ROSE, color: LICORICE }}
                      >
                        Modifier
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => addLine(p.id)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: OLD_ROSE, color: LICORICE }}>
                          + Ajouter ligne
                        </button>
                        <button type="button" onClick={() => void saveDraft(p.id)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: OLD_ROSE, color: LICORICE }}>
                          Enregistrer
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: "#D1D5DB", color: "#374151" }}>
                          Annuler
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void submitPrime(p.id)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
                    >
                      Soumettre à validation
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {openCreate && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4" style={{ borderColor: "#EEDFD1" }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: LICORICE }}>Nouveau mois</h3>
            <div className="space-y-3">
              <label className="block text-sm">Mois
                <select className="mt-1 w-full border rounded-lg px-3 py-2" value={createMois} onChange={(e) => setCreateMois(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="block text-sm">Année
                <input className="mt-1 w-full border rounded-lg px-3 py-2" type="number" value={createAnnee} onChange={(e) => setCreateAnnee(Number(e.target.value))} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 border rounded-lg" onClick={() => setOpenCreate(false)}>Annuler</button>
              <button className="px-3 py-2 rounded-lg" style={{ backgroundColor: TEA_GREEN, color: LICORICE }} onClick={() => void createPrime()}>
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

