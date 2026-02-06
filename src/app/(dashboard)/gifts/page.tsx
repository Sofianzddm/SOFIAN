"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Gift, Plus, Loader2, AlertTriangle, Package, Clock,
  CheckCircle, XCircle, Filter, Search, ChevronRight, Truck,
  User, Calendar, TrendingUp, Building2, MessageSquare,
} from "lucide-react";

export default function GiftsPage() {
  const { data: session } = useSession();
  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState("TOUS");
  const [searchTerm, setSearchTerm] = useState("");

  const user = session?.user as { role?: string };
  const isTM = user?.role === "TM";
  const isAM = user?.role === "CM" || user?.role === "ADMIN";

  useEffect(() => {
    fetchDemandes();
  }, [filtreStatut]);

  const fetchDemandes = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filtreStatut !== "TOUS") {
        params.append("statut", filtreStatut);
      }
      const res = await fetch(`/api/gifts?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setDemandes(data);
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement des demandes");
    } finally {
      setLoading(false);
    }
  };

  const demandesFiltrees = demandes.filter((d) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      d.reference.toLowerCase().includes(searchLower) ||
      `${d.talent.prenom} ${d.talent.nom}`.toLowerCase().includes(searchLower) ||
      d.description.toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const stats = {
    total: demandes.length,
    enAttente: demandes.filter((d) => d.statut === "EN_ATTENTE").length,
    enCours: demandes.filter((d) => d.statut === "EN_COURS" || d.statut === "ATTENTE_MARQUE").length,
    accepte: demandes.filter((d) => d.statut === "ACCEPTE" || d.statut === "ENVOYE").length,
    termine: demandes.filter((d) => d.statut === "RECU").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-glowup-licorice via-gray-900 to-glowup-licorice rounded-2xl p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-purple-500/20 rounded-xl backdrop-blur-sm">
                <Gift className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-extrabold">Demandes de Gifts</h1>
            </div>
            <p className="text-white/70 mt-2 max-w-2xl">
              {isTM
                ? "Demandez des produits ou services pour vos talents. L'Account Manager prendra en charge votre demande."
                : "Gérez toutes les demandes de gifts des Talent Managers."}
            </p>
          </div>
          {isTM && (
            <Link
              href="/gifts/new"
              className="flex items-center gap-2 px-6 py-3 bg-white text-glowup-licorice rounded-xl font-semibold hover:bg-white/90 transition-all hover:scale-105 shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Nouvelle demande
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={<Package className="w-5 h-5" />}
          gradient="from-gray-500 to-gray-600"
        />
        <StatCard
          label="En attente"
          value={stats.enAttente}
          icon={<Clock className="w-5 h-5" />}
          gradient="from-yellow-500 to-orange-500"
        />
        <StatCard
          label="En cours"
          value={stats.enCours}
          icon={<TrendingUp className="w-5 h-5" />}
          gradient="from-blue-500 to-indigo-600"
        />
        <StatCard
          label="Accepté"
          value={stats.accepte}
          icon={<CheckCircle className="w-5 h-5" />}
          gradient="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Reçu"
          value={stats.termine}
          icon={<Truck className="w-5 h-5" />}
          gradient="from-purple-500 to-pink-600"
        />
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Recherche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, talent ou description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose transition-all"
            />
          </div>

          {/* Filtre statut */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose transition-all"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="EN_ATTENTE">En attente</option>
              <option value="EN_COURS">En cours</option>
              <option value="ATTENTE_MARQUE">Attente marque</option>
              <option value="ACCEPTE">Accepté</option>
              <option value="REFUSE">Refusé</option>
              <option value="ENVOYE">Envoyé</option>
              <option value="RECU">Reçu</option>
              <option value="ANNULE">Annulé</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des demandes */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      ) : demandesFiltrees.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
            <Gift className="w-10 h-10 text-purple-500" />
          </div>
          <h3 className="text-xl font-bold text-glowup-licorice mb-2">
            {searchTerm ? "Aucun résultat" : "Aucune demande"}
          </h3>
          <p className="text-gray-500 mb-6">
            {searchTerm
              ? "Essayez de modifier vos critères de recherche"
              : isTM
              ? "Créez votre première demande de gift pour vos talents"
              : "Aucune demande de gift n'a été créée pour le moment"}
          </p>
          {isTM && !searchTerm && (
            <Link
              href="/gifts/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
            >
              <Plus className="w-5 h-5" />
              Créer ma première demande
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {demandesFiltrees.map((demande) => (
            <DemandeCard key={demande.id} demande={demande} isAM={isAM} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, gradient }: any) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer group`}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
      <div className="relative">
        <div className="p-2 bg-white/20 rounded-lg inline-flex mb-3">
          {icon}
        </div>
        <p className="text-3xl font-extrabold mb-1">{value}</p>
        <p className="text-white/80 text-sm">{label}</p>
      </div>
    </div>
  );
}

