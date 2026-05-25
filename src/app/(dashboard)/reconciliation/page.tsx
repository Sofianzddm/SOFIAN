"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Link2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  X,
  ExternalLink,
  Briefcase,
  EyeOff,
  Undo2,
  Search,
  Plus,
  Minus,
} from "lucide-react";

interface TransactionMatch {
  id: string;
  montant: number | string;
  modePaiement: string | null;
  document: {
    id: string;
    reference: string;
    type: string;
    montantTTC: number | string;
    statut: string;
    collaboration?: {
      id: string;
      reference: string;
      marque: { nom: string };
    } | null;
  };
}

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
  totalAlloue?: number;
  restant?: number;
  horsPlateforme?: boolean;
  horsPlateformeAt?: string | null;
  horsPlateformeNote?: string | null;
  document?: {
    id: string;
    reference: string;
    type: string;
    collaboration?: {
      id: string;
      reference: string;
      marque: { nom: string };
    } | null;
  };
  matches?: TransactionMatch[];
}

const FACTURE_STATUTS_RAPPROCHEMENT = "ENVOYE,VALIDE,PAYE";

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

const MODE_PAIEMENT_OPTIONS = [
  "Virement",
  "Carte bancaire",
  "Chèque",
  "Espèces",
  "Prélèvement",
  "Autres",
] as const;

interface FactureMatchSummary {
  id: string;
  montant: number | string;
  transactionId: string;
}

interface Facture {
  id: string;
  reference: string;
  montantHT?: number | string;
  montantTTC: number | string;
  dateEmission: string;
  dateEcheance: string;
  statut: string;
  devise?: string;
  clientNom?: string | null;
  collaboration: {
    id: string;
    reference: string;
    marque: { nom: string };
  } | null;
  transactionMatches?: FactureMatchSummary[];
}

function toNumber(v: number | string | undefined | null): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getFactureRestant(facture: Facture, excludeTransactionId?: string) {
  const ttc = toNumber(facture.montantTTC);
  const totalPaid = (facture.transactionMatches ?? [])
    .filter((m) => !excludeTransactionId || m.transactionId !== excludeTransactionId)
    .reduce((s, m) => s + toNumber(m.montant), 0);
  return Math.max(0, ttc - totalPaid);
}

