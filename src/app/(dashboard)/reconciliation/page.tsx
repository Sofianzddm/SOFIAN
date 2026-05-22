"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Link2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Eye,
  X,
  ExternalLink,
} from "lucide-react";

interface TransactionQonto {
  id: string;
  qontoId: string;
  montant: number;
  libelle: string;
  reference: string;
  dateTransaction: string;
  emetteur: string;
  emetteurIban: string;
  statut?: "PENDING" | "SETTLED" | string;
  associe: boolean;
  document?: {
    id: string;
    reference: string;
    type: string;
  };
}

/** Factures éligibles au rapprochement (non payées, non annulées) */
const FACTURE_STATUTS_RAPPROCHEMENT = "ENVOYE,VALIDE";

function parseDocumentsList(data: unknown): Facture[] {
  if (Array.isArray(data)) return data as Facture[];
  if (data && typeof data === "object" && "documents" in data) {
    const docs = (data as { documents?: unknown }).documents;
    return Array.isArray(docs) ? (docs as Facture[]) : [];
  }
  return [];
}

const PERIOD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: "30 jours" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
  { value: 365, label: "12 mois" },
];

interface Facture {
  id: string;
  reference: string;
  montantHT?: number;
  montantTTC: number;
  dateEmission: string;
  dateEcheance: string;
  statut: string;
  collaboration: {
    id: string;
    reference: string;
    marque: { nom: string };
  } | null;
}

