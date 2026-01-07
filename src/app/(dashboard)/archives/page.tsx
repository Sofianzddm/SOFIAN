"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  FolderOpen,
  FileText,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  User,
  Calendar,
  Euro,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Filter,
  Loader2,
} from "lucide-react";

interface TalentDossier {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  totalCA: number;
  nombreCollabs: number;
  mois: {
    mois: string; // "Janvier 2026"
    marques: {
      id: string;
      nom: string;
      collaborationId: string;
      montantTTC: number;
      statut: string;
      documents: {
        id: string;
        numero: string;
        type: string;
        statut: string;
        totalTTC: number;
        dateDocument: string;
      }[];
    }[];
  }[];
}

export default function ArchivesPage() {
  const { data: session } = useSession();
  const [talents, setTalents] = useState<TalentDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedTalents, setExpandedTalents] = useState<Set<string>>(new Set());
  const [expandedMois, setExpandedMois] = useState<Set<string>>(new Set());
  const [filterStatut, setFilterStatut] = useState<string>("all");

  const user = session?.user as { role: string } | undefined;

  // Vérifier les permissions (ADMIN uniquement)
  if (user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Accès réservé aux administrateurs</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetchDossiers();
  }, []);

  const fetchDossiers = async () => {
    try {
      const res = await fetch("/api/documents/archives");
      if (res.ok) {
        const data = await res.json();
        setTalents(data.talents);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTalent = (id: string) => {
    const newExpanded = new Set(expandedTalents);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTalents(newExpanded);
  };

  const toggleMois = (key: string) => {
    const newExpanded = new Set(expandedMois);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMois(newExpanded);
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case "PAYE":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Payée
          </span>
        );
      case "ENVOYE":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            <Clock className="w-3 h-3" />
            Envoyée
          </span>
        );
      case "BROUILLON":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            <FileText className="w-3 h-3" />
            Brouillon
          </span>
        );
      case "ANNULE":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <AlertCircle className="w-3 h-3" />
            Annulée
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
            {statut}
          </span>
        );
    }
  };

  const formatMontant = (montant: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(montant);
  };

  const filteredTalents = talents.filter((talent) => {
    const matchSearch =
      `${talent.prenom} ${talent.nom}`.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice flex items-center gap-3">
            <FolderOpen className="w-7 h-7 text-glowup-rose" />
            Archives & Dossiers
          </h1>
          <p className="text-gray-500 mt-1">
            {talents.length} talents · Tous les documents classés
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white rounded-xl hover:bg-glowup-licorice/90 transition-colors">
            <Download className="w-4 h-4" />
            Export comptable
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un talent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose"
          />
        </div>
        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose"
        >
          <option value="all">Tous les statuts</option>
          <option value="PAYE">Payées</option>
          <option value="ENVOYE">En attente</option>
          <option value="BROUILLON">Brouillons</option>
        </select>
      </div>

      {/* Dossiers Talents */}
      <div className="space-y-4">
        {filteredTalents.map((talent) => (
          <div
            key={talent.id}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            {/* Talent Header */}
            <button
              onClick={() => toggleTalent(talent.id)}
              className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-glowup-rose/20 to-pink-100 flex items-center justify-center">
                  {talent.photo ? (
                    <img
                      src={talent.photo}
                      alt={talent.prenom}
                      className="w-full h-full rounded-xl object-cover"
                    />
                  ) : (
                    <span className="text-lg font-bold text-glowup-rose">
                      {talent.prenom.charAt(0)}
                      {talent.nom.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="text-left">
                  <h2 className="font-bold text-glowup-licorice text-lg">
                    {talent.prenom} {talent.nom}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {talent.nombreCollabs} collaborations
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm text-gray-500">CA Total</p>
                  <p className="text-xl font-bold text-glowup-licorice">
                    {formatMontant(talent.totalCA)}
                  </p>
                </div>
                {expandedTalents.has(talent.id) ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>

            {/* Talent Content - Mois */}
            {expandedTalents.has(talent.id) && (
              <div className="border-t border-gray-100">
                {talent.mois.map((moisData) => {
                  const moisKey = `${talent.id}-${moisData.mois}`;
                  return (
                    <div key={moisKey} className="border-b border-gray-50 last:border-0">
                      {/* Mois Header */}
                      <button
                        onClick={() => toggleMois(moisKey)}
                        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-700">
                            {moisData.mois}
                          </span>
                          <span className="text-sm text-gray-500">
                            ({moisData.marques.length} marques)
                          </span>
                        </div>
                        {expandedMois.has(moisKey) ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {/* Marques */}
                      {expandedMois.has(moisKey) && (
                        <div className="px-5 py-3 space-y-3">
                          {moisData.marques.map((marque) => (
                            <div
                              key={marque.id}
                              className="bg-white rounded-xl border border-gray-200 p-4"
                            >
                              {/* Marque Header */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                    <Building2 className="w-5 h-5 text-gray-500" />
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-glowup-licorice">
                                      {marque.nom}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                      {formatMontant(marque.montantTTC)}
                                    </p>
                                  </div>
                                </div>
                                {getStatutBadge(marque.statut)}
                              </div>

                              {/* Documents */}
                              <div className="space-y-2">
                                {marque.documents.map((doc) => (
                                  <div
                                    key={doc.id}
                                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                                  >
                                    <div className="flex items-center gap-3">
                                      <FileText className="w-4 h-4 text-gray-400" />
                                      <div>
                                        <p className="font-medium text-sm text-gray-700">
                                          {doc.numero}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {doc.type} ·{" "}
                                          {new Date(doc.dateDocument).toLocaleDateString(
                                            "fr-FR"
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-medium text-gray-700">
                                        {formatMontant(doc.totalTTC)}
                                      </span>
                                      {getStatutBadge(doc.statut)}
                                      <a
                                        href={`/api/documents/${doc.id}/pdf`}
                                        target="_blank"
                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                        title="Télécharger le PDF"
                                      >
                                        <Download className="w-4 h-4 text-gray-500" />
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {filteredTalents.length === 0 && (
          <div className="text-center py-12">
            <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucun dossier trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}
