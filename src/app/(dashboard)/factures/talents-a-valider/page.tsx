"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { downloadHref, previewHref } from "@/lib/download";

type CycleFacture = {
  id: string;
  numero: number;
  description: string | null;
  montantNet: number;
  factureTalentUrl: string | null;
  factureTalentRecueAt: string | null;
};

type FactureAValider = {
  id: string;
  reference: string;
  statut: string;
  montantBrut: number;
  montantNet: number;
  commissionEuros: number;
  factureTalentUrl: string | null;
  factureTalentRecueAt: string | null;
  isLongTerme: boolean;
  talent: { id: string; prenom: string; nom: string };
  marque: { id: string; nom: string };
  tm: { id: string; prenom: string; nom: string } | null;
  cycles: CycleFacture[];
};

type PreviewState = {
  item: FactureAValider;
  url: string;
  label: string;
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysWaiting(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function ageLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "1 jour";
  return `${days} jours`;
}

export default function FacturesTalentsAValiderPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";

  const [items, setItems] = useState<FactureAValider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [refusingId, setRefusingId] = useState<string | null>(null);
  const [refusTarget, setRefusTarget] = useState<FactureAValider | null>(null);
  const [raisonRefus, setRaisonRefus] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/factures/talents-a-valider");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur de chargement");
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch {
      setError("Erreur de chargement");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && isAdmin) {
      load();
    } else if (status === "authenticated") {
      setLoading(false);
    }
  }, [status, isAdmin, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? items
      : items.filter((item) => {
          return (
            item.reference.toLowerCase().includes(q) ||
            `${item.talent.prenom} ${item.talent.nom}`.toLowerCase().includes(q) ||
            item.marque.nom.toLowerCase().includes(q) ||
            (item.tm
              ? `${item.tm.prenom} ${item.tm.nom}`.toLowerCase().includes(q)
              : false)
          );
        });

    return [...list].sort((a, b) => {
      const ta = a.factureTalentRecueAt
        ? new Date(a.factureTalentRecueAt).getTime()
        : 0;
      const tb = b.factureTalentRecueAt
        ? new Date(b.factureTalentRecueAt).getTime()
        : 0;
      return ta - tb;
    });
  }, [items, search]);

  const totalNet = useMemo(
    () => filtered.reduce((sum, i) => sum + i.montantNet, 0),
    [filtered]
  );

  const openPreview = (
    item: FactureAValider,
    url: string | null,
    label?: string
  ) => {
    if (!url) return;
    setPreview({
      item,
      url,
      label:
        label ||
        `${item.reference} — ${item.talent.prenom} ${item.talent.nom}`,
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setPreview((p) => (p?.item.id === id ? null : p));
    setRefusTarget((t) => (t?.id === id ? null : t));
  };

  const valider = async (item: FactureAValider) => {
    setValidatingId(item.id);
    try {
      const res = await fetch(`/api/collaborations/${item.id}/valider-facture`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur lors de la validation");
        return;
      }
      removeItem(item.id);
      setToast(`${item.reference} validée`);
    } catch {
      alert("Erreur lors de la validation");
    } finally {
      setValidatingId(null);
    }
  };

  const refuser = async () => {
    if (!refusTarget) return;
    const commentaire = raisonRefus.trim();
    if (!commentaire) {
      alert("Indique le motif du refus — il sera envoyé par mail au talent.");
      return;
    }
    setRefusingId(refusTarget.id);
    try {
      const res = await fetch(
        `/api/collaborations/${refusTarget.id}/refuser-facture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raisonRefus: commentaire }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur lors du refus");
        return;
      }
      removeItem(refusTarget.id);
      setRaisonRefus("");
      setToast(
        data.emailSent
          ? `${refusTarget.reference} refusée — mail envoyé au talent`
          : `${refusTarget.reference} refusée — mail non envoyé (vérifier Resend)`
      );
    } catch {
      alert("Erreur lors du refus");
    } finally {
      setRefusingId(null);
    }
  };

  if (status === "loading" || (status === "authenticated" && isAdmin && loading)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center px-4">
        <p className="text-lg font-semibold text-slate-900">Accès réservé</p>
        <p className="text-sm text-slate-500 mt-2">
          Seuls les administrateurs peuvent valider les factures talents.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au dashboard
        </Link>
      </div>
    );
  }

  const previewSrc = preview
    ? previewHref(preview.url, `facture-${preview.item.reference}.pdf`)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Factures talents à valider
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Aperçu rapide sans quitter la page — refus = motif + mail au talent
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 font-medium text-amber-800">
                {filtered.length} à valider
              </span>
              {filtered.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 font-medium text-slate-700 tabular-nums">
                  {formatMoney(totalNet)} net
                </span>
              )}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Talent, marque, réf., TM…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">
            {items.length === 0
              ? "Aucune facture talent à valider"
              : "Aucun résultat pour cette recherche"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 whitespace-nowrap">Reçue</th>
                  <th className="px-4 py-3 whitespace-nowrap">Attente</th>
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Talent</th>
                  <th className="px-4 py-3">Marque</th>
                  <th className="px-4 py-3">TM</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Net talent</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const busy =
                    validatingId === item.id || refusingId === item.id;
                  const days = daysWaiting(item.factureTalentRecueAt);
                  const urgent = days !== null && days >= 7;
                  const warn = days !== null && days >= 3 && days < 7;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">
                        {formatDate(item.factureTalentRecueAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${
                            urgent
                              ? "bg-red-50 text-red-700"
                              : warn
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {ageLabel(days)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              openPreview(item, item.factureTalentUrl)
                            }
                            disabled={!item.factureTalentUrl}
                            className="font-medium text-slate-900 hover:text-violet-700 truncate text-left disabled:opacity-40"
                            title="Aperçu rapide"
                          >
                            {item.reference}
                          </button>
                          {item.isLongTerme && (
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              LT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 whitespace-nowrap">
                        {item.talent.prenom} {item.talent.nom}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-600 max-w-[10rem] truncate"
                        title={item.marque.nom}
                      >
                        {item.marque.nom}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {item.tm
                          ? `${item.tm.prenom} ${item.tm.nom.charAt(0)}.`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatMoney(item.montantNet)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={!item.factureTalentUrl}
                            onClick={() =>
                              openPreview(item, item.factureTalentUrl)
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg hover:bg-violet-100 disabled:opacity-40"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Aperçu rapide
                          </button>
                          <button
                            type="button"
                            onClick={() => valider(item)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {validatingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRaisonRefus("");
                              setRefusTarget(item);
                            }}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Refuser
                          </button>
                        </div>
                        {item.cycles.length > 1 && (
                          <div className="flex justify-end flex-wrap gap-1 mt-1.5">
                            {item.cycles.map((cy) => (
                              <button
                                key={cy.id}
                                type="button"
                                disabled={!cy.factureTalentUrl}
                                onClick={() =>
                                  openPreview(
                                    item,
                                    cy.factureTalentUrl,
                                    `${item.reference} · Cycle ${cy.numero}`
                                  )
                                }
                                className="text-[11px] text-violet-600 hover:text-violet-800 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-40"
                              >
                                Aperçu C{cy.numero}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-100">
            {filtered.map((item) => {
              const busy =
                validatingId === item.id || refusingId === item.id;
              const days = daysWaiting(item.factureTalentRecueAt);
              const urgent = days !== null && days >= 7;

              return (
                <div key={item.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {item.reference}
                      </p>
                      <p className="text-sm text-slate-700 mt-0.5">
                        {item.talent.prenom} {item.talent.nom}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.marque.nom}
                        {item.tm &&
                          ` · ${item.tm.prenom} ${item.tm.nom.charAt(0)}.`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-900 tabular-nums">
                        {formatMoney(item.montantNet)}
                      </p>
                      <span
                        className={`inline-flex mt-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                          urgent
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {ageLabel(days)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openPreview(item, item.factureTalentUrl)
                      }
                      disabled={!item.factureTalentUrl}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg disabled:opacity-40"
                    >
                      <Eye className="w-4 h-4" />
                      Aperçu
                    </button>
                    <button
                      type="button"
                      onClick={() => valider(item)}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg disabled:opacity-50"
                    >
                      {validatingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRaisonRefus("");
                        setRefusTarget(item);
                      }}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg disabled:opacity-50"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Panneau aperçu rapide (reste sur la page) */}
      {preview && previewSrc && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Fermer l'aperçu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setPreview(null)}
          />
          <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {preview.label}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {preview.item.marque.nom} ·{" "}
                  {formatMoney(preview.item.montantNet)} net · reçue le{" "}
                  {formatDate(preview.item.factureTalentRecueAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={downloadHref(
                    preview.url,
                    `facture-${preview.item.reference}.pdf`
                  )}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </a>
                <Link
                  href={`/collaborations/${preview.item.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <ExternalLink className="w-4 h-4" />
                  Collab
                </Link>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-slate-100">
              <iframe
                key={previewSrc}
                src={previewSrc}
                title="Aperçu facture talent"
                className="w-full h-full border-0 bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shrink-0">
              <p className="text-xs text-slate-500">
                Aperçu intégré — tu ne quittes pas la liste
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRaisonRefus("");
                    setRefusTarget(preview.item);
                  }}
                  disabled={
                    validatingId === preview.item.id ||
                    refusingId === preview.item.id
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={() => valider(preview.item)}
                  disabled={
                    validatingId === preview.item.id ||
                    refusingId === preview.item.id
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {validatingId === preview.item.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Valider la facture
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal refus + mail */}
      {refusTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Refuser la facture
              </h3>
              <button
                type="button"
                onClick={() => {
                  setRefusTarget(null);
                  setRaisonRefus("");
                }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4 flex gap-2">
              <Mail className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                Un <strong>mail</strong> sera envoyé à{" "}
                <strong>
                  {refusTarget.talent.prenom} {refusTarget.talent.nom}
                </strong>{" "}
                avec ton motif. La facture sera retirée et le talent devra en
                renvoyer une corrigée.
              </p>
            </div>

            <p className="text-sm text-slate-600 mb-2">
              {refusTarget.reference} · {refusTarget.marque.nom}
            </p>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Pourquoi cette facture est refusée ? (obligatoire)
            </label>
            <textarea
              value={raisonRefus}
              onChange={(e) => setRaisonRefus(e.target.value)}
              rows={4}
              placeholder="Ex. : montant incorrect, TVA manquante, mauvais n° de référence…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setRefusTarget(null);
                  setRaisonRefus("");
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={refuser}
                disabled={refusingId === refusTarget.id || !raisonRefus.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {refusingId === refusTarget.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                Refuser et envoyer le mail
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-3 shadow-lg max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
