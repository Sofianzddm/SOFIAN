"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Users, Building2, Handshake, FileText, Loader2, Euro,
  AlertTriangle, CheckCircle, Clock, Target, Zap, ChevronRight,
  Plus, Sparkles, RefreshCw, Instagram, TrendingUp, Calendar,
  ArrowUpRight, MoreHorizontal, Play, Camera, Video, TrendingDown,
  Activity, BarChart3, PieChart, DollarSign, Percent, Award,
} from "lucide-react";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setError(null);
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        throw new Error("Erreur lors du chargement");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Erreur:", err);
      setError("Erreur de chargement du dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-glowup-rose to-pink-400 animate-pulse" />
            <Loader2 className="w-8 h-8 animate-spin text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-gray-500 animate-pulse">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-orange-500" />
        </div>
        <p className="text-gray-600 font-medium">{error || "Erreur de chargement"}</p>
        <button 
          onClick={fetchDashboard}
          className="flex items-center gap-2 px-5 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose/90 transition-all hover:scale-105"
        >
          <RefreshCw className="w-4 h-4" />
          Réessayer
        </button>
      </div>
    );
  }

  const role = data.role;

  return (
    <div className="space-y-6 pb-8">
      {/* Welcome Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-glowup-licorice via-gray-900 to-glowup-licorice rounded-2xl p-6 text-white">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-glowup-rose/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm font-medium mb-1">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl font-bold">
              Bonjour, {session?.user?.name?.split(" ")[0]} ✨
            </h1>
            <p className="text-white/70 mt-1">{getWelcomeMessage(role)}</p>
          </div>
          {(role === "ADMIN" || role === "TM") && (
            <Link
              href="/collaborations/new"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-glowup-licorice rounded-xl font-semibold hover:bg-white/90 transition-all hover:scale-105 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              Nouvelle collab
            </Link>
          )}
        </div>
      </div>

      {/* Dashboard par rôle */}
      {role === "ADMIN" && <AdminDashboard data={data} />}
      {role === "HEAD_OF" && <HeadOfDashboard data={data} />}
      {role === "TM" && <TMDashboard data={data} />}
    </div>
  );
}

