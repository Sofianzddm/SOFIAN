"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  Upload,
  X,
} from "lucide-react";

interface DepenseInfo {
  id: string;
  fournisseur: string | null;
  libelle: string | null;
  categorie: string | null;
  notes: string | null;
  montantTTC: number | string;
  montantTVA: number | string | null;
  tauxTVA: number | string | null;
  devise: string;
  dateDepense: string;
  justificatifUrl: string | null;
  justificatifNom: string | null;
  justificatifType: string | null;
  source: string;
  createdBy?: { id: string; prenom: string; nom: string } | null;
}

interface TransactionDebit {
  id: string;
  qontoId: string;
  montant: number | string;
  devise: string;
  libelle: string | null;
  emetteur: string | null;
  dateTransaction: string;
  statut: string;
  depense: DepenseInfo | null;
}

const PERIOD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: "30 jours" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
  { value: 365, label: "12 mois" },
];

const CATEGORIES = [
  "Logiciels & abonnements",
  "Déplacements",
  "Restauration",
  "Matériel",
  "Marketing & communication",
  "Prestataires & freelances",
  "Événements",
  "Salaires & charges",
  "Frais bancaires",
  "Impôts & taxes",
  "Loyer & bureaux",
  "Autres",
];

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function DepensesPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionDebit[]>([]);
  const [horsBanque, setHorsBanque] = useState<DepenseInfo[]>([]);
  const [periodDays, setPeriodDays] = useState<number>(90);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Upload en cours (id de transaction ou de dépense hors banque)
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Ligne survolée pendant un drag
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Input file caché : cible du clic "Ajouter un justificatif"
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadTarget = useRef<TransactionDebit | null>(null);

  // Modale d'édition (catégorie, TVA, notes…)
  const [editDepense, setEditDepense] = useState<DepenseInfo | null>(null);
  const [editTx, setEditTx] = useState<TransactionDebit | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = async (days = periodDays) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/depenses?periodDays=${days}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors du chargement des dépenses");
        return;
      }
      const data = await res.json();
      setTransactions(data.transactions || []);
      setHorsBanque(data.horsBanque || []);
    } catch (e) {
      console.error("Erreur fetch dépenses:", e);
      setError("Erreur lors du chargement des dépenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(periodDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays]);

  const syncQonto = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/qonto/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: periodDays }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.details || data.error || "Erreur de synchronisation");
        return;
      }
      await fetchData();
    } catch (e) {
      console.error("Erreur sync:", e);
      alert("Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  /** Upload d'un justificatif sur une transaction (drag & drop ou clic). */
  const uploadForTransaction = async (tx: TransactionDebit, file: File) => {
    setUploadingId(tx.id);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      let res: Response;
      if (tx.depense) {
        // Dépense déjà créée (ex : catégorie saisie avant) → remplacer/ajouter le fichier
        res = await fetch(`/api/depenses/${tx.depense.id}`, {
          method: "PATCH",
          body: formData,
        });
      } else {
        formData.append("transactionId", tx.id);
        res = await fetch("/api/depenses", { method: "POST", body: formData });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'upload du justificatif");
        return;
      }
      setTransactions((list) =>
        list.map((t) => (t.id === tx.id ? { ...t, depense: data.depense } : t))
      );
    } catch (e) {
      console.error("Erreur upload:", e);
      setError("Erreur lors de l'upload du justificatif");
    } finally {
      setUploadingId(null);
    }
  };

  const onDropRow = (tx: TransactionDebit) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadForTransaction(tx, file);
  };

  const openFilePicker = (tx: TransactionDebit) => {
    pendingUploadTarget.current = tx;
    fileInputRef.current?.click();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tx = pendingUploadTarget.current;
    e.target.value = "";
    pendingUploadTarget.current = null;
    if (file && tx) void uploadForTransaction(tx, file);
  };

  const removeJustificatif = async (depense: DepenseInfo) => {
    const ok = window.confirm(
      "Supprimer cette dépense et son justificatif ? La transaction redeviendra à justifier."
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/depenses/${depense.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      await fetchData();
    } catch (e) {
      console.error("Erreur suppression:", e);
      alert("Erreur lors de la suppression");
    }
  };

  const openEdit = (tx: TransactionDebit | null, depense: DepenseInfo | null) => {
    setEditTx(tx);
    setEditDepense(
      depense ?? {
        id: "",
        fournisseur: tx?.emetteur ?? null,
        libelle: tx?.libelle ?? null,
        categorie: null,
        notes: null,
        montantTTC: tx ? Math.abs(toNumber(tx.montant)) : 0,
        montantTVA: null,
        tauxTVA: null,
        devise: tx?.devise ?? "EUR",
        dateDepense: tx?.dateTransaction ?? new Date().toISOString(),
        justificatifUrl: null,
        justificatifNom: null,
        justificatifType: null,
        source: "WEB",
      }
    );
  };

  const closeEdit = () => {
    setEditDepense(null);
    setEditTx(null);
  };

  const saveEdit = async () => {
    if (!editDepense) return;
    setSavingEdit(true);
    try {
      const payload = {
        fournisseur: editDepense.fournisseur ?? "",
        libelle: editDepense.libelle ?? "",
        categorie: editDepense.categorie ?? "",
        notes: editDepense.notes ?? "",
        montantTVA:
          editDepense.montantTVA === null || editDepense.montantTVA === ""
            ? null
            : toNumber(editDepense.montantTVA),
        tauxTVA:
          editDepense.tauxTVA === null || editDepense.tauxTVA === ""
            ? null
            : toNumber(editDepense.tauxTVA),
      };

      let res: Response;
      if (editDepense.id) {
        res = await fetch(`/api/depenses/${editDepense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Pas encore de dépense pour cette transaction → création sans fichier
        const formData = new FormData();
        if (editTx) formData.append("transactionId", editTx.id);
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== null && v !== "") formData.append(k, String(v));
        });
        res = await fetch("/api/depenses", { method: "POST", body: formData });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur lors de l'enregistrement");
        return;
      }
      await fetchData();
      closeEdit();
    } catch (e) {
      console.error("Erreur enregistrement:", e);
      alert("Erreur lors de l'enregistrement");
    } finally {
      setSavingEdit(false);
    }
  };

  // ——— Dérivés ———
  const aJustifier = transactions.filter((t) => !t.depense?.justificatifUrl);
  const justifiees = transactions.filter((t) => t.depense?.justificatifUrl);

  const q = search.trim().toLowerCase();
  const matchTx = (t: TransactionDebit) =>
    !q ||
    (t.libelle ?? "").toLowerCase().includes(q) ||
    (t.emetteur ?? "").toLowerCase().includes(q) ||
    (t.depense?.categorie ?? "").toLowerCase().includes(q);

  const filteredAJustifier = aJustifier.filter(matchTx);
  const filteredJustifiees = justifiees.filter(matchTx);

  const totalAJustifier = aJustifier.reduce((s, t) => s + Math.abs(toNumber(t.montant)), 0);
  const totalJustifiees = justifiees.reduce((s, t) => s + Math.abs(toNumber(t.montant)), 0);
  const totalPeriode = totalAJustifier + totalJustifiees;

  const percentJustifie = useMemo(() => {
    if (transactions.length === 0) return 100;
    return Math.round((justifiees.length / transactions.length) * 100);
  }, [transactions.length, justifiees.length]);

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-slate-800">Accès réservé</p>
          <p className="text-sm text-slate-500 mt-1">
            Cette fonctionnalité est réservée aux administrateurs.
          </p>
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

  return (
    <div className="min-h-screen bg-slate-50/50">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*"
        className="hidden"
        onChange={onFilePicked}
      />

      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Dépenses
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Justifier chaque sortie d'argent Qonto : glissez la facture
              fournisseur sur la ligne correspondante
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
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

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              À justifier
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {aJustifier.length}
            </p>
            <p className="text-sm text-amber-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalAJustifier)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Justifiées
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {justifiees.length}
              <span className="text-sm font-normal text-slate-400 ml-2">
                ({percentJustifie}%)
              </span>
            </p>
            <p className="text-sm text-emerald-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalJustifiees)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total dépenses période
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {transactions.length}
            </p>
            <p className="text-sm text-slate-600 font-medium mt-0.5 tabular-nums">
              {formatMoney(totalPeriode)}
            </p>
          </div>
        </div>

        {/* Table : à justifier */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Dépenses à justifier
              <span className="text-slate-400 font-normal ml-2">
                ({aJustifier.length})
              </span>
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                placeholder="Rechercher (libellé, fournisseur…)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
              />
            </div>
          </div>

          {aJustifier.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-base font-medium text-slate-900">
                Toutes les dépenses sont justifiées
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Chaque sortie d'argent de la période a son justificatif.
              </p>
            </div>
          ) : filteredAJustifier.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Aucun résultat pour « {search} »
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">
                      Fournisseur / libellé
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">
                      Catégorie
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">
                      Montant
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600 w-64">
                      Justificatif
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAJustifier.map((tx) => {
                    const isDragOver = dragOverId === tx.id;
                    const isUploading = uploadingId === tx.id;
                    return (
                      <tr
                        key={tx.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverId(tx.id);
                        }}
                        onDragLeave={() => setDragOverId(null)}
                        onDrop={onDropRow(tx)}
                        className={`border-b border-slate-100 transition-colors align-top ${
                          isDragOver
                            ? "bg-amber-50 outline outline-2 outline-dashed outline-amber-400 -outline-offset-2"
                            : "hover:bg-slate-50/50"
                        }`}
                      >
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {formatDate(tx.dateTransaction)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {tx.emetteur || tx.libelle || "—"}
                          </div>
                          {tx.emetteur && tx.libelle && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {tx.libelle}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => openEdit(tx, tx.depense)}
                            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
                          >
                            {tx.depense?.categorie ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                {tx.depense.categorie}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 underline decoration-dotted underline-offset-2">
                                Catégoriser
                              </span>
                            )}
                            <Pencil className="w-3 h-3 text-slate-400" />
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-red-600 whitespace-nowrap tabular-nums">
                          −{formatMoney(Math.abs(toNumber(tx.montant)))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => openFilePicker(tx)}
                            disabled={isUploading}
                            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border-2 border-dashed transition-colors ${
                              isDragOver
                                ? "border-amber-400 bg-amber-100 text-amber-700"
                                : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                            } disabled:opacity-50`}
                          >
                            {isUploading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                            {isUploading
                              ? "Envoi…"
                              : "Glisser la facture ici"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section : dépenses hors banque (photos mobile en attente) */}
        {horsBanque.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-8">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">
                Reçus hors banque
                <span className="text-slate-400 font-normal ml-2">
                  ({horsBanque.length})
                </span>
              </h2>
              <span className="text-xs text-slate-400">
                — photographiés avant le passage en banque, à rapprocher
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {horsBanque.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatDate(d.dateDepense)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {d.fournisseur || d.libelle || "—"}
                        </div>
                        {d.createdBy && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            par {d.createdBy.prenom} {d.createdBy.nom}
                            {d.source === "MOBILE" && " (mobile)"}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {d.categorie && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                            {d.categorie}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-red-600 whitespace-nowrap tabular-nums">
                        −{formatMoney(Math.abs(toNumber(d.montantTTC)))}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {d.justificatifUrl && (
                          <a
                            href={d.justificatifUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 mr-3"
                          >
                            <FileText className="w-4 h-4" />
                            Voir
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          onClick={() => openEdit(null, d)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 mr-3"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Modifier
                        </button>
                        <button
                          onClick={() => removeJustificatif(d)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Table : justifiées */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Dépenses justifiées
              <span className="text-slate-400 font-normal ml-2">
                ({justifiees.length})
              </span>
            </h2>
          </div>
          {justifiees.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Aucune dépense justifiée sur la période.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">
                      Fournisseur / libellé
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">
                      Catégorie
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">
                      Montant
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600 w-56">
                      Justificatif
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJustifiees.map((tx) => {
                    const d = tx.depense!;
                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {formatDate(tx.dateTransaction)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {d.fournisseur || tx.emetteur || tx.libelle || "—"}
                          </div>
                          {tx.libelle && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {tx.libelle}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => openEdit(tx, d)}
                            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
                          >
                            {d.categorie ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                {d.categorie}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 underline decoration-dotted underline-offset-2">
                                Catégoriser
                              </span>
                            )}
                            <Pencil className="w-3 h-3 text-slate-400" />
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                          −{formatMoney(Math.abs(toNumber(tx.montant)))}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <a
                            href={d.justificatifUrl!}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 mr-3"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {d.justificatifNom
                              ? d.justificatifNom.length > 24
                                ? d.justificatifNom.slice(0, 21) + "…"
                                : d.justificatifNom
                              : "Voir"}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => removeJustificatif(d)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
                            title="Supprimer la dépense et son justificatif"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modale d'édition */}
      {editDepense && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Détails de la dépense
              </h3>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Fournisseur
                </label>
                <input
                  type="text"
                  value={editDepense.fournisseur ?? ""}
                  onChange={(e) =>
                    setEditDepense({ ...editDepense, fournisseur: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Catégorie
                </label>
                <select
                  value={editDepense.categorie ?? ""}
                  onChange={(e) =>
                    setEditDepense({
                      ...editDepense,
                      categorie: e.target.value || null,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">— Sans catégorie —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    TVA (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editDepense.montantTVA ?? ""}
                    onChange={(e) =>
                      setEditDepense({
                        ...editDepense,
                        montantTVA: e.target.value === "" ? null : e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Taux TVA (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editDepense.tauxTVA ?? ""}
                    onChange={(e) =>
                      setEditDepense({
                        ...editDepense,
                        tauxTVA: e.target.value === "" ? null : e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editDepense.notes ?? ""}
                  onChange={(e) =>
                    setEditDepense({ ...editDepense, notes: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={closeEdit}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