export default function ReconciliationPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionQonto[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [associating, setAssociating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [periodDays, setPeriodDays] = useState<number>(90);
  const [previewFacture, setPreviewFacture] = useState<Facture | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [transactionsRes, facturesRes] = await Promise.all([
        fetch("/api/qonto/transactions"),
        fetch(`/api/documents?type=FACTURE&statut=${FACTURE_STATUTS_RAPPROCHEMENT}`),
      ]);

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions || []);
      } else {
        console.error("Erreur chargement transactions Qonto:", transactionsRes.status);
      }

      if (facturesRes.ok) {
        const data = await facturesRes.json();
        const list = parseDocumentsList(data).filter(
          (f) => f.statut !== "PAYE" && f.statut !== "ANNULE"
        );
        setFactures(list);
      } else {
        console.error("Erreur chargement factures:", facturesRes.status);
        setFactures([]);
      }
    } catch (error) {
      console.error("Erreur fetch:", error);
      alert("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const syncQonto = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/qonto/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: periodDays }),
      });

      if (res.ok) {
        const data = await res.json();
        await fetchData();
        alert(`Synchronisation terminée. ${data.stats?.imported ?? 0} nouvelle(s) transaction(s).`);
      } else {
        const error = await res.json();
        alert(error.details || error.error || "Erreur de synchronisation");
      }
    } catch (error) {
      console.error("Erreur sync:", error);
      alert("Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  const associer = async (transactionId: string, factureId: string) => {
    setAssociating(transactionId);
    try {
      const res = await fetch("/api/qonto/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, documentId: factureId }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchData();
        setExpandedId(null);
        const msg = data.collaboration
          ? `Facture rapprochée. Marque marquée comme nous ayant payés (${data.collaboration.reference}). Pensez à « Nous avons payé le talent » une fois le talent réglé.`
          : "Paiement associé avec succès.";
        alert(msg);
      } else {
        alert(data.error || "Erreur lors de l'association");
      }
    } catch (error) {
      console.error("Erreur association:", error);
      alert("Erreur lors de l'association");
    } finally {
      setAssociating(null);
    }
  };

  const getSuggestions = (transaction: TransactionQonto): Facture[] => {
    const montantTransaction = Number(transaction.montant);
    return factures.filter((facture) => {
      const ttc = Number(facture.montantTTC);
      const ht = Number(facture.montantHT ?? 0);
      return (
        Math.abs(ttc - montantTransaction) < 1 ||
        (ht > 0 && Math.abs(ht - montantTransaction) < 1)
      );
    });
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!previewFacture) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewFacture(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewFacture]);

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-slate-800">Accès réservé</p>
          <p className="text-sm text-slate-500 mt-1">Cette fonctionnalité est réservée aux administrateurs.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const transactionsNonAssociees = transactions.filter((t) => !t.associe);
  const transactionsAssociees = transactions.filter((t) => t.associe);
  const filteredNonAssociees = search
    ? transactionsNonAssociees.filter(
        (t) =>
          t.libelle?.toLowerCase().includes(search.toLowerCase()) ||
          (t.emetteur ?? "").toLowerCase().includes(search.toLowerCase()) ||
          t.reference?.toLowerCase().includes(search.toLowerCase())
      )
    : transactionsNonAssociees;

  const totalNonAssocie = transactionsNonAssociees.reduce((s, t) => s + t.montant, 0);
  const totalAssocie = transactionsAssociees.reduce((s, t) => s + t.montant, 0);
  const totalFacturesAttente = factures.reduce((s, f) => s + Number(f.montantHT ?? f.montantTTC), 0);

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Réconciliation bancaire
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Associer les encaissements Qonto aux factures émises
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="qonto-period">
              Période
            </label>
            <select
              id="qonto-period"
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              disabled={syncing}
              className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 disabled:opacity-50"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={syncQonto}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {syncing ? "Synchronisation…" : "Synchroniser Qonto"}
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">À réconcilier</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{transactionsNonAssociees.length}</p>
            <p className="text-sm text-amber-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalNonAssocie)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Réconciliés</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{transactionsAssociees.length}</p>
            <p className="text-sm text-emerald-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalAssocie)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Factures en attente (HT)</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{factures.length}</p>
            <p className="text-sm text-slate-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalFacturesAttente)}
            </p>
          </div>
        </div>

        {/* Table: À réconcilier */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Transactions à réconcilier
              <span className="text-slate-400 font-normal ml-2">({transactionsNonAssociees.length})</span>
            </h2>
            {transactionsNonAssociees.length > 0 && (
              <input
                type="search"
                placeholder="Rechercher (libellé, émetteur, réf.)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
              />
            )}
          </div>

          {transactionsNonAssociees.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-base font-medium text-slate-900">Aucune transaction à réconcilier</p>
              <p className="text-sm text-slate-500 mt-1">
                Toutes les transactions importées sont déjà associées à une facture.
              </p>
            </div>
          ) : filteredNonAssociees.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Aucun résultat pour « {search} »
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-3 px-4 font-medium text-slate-600 w-8" />
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Libellé</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Émetteur</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Montant</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600 w-36">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNonAssociees.map((transaction) => {
                    const suggestions = getSuggestions(transaction);
                    const isExpanded = expandedId === transaction.id;

                    return (
                      <Fragment key={transaction.id}>
                        <tr
                          className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="py-2 px-4">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : transaction.id)
                              }
                              className="p-1 rounded hover:bg-slate-200 text-slate-500"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? "Replier" : "Associer à une facture"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {formatDate(transaction.dateTransaction)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-900">{transaction.libelle}</span>
                            {transaction.statut === "PENDING" && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 align-middle">
                                En attente
                              </span>
                            )}
                            {transaction.reference && (
                              <span className="block text-xs text-slate-400 font-mono mt-0.5">
                                {transaction.reference}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{transaction.emetteur}</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                            {formatMoney(transaction.montant)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : transaction.id)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              {isExpanded ? "Masquer" : "Associer"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={6} className="py-0 px-0">
                              <div className="px-4 py-4 border-t border-slate-200">
                                {suggestions.length > 0 && (
                                  <div className="mb-4">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                                      Correspondances par montant
                                    </p>
                                    <div className="space-y-2">
                                      {suggestions.map((facture) => (
                                        <div
                                          key={facture.id}
                                          className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-4 py-3"
                                        >
                                          <div className="flex items-center gap-4">
                                            <FileText className="w-4 h-4 text-slate-400" />
                                            <div>
                                              <p className="font-medium text-slate-900">{facture.reference}</p>
                                              <p className="text-xs text-slate-500">
                                                {facture.collaboration?.marque?.nom ?? "—"} · Échéance{" "}
                                                {formatDate(facture.dateEcheance)}
                                              </p>
                                            </div>
                                            <span className="text-sm font-medium text-slate-700 tabular-nums">
                                              {formatMoney(Number(facture.montantHT ?? facture.montantTTC))}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewFacture(facture)}
                                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50"
                                              title="Aperçu de la facture"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                              Voir
                                            </button>
                                            <button
                                              onClick={() => associer(transaction.id, facture.id)}
                                              disabled={associating === transaction.id}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 disabled:opacity-50"
                                            >
                                              {associating === transaction.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              ) : (
                                                <Link2 className="w-3.5 h-3.5" />
                                              )}
                                              Associer
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                                    {suggestions.length > 0 ? "Autre facture" : "Choisir une facture"}
                                  </p>
                                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                                    {factures.length === 0 ? (
                                      <p className="px-4 py-3 text-sm text-slate-500">
                                        Aucune facture envoyée ou validée en attente de paiement
                                        (statuts ENVOYE / VALIDE). Créez ou envoyez une facture
                                        depuis la fiche collaboration.
                                      </p>
                                    ) : (
                                      factures.map((facture) => (
                                        <div
                                          key={facture.id}
                                          className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                                        >
                                          <div className="flex items-center gap-3 min-w-0">
                                            <span className="font-medium text-slate-900 truncate">
                                              {facture.reference}
                                            </span>
                                            <span className="text-slate-500 text-xs shrink-0">
                                              {facture.collaboration?.marque?.nom ?? "—"}
                                            </span>
                                            <span className="text-slate-600 text-xs tabular-nums shrink-0">
                                              {formatMoney(Number(facture.montantHT ?? facture.montantTTC))}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewFacture(facture)}
                                              className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                              title="Aperçu de la facture"
                                              aria-label={`Aperçu ${facture.reference}`}
                                            >
                                              <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                              onClick={() => associer(transaction.id, facture.id)}
                                              disabled={associating === transaction.id}
                                              className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                                            >
                                              Associer
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Historique réconcilié */}
        {transactionsAssociees.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Historique réconcilié
                <span className="text-slate-400 font-normal ml-2">({transactionsAssociees.length})</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Libellé</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Montant</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Facture</th>
                    <th className="w-10 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {transactionsAssociees.slice(0, 15).map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30"
                    >
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatDate(transaction.dateTransaction)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{transaction.libelle}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                        {formatMoney(transaction.montant)}
                      </td>
                      <td className="py-3 px-4">
                        {transaction.document ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-700">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            {transaction.document.reference}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {transaction.document && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewFacture({
                                id: transaction.document!.id,
                                reference: transaction.document!.reference,
                                montantTTC: transaction.montant,
                                dateEmission: transaction.dateTransaction,
                                dateEcheance: transaction.dateTransaction,
                                statut: "PAYE",
                                collaboration: null,
                              })
                            }
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title={`Aperçu ${transaction.document.reference}`}
                            aria-label={`Aperçu ${transaction.document.reference}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactionsAssociees.length > 15 && (
              <div className="px-5 py-2 border-t border-slate-100 text-xs text-slate-500">
                Affichage des 15 dernières. Total : {transactionsAssociees.length} réconciliées.
              </div>
            )}
          </div>
        )}
      </div>

      {previewFacture && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setPreviewFacture(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {previewFacture.reference}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {previewFacture.collaboration?.marque?.nom ?? "Facture libre"}
                  {" · "}
                  {formatMoney(
                    Number(previewFacture.montantHT ?? previewFacture.montantTTC)
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/documents/${previewFacture.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Onglet
                </a>
                <a
                  href={`/factures/${previewFacture.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Fiche facture
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFacture(null)}
                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={`/api/documents/${previewFacture.id}/pdf`}
              title={`Aperçu ${previewFacture.reference}`}
              className="flex-1 w-full border-0 bg-slate-100"
            />
          </div>
        </div>
      )}
    </div>
  );
}