function DemandeCard({ demande, isAM }: any) {
  return (
    <Link
      href={`/gifts/${demande.id}`}
      className="group block bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-purple-300 hover:shadow-lg transition-all p-6"
    >
      <div className="flex items-start gap-6">
        {/* Badge priorité + statut */}
        <div className="flex flex-col items-center gap-2">
          <PrioriteBadge priorite={demande.priorite} />
          <StatutBadge statut={demande.statut} />
        </div>

        {/* Contenu principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-bold text-glowup-licorice group-hover:text-purple-600 transition-colors">
                  {demande.reference}
                </h3>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold uppercase">
                  {demande.typeGift}
                </span>
              </div>
              <p className="text-gray-600 line-clamp-2">{demande.description}</p>
            </div>
          </div>

          {/* Infos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
            {/* Talent */}
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Talent</p>
                <p className="font-semibold text-sm truncate">
                  {demande.talent.prenom} {demande.talent.nom}
                </p>
              </div>
            </div>

            {/* TM */}
            {isAM && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">TM</p>
                  <p className="font-semibold text-sm truncate">
                    {demande.tm.prenom} {demande.tm.nom}
                  </p>
                </div>
              </div>
            )}

            {/* Marque */}
            {demande.marque && (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Marque</p>
                  <p className="font-semibold text-sm truncate">{demande.marque.nom}</p>
                </div>
              </div>
            )}

            {/* Date */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Créée le</p>
                <p className="font-semibold text-sm">
                  {new Date(demande.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
          </div>

          {/* Dernier commentaire */}
          {demande.commentaires && demande.commentaires.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-1">
                    {demande.commentaires[0].auteur.prenom} {demande.commentaires[0].auteur.nom} •{" "}
                    {new Date(demande.commentaires[0].createdAt).toLocaleDateString("fr-FR")}
                  </p>
                  <p className="text-sm text-gray-600 line-clamp-1">
                    {demande.commentaires[0].contenu}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Flèche */}
        <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}

function PrioriteBadge({ priorite }: { priorite: string }) {
  const config: Record<string, { label: string; color: string }> = {
    BASSE: { label: "Basse", color: "bg-gray-100 text-gray-600" },
    NORMALE: { label: "Normale", color: "bg-blue-100 text-blue-600" },
    HAUTE: { label: "Haute", color: "bg-orange-100 text-orange-600" },
    URGENTE: { label: "Urgente", color: "bg-red-100 text-red-600" },
  };
  const c = config[priorite] || config.NORMALE;
  return (
    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${c.color}`}>
      {c.label}
    </span>
  );
}

function StatutBadge({ statut }: { statut: string }) {
  const config: Record<string, { label: string; color: string; icon: any }> = {
    BROUILLON: { label: "Brouillon", color: "bg-gray-100 text-gray-600", icon: Clock },
    EN_ATTENTE: { label: "En attente", color: "bg-yellow-100 text-yellow-700", icon: Clock },
    EN_COURS: { label: "En cours", color: "bg-blue-100 text-blue-700", icon: TrendingUp },
    ATTENTE_MARQUE: { label: "Attente marque", color: "bg-purple-100 text-purple-700", icon: Building2 },
    ACCEPTE: { label: "Accepté", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
    REFUSE: { label: "Refusé", color: "bg-red-100 text-red-700", icon: XCircle },
    ENVOYE: { label: "Envoyé", color: "bg-indigo-100 text-indigo-700", icon: Truck },
    RECU: { label: "Reçu", color: "bg-green-100 text-green-700", icon: Package },
    ANNULE: { label: "Annulé", color: "bg-gray-100 text-gray-600", icon: XCircle },
  };
  const c = config[statut] || config.EN_ATTENTE;
  const Icon = c.icon;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${c.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
    </div>
  );
}
