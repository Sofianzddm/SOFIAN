"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
  Eye,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export default function TalentFacturesPage() {
  const [factures, setFactures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMois, setExpandedMois] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFactures();
  }, []);

  async function fetchFactures() {
    try {
      const res = await fetch("/api/talents/me/factures");
      if (res.ok) {
        const data = await res.json();
        setFactures(data);
      } else {
        const error = await res.json();
        console.error("Erreur API:", error);
        alert(`Erreur: ${error.error || "Impossible de charger les factures"}`);
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur de connexion lors du chargement des factures");
    } finally {
      setLoading(false);
    }
  }

  const filteredFactures = factures
    .filter((facture) =>
      facture.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      facture.marque?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = new Date(a.dateEmission || 0).getTime();
      const dateB = new Date(b.dateEmission || 0).getTime();
      return dateB - dateA; // Plus récent en premier
    });

  // Regrouper par mois (année-mois) pour affichage
  const facturesParMois = filteredFactures.reduce<Record<string, typeof filteredFactures>>((acc, f) => {
    const d = new Date(f.dateEmission || f.id);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  const moisLabels: Record<string, string> = {
    "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
    "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
    "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  };

  const moisKeys = Object.keys(facturesParMois).sort((a, b) => b.localeCompare(a));

  // Premier mois déplié par défaut au chargement
  useEffect(() => {
    if (moisKeys.length > 0 && expandedMois.size === 0) {
      setExpandedMois(new Set([moisKeys[0]]));
    }
  }, [moisKeys.join(",")]);

  const toggleMois = (key: string) => {
    setExpandedMois((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isMoisExpanded = (key: string) => expandedMois.has(key);

  const stats = {
    total: factures.length,
    enAttente: factures.filter((f) => f.statut !== "PAYE").length,
    payees: factures.filter((f) => f.statut === "PAYE").length,
    montantTotal: factures.reduce((acc, f) => acc + (f.statut === "PAYE" ? f.montant : 0), 0),
  };

  const getStatusConfig = (statut: string) => {
    const configs: Record<string, { label: string; color: string; icon: any }> = {
      FACTURE_RECUE: {
        label: "En attente",
        color: "bg-amber-100 text-amber-700",
        icon: Clock,
      },
      EN_ATTENTE: {
        label: "En attente facture",
        color: "bg-yellow-100 text-yellow-700",
        icon: Clock,
      },
      PAYE: { label: "Payé", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    };
    return (
      configs[statut] || {
        label: statut,
        color: "bg-gray-100 text-gray-700",
        icon: FileText,
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-glowup-licorice flex items-center gap-3">
          <FileText className="w-8 h-8" />
          Mes Factures
        </h1>
        <p className="text-gray-600 mt-1">Suivi de tes paiements</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-gray-50 rounded-lg">
              <FileText className="w-5 h-5 text-gray-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{stats.total}</p>
          <p className="text-sm text-gray-500">Factures totales</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{stats.enAttente}</p>
          <p className="text-sm text-gray-500">En attente</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{stats.payees}</p>
          <p className="text-sm text-gray-500">Payées</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher une facture, marque..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
          />
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
        </div>
      ) : filteredFactures.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">Aucune facture</p>
          <p className="text-gray-400 text-sm mt-2">
            Tes factures apparaîtront ici une fois que tu les auras envoyées
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {moisKeys.map((key) => {
            const facturesMois = facturesParMois[key];
            const [annee, mois] = key.split("-");
            const label = `${moisLabels[mois] || mois} ${annee}`;
            const expanded = isMoisExpanded(key);
            const totalMois = facturesMois.reduce((s, f) => s + f.montant, 0);
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleMois(key)}
                  className="w-full bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {expanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    )}
                    <h3 className="font-semibold text-gray-800">{label}</h3>
                    <span className="text-sm text-gray-500">
                      {facturesMois.length} facture{facturesMois.length > 1 ? "s" : ""} · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(totalMois)}
                    </span>
                  </div>
                </button>
                {expanded && (
                <table className="w-full">
                    <thead className="bg-gray-50/70 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Référence</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Marque</th>
                        <th className="text-center px-6 py-3 text-sm font-semibold text-gray-700">Date</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-gray-700">Montant</th>
                        <th className="text-center px-6 py-3 text-sm font-semibold text-gray-700">Statut</th>
                        <th className="text-center px-6 py-3 text-sm font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {facturesMois.map((facture) => {
                        const status = getStatusConfig(facture.statut);
                        const StatusIcon = status.icon;
                        return (
                          <tr key={facture.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-medium text-gray-900">{facture.reference}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-gray-700">{facture.marque}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                                <Calendar className="w-4 h-4" />
                                {facture.dateEmission
                                  ? new Date(facture.dateEmission).toLocaleDateString("fr-FR")
                                  : "-"}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-lg font-bold text-emerald-600">
                                {new Intl.NumberFormat("fr-FR", {
                                  style: "currency",
                                  currency: "EUR",
                                }).format(facture.montant)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${status.color}`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {status.label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2">
                                {facture.pdfUrl ? (
                                  <>
                                    <a
                                      href={facture.pdfUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Voir"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </a>
                                    <a
                                      href={facture.pdfUrl}
                                      download
                                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                      title="Télécharger"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
