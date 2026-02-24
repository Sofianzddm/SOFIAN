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
    <div className="space-y-8 pb-10">
      {/* Welcome Header — pro, épuré */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm font-medium">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 tracking-tight">
            Bonjour, {session?.user?.name?.split(" ")[0]}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{getWelcomeMessage(role)}</p>
        </div>
        {(role === "ADMIN" || role === "TM") && (
          <Link
            href="/collaborations/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle collaboration
          </Link>
        )}
      </div>

      {/* Dashboard par rôle */}
      {role === "ADMIN" && <AdminDashboard data={data} />}
      {role === "HEAD_OF" && <HeadOfDashboard data={data} />}
      {role === "TM" && <TMDashboard data={data} />}
    </div>
  );
}

// ============================================
// ADMIN DASHBOARD — Pro, épuré
// ============================================
function AdminDashboard({ data }: { data: any }) {
  const { stats, pipeline, topTalents, facturesTalentAValider = [], tmPerformance, facturesRelance, negociationsSansReponse = [] } = data;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Alerte négos sans réponse — sobre */}
      {negociationsSansReponse.length > 0 && (
        <Link
          href="/negociations"
          className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 hover:bg-amber-50 transition-colors"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/90">
            <AlertTriangle className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">
              {negociationsSansReponse.length} négociation{negociationsSansReponse.length > 1 ? "s" : ""} sans réponse client (5+ jours)
            </h3>
            <p className="text-sm text-slate-600 mt-0.5">À relancer auprès des marques</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {negociationsSansReponse.slice(0, 4).map((n: any) => (
                <span key={n.id} className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-slate-700 border border-amber-200/60">
                  {n.talent} × {n.marque}
                  <span className="text-amber-600">({n.joursSansReponse}j)</span>
                  {n.tm && <span className="text-slate-400">· {n.tm}</span>}
                </span>
              ))}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-amber-600" />
        </Link>
      )}

      {/* KPI — cartes blanches, typo claire */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/finance" className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <Euro className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-slate-400">Ce mois</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatMoney(stats.caMois)}</p>
          <p className="text-sm text-slate-500 mt-0.5">CA du mois (HT)</p>
          <p className="text-xs text-slate-400 mt-2">Commission : {formatMoney(stats.commissionMois)}</p>
        </Link>

        <Link href="/negociations" className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Target className="h-5 w-5 text-amber-600" />
            </div>
            {stats.collabsNego > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" />}
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.collabsNego}</p>
          <p className="text-sm text-slate-500 mt-0.5">Négociations actives</p>
          <p className="text-xs text-slate-400 mt-2">En attente de validation</p>
        </Link>

        <Link href="/collaborations" className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.collabsEnCours}</p>
          <p className="text-sm text-slate-500 mt-0.5">Collaborations en cours</p>
          <p className="text-xs text-slate-400 mt-2">Production</p>
        </Link>

        <Link href="/collaborations" className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stats.collabsPublie > 0 ? "bg-rose-500/10" : "bg-slate-100"}`}>
              <FileText className={`h-5 w-5 ${stats.collabsPublie > 0 ? "text-rose-600" : "text-slate-400"}`} />
            </div>
            {stats.collabsPublie > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.collabsPublie}</p>
          <p className="text-sm text-slate-500 mt-0.5">Publiées — à facturer</p>
          <p className="text-xs text-slate-400 mt-2">{stats.collabsPublie > 0 ? "Action requise" : "À jour"}</p>
        </Link>
      </div>

      {/* Performance annuelle + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                <BarChart3 className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Performance annuelle</h2>
                <p className="text-sm text-slate-500">Chiffre d'affaires depuis janvier</p>
              </div>
            </div>
            <Link href="/finance" className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1">
              Détails <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{formatMoney(stats.caAnnee)}</span>
            <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
              <TrendingUp className="w-3.5 h-3.5" /> +18.5%
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Talents</span>
              </div>
              <p className="text-xl font-bold text-slate-900 tabular-nums">{stats.totalTalents}</p>
              <p className="text-xs text-slate-400 mt-0.5">Actifs</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Marques</span>
              </div>
              <p className="text-xl font-bold text-slate-900 tabular-nums">{stats.totalMarques}</p>
              <p className="text-xs text-slate-400 mt-0.5">Partenaires</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">En attente</span>
              </div>
              <p className="text-xl font-bold text-slate-900 tabular-nums">{stats.facturesEnAttente}</p>
              <p className="text-xs text-slate-400 mt-0.5">Paiements</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <PieChart className="w-5 h-5 text-slate-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Pipeline</h2>
          </div>
          <div className="space-y-2">
            {pipeline?.map((p: any) => <PipelineRow key={p.statut} statut={p.statut} count={p.count} />)}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100">
            <Link href="/collaborations" className="flex items-center justify-between w-full py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
              Voir toutes les collaborations
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Top Talents & Factures talent à valider */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopList title="Top Talents" subtitle="Par chiffre d'affaires" items={topTalents} href="/talents" icon={<Award className="w-5 h-5 text-slate-500" />} />
        <FactureTalentAValiderList items={facturesTalentAValider} />
      </div>

      {/* Performance TM — tableau sobre */}
      {tmPerformance && tmPerformance.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                <Users className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Performance Talent Managers</h2>
                <p className="text-sm text-slate-500">Par CA généré</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {tmPerformance.map((tm: any, index: number) => (
              <div key={tm.id} className="flex items-center justify-between gap-6 px-6 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm flex-shrink-0">
                    {tm.nom.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{tm.nom}</p>
                    <p className="text-xs text-slate-500">{tm.talents} talents · {tm.collabsEnCours} collabs</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    tm.tauxConversion >= 70 ? "bg-emerald-50 text-emerald-700" :
                    tm.tauxConversion >= 50 ? "bg-amber-50 text-amber-700" :
                    "bg-red-50 text-red-700"
                  }`}>
                    {tm.tauxConversion}% conversion
                  </div>
                  <p className="text-lg font-semibold text-slate-900 tabular-nums w-28 text-right">{formatMoney(tm.ca)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Factures à relancer — liste épurée */}
      {facturesRelance && facturesRelance.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/90">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Factures à relancer</h2>
                <p className="text-sm text-slate-600">{facturesRelance.length} en retard de paiement</p>
              </div>
            </div>
            <Link href="/factures" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Voir toutes <ChevronRight className="w-4 h-4 inline" />
            </Link>
          </div>
          <div className="divide-y divide-amber-200/40">
            {facturesRelance.map((f: any) => {
              const isContentieux = f.statut === "contentieux";
              const isRelance2 = f.statut === "relance2";
              const borderClass = isContentieux ? "border-l-red-500" : isRelance2 ? "border-l-orange-500" : "border-l-amber-500";
              const badgeClass = isContentieux ? "bg-red-100 text-red-800" : isRelance2 ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800";
              return (
                <Link key={f.id} href="/documents" className={`flex items-center justify-between gap-4 px-6 py-4 hover:bg-white/60 transition-colors border-l-4 ${borderClass}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-slate-900">{f.reference}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
                        {isContentieux ? "Contentieux" : isRelance2 ? "Relance 2" : "Relance 1"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{f.marque} · {f.talent}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-slate-900 tabular-nums">{formatMoney(f.montant)}</p>
                    <p className="text-xs text-slate-500">{f.jours} jours de retard</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </Link>
              );
            })}
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
<p className="text-sm text-slate-500 mt-0.5">CA du mois (HT)</p>
            <p className="text-xs text-slate-400 mt-2">Comm. (HT) {formatMoney(stats.commissionMois)}</p>
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
          <p className="text-sm font-medium text-slate-500">CA Pôle Influence (HT)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{formatMoney(stats.caAnnee)}</p>
          <p className="text-sm text-slate-500 mt-2">Année en cours</p>
          <p className="text-xs text-slate-400 mt-1">Commission (HT): {formatMoney(stats.commissionAnnee)}</p>
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
  const config: Record<string, { label: string; dot: string }> = {
    NEGO: { label: "Négociation", dot: "bg-amber-500" },
    GAGNE: { label: "Gagné", dot: "bg-emerald-500" },
    EN_COURS: { label: "En cours", dot: "bg-blue-500" },
    PUBLIE: { label: "Publié", dot: "bg-violet-500" },
    FACTURE_RECUE: { label: "Facture reçue", dot: "bg-orange-500" },
    PAYE: { label: "Payé", dot: "bg-slate-400" },
    PERDU: { label: "Perdu", dot: "bg-red-500" },
  };
  const c = config[statut] || { label: statut, dot: "bg-slate-400" };
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${c.dot}`} />
        <span className="text-sm font-medium text-slate-700">{c.label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-900 tabular-nums">{count}</span>
    </div>
  );
}

function FactureTalentAValiderList({ items }: { items: { id: string; reference: string; talent: string; marque: string; factureTalentRecueAt: string | null }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-violet-500" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Factures talent à valider</h2>
            <p className="text-sm text-slate-500">
              {items.length === 0 ? "Aucune en attente" : `${items.length} à valider`}
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <Link href="/collaborations" className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1">
            Voir tout <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            Aucune facture talent en attente de validation
          </div>
        ) : (
          items.slice(0, 5).map((item) => (
            <Link
              key={item.id}
              href={`/collaborations/${item.id}`}
              className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-slate-50/80 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 truncate">{item.reference}</p>
                <p className="text-xs text-slate-500 truncate">{item.talent} · {item.marque}</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function TopList({ title, subtitle, items, href, icon }: { title: string; subtitle?: string; items: any[]; href: string; icon?: React.ReactNode }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <Link href={href} className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1">
          Voir tout <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item: any, i: number) => (
          <Link
            key={item.id}
            href={`${href}/${item.id}`}
            className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-slate-50/80 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">
                {i + 1}
              </span>
              <p className="font-medium text-slate-900 truncate">{item.nom}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-semibold text-slate-900 tabular-nums">{formatMoney(item.ca)}</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </div>
          </Link>
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
      { label: "Factures", icon: <FileText className="w-4 h-4" />, href: "/factures" },
      { label: "Nouvelle collab", icon: <Handshake className="w-4 h-4" />, href: "/collaborations/new" },
      { label: "Finance", icon: <Euro className="w-4 h-4" />, href: "/finance" },
      { label: "Notifications", icon: <Activity className="w-4 h-4" />, href: "/notifications" },
    ],
    HEAD_OF: [
      { label: "Talents", icon: <Users className="w-4 h-4" />, href: "/talents" },
      { label: "Négociations", icon: <Target className="w-4 h-4" />, href: "/negociations" },
    ],
    TM: [
      { label: "Mes talents", icon: <Users className="w-4 h-4" />, href: "/talents" },
      { label: "Nouvelle négo", icon: <Target className="w-4 h-4" />, href: "/negociations/new" },
      { label: "Collaborations", icon: <Handshake className="w-4 h-4" />, href: "/collaborations" },
    ],
  };
  const items = actions[role] || actions.TM;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Actions rapides</h2>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            {item.icon}
            {item.label}
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