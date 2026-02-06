"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Handshake, Loader2, AlertTriangle, Users, Building2,
  TrendingUp, CheckCircle, Clock, Euro, Gift, ChevronRight,
  Filter, Search, Calendar, Package,
} from "lucide-react";

export default function AccountManagerDashboard() {
  const { data: session } = useSession();
  const [collaborations, setCollaborations] = useState<any[]>([]);
  const [demandesGift, setDemandesGift] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState("TOUS");
  const [searchTerm, setSearchTerm] = useState("");

  const user = session?.user as { id?: string; role?: string };
  const isAM = user?.role === "CM" || user?.role === "ADMIN";

  useEffect(() => {
    if (isAM) {
      fetchData();
    }
  }, [isAM]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Récupérer les collaborations assignées
      const collabsRes = await fetch("/api/collaborations?accountManagerId=" + user?.id);
      if (collabsRes.ok) {
        const collabsData = await collabsRes.json();
        setCollaborations(collabsData);
      }

      // Récupérer les demandes de gifts
      const giftsRes = await fetch("/api/gifts");
      if (giftsRes.ok) {
        const giftsData = await giftsRes.json();
        setDemandesGift(giftsData);
      }
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  if (!isAM) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertTriangle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-glowup-licorice mb-2">
          Accès réservé aux Account Managers
        </h2>
        <p className="text-gray-600">
          Cette page est accessible uniquement aux utilisateurs avec le rôle CM (Account Manager).
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const collabsFiltrees = collaborations.filter((c) => {
    if (filtreStatut !== "TOUS" && c.statut !== filtreStatut) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      c.reference.toLowerCase().includes(searchLower) ||
      `${c.talent?.prenom} ${c.talent?.nom}`.toLowerCase().includes(searchLower) ||
      c.marque?.nom.toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const stats = {
    totalCollabs: collaborations.length,
    enCours: collaborations.filter((c) => c.statut === "EN_COURS").length,
    publie: collaborations.filter((c) => c.statut === "PUBLIE").length,
    totalGifts: demandesGift.length,
    giftsEnCours: demandesGift.filter((g) => g.statut === "EN_COURS" || g.statut === "ATTENTE_MARQUE").length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold">Dashboard Account Manager</h1>
              <p className="text-white/80 mt-1">
                Gérez vos collaborations assignées et les demandes de gifts
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Mes collaborations"
          value={stats.totalCollabs}
          icon={<Handshake className="w-5 h-5" />}
          gradient="from-blue-500 to-indigo-600"
        />
        <StatCard
          label="En cours"
          value={stats.enCours}
          icon={<TrendingUp className="w-5 h-5" />}
          gradient="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Publiées"
          value={stats.publie}
          icon={<CheckCircle className="w-5 h-5" />}
          gradient="from-purple-500 to-pink-600"
        />
        <StatCard
          label="Demandes gifts"
          value={stats.totalGifts}
          icon={<Gift className="w-5 h-5" />}
          gradient="from-orange-500 to-red-500"
        />
        <StatCard
          label="Gifts en cours"
          value={stats.giftsEnCours}
          icon={<Package className="w-5 h-5" />}
          gradient="from-amber-400 to-orange-500"
        />
      </div>

      {/* Navigation rapide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/gifts"
          className="group relative overflow-hidden bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white hover:shadow-2xl transition-all"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Gift className="w-8 h-8" />
                <h3 className="text-2xl font-bold">Gérer les Gifts</h3>
              </div>
              <p className="text-white/80">
                {stats.totalGifts} demande(s) de gifts à gérer
              </p>
            </div>
            <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
          </div>
        </Link>

        <Link
          href="/collaborations"
          className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-6 text-white hover:shadow-2xl transition-all"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Handshake className="w-8 h-8" />
                <h3 className="text-2xl font-bold">Toutes les Collaborations</h3>
              </div>
              <p className="text-white/80">
                Voir toutes les collaborations de l'agence
              </p>
            </div>
            <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Mes collaborations assignées */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-glowup-licorice flex items-center gap-3">
              <Handshake className="w-6 h-6 text-purple-600" />
              Mes collaborations assignées
            </h2>
            <p className="text-gray-500 mt-1">
              Collaborations dont vous assurez le suivi
            </p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, talent ou marque..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="GAGNE">Gagné</option>
              <option value="EN_COURS">En cours</option>
              <option value="PUBLIE">Publié</option>
              <option value="FACTURE_RECUE">Facture reçue</option>
              <option value="PAYE">Payé</option>
            </select>
          </div>
        </div>

        {/* Liste */}
        {collabsFiltrees.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-purple-50 flex items-center justify-center">
              <Handshake className="w-10 h-10 text-purple-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {searchTerm || filtreStatut !== "TOUS"
                ? "Aucune collaboration trouvée"
                : "Aucune collaboration assignée"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Les HEAD_OF_SALES peuvent vous assigner des collaborations
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {collabsFiltrees.map((collab) => (
              <CollabCard key={collab.id} collab={collab} />
            ))}
          </div>
        )}
      </div>
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

function CollabCard({ collab }: any) {
  return (
    <Link
      href={`/collaborations/${collab.id}`}
      className="group block bg-gray-50 hover:bg-purple-50 rounded-2xl border-2 border-gray-100 hover:border-purple-300 transition-all p-5"
    >
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-bold text-glowup-licorice text-lg group-hover:text-purple-600 transition-colors">
              {collab.reference}
            </span>
            <StatutBadge statut={collab.statut} />
            {collab.dateAssignationAM && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Assignée le {new Date(collab.dateAssignationAM).toLocaleDateString("fr-FR")}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">
                {collab.talent?.prenom} {collab.talent?.nom}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{collab.marque?.nom}</span>
            </div>
            <div className="flex items-center gap-2">
              <Euro className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-emerald-600">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(collab.montantBrut)}
              </span>
            </div>
          </div>
        </div>

        <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}

function StatutBadge({ statut }: { statut: string }) {
  const config: Record<string, { label: string; color: string }> = {
    NEGO: { label: "Négo", color: "bg-yellow-100 text-yellow-700" },
    PERDU: { label: "Perdu", color: "bg-red-100 text-red-700" },
    GAGNE: { label: "Gagné", color: "bg-emerald-100 text-emerald-700" },
    EN_COURS: { label: "En cours", color: "bg-blue-100 text-blue-700" },
    PUBLIE: { label: "Publié", color: "bg-purple-100 text-purple-700" },
    FACTURE_RECUE: { label: "Facture reçue", color: "bg-orange-100 text-orange-700" },
    PAYE: { label: "Payé", color: "bg-green-100 text-green-700" },
  };
  const c = config[statut] || { label: statut, color: "bg-gray-100 text-gray-600" };
  return (
    <span className={`px-3 py-1 rounded-xl text-xs font-bold ${c.color}`}>
      {c.label}
    </span>
  );
}
