"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  Search,
  Filter,
  Calendar,
  Building2,
  User,
  ChevronDown,
  Loader2,
  Receipt,
  FileCheck,
  FileMinus,
  Eye,
  MoreHorizontal,
  ArrowUpDown,
  X,
  RefreshCw,
  Check,
} from "lucide-react";

interface Document {
  id: string;
  reference: string;
  type: "DEVIS" | "FACTURE" | "AVOIR";
  statut: string;
  montantHT: number;
  montantTTC: number;
  dateEmission: string | null;
  dateEcheance: string | null;
  createdAt: string;
  collaboration: {
    id: string;
    reference: string;
    talent: { id: string; prenom: string; nom: string };
    marque: { id: string; nom: string };
  } | null;
}

const TYPE_CONFIG = {
  DEVIS: { label: "Devis", icon: FileText, color: "bg-blue-50 text-blue-600 border-blue-100" },
  FACTURE: { label: "Facture", icon: Receipt, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  AVOIR: { label: "Avoir", icon: FileMinus, color: "bg-orange-50 text-orange-600 border-orange-100" },
};

const STATUT_CONFIG: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon", color: "bg-gray-100 text-gray-600" },
  ENVOYE: { label: "Facturé", color: "bg-emerald-50 text-emerald-600" },
  VALIDE: { label: "Validé", color: "bg-green-50 text-green-600" },
  REFUSE: { label: "Refusé", color: "bg-red-50 text-red-600" },
  PAYE: { label: "Payé", color: "bg-green-100 text-green-700" },
  ANNULE: { label: "Annulé", color: "bg-red-50 text-red-500" },
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"DEVIS" | "FACTURE">("DEVIS");
  const [statutFilter, setStatutFilter] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "montant" | "reference">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [selectedFacture, setSelectedFacture] = useState<Document | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  // Filtrage
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      search === "" ||
      doc.reference.toLowerCase().includes(search.toLowerCase()) ||
      doc.collaboration?.marque.nom.toLowerCase().includes(search.toLowerCase()) ||
      doc.collaboration?.talent.prenom.toLowerCase().includes(search.toLowerCase()) ||
      doc.collaboration?.talent.nom.toLowerCase().includes(search.toLowerCase());

    const matchesTab = doc.type === activeTab;
    const matchesStatut = statutFilter === "ALL" || doc.statut === statutFilter;

    return matchesSearch && matchesTab && matchesStatut;
  });

  // Tri
  const sortedDocs = [...filteredDocs].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "date") {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (sortBy === "montant") {
      comparison = a.montantTTC - b.montantTTC;
    } else if (sortBy === "reference") {
      comparison = a.reference.localeCompare(b.reference);
    }
    return sortOrder === "desc" ? -comparison : comparison;
  });

  // Stats rapides
  const stats = {
    total: documents.length,
    devis: documents.filter((d) => d.type === "DEVIS").length,
    factures: documents.filter((d) => d.type === "FACTURE").length,
    avoirs: documents.filter((d) => d.type === "AVOIR").length,
    enAttente: documents.filter((d) => d.statut === "ENVOYE" && d.type === "FACTURE").length,
    totalFacture: documents
      .filter((d) => d.type === "FACTURE" && d.statut !== "ANNULE")
      .reduce((sum, d) => sum + d.montantTTC, 0),
  };

  const toggleSort = (field: "date" | "montant" | "reference") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatutFilter("ALL");
  };

  const hasActiveFilters = search !== "" || statutFilter !== "ALL";

  const handleReplace = async () => {
    if (!selectedFacture) return;

    try {
      setReplacing(true);
      const res = await fetch(`/api/documents/${selectedFacture.id}/remplacer`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erreur");
      }

      const data = await res.json();
      
      // Afficher un message de succès
      alert(data.message);
      
      // Recharger les documents
      await fetchDocuments();
      
      // Fermer la modal
      setShowReplaceModal(false);
      setSelectedFacture(null);
      
      // Rediriger vers la collaboration pour voir la nouvelle facture
      if (selectedFacture.collaboration?.id) {
        window.location.href = `/collaborations/${selectedFacture.collaboration.id}`;
      }
    } catch (error: any) {
      console.error("Erreur remplacement:", error);
      alert(error.message || "Erreur lors du remplacement de la facture");
    } finally {
      setReplacing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-glowup-licorice">Documents</h1>
        <p className="text-gray-500 mt-1">Gérez vos devis, factures et avoirs</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Devis</span>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{stats.devis}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm text-gray-500">Factures</span>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{stats.factures}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <FileMinus className="w-5 h-5 text-orange-600" />
            </div>
            <span className="text-sm text-gray-500">Avoirs</span>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{stats.avoirs}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Total facturé</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatMoney(stats.totalFacture)}</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("DEVIS")}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === "DEVIS"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FileText className="w-5 h-5" />
            Devis
          </button>
          <button
            onClick={() => setActiveTab("FACTURE")}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === "FACTURE"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Receipt className="w-5 h-5" />
            Factures
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par référence, client, talent..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
            />
          </div>

          {/* Statut Filter */}
          <div className="relative">
            <select
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
              className="appearance-none pl-4 pr-10 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose bg-white cursor-pointer min-w-[140px]"
            >
              <option value="ALL">Tous statuts</option>
              <option value="BROUILLON">Brouillon</option>
              <option value="ENVOYE">Facturé</option>
              <option value="PAYE">Payé</option>
              <option value="ANNULE">Annulé</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {sortedDocs.length} document{sortedDocs.length > 1 ? "s" : ""}
          {hasActiveFilters && " (filtré)"}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {sortedDocs.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Aucun document trouvé</p>
            <p className="text-sm text-gray-400 mt-1">
              {hasActiveFilters ? "Essayez de modifier vos filtres" : "Les documents apparaîtront ici"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={() => toggleSort("reference")}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
                  >
                    Référence
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Client / Talent
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={() => toggleSort("date")}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
                  >
                    Date
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-6 py-4 text-right">
                  <button
                    onClick={() => toggleSort("montant")}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 ml-auto"
                  >
                    Montant
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedDocs.map((doc) => {
                const typeConfig = TYPE_CONFIG[doc.type];
                const statutConfig = STATUT_CONFIG[doc.statut] || STATUT_CONFIG.BROUILLON;
                const isAnnule = doc.statut === "ANNULE";
                const TypeIcon = typeConfig.icon;

                return (
                  <tr
                    key={doc.id}
                    className={`hover:bg-gray-50/50 transition-colors ${isAnnule ? "opacity-50" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <span className={`font-mono font-medium ${isAnnule ? "line-through text-gray-400" : "text-glowup-licorice"}`}>
                        {doc.reference}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${typeConfig.color}`}>
                        <TypeIcon className="w-3.5 h-3.5" />
                        {typeConfig.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {doc.collaboration ? (
                        <div>
                          <Link
                            href={`/marques/${doc.collaboration.marque.id}`}
                            className="text-sm font-medium text-glowup-licorice hover:text-glowup-rose transition-colors"
                          >
                            {doc.collaboration.marque.nom}
                          </Link>
                          <Link
                            href={`/talents/${doc.collaboration.talent.id}`}
                            className="block text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {doc.collaboration.talent.prenom} {doc.collaboration.talent.nom}
                          </Link>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${statutConfig.color}`}>
                        {statutConfig.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{formatDate(doc.createdAt)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-semibold ${doc.type === "AVOIR" ? "text-orange-600" : "text-glowup-licorice"}`}>
                        {doc.type === "AVOIR" ? "-" : ""}{formatMoney(doc.montantTTC)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {doc.collaboration && (
                          <Link
                            href={`/collaborations/${doc.collaboration.id}`}
                            className="p-2 text-gray-400 hover:text-glowup-licorice hover:bg-gray-100 rounded-lg transition-all"
                            title="Voir la collaboration"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        )}
                        <a
                          href={`/api/documents/${doc.id}/pdf`}
                          target="_blank"
                          className="p-2 text-gray-400 hover:text-glowup-rose hover:bg-glowup-lace rounded-lg transition-all"
                          title="Télécharger le PDF"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {/* Bouton Remplacer (uniquement pour les factures non annulées) */}
                        {doc.type === "FACTURE" && doc.statut !== "ANNULE" && (
                          <button
                            onClick={() => {
                              setSelectedFacture(doc);
                              setShowReplaceModal(true);
                            }}
                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                            title="Remplacer cette facture"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Remplacement */}
      {showReplaceModal && selectedFacture && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                <RefreshCw className="w-7 h-7 text-orange-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-glowup-licorice">
                  Remplacer la facture
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedFacture.reference}
                </p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6">
              <p className="text-sm text-orange-900 leading-relaxed">
                <strong>Cette action va :</strong>
              </p>
              <ul className="mt-3 space-y-2 text-sm text-orange-800">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Créer un avoir <strong>total</strong> qui annule cette facture</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Marquer la facture actuelle comme <strong>annulée</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Créer automatiquement une <strong>nouvelle facture</strong> (en brouillon)</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">Client</span>
                <span className="text-sm font-medium text-glowup-licorice">
                  {selectedFacture.collaboration?.marque.nom}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">Talent</span>
                <span className="text-sm font-medium text-glowup-licorice">
                  {selectedFacture.collaboration?.talent.prenom} {selectedFacture.collaboration?.talent.nom}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Montant TTC</span>
                <span className="text-sm font-bold text-glowup-licorice">
                  {formatMoney(selectedFacture.montantTTC)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReplaceModal(false);
                  setSelectedFacture(null);
                }}
                disabled={replacing}
                className="flex-1 px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleReplace}
                disabled={replacing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-all disabled:opacity-50"
              >
                {replacing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Remplacement...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Remplacer la facture
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
