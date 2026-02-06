"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Handshake,
  Search,
  Filter,
  Calendar,
  Building2,
  Euro,
  Loader2,
  ExternalLink,
  Clock,
  CheckCircle2,
  Upload,
} from "lucide-react";

export default function TalentCollaborationsPage() {
  const [collaborations, setCollaborations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchCollaborations();
  }, []);

  async function fetchCollaborations() {
    try {
      const res = await fetch("/api/talents/me/collaborations");
      if (res.ok) {
        setCollaborations(await res.json());
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredCollabs = collaborations.filter((collab) => {
    const matchSearch =
      collab.marque?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collab.reference?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus = statusFilter === "all" || collab.statut === statusFilter;

    return matchSearch && matchStatus;
  });

  const getStatusConfig = (statut: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      EN_COURS: { label: "En cours", color: "bg-blue-100 text-blue-700" },
      PUBLIE: { label: "Publié", color: "bg-purple-100 text-purple-700" },
      FACTURE_RECUE: { label: "Facture reçue", color: "bg-amber-100 text-amber-700" },
      PAYE: { label: "Payé ✓", color: "bg-green-100 text-green-700" },
      NEGO: { label: "Négociation", color: "bg-yellow-100 text-yellow-700" },
    };
    return configs[statut] || { label: statut, color: "bg-gray-100 text-gray-700" };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-glowup-licorice flex items-center gap-3">
          <Handshake className="w-8 h-8" />
          Mes Collaborations
        </h1>
        <p className="text-gray-600 mt-1">
          {filteredCollabs.length} collaboration{filteredCollabs.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher une marque, référence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
        >
          <option value="all">Tous les statuts</option>
          <option value="EN_COURS">En cours</option>
          <option value="PUBLIE">Publié</option>
          <option value="FACTURE_RECUE">Facture reçue</option>
          <option value="PAYE">Payé</option>
        </select>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
        </div>
      ) : filteredCollabs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Handshake className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">Aucune collaboration trouvée</p>
          <p className="text-gray-400 text-sm mt-2">
            Les collaborations apparaîtront ici une fois créées par ton Talent Manager
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCollabs.map((collab) => {
            const status = getStatusConfig(collab.statut);
            const needsInvoice = collab.statut === "PUBLIE";

            return (
              <div
                key={collab.id}
                className={`bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-all ${
                  needsInvoice
                    ? "border-amber-300 bg-amber-50/20"
                    : "border-gray-200 hover:border-glowup-rose"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-glowup-licorice">{collab.marque}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm">{collab.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-600">
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      }).format(collab.montant)}
                    </p>
                    <p className="text-xs text-gray-500">Montant net</p>
                  </div>
                </div>

                {/* Infos */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4 border-t border-b border-gray-200 mb-4">
                  {collab.datePublication && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(collab.datePublication).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building2 className="w-4 h-4" />
                    <span>{collab.livrables || 0} livrable(s)</span>
                  </div>
                  {collab.lienPublication && (
                    <a
                      href={collab.lienPublication}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-glowup-rose hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Voir la publication</span>
                    </a>
                  )}
                </div>

                {/* Actions */}
                {needsInvoice && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Upload className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-900 mb-1">
                          ⚠️ Action requise : Envoyer ta facture
                        </p>
                        <p className="text-xs text-amber-700 mb-3">
                          La collaboration est publiée. Tu dois maintenant envoyer ta facture pour
                          être payé.
                        </p>
                        <button className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors">
                          Envoyer ma facture
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
