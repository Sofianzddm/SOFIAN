"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Users, Building2, Handshake, FileText, Loader2, Euro,
  AlertTriangle, CheckCircle, Clock, Target, Zap, ChevronRight,
  Plus, Sparkles, RefreshCw, Instagram, TrendingUp, Calendar,
  ArrowUpRight, MoreHorizontal, Play, Camera, Video,
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
// ADMIN DASHBOARD (inchangé pour l'instant)
// ============================================
function AdminDashboard({ data }: { data: any }) {
  const { stats, pipeline, topTalents, topMarques, tmPerformance, facturesRelance } = data;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="CA du mois" value={formatMoney(stats.caMois)} icon={<Euro className="w-5 h-5" />} color="emerald" subtitle={`Commission: ${formatMoney(stats.commissionMois)}`} />
        <StatCard title="Négociations" value={stats.collabsNego} icon={<Target className="w-5 h-5" />} color="yellow" />
        <StatCard title="En cours" value={stats.collabsEnCours} icon={<Zap className="w-5 h-5" />} color="blue" />
        <StatCard title="À facturer" value={stats.collabsPublie} icon={<FileText className="w-5 h-5" />} color="rose" />
      </div>

      {/* CA + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Performance annuelle</h2>
          <div className="text-3xl font-bold text-glowup-licorice mb-2">{formatMoney(stats.caAnnee)}</div>
          <p className="text-sm text-gray-500">CA brut depuis janvier</p>
          <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
            <div><p className="text-xs text-gray-500">Talents</p><p className="text-xl font-semibold">{stats.totalTalents}</p></div>
            <div><p className="text-xs text-gray-500">Marques</p><p className="text-xl font-semibold">{stats.totalMarques}</p></div>
            <div><p className="text-xs text-gray-500">En attente</p><p className="text-xl font-semibold text-orange-500">{stats.facturesEnAttente}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Pipeline</h2>
          <div className="space-y-3">{pipeline?.map((p: any) => <PipelineRow key={p.statut} statut={p.statut} count={p.count} />)}</div>
        </div>
      </div>

      {/* Top performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopList title="Top Talents" items={topTalents} href="/talents" />
        <TopList title="Top Marques" items={topMarques} href="/marques" />
      </div>

      {/* Performance TM */}
      {tmPerformance && tmPerformance.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Performance Talent Managers</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">TM</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Talents</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">En cours</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Taux</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">CA</th>
                </tr>
              </thead>
              <tbody>
                {tmPerformance.map((tm: any) => (
                  <tr key={tm.id} className="border-b border-gray-50">
                    <td className="py-3 px-4 font-medium">{tm.nom}</td>
                    <td className="py-3 px-4 text-center">{tm.talents}</td>
                    <td className="py-3 px-4 text-center">{tm.collabsEnCours}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${tm.tauxConversion >= 70 ? "bg-emerald-100 text-emerald-700" : tm.tauxConversion >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{tm.tauxConversion}%</span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600">{formatMoney(tm.ca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Factures relance */}
      {facturesRelance && facturesRelance.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold">Factures à relancer</h2>
          </div>
          <div className="space-y-2">
            {facturesRelance.map((f: any) => (
              <div key={f.id} className={`flex items-center justify-between p-3 rounded-xl ${f.statut === "contentieux" ? "bg-red-50" : f.statut === "relance2" ? "bg-orange-50" : "bg-yellow-50"}`}>
                <div>
                  <p className="font-medium">{f.reference} - {f.marque}</p>
                  <p className="text-sm text-gray-600">{f.talent}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatMoney(f.montant)}</p>
                  <p className={`text-xs font-medium ${f.statut === "contentieux" ? "text-red-600" : f.statut === "relance2" ? "text-orange-600" : "text-yellow-600"}`}>{f.jours}j</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickActions role="ADMIN" />
    </div>
  );
}

// ============================================
// HEAD_OF DASHBOARD (inchangé pour l'instant)
// ============================================
function HeadOfDashboard({ data }: { data: any }) {
  const { stats, tmBilans } = data;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="CA du mois" value={formatMoney(stats.caMois)} icon={<Euro className="w-5 h-5" />} color="emerald" subtitle={`Commission: ${formatMoney(stats.commissionMois)}`} />
        <StatCard title="Négociations" value={stats.collabsNego} icon={<Target className="w-5 h-5" />} color="yellow" />
        <StatCard title="Sans tarifs" value={stats.talentsSansTarifs} icon={<AlertTriangle className="w-5 h-5" />} color="orange" alert={stats.talentsSansTarifs > 0} />
        <StatCard title="Bilans en retard" value={stats.talentsAvecBilanRetard} icon={<Clock className="w-5 h-5" />} color="red" alert={stats.talentsAvecBilanRetard > 0} />
      </div>

      {/* CA Annuel */}
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
        <p className="text-white/80 text-sm">CA Pôle Influence (Année)</p>
        <p className="text-3xl font-bold mt-2">{formatMoney(stats.caAnnee)}</p>
        <p className="text-white/80 text-sm mt-1">Commission: {formatMoney(stats.commissionAnnee)}</p>
      </div>

      {/* Supervision TM */}
      {tmBilans && tmBilans.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Supervision Talent Managers</h2>
          <div className="space-y-4">
            {tmBilans.map((tm: any) => (
              <div key={tm.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{tm.nom}</h3>
                    <p className="text-sm text-gray-500">{tm.talents} talents · CA: {formatMoney(tm.ca)}</p>
                  </div>
                  <div className="flex gap-2">
                    {tm.bilansRetard > 0 && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">{tm.bilansRetard} bilan(s) retard</span>}
                    {tm.sansTarifs > 0 && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">{tm.sansTarifs} sans tarifs</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {tm.talentsDetail?.map((t: any) => (
                    <Link key={t.id} href={`/talents/${t.id}`} className={`p-2 rounded-lg text-sm flex items-center gap-2 ${!t.bilanOk || !t.tarifsOk ? "bg-red-50 hover:bg-red-100" : "bg-gray-50 hover:bg-gray-100"}`}>
                      {t.bilanOk && t.tarifsOk ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                      <span className="truncate">{t.nom}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickActions role="HEAD_OF" />
    </div>
  );
}

// ============================================
// TM DASHBOARD - REDESIGNED ✨
// ============================================
function TMDashboard({ data }: { data: any }) {
  const { stats, talents, negociations, aFacturer } = data;

  return (
    <div className="space-y-6">
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
        
        <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${stats.aFacturer > 0 ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200" : "bg-gradient-to-br from-gray-400 to-gray-500 shadow-gray-200"}`}>
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <Euro className="w-6 h-6 mb-3 opacity-80" />
          <p className="text-3xl font-bold">{stats.aFacturer}</p>
          <p className="text-white/80 text-sm mt-1">À facturer</p>
          {stats.aFacturer > 0 && (
            <span className="absolute top-3 right-3 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
          )}
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

      {/* 💰 À FACTURER */}
      {aFacturer && aFacturer.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">💰 {aFacturer.length} collab(s) publiée(s)</h3>
                <p className="text-white/80 text-sm">En attente de la facture talent</p>
              </div>
            </div>
            <div className="space-y-2">
              {aFacturer.map((c: any) => (
                <Link 
                  key={c.id} 
                  href={`/collaborations/${c.id}`}
                  className="flex items-center justify-between p-4 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all group"
                >
                  <div>
                    <p className="font-semibold">{c.talent}</p>
                    <p className="text-white/70 text-sm">{c.marque} · {c.reference}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold">{formatMoney(c.montant)}</span>
                    <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
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

          {/* 💵 CA DU MOIS */}
          <div className="relative overflow-hidden bg-gradient-to-br from-glowup-licorice to-gray-800 rounded-2xl p-6 text-white">
            <div className="absolute top-0 right-0 w-24 h-24 bg-glowup-rose/20 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-pink-500/10 rounded-full blur-xl" />
            
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-glowup-rose" />
                <span className="text-white/60 text-sm">Mon CA du mois</span>
              </div>
              <p className="text-4xl font-bold">{formatMoney(stats.caMois)}</p>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
                <div>
                  <p className="text-2xl font-bold">{stats.mesCollabsEnCours}</p>
                  <p className="text-white/50 text-xs">en cours</p>
                </div>
                <div className="w-px h-8 bg-white/20" />
                <div>
                  <p className="text-2xl font-bold">{stats.aFacturer}</p>
                  <p className="text-white/50 text-xs">à facturer</p>
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
  const config: Record<string, { label: string; color: string; bg: string }> = {
    NEGO: { label: "Négociation", color: "bg-yellow-500", bg: "bg-yellow-100" },
    GAGNE: { label: "Gagné", color: "bg-emerald-500", bg: "bg-emerald-100" },
    EN_COURS: { label: "En cours", color: "bg-blue-500", bg: "bg-blue-100" },
    PUBLIE: { label: "Publié", color: "bg-purple-500", bg: "bg-purple-100" },
    FACTURE_RECUE: { label: "Facture reçue", color: "bg-orange-500", bg: "bg-orange-100" },
    PAYE: { label: "Payé", color: "bg-gray-500", bg: "bg-gray-100" },
    PERDU: { label: "Perdu", color: "bg-red-500", bg: "bg-red-100" },
  };
  const c = config[statut] || { label: statut, color: "bg-gray-500", bg: "bg-gray-100" };
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${c.color}`} />
      <span className="flex-1 text-sm text-gray-700">{c.label}</span>
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg}`}>{count}</span>
    </div>
  );
}

function TopList({ title, items, href }: { title: string; items: any[]; href: string }) {
  if (!items || items.length === 0) return null;
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-glowup-licorice">{title}</h2>
        <Link href={href} className="text-sm text-glowup-rose hover:underline flex items-center gap-1">
          Voir tous <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="space-y-3">
        {items.map((item: any, i: number) => (
          <div key={item.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-100 text-gray-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-gray-50 text-gray-500"}`}>
                {i + 1}
              </span>
              <span className="font-medium">{item.nom}</span>
            </div>
            <span className="text-sm font-semibold text-emerald-600">{formatMoney(item.ca)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickActions({ role }: { role: string }) {
  const actions: Record<string, { label: string; icon: React.ReactNode; href: string }[]> = {
    ADMIN: [
      { label: "Nouveau talent", icon: <Users className="w-4 h-4" />, href: "/talents/new" },
      { label: "Nouvelle marque", icon: <Building2 className="w-4 h-4" />, href: "/marques/new" },
      { label: "Voir les factures", icon: <FileText className="w-4 h-4" />, href: "/factures" },
    ],
    HEAD_OF: [
      { label: "Voir les talents", icon: <Users className="w-4 h-4" />, href: "/talents" },
      { label: "Négociations", icon: <Target className="w-4 h-4" />, href: "/negociations" },
    ],
    TM: [
      { label: "Mes talents", icon: <Users className="w-4 h-4" />, href: "/talents" },
      { label: "Nouvelle négo", icon: <Target className="w-4 h-4" />, href: "/negociations/new" },
      { label: "Mes collabs", icon: <Handshake className="w-4 h-4" />, href: "/collaborations" },
    ],
  };

  const items = actions[role] || actions.TM;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Actions rapides</h2>
      <div className="grid grid-cols-3 gap-4">
        {items.map((item) => (
          <Link 
            key={item.href} 
            href={item.href} 
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:border-glowup-rose hover:bg-glowup-rose/5 transition-all group"
          >
            <div className="text-gray-400 group-hover:text-glowup-rose transition-colors">{item.icon}</div>
            <span className="text-sm text-gray-600 group-hover:text-glowup-licorice text-center">{item.label}</span>
          </Link>
        ))}
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