// ============================================
// ADMIN DASHBOARD - ULTRA MODERNE 2.0 ✨
// ============================================
function AdminDashboard({ data }: { data: any }) {
  const { stats, pipeline, topTalents, topMarques, tmPerformance, facturesRelance, negociationsSansReponse = [] } = data;

  // Calculer les tendances (simulé - à remplacer par vraies données)
  const trends = {
    caMois: 12.5,
    collabsNego: -5,
    collabsEnCours: 8,
    collabsPublie: 3,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ALERTE: Négos > 5j sans réponse client */}
      {negociationsSansReponse.length > 0 && (
        <Link
          href="/negociations"
          className="block rounded-xl border-2 border-amber-200 bg-amber-50 p-4 ring-1 ring-amber-200/60 hover:bg-amber-100/80 transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-amber-900">
                {negociationsSansReponse.length} négociation{negociationsSansReponse.length > 1 ? "s" : ""} sans réponse client depuis 5+ jours
              </h3>
              <p className="mt-1 text-sm text-amber-800">À relancer auprès des marques</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {negociationsSansReponse.slice(0, 4).map((n: any) => (
                  <span key={n.id} className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800">
                    {n.talent} × {n.marque}
                    <span className="text-amber-600">({n.joursSansReponse}j)</span>
                    {n.tm && <span className="text-amber-500">· {n.tm}</span>}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-amber-600" />
          </div>
        </Link>
      )}

      {/* Hero Stats Cards - Style glassmorphism moderne avec animations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* CA du mois */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-xl shadow-emerald-200 hover:shadow-2xl hover:shadow-emerald-300 transition-all duration-500 hover:scale-105 cursor-pointer">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                <Euro className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-lg text-xs font-semibold">
                {trends.caMois > 0 ? (
                  <>
                    <TrendingUp className="w-3.5 h-3.5" />
                    +{trends.caMois}%
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3.5 h-3.5" />
                    {trends.caMois}%
                  </>
                )}
              </div>
            </div>
            <p className="text-4xl font-extrabold mb-2 group-hover:scale-105 transition-transform">{formatMoney(stats.caMois)}</p>
            <p className="text-white/90 text-sm font-medium mb-1">CA du mois</p>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/20">
              <DollarSign className="w-4 h-4 text-white/70" />
              <p className="text-white/70 text-xs">Commission: {formatMoney(stats.commissionMois)}</p>
            </div>
          </div>
        </div>

        {/* Négociations */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-2xl p-6 text-white shadow-xl shadow-orange-200 hover:shadow-2xl hover:shadow-orange-300 transition-all duration-500 hover:scale-105 cursor-pointer">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                <Target className="w-6 h-6" />
              </div>
              {trends.collabsNego !== 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-lg text-xs font-semibold">
                  {trends.collabsNego > 0 ? (
                    <>
                      <TrendingUp className="w-3.5 h-3.5" />
                      +{trends.collabsNego}%
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3.5 h-3.5" />
                      {trends.collabsNego}%
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-4xl font-extrabold mb-2 group-hover:scale-105 transition-transform">{stats.collabsNego}</p>
            <p className="text-white/90 text-sm font-medium mb-1">Négociations actives</p>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/20">
              <Activity className="w-4 h-4 text-white/70" />
              <p className="text-white/70 text-xs">En attente de validation</p>
            </div>
          </div>
        </div>

        {/* En cours */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-200 hover:shadow-2xl hover:shadow-blue-300 transition-all duration-500 hover:scale-105 cursor-pointer">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              {trends.collabsEnCours > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-lg text-xs font-semibold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +{trends.collabsEnCours}%
                </div>
              )}
            </div>
            <p className="text-4xl font-extrabold mb-2 group-hover:scale-105 transition-transform">{stats.collabsEnCours}</p>
            <p className="text-white/90 text-sm font-medium mb-1">Collaborations en cours</p>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/20">
              <Activity className="w-4 h-4 text-white/70" />
              <p className="text-white/70 text-xs">Production en cours</p>
            </div>
          </div>
        </div>

        {/* À facturer */}
        <div className={`group relative overflow-hidden rounded-2xl p-6 text-white shadow-xl transition-all duration-500 hover:scale-105 cursor-pointer ${
          stats.collabsPublie > 0 
            ? "bg-gradient-to-br from-glowup-rose via-pink-500 to-pink-600 shadow-pink-200 hover:shadow-2xl hover:shadow-pink-300" 
            : "bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600 shadow-gray-200 hover:shadow-2xl hover:shadow-gray-300"
        }`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              {stats.collabsPublie > 0 && (
                <span className="relative flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
                </span>
              )}
            </div>
            <p className="text-4xl font-extrabold mb-2 group-hover:scale-105 transition-transform">{stats.collabsPublie}</p>
            <p className="text-white/90 text-sm font-medium mb-1">Publiées - À facturer</p>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/20">
              <FileText className="w-4 h-4 text-white/70" />
              <p className="text-white/70 text-xs">
                {stats.collabsPublie > 0 ? "Action requise" : "Tout est à jour"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Performance annuelle + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance annuelle - Prend 2 colonnes */}
        <div className="lg:col-span-2 relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-glowup-rose/10 to-pink-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-glowup-licorice">Performance annuelle 2026</h2>
                </div>
                <p className="text-sm text-gray-500">Chiffre d'affaires depuis janvier</p>
              </div>
              <Link 
                href="/finance" 
                className="flex items-center gap-1 text-sm text-glowup-rose hover:text-glowup-rose-dark font-medium transition-colors"
              >
                Détails
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-extrabold text-glowup-licorice">{formatMoney(stats.caAnnee)}</span>
                <span className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold">
                  <TrendingUp className="w-4 h-4" />
                  +18.5%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2">vs année précédente</p>
            </div>
            
            {/* Grille de stats */}
            <div className="grid grid-cols-3 gap-6">
              <div className="group/stat bg-gradient-to-br from-glowup-rose/5 to-pink-50 rounded-2xl p-5 border border-glowup-rose/10 hover:border-glowup-rose/30 transition-all hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-glowup-rose" />
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Talents</p>
                </div>
                <p className="text-3xl font-extrabold text-glowup-licorice group-hover/stat:scale-110 transition-transform">{stats.totalTalents}</p>
                <p className="text-xs text-gray-500 mt-1">Actifs cette année</p>
              </div>
              
              <div className="group/stat bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100 hover:border-blue-300 transition-all hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Marques</p>
                </div>
                <p className="text-3xl font-extrabold text-glowup-licorice group-hover/stat:scale-110 transition-transform">{stats.totalMarques}</p>
                <p className="text-xs text-gray-500 mt-1">Partenaires actifs</p>
              </div>
              
              <div className="group/stat bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-5 border border-orange-100 hover:border-orange-300 transition-all hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">En attente</p>
                </div>
                <p className="text-3xl font-extrabold text-orange-600 group-hover/stat:scale-110 transition-transform">{stats.facturesEnAttente}</p>
                <p className="text-xs text-gray-500 mt-1">Paiements à recevoir</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Pipeline */}
        <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
              <PieChart className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-glowup-licorice">Pipeline</h2>
          </div>
          
          <div className="space-y-2.5">
            {pipeline?.map((p: any) => <PipelineRow key={p.statut} statut={p.statut} count={p.count} />)}
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-100">
            <Link 
              href="/collaborations" 
              className="flex items-center justify-between w-full px-4 py-3 bg-gradient-to-r from-glowup-rose/5 to-pink-50 hover:from-glowup-rose/10 hover:to-pink-100 rounded-xl transition-colors group"
            >
              <span className="text-sm font-semibold text-glowup-licorice">Voir toutes les collabs</span>
              <ArrowUpRight className="w-4 h-4 text-glowup-rose group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* Top performers avec design modernisé */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopList title="🏆 Top Talents" subtitle="Les meilleurs performeurs" items={topTalents} href="/talents" icon={<Award className="w-5 h-5" />} />
        <TopList title="⭐ Top Marques" subtitle="Nos meilleurs clients" items={topMarques} href="/marques" icon={<Building2 className="w-5 h-5" />} />
      </div>

      {/* Performance TM - Design modernisé */}
      {tmPerformance && tmPerformance.length > 0 && (
        <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-100/30 to-pink-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-glowup-licorice">Performance Talent Managers</h2>
                  <p className="text-sm text-gray-500">Classement par CA généré</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              {tmPerformance.map((tm: any, index: number) => (
                <div 
                  key={tm.id} 
                  className="group relative bg-gradient-to-r from-gray-50 to-white hover:from-glowup-rose/5 hover:to-pink-50 rounded-2xl p-5 border border-gray-100 hover:border-glowup-rose/30 transition-all hover:shadow-md"
                >
                  {/* Badge de classement */}
                  <div className="absolute -left-2 -top-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold shadow-lg ${
                      index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-white" :
                      index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-white" :
                      index === 2 ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white" :
                      "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600"
                    }`}>
                      #{index + 1}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-6 pl-6">
                    {/* Nom et avatar */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-glowup-rose to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                        {tm.nom.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-glowup-licorice text-lg truncate group-hover:text-glowup-rose transition-colors">{tm.nom}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Users className="w-3.5 h-3.5" />
                            {tm.talents} talents
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Handshake className="w-3.5 h-3.5" />
                            {tm.collabsEnCours} collabs
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Métriques */}
                    <div className="flex items-center gap-6">
                      {/* Taux de conversion */}
                      <div className="text-center">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold ${
                          tm.tauxConversion >= 70 ? "bg-emerald-100 text-emerald-700" : 
                          tm.tauxConversion >= 50 ? "bg-yellow-100 text-yellow-700" : 
                          "bg-red-100 text-red-700"
                        }`}>
                          <Percent className="w-3.5 h-3.5" />
                          {tm.tauxConversion}%
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Taux conversion</p>
                      </div>
                      
                      {/* CA */}
                      <div className="text-right min-w-[120px]">
                        <p className="text-2xl font-extrabold text-emerald-600">{formatMoney(tm.ca)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Chiffre d'affaires</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Factures relance - Design modernisé */}
      {facturesRelance && facturesRelance.length > 0 && (
        <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg border-2 border-orange-200 p-8 hover:shadow-xl transition-shadow">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-red-100/40 to-orange-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl animate-pulse-soft">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-glowup-licorice">⚠️ Factures à relancer</h2>
                <p className="text-sm text-gray-500">{facturesRelance.length} facture(s) en retard de paiement</p>
              </div>
            </div>
            
            <div className="space-y-3">
              {facturesRelance.map((f: any) => {
                const isContentieux = f.statut === "contentieux";
                const isRelance2 = f.statut === "relance2";
                const isRelance1 = !isContentieux && !isRelance2;
                
                return (
                  <Link
                    key={f.id}
                    href={`/documents`}
                    className={`group block p-5 rounded-2xl border-2 transition-all hover:shadow-lg ${
                      isContentieux 
                        ? "bg-gradient-to-r from-red-50 to-red-100/50 border-red-300 hover:border-red-400" 
                        : isRelance2 
                        ? "bg-gradient-to-r from-orange-50 to-orange-100/50 border-orange-300 hover:border-orange-400" 
                        : "bg-gradient-to-r from-yellow-50 to-yellow-100/50 border-yellow-300 hover:border-yellow-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Icône d'urgence */}
                        <div className={`p-3 rounded-xl ${
                          isContentieux ? "bg-red-200" : isRelance2 ? "bg-orange-200" : "bg-yellow-200"
                        }`}>
                          <Clock className={`w-5 h-5 ${
                            isContentieux ? "text-red-700" : isRelance2 ? "text-orange-700" : "text-yellow-700"
                          }`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-glowup-licorice group-hover:text-glowup-rose transition-colors">
                              {f.reference}
                            </p>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase ${
                              isContentieux ? "bg-red-200 text-red-800" : 
                              isRelance2 ? "bg-orange-200 text-orange-800" : 
                              "bg-yellow-200 text-yellow-800"
                            }`}>
                              {isContentieux ? "Contentieux" : isRelance2 ? "Relance 2" : "Relance 1"}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-700">{f.marque}</p>
                          <p className="text-xs text-gray-500">{f.talent}</p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-2xl font-extrabold text-glowup-licorice mb-1">{formatMoney(f.montant)}</p>
                        <div className="flex items-center justify-end gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${
                            isContentieux ? "bg-red-500 animate-pulse" : 
                            isRelance2 ? "bg-orange-500" : 
                            "bg-yellow-500"
                          }`} />
                          <p className={`text-sm font-bold ${
                            isContentieux ? "text-red-600" : isRelance2 ? "text-orange-600" : "text-yellow-600"
                          }`}>
                            {f.jours} jours de retard
                          </p>
                        </div>
                      </div>
                      
                      <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-glowup-rose group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    </div>
                  </Link>
                );
              })}
            </div>
            
            <div className="mt-6 pt-4 border-t border-orange-200">
              <Link 
                href="/factures" 
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-semibold transition-all hover:shadow-lg"
              >
                <FileText className="w-4 h-4" />
                Voir toutes les factures
              </Link>
            </div>
          </div>
        </div>
      )}

      <QuickActions role="ADMIN" />
    </div>
  );
}

// ============================================
// HEAD_OF DASHBOARD - Épuré, négos en premier
// ============================================
function HeadOfDashboard({ data }: { data: any }) {
  const { stats, negociations = [], negociationsSansReponse = [], tmBilans = [] } = data;

  const negoStatutLabel: Record<string, string> = {
    BROUILLON: "Brouillon",
    EN_ATTENTE: "En attente",
    EN_DISCUSSION: "En discussion",
  };

  return (
    <div className="space-y-6">
      {/* ALERTE: Négos > 5j sans réponse client */}
      {negociationsSansReponse.length > 0 && (
        <Link
          href="/negociations"
          className="block rounded-xl border-2 border-amber-200 bg-amber-50 p-4 ring-1 ring-amber-200/60 hover:bg-amber-100/80 transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-amber-900">
                {negociationsSansReponse.length} négociation{negociationsSansReponse.length > 1 ? "s" : ""} sans réponse client depuis 5+ jours
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                À relancer auprès des marques
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {negociationsSansReponse.slice(0, 4).map((n: any) => (
                  <span key={n.id} className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800">
                    {n.talent} × {n.marque}
                    <span className="text-amber-600">({n.joursSansReponse}j)</span>
                  </span>
                ))}
                {negociationsSansReponse.length > 4 && (
                  <span className="text-sm text-amber-600">+{negociationsSansReponse.length - 4} autre{negociationsSansReponse.length - 4 > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-amber-600" />
          </div>
        </Link>
      )}

      {/* 1. NÉGOCIATIONS EN COURS - Premier bloc, mega visible */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Target className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Négociations en cours</h2>
              <p className="text-sm text-slate-500">{stats.collabsNego} négo{stats.collabsNego > 1 ? "s" : ""} en attente</p>
            </div>
          </div>
          <Link
            href="/negociations"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Voir tout <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {!negociations || negociations.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Target className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">Aucune négociation en cours</p>
              <p className="mt-1 text-sm text-slate-400">Les négociations apparaîtront ici</p>
            </div>
          ) : (
            negociations.slice(0, 8).map((n: any) => (
              <Link
                key={n.id}
                href={`/negociations/${n.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate">{n.talent} × {n.marque}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-slate-500">{n.reference}</span>
                    {n.tm && <span className="text-xs text-slate-400">• {n.tm}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {negoStatutLabel[n.statut] || n.statut}
                  </span>
                  <span className="text-base font-semibold text-slate-900 tabular-nums">{formatMoney(n.montant)}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* 2. KPI CARDS - 4 carrés épurés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/finance" className="group rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60 hover:ring-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Euro className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatMoney(stats.caMois)}</p>
          <p className="text-sm text-slate-500 mt-0.5">CA du mois</p>
          <p className="text-xs text-slate-400 mt-2">Comm. {formatMoney(stats.commissionMois)}</p>
        </Link>

        <Link href="/negociations" className="group rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60 hover:ring-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Target className="h-4 w-4 text-amber-600" />
            </div>
            {stats.collabsNego > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-amber-500" />
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.collabsNego}</p>
          <p className="text-sm text-slate-500 mt-0.5">Négociations</p>
          <p className="text-xs text-slate-400 mt-2">En cours</p>
        </Link>

        <Link href="/talents" className="group rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60 hover:ring-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stats.talentsSansTarifs > 0 ? "bg-orange-500/10" : "bg-slate-100"}`}>
              <AlertTriangle className={`h-4 w-4 ${stats.talentsSansTarifs > 0 ? "text-orange-600" : "text-slate-400"}`} />
            </div>
            {stats.talentsSansTarifs > 0 && (
              <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Action</span>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.talentsSansTarifs}</p>
          <p className="text-sm text-slate-500 mt-0.5">Sans tarifs</p>
          <p className="text-xs text-slate-400 mt-2">À valider</p>
        </Link>

        <Link href="/talents" className="group rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60 hover:ring-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stats.talentsAvecBilanRetard > 0 ? "bg-red-500/10" : "bg-slate-100"}`}>
              <Clock className={`h-4 w-4 ${stats.talentsAvecBilanRetard > 0 ? "text-red-600" : "text-slate-400"}`} />
            </div>
            {stats.talentsAvecBilanRetard > 0 && (
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Retard</span>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.talentsAvecBilanRetard}</p>
          <p className="text-sm text-slate-500 mt-0.5">Bilans en retard</p>
          <p className="text-xs text-slate-400 mt-2">À mettre à jour</p>
        </Link>
      </div>

      {/* 3. CA ANNUEL + SUPERVISION TM - 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CA Annuel */}
        <Link href="/finance" className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 ring-1 ring-slate-200/60 hover:ring-slate-300 transition-all block">
          <p className="text-sm font-medium text-slate-500">CA Pôle Influence</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{formatMoney(stats.caAnnee)}</p>
          <p className="text-sm text-slate-500 mt-2">Année en cours</p>
          <p className="text-xs text-slate-400 mt-1">Commission: {formatMoney(stats.commissionAnnee)}</p>
        </Link>

        {/* Supervision TM */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Supervision TM</h3>
            <Link href="/talents" className="text-sm font-medium text-slate-600 hover:text-slate-900">Voir les talents</Link>
          </div>
          {tmBilans.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">Aucun TM actif</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tmBilans.slice(0, 4).map((tm: any) => (
                <div key={tm.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{tm.nom}</p>
                    <p className="text-sm text-slate-500">{tm.talents} talents · {formatMoney(tm.ca)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    {tm.bilansRetard > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                        <Clock className="h-3 w-3" /> {tm.bilansRetard} retard
                      </span>
                    )}
                    {tm.sansTarifs > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                        <AlertTriangle className="h-3 w-3" /> {tm.sansTarifs} sans tarifs
                      </span>
                    )}
                    {tm.bilansRetard === 0 && tm.sansTarifs === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        <CheckCircle className="h-3 w-3" /> OK
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Quick actions - minimal */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/talents"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Users className="h-4 w-4" /> Talents
        </Link>
        <Link
          href="/negociations"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Target className="h-4 w-4" /> Négociations
        </Link>
        <Link
          href="/collaborations"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Handshake className="h-4 w-4" /> Collaborations
        </Link>
      </div>
    </div>
  );
}

// ============================================
// TM DASHBOARD - REDESIGNED ✨
// ============================================
function TMDashboard({ data }: { data: any }) {
  const { stats, talents, negociations, negociationsSansReponse = [] } = data;

  return (
    <div className="space-y-6">
      {/* ALERTE: Négos > 5j sans réponse client */}
      {negociationsSansReponse.length > 0 && (
        <Link
          href="/negociations"
          className="block rounded-xl border-2 border-amber-200 bg-amber-50 p-4 ring-1 ring-amber-200/60 hover:bg-amber-100/80 transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-amber-900">
                {negociationsSansReponse.length} négo{negociationsSansReponse.length > 1 ? "s" : ""} sans réponse client depuis 5+ jours
              </h3>
              <p className="mt-1 text-sm text-amber-800">À relancer auprès des marques</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {negociationsSansReponse.slice(0, 4).map((n: any) => (
                  <span key={n.id} className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800">
                    {n.talent} × {n.marque} <span className="text-amber-600">({n.joursSansReponse}j)</span>
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-amber-600" />
          </div>
        </Link>
      )}

      {/* Stats Cards - Style glassmorphism */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-glowup-rose/90 to-pink-500 rounded-2xl p-5 text-white shadow-lg shadow-pink-200">
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <Users className="w-6 h-6 mb-3 opacity-80" />
          <p className="text-3xl font-bold">{stats.mesTalents}</p>
          <p className="text-white/80 text-sm mt-1">Mes talents</p>
        </div>
        
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-orange-200">
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <Target className="w-6 h-6 mb-3 opacity-80" />
          <p className="text-3xl font-bold">{stats.mesNegos}</p>
          <p className="text-white/80 text-sm mt-1">Négociations</p>
        </div>
        
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <Zap className="w-6 h-6 mb-3 opacity-80" />
          <p className="text-3xl font-bold">{stats.mesCollabsEnCours}</p>
          <p className="text-white/80 text-sm mt-1">En cours</p>
        </div>
        
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-purple-200">
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <Handshake className="w-6 h-6 mb-3 opacity-80" />
          <p className="text-3xl font-bold">{stats.mesTalents}</p>
          <p className="text-white/80 text-sm mt-1">Collaborations</p>
        </div>
      </div>

      {/* 🔴 ALERTE BILANS EN RETARD */}
      {stats.bilansRetard > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">⚠️ {stats.bilansRetard} talent(s) à mettre à jour</h3>
              <p className="text-white/80 text-sm mt-1">Les stats doivent être actualisées tous les 30 jours</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {talents?.filter((t: any) => t.bilanRetard).map((t: any) => (
                  <Link 
                    key={t.id} 
                    href={`/talents/${t.id}/stats`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-xl text-sm font-medium hover:bg-white/30 transition-all"
                  >
                    <Clock className="w-4 h-4" />
                    {t.nom}
                    <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">{t.joursDepuisBilan}j</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Layout 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* 👥 MES TALENTS - Colonne principale */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-glowup-licorice">Mes talents</h2>
              <p className="text-gray-500 text-sm">{talents?.length || 0} talent(s) sous ma gestion</p>
            </div>
            <Link href="/talents" className="flex items-center gap-1 text-sm text-glowup-rose hover:underline font-medium">
              Voir tous <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          
          {!talents || talents.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-glowup-rose/20 to-pink-100 flex items-center justify-center">
                <Users className="w-10 h-10 text-glowup-rose/50" />
              </div>
              <p className="text-gray-500 font-medium">Aucun talent assigné</p>
              <p className="text-gray-400 text-sm mt-1">Contactez votre Head of pour être assigné à des talents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {talents.map((t: any) => (
                <Link 
                  key={t.id} 
                  href={`/talents/${t.id}`} 
                  className={`group block p-4 rounded-2xl border-2 transition-all hover:shadow-lg ${
                    t.bilanRetard 
                      ? "border-red-200 bg-red-50/30 hover:border-red-300" 
                      : "border-gray-100 hover:border-glowup-rose/50 hover:bg-glowup-rose/5"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-glowup-rose to-pink-400 flex items-center justify-center overflow-hidden shadow-lg shadow-pink-200/50">
                        {t.photo ? (
                          <img src={t.photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl font-bold text-white">
                            {t.nom?.split(" ").map((n: string) => n[0]).join("")}
                          </span>
                        )}
                      </div>
                      {t.bilanRetard && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-glowup-licorice text-lg truncate group-hover:text-glowup-rose transition-colors">
                        {t.nom}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                          <Instagram className="w-4 h-4" />
                          {formatFollowers(t.followers)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                          <Handshake className="w-4 h-4" />
                          {t.collabs} collabs
                        </span>
                      </div>
                    </div>
                    
                    {/* Status / Action */}
                    <div className="flex flex-col items-end gap-2">
                      {t.bilanRetard ? (
                        <>
                          <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl text-xs font-bold">
                            ⏰ {t.joursDepuisBilan}j
                          </span>
                          <Link 
                            href={`/talents/${t.id}/stats`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-red-600 hover:underline font-medium"
                          >
                            Mettre à jour →
                          </Link>
                        </>
                      ) : (
                        <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold">
                          ✓ À jour
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Colonne secondaire */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 📋 MES NÉGOCIATIONS */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-glowup-licorice">Négociations</h2>
              <Link 
                href="/negociations/new" 
                className="p-2 bg-glowup-rose/10 text-glowup-rose rounded-xl hover:bg-glowup-rose/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </Link>
            </div>
            
            {!negociations || negociations.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center">
                  <Target className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-gray-500 text-sm">Aucune négo en cours</p>
                <Link 
                  href="/negociations/new" 
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-orange-200 transition-all"
                >
                  <Plus className="w-4 h-4" /> Créer
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {negociations.slice(0, 3).map((n: any) => (
                  <Link 
                    key={n.id} 
                    href={`/negociations/${n.id}`} 
                    className="block p-3 bg-gray-50 rounded-xl hover:bg-amber-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate group-hover:text-amber-700">{n.talent}</p>
                        <p className="text-xs text-gray-500 truncate">{n.marque}</p>
                      </div>
                      <span className="font-bold text-sm text-amber-600">{formatMoney(n.montant)}</span>
                    </div>
                  </Link>
                ))}
                {negociations.length > 3 && (
                  <Link href="/negociations" className="block text-center text-sm text-glowup-rose hover:underline py-2">
                    Voir les {negociations.length - 3} autres →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* 💼 MES STATS */}
          <div className="relative overflow-hidden bg-gradient-to-br from-glowup-licorice to-gray-800 rounded-2xl p-6 text-white">
            <div className="absolute top-0 right-0 w-24 h-24 bg-glowup-rose/20 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-pink-500/10 rounded-full blur-xl" />
            
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-glowup-rose" />
                <span className="text-white/60 text-sm">Mes collaborations</span>
              </div>
              <p className="text-4xl font-bold">{stats.mesCollabsEnCours}</p>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
                <div>
                  <p className="text-2xl font-bold">{stats.mesTalents}</p>
                  <p className="text-white/50 text-xs">talents gérés</p>
                </div>
                <div className="w-px h-8 bg-white/20" />
                <div>
                  <p className="text-2xl font-bold">{stats.mesNegos}</p>
                  <p className="text-white/50 text-xs">négociations</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions rapides */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-glowup-licorice mb-4">Actions rapides</h3>
            <div className="grid grid-cols-3 gap-3">
              <Link 
                href="/talents" 
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-glowup-rose/5 hover:bg-glowup-rose/10 transition-colors group"
              >
                <Users className="w-5 h-5 text-glowup-rose" />
                <span className="text-xs text-gray-600 group-hover:text-glowup-licorice">Talents</span>
              </Link>
              <Link 
                href="/negociations/new" 
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors group"
              >
                <Target className="w-5 h-5 text-amber-500" />
                <span className="text-xs text-gray-600 group-hover:text-glowup-licorice">Négo</span>
              </Link>
              <Link 
                href="/collaborations" 
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors group"
              >
                <Handshake className="w-5 h-5 text-blue-500" />
                <span className="text-xs text-gray-600 group-hover:text-glowup-licorice">Collabs</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
function StatCard({ title, value, icon, color, subtitle, alert }: any) {
  const colors: Record<string, string> = {
    rose: "bg-glowup-rose/10 text-glowup-rose",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    yellow: "bg-yellow-50 text-yellow-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 ${alert ? "border-red-300 ring-2 ring-red-100" : "border-gray-100"}`}>
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
        {alert && <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-medium rounded-full">Action requise</span>}
      </div>
      <p className="text-2xl font-bold text-glowup-licorice mt-3">{value}</p>
      <p className="text-sm text-gray-500">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function PipelineRow({ statut, count }: { statut: string; count: number }) {
  const config: Record<string, { label: string; color: string; bg: string; gradient: string }> = {
    NEGO: { label: "Négociation", color: "bg-yellow-500", bg: "bg-yellow-50", gradient: "from-yellow-500 to-orange-500" },
    GAGNE: { label: "Gagné", color: "bg-emerald-500", bg: "bg-emerald-50", gradient: "from-emerald-500 to-teal-600" },
    EN_COURS: { label: "En cours", color: "bg-blue-500", bg: "bg-blue-50", gradient: "from-blue-500 to-indigo-600" },
    PUBLIE: { label: "Publié", color: "bg-purple-500", bg: "bg-purple-50", gradient: "from-purple-500 to-pink-600" },
    FACTURE_RECUE: { label: "Facture reçue", color: "bg-orange-500", bg: "bg-orange-50", gradient: "from-orange-500 to-red-500" },
    PAYE: { label: "Payé", color: "bg-gray-500", bg: "bg-gray-50", gradient: "from-gray-500 to-gray-600" },
    PERDU: { label: "Perdu", color: "bg-red-500", bg: "bg-red-50", gradient: "from-red-500 to-rose-600" },
  };
  const c = config[statut] || { label: statut, color: "bg-gray-500", bg: "bg-gray-50", gradient: "from-gray-500 to-gray-600" };
  
  return (
    <div className={`group p-3 rounded-xl ${c.bg} hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-gray-200`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${c.color} group-hover:scale-125 transition-transform`} />
          <span className="text-sm font-semibold text-gray-700 group-hover:text-glowup-licorice transition-colors">{c.label}</span>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-sm font-bold bg-gradient-to-r ${c.gradient} text-white shadow-sm`}>
          {count}
        </span>
      </div>
      
      {/* Barre de progression simulée */}
      <div className="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${c.gradient} rounded-full transition-all duration-500 group-hover:animate-pulse`}
          style={{ width: `${Math.min(100, (count / 10) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function TopList({ title, subtitle, items, href, icon }: { title: string; subtitle?: string; items: any[]; href: string; icon?: React.ReactNode }) {
  if (!items || items.length === 0) return null;
  
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow group">
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-yellow-100/30 to-orange-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {icon && <div className="text-yellow-600">{icon}</div>}
              <h2 className="text-xl font-bold text-glowup-licorice">{title}</h2>
            </div>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
          <Link 
            href={href} 
            className="flex items-center gap-1 text-sm text-glowup-rose hover:text-glowup-rose-dark font-semibold transition-colors group/link"
          >
            Voir tous 
            <ChevronRight className="w-4 h-4 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        
        <div className="space-y-3">
          {items.map((item: any, i: number) => {
            const isTop3 = i < 3;
            const isPodium = i === 0;
            
            return (
              <Link
                key={item.id}
                href={`${href}/${item.id}`}
                className={`group/item flex items-center justify-between gap-4 p-4 rounded-2xl transition-all border-2 ${
                  isPodium 
                    ? "bg-gradient-to-r from-yellow-50 to-yellow-100/50 border-yellow-300 hover:border-yellow-400 hover:shadow-lg" 
                    : isTop3 
                    ? "bg-gradient-to-r from-gray-50 to-gray-100/30 border-gray-200 hover:border-gray-300 hover:shadow-md" 
                    : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Badge de classement */}
                  <div className={`relative flex items-center justify-center w-12 h-12 rounded-xl font-extrabold text-base shadow-md ${
                    i === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-white" :
                    i === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-white" :
                    i === 2 ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white" :
                    "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600"
                  }`}>
                    {isPodium && (
                      <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 animate-pulse" />
                    )}
                    #{i + 1}
                  </div>
                  
                  {/* Nom */}
                  <div className="min-w-0">
                    <p className="font-bold text-glowup-licorice text-lg truncate group-hover/item:text-glowup-rose transition-colors">
                      {item.nom}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        Performance excellente
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* CA */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={`text-2xl font-extrabold ${
                      isPodium ? "text-yellow-700" : "text-emerald-600"
                    }`}>
                      {formatMoney(item.ca)}
                    </p>
                    <p className="text-xs text-gray-400">Chiffre d'affaires</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover/item:text-glowup-rose group-hover/item:translate-x-0.5 group-hover/item:-translate-y-0.5 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuickActions({ role }: { role: string }) {
  const actions: Record<string, { label: string; icon: React.ReactNode; href: string; gradient: string; color: string }[]> = {
    ADMIN: [
      { label: "Nouveau talent", icon: <Users className="w-5 h-5" />, href: "/talents/new", gradient: "from-glowup-rose to-pink-500", color: "pink" },
      { label: "Nouvelle marque", icon: <Building2 className="w-5 h-5" />, href: "/marques/new", gradient: "from-blue-500 to-indigo-600", color: "blue" },
      { label: "Voir les factures", icon: <FileText className="w-5 h-5" />, href: "/factures", gradient: "from-emerald-500 to-teal-600", color: "emerald" },
      { label: "Nouvelle collab", icon: <Handshake className="w-5 h-5" />, href: "/collaborations/new", gradient: "from-amber-400 to-orange-500", color: "amber" },
      { label: "Finance", icon: <Euro className="w-5 h-5" />, href: "/finance", gradient: "from-purple-500 to-pink-600", color: "purple" },
      { label: "Notifications", icon: <Activity className="w-5 h-5" />, href: "/notifications", gradient: "from-red-500 to-rose-600", color: "red" },
    ],
    HEAD_OF: [
      { label: "Voir les talents", icon: <Users className="w-5 h-5" />, href: "/talents", gradient: "from-glowup-rose to-pink-500", color: "pink" },
      { label: "Négociations", icon: <Target className="w-5 h-5" />, href: "/negociations", gradient: "from-amber-400 to-orange-500", color: "amber" },
    ],
    TM: [
      { label: "Mes talents", icon: <Users className="w-5 h-5" />, href: "/talents", gradient: "from-glowup-rose to-pink-500", color: "pink" },
      { label: "Nouvelle négo", icon: <Target className="w-5 h-5" />, href: "/negociations/new", gradient: "from-amber-400 to-orange-500", color: "amber" },
      { label: "Mes collabs", icon: <Handshake className="w-5 h-5" />, href: "/collaborations", gradient: "from-blue-500 to-indigo-600", color: "blue" },
    ],
  };

  const items = actions[role] || actions.TM;

  return (
    <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-glowup-rose/10 to-pink-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-glowup-rose to-pink-500 rounded-xl">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-glowup-licorice">Actions rapides</h2>
            <p className="text-sm text-gray-500">Accès direct aux fonctionnalités clés</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((item) => (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`group relative overflow-hidden flex flex-col items-center gap-3 p-5 rounded-2xl bg-gradient-to-br ${item.gradient} text-white shadow-lg hover:shadow-2xl transition-all hover:scale-105 transform`}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
              
              <div className="relative p-3 bg-white/20 backdrop-blur-sm rounded-xl group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
              <span className="relative text-sm font-bold text-center leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================
function getWelcomeMessage(role: string) {
  const messages: Record<string, string> = {
    ADMIN: "Vue globale de l'agence",
    HEAD_OF: "Supervision du pôle Influence",
    TM: "Gérez vos talents et négociations",
    TALENT: "Votre espace personnel",
  };
  return messages[role] || "Bienvenue";
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("fr-FR", { 
    style: "currency", 
    currency: "EUR", 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(amount || 0);
}

function formatFollowers(count: number) {
  if (!count) return "0";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${Math.round(count / 1000)}K`;
  return count.toString();
}