export default function ReconciliationPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionQonto[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [markingHorsPlateforme, setMarkingHorsPlateforme] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [periodDays, setPeriodDays] = useState<number>(90);
  const [previewFacture, setPreviewFacture] = useState<Facture | null>(null);
  const [showHorsPlateforme, setShowHorsPlateforme] = useState(false);

  // Modale "Rapprocher"
  const [reconcileTx, setReconcileTx] = useState<TransactionQonto | null>(null);
  const [reconcileSearch, setReconcileSearch] = useState("");
  const [selection, setSelection] = useState<
    Array<{ factureId: string; montant: number }>
  >([]);
  const [modePaiement, setModePaiement] = useState<string>("Virement");
  const [submittingReconcile, setSubmittingReconcile] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [dissociating, setDissociating] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [transactionsRes, facturesRes] = await Promise.all([
        fetch("/api/qonto/transactions?includeHorsPlateforme=true"),
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
        const list = parseDocumentsList(data).filter((f) => f.statut !== "ANNULE");
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

  const marquerHorsPlateforme = async (
    transactionId: string,
    horsPlateforme: boolean
  ) => {
    if (horsPlateforme) {
      const ok = window.confirm(
        "Marquer ce paiement comme « hors plateforme » ?\n\n" +
          "Il n'apparaîtra plus dans la liste des transactions à réconcilier. " +
          "Utilisez ceci pour les virements perso, remboursements ou paiements d'une autre activité."
      );
      if (!ok) return;
    }

    setMarkingHorsPlateforme(transactionId);
    try {
      const res = await fetch("/api/qonto/hors-plateforme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, horsPlateforme }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur lors du marquage");
        return;
      }
      await fetchData();
    } catch (error) {
      console.error("Erreur hors plateforme:", error);
      alert("Erreur lors du marquage");
    } finally {
      setMarkingHorsPlateforme(null);
    }
  };

  const openReconcile = (transaction: TransactionQonto) => {
    setReconcileTx(transaction);
    setSelection([]);
    setReconcileSearch("");
    setReconcileError(null);
    setModePaiement("Virement");
  };

  const closeReconcile = () => {
    setReconcileTx(null);
    setSelection([]);
    setReconcileSearch("");
    setReconcileError(null);
  };

  const reconcileTotals = useMemo(() => {
    if (!reconcileTx) {
      return { txMontant: 0, alreadyMatched: 0, selectionTotal: 0, restant: 0 };
    }
    const txMontant = toNumber(reconcileTx.montant);
    const alreadyMatched = toNumber(reconcileTx.totalAlloue ?? 0);
    const selectionTotal = selection.reduce((s, x) => s + toNumber(x.montant), 0);
    const restant = Math.max(0, txMontant - alreadyMatched - selectionTotal);
    return { txMontant, alreadyMatched, selectionTotal, restant };
  }, [reconcileTx, selection]);

  const factureRestantPourTx = (facture: Facture) =>
    getFactureRestant(facture, reconcileTx?.id);

  const factureCandidates = useMemo(() => {
    if (!reconcileTx) return [];
    const q = reconcileSearch.trim().toLowerCase();
    return factures
      .filter((f) => {
        if (selection.some((s) => s.factureId === f.id)) return false;
        if (factureRestantPourTx(f) <= 0.005) return false;
        if (!q) return true;
        return (
          f.reference.toLowerCase().includes(q) ||
          (f.collaboration?.marque?.nom ?? "").toLowerCase().includes(q) ||
          (f.clientNom ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // suggestions par montant proche en premier
        const dueA = Math.abs(
          factureRestantPourTx(a) - reconcileTotals.restant
        );
        const dueB = Math.abs(
          factureRestantPourTx(b) - reconcileTotals.restant
        );
        return dueA - dueB;
      });
  }, [factures, reconcileSearch, selection, reconcileTx, reconcileTotals.restant]);

  const addToSelection = (facture: Facture) => {
    if (!reconcileTx) return;
    const factureRestant = factureRestantPourTx(facture);
    const txRestant = reconcileTotals.restant;
    const montant = Math.min(factureRestant, txRestant);
    if (montant <= 0) {
      setReconcileError("Plus rien à allouer sur cette transaction");
      return;
    }
    setReconcileError(null);
    setSelection((s) => [...s, { factureId: facture.id, montant }]);
  };

  const removeFromSelection = (factureId: string) => {
    setSelection((s) => s.filter((x) => x.factureId !== factureId));
  };

  const updateSelectionMontant = (factureId: string, value: number) => {
    setSelection((s) =>
      s.map((x) =>
        x.factureId === factureId
          ? { ...x, montant: Number.isFinite(value) && value > 0 ? value : 0 }
          : x
      )
    );
  };

  const submitReconcile = async () => {
    if (!reconcileTx || selection.length === 0) return;
    setSubmittingReconcile(true);
    setReconcileError(null);
    try {
      const res = await fetch("/api/qonto/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: reconcileTx.id,
          matches: selection.map((s) => ({
            documentId: s.factureId,
            montant: s.montant,
          })),
          modePaiement,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReconcileError(data.error || "Erreur lors du rapprochement");
        return;
      }
      await fetchData();
      closeReconcile();
    } catch (err) {
      console.error("Erreur association:", err);
      setReconcileError("Erreur lors du rapprochement");
    } finally {
      setSubmittingReconcile(false);
    }
  };

  const handleDissocierMatch = async (transactionId: string, documentId?: string) => {
    const ok = window.confirm(
      documentId
        ? "Retirer ce rapprochement ? La facture redeviendra à payer si plus aucun montant n'est rapproché."
        : "Retirer tous les rapprochements de cette transaction ?"
    );
    if (!ok) return;
    setDissociating(`${transactionId}-${documentId ?? "all"}`);
    try {
      const res = await fetch("/api/qonto/dissocier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, documentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur lors du retrait du rapprochement");
        return;
      }
      await fetchData();
    } catch (err) {
      console.error("Erreur dissociation:", err);
      alert("Erreur lors du retrait du rapprochement");
    } finally {
      setDissociating(null);
    }
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!previewFacture && !reconcileTx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewFacture) setPreviewFacture(null);
        else if (reconcileTx) closeReconcile();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewFacture, reconcileTx]);

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

  const transactionsHorsPlateforme = transactions.filter((t) => t.horsPlateforme);
  // Transactions à réconcilier = non totalement associées ET non hors plateforme.
  // Incluent les transactions avec rapprochement PARTIEL (associe=false mais matches.length>0).
  const transactionsNonAssociees = transactions.filter(
    (t) => !t.associe && !t.horsPlateforme
  );
  const transactionsAssociees = transactions.filter(
    (t) => t.associe && !t.horsPlateforme
  );
  const filteredNonAssociees = search
    ? transactionsNonAssociees.filter(
        (t) =>
          t.libelle?.toLowerCase().includes(search.toLowerCase()) ||
          (t.emetteur ?? "").toLowerCase().includes(search.toLowerCase()) ||
          t.reference?.toLowerCase().includes(search.toLowerCase())
      )
    : transactionsNonAssociees;

  const totalNonAssocie = transactionsNonAssociees.reduce(
    (s, t) => s + (toNumber(t.restant) || toNumber(t.montant)),
    0
  );
  const totalAssocie = transactionsAssociees.reduce((s, t) => s + toNumber(t.montant), 0);
  const totalHorsPlateforme = transactionsHorsPlateforme.reduce(
    (s, t) => s + toNumber(t.montant),
    0
  );
  const facturesARapprocher = factures.filter((f) => getFactureRestant(f) > 0.005);
  const totalFacturesAttente = facturesARapprocher.reduce(
    (s, f) => s + getFactureRestant(f),
    0
  );

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
              Associer les encaissements Qonto à une ou plusieurs factures émises
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
              {formatMoney(totalNonAssocie)} restants
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
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Factures à encaisser</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{facturesARapprocher.length}</p>
            <p className="text-sm text-slate-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalFacturesAttente)} restants dus
            </p>
          </div>
        </div>

        {/* Table : À réconcilier */}
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
                Toutes les transactions importées sont déjà rapprochées.
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
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Libellé / émetteur</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Montant</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Restant</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Rapprochements</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600 w-44">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNonAssociees.map((transaction) => {
                    const matches = transaction.matches ?? [];
                    const partial = matches.length > 0;
                    const restant =
                      toNumber(transaction.restant ?? transaction.montant);
                    return (
                      <tr
                        key={transaction.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors align-top"
                      >
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {formatDate(transaction.dateTransaction)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {transaction.libelle || "—"}
                            {transaction.statut === "PENDING" && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 align-middle">
                                En attente
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {transaction.emetteur}
                          </div>
                          {transaction.reference && (
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {transaction.reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {formatMoney(toNumber(transaction.montant))}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              partial ? "text-amber-600" : "text-slate-900"
                            }`}
                          >
                            {formatMoney(restant)}
                          </span>
                          {partial && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              sur {formatMoney(toNumber(transaction.montant))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {matches.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {matches.map((m) => (
                                <li
                                  key={m.id}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="font-medium text-slate-800">
                                    {m.document.reference}
                                  </span>
                                  <span className="text-slate-500 tabular-nums">
                                    {formatMoney(toNumber(m.montant))}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDissocierMatch(transaction.id, m.document.id)
                                    }
                                    disabled={dissociating === `${transaction.id}-${m.document.id}`}
                                    className="ml-1 text-slate-400 hover:text-red-600 disabled:opacity-50"
                                    title="Retirer ce rapprochement"
                                  >
                                    {dissociating === `${transaction.id}-${m.document.id}` ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <X className="w-3 h-3" />
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openReconcile(transaction)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              {partial ? "Compléter" : "Rapprocher"}
                            </button>
                            {!partial && (
                              <button
                                type="button"
                                onClick={() =>
                                  marquerHorsPlateforme(transaction.id, true)
                                }
                                disabled={markingHorsPlateforme === transaction.id}
                                className="inline-flex items-center justify-center p-1.5 border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                                title="Hors plateforme"
                              >
                                {markingHorsPlateforme === transaction.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
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
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Factures</th>
                    <th className="w-20 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {transactionsAssociees.slice(0, 25).map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30 align-top"
                    >
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatDate(transaction.dateTransaction)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{transaction.libelle}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {formatMoney(toNumber(transaction.montant))}
                      </td>
                      <td className="py-3 px-4">
                        {(transaction.matches?.length ?? 0) > 0 ? (
                          <ul className="space-y-1">
                            {(transaction.matches ?? []).map((m) => (
                              <li key={m.id} className="flex items-center gap-2 text-xs">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewFacture({
                                      id: m.document.id,
                                      reference: m.document.reference,
                                      montantTTC: toNumber(m.document.montantTTC),
                                      dateEmission: transaction.dateTransaction,
                                      dateEcheance: transaction.dateTransaction,
                                      statut: m.document.statut,
                                      collaboration:
                                        m.document.collaboration ?? null,
                                    })
                                  }
                                  className="font-medium text-slate-800 hover:underline"
                                >
                                  {m.document.reference}
                                </button>
                                <span className="text-slate-500 tabular-nums">
                                  {formatMoney(toNumber(m.montant))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : transaction.document ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-700">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            {transaction.document.reference}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleDissocierMatch(transaction.id, undefined)
                          }
                          disabled={dissociating === `${transaction.id}-all`}
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="Dissocier toutes les factures"
                        >
                          {dissociating === `${transaction.id}-all` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Undo2 className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactionsAssociees.length > 25 && (
              <div className="px-5 py-2 border-t border-slate-100 text-xs text-slate-500">
                Affichage des 25 dernières. Total : {transactionsAssociees.length} réconciliées.
              </div>
            )}
          </div>
        )}

        {/* Paiements hors plateforme */}
        {transactionsHorsPlateforme.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mt-8">
            <button
              type="button"
              onClick={() => setShowHorsPlateforme((v) => !v)}
              className="w-full px-5 py-4 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-2 text-left">
                <EyeOff className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Paiements hors plateforme
                  <span className="text-slate-400 font-normal ml-2">
                    ({transactionsHorsPlateforme.length})
                  </span>
                </h2>
                <span className="text-xs text-slate-500 ml-2 tabular-nums">
                  {formatMoney(totalHorsPlateforme)}
                </span>
              </div>
            </button>
            {showHorsPlateforme && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Libellé</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Émetteur</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Montant</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600 w-40">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionsHorsPlateforme.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30"
                      >
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {formatDate(transaction.dateTransaction)}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {transaction.libelle}
                          {transaction.reference && (
                            <span className="block text-xs text-slate-400 font-mono mt-0.5">
                              {transaction.reference}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{transaction.emetteur}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                          {formatMoney(toNumber(transaction.montant))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              marquerHorsPlateforme(transaction.id, false)
                            }
                            disabled={markingHorsPlateforme === transaction.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md disabled:opacity-50"
                            title="Réintégrer dans la réconciliation"
                          >
                            {markingHorsPlateforme === transaction.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Undo2 className="w-3.5 h-3.5" />
                            )}
                            Réintégrer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───────────── MODALE : Rapprocher (multi-factures) ───────────── */}
      {reconcileTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeReconcile}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header de la modale : nom émetteur, libellé/réf et montant */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline flex-wrap gap-x-3">
                  <p className="font-semibold text-lg text-[#9F2C2C] truncate">
                    {reconcileTx.emetteur || "Émetteur inconnu"}
                  </p>
                  {reconcileTx.reference && (
                    <span className="text-slate-500 font-mono text-sm">
                      {reconcileTx.reference}
                    </span>
                  )}
                  <span className="text-slate-400">|</span>
                  <span className="font-semibold text-lg text-slate-900 tabular-nums">
                    {formatMoney(toNumber(reconcileTx.montant))}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {reconcileTx.libelle} · {formatDate(reconcileTx.dateTransaction)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReconcile}
                className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Section : Factures candidates */}
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Factures</h3>
                  <div className="relative w-full max-w-xs">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      placeholder="Votre recherche"
                      value={reconcileSearch}
                      onChange={(e) => setReconcileSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          <th className="py-2 px-3">Facture n°</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">État</th>
                          <th className="py-2 px-3">Client</th>
                          <th className="py-2 px-3 text-right">Total TTC</th>
                          <th className="py-2 px-3 text-right">Restant dû</th>
                          <th className="py-2 px-3 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {factureCandidates.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-8 text-center text-sm text-slate-500"
                            >
                              {reconcileSearch
                                ? `Aucune facture pour « ${reconcileSearch} »`
                                : "Aucune facture disponible"}
                            </td>
                          </tr>
                        ) : (
                          factureCandidates.map((facture) => {
                            const restantDu = factureRestantPourTx(facture);
                            return (
                              <tr
                                key={facture.id}
                                className="border-t border-slate-100 hover:bg-slate-50/70"
                              >
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-[#9F2C2C]">
                                      {facture.reference}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewFacture(facture)}
                                      className="text-slate-400 hover:text-slate-700"
                                      title="Voir la facture"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                                  {formatDate(facture.dateEmission)}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {facture.statut === "PAYE"
                                    ? "Payé"
                                    : facture.statut === "ENVOYE"
                                    ? "Envoyé"
                                    : "Enregistré"}
                                </td>
                                <td className="py-2 px-3 text-slate-600 truncate max-w-[140px]">
                                  {facture.collaboration?.marque?.nom ??
                                    facture.clientNom ??
                                    "—"}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums">
                                  {formatMoney(toNumber(facture.montantTTC))}
                                </td>
                                <td className="py-2 px-3 text-right font-medium tabular-nums">
                                  {formatMoney(restantDu)}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => addToSelection(facture)}
                                    disabled={reconcileTotals.restant <= 0.005}
                                    className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                                    title="Ajouter à la sélection"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Section : Votre sélection */}
              <div className="px-6 py-4">
                <h3 className="text-base font-semibold text-slate-900 mb-3">
                  Votre sélection
                </h3>

                {selection.length === 0 ? (
                  <div className="border border-slate-200 rounded-lg py-6 text-center text-sm text-slate-400 bg-slate-50/50">
                    Aucune facture sélectionnée. Cliquez sur{" "}
                    <Plus className="inline w-3.5 h-3.5 align-text-bottom" /> à
                    droite pour en ajouter.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          <th className="py-2 px-3">Facture n°</th>
                          <th className="py-2 px-3">Client</th>
                          <th className="py-2 px-3 text-right">Restant dû</th>
                          <th className="py-2 px-3 text-right">Montant alloué</th>
                          <th className="py-2 px-3 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {selection.map((item) => {
                          const facture = factures.find(
                            (f) => f.id === item.factureId
                          );
                          if (!facture) return null;
                          const restant = factureRestantPourTx(facture);
                          return (
                            <tr
                              key={item.factureId}
                              className="border-t border-slate-100"
                            >
                              <td className="py-2 px-3">
                                <span className="font-medium text-[#9F2C2C]">
                                  {facture.reference}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-600 truncate max-w-[160px]">
                                {facture.collaboration?.marque?.nom ??
                                  facture.clientNom ??
                                  "—"}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                                {formatMoney(restant)}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.montant}
                                  onChange={(e) =>
                                    updateSelectionMontant(
                                      item.factureId,
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-28 px-2 py-1 text-right border border-slate-200 rounded text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-200"
                                />
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeFromSelection(item.factureId)
                                  }
                                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  title="Retirer"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {reconcileTotals.alreadyMatched > 0.005 && (
                  <div className="mt-3 text-xs text-slate-500">
                    Déjà rapproché sur cette transaction :{" "}
                    <span className="font-medium text-slate-700 tabular-nums">
                      {formatMoney(reconcileTotals.alreadyMatched)}
                    </span>
                  </div>
                )}

                <div className="mt-4 text-center">
                  <span className="text-xs uppercase tracking-wider text-slate-500">
                    Restant à rapprocher{" "}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      reconcileTotals.restant <= 0.005
                        ? "text-emerald-600"
                        : "text-[#9F2C2C]"
                    }`}
                  >
                    {formatMoney(reconcileTotals.restant)}
                  </span>
                  <span className="text-xs text-slate-500"> sur </span>
                  <span className="font-semibold text-[#9F2C2C] tabular-nums">
                    {formatMoney(reconcileTotals.txMontant)}
                  </span>
                </div>

                {/* Barre de progression */}
                <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      reconcileTotals.restant <= 0.005
                        ? "bg-emerald-500"
                        : "bg-amber-400"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        ((reconcileTotals.alreadyMatched +
                          reconcileTotals.selectionTotal) /
                          (reconcileTotals.txMontant || 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>

                {reconcileError && (
                  <p className="mt-3 text-sm text-red-600">{reconcileError}</p>
                )}
              </div>
            </div>

            {/* Footer : mode de paiement + actions */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <label className="font-medium text-slate-700">
                  Mode de paiement
                </label>
                <select
                  value={modePaiement}
                  onChange={(e) => setModePaiement(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {MODE_PAIEMENT_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeReconcile}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-white"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submitReconcile}
                  disabled={selection.length === 0 || submittingReconcile}
                  className="px-4 py-2 text-sm font-medium bg-[#9F2C2C] text-white rounded-md hover:bg-[#8B2424] disabled:opacity-50 disabled:pointer-events-none inline-flex items-center gap-2"
                >
                  {submittingReconcile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  Rapprocher
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : Aperçu facture */}
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
                  {formatMoney(toNumber(previewFacture.montantTTC))}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewFacture.collaboration && (
                  <a
                    href={`/collaborations/${previewFacture.collaboration.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
                    title={`Collaboration ${previewFacture.collaboration.reference}`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    Collaboration
                  </a>
                )}
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
