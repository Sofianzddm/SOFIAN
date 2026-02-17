"use client";

import { useState, useEffect } from "react";

interface Stats {
  totalPageViews: number;
  uniqueVisitors: number;
  totalTalentClicks: number;
  totalPdfDownloads: number;
}

interface TopTalent {
  talentId: string;
  clicks: number;
  prenom: string;
  nom: string;
  photo: string | null;
}

interface RecentActivity {
  id: string;
  type: string;
  talentName: string | null;
  createdAt: string;
}

interface DailyStat {
  date: string;
  views: number;
  clicks: number;
}

interface PresskitStats {
  totalViews: number;
  uniqueVisitors: number;
  totalDuration: number;
  avgDuration: number;
  avgScrollDepth: number;
  topBrands: TopBrand[];
  allBrands: AllBrand[];
}

interface AllBrand {
  brandId: string;
  brandName: string;
  slug: string;
  pressKitUrl: string;
  logo: string | null;
  color: string | null;
  hasBeenOpened: boolean;
  views: number;
  lastVisit: string | null;
  avgDuration: number;
  conversionRate: number;
  createdAt: string;
}

interface TalentViewed {
  id: string;
  name: string;
  photo: string | null;
  duration: number; // Durée totale passée sur ce talent (en secondes)
}

interface Visit {
  date: string;
  duration: number;
  scrollDepth: number;
  talentsViewed: string[];
  talentDurations: Record<string, number>;
  ctaClicked: boolean;
  talentbookClicked: boolean;
}

interface TopBrand {
  brandId: string;
  brandName: string;
  logo: string | null;
  color: string | null;
  views: number;
  avgDuration: number;
  talentsViewedCount: number;
  talentsViewed: TalentViewed[];
  lastVisit: string;
  ctaClicked: number;
  conversionRate: number;
  visits: Visit[];
}

// Icônes
function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UsersIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MousePointerIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <path d="M13 13l6 6" />
    </svg>
  );
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function getInitials(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  return `Il y a ${diffDays}j`;
}

function getEventLabel(type: string): { label: string; color: string; icon: string } {
  switch (type) {
    case "page_view":
      return { label: "Visite", color: "bg-blue-100 text-blue-700", icon: "👁️" };
    case "talent_click":
      return { label: "Clic talent", color: "bg-emerald-100 text-emerald-700", icon: "👆" };
    case "pdf_download":
      return { label: "PDF téléchargé", color: "bg-purple-100 text-purple-700", icon: "📄" };
    case "favorite_add":
      return { label: "Ajout favori", color: "bg-pink-100 text-pink-700", icon: "❤️" };
    default:
      return { label: type, color: "bg-gray-100 text-gray-700", icon: "📊" };
  }
}

export default function TalentbookStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topTalents, setTopTalents] = useState<TopTalent[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [presskitStats, setPresskitStats] = useState<PresskitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7d");
  const [activeTab, setActiveTab] = useState<"talentbook" | "presskits">("talentbook");
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  
  // Filtres pour la liste complète des press kits
  const [sortBy, setSortBy] = useState<"recent" | "views" | "duration" | "cta" | "name">("recent");
  const [filterStatus, setFilterStatus] = useState<"all" | "opened" | "pending">("all");

  useEffect(() => {
    fetchStats();
  }, [period]);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch(`/api/talentbook/tracking?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setTopTalents(data.topTalents);
        setRecentActivity(data.recentActivity);
        setDailyStats(data.dailyStats);
        setPresskitStats(data.presskitStats);
      }
    } catch (error) {
      console.error("Erreur chargement stats:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#220101]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#220101] text-white px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">📊 Analytics Dashboard</h1>
          <p className="text-white/60">Suivez l'activité sur votre Talentbook et vos Press Kits</p>
          
          {/* Tabs */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setActiveTab("talentbook")}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === "talentbook"
                  ? "bg-white text-[#220101]"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              📚 Talentbook
            </button>
            <button
              onClick={() => setActiveTab("presskits")}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === "presskits"
                  ? "bg-white text-[#220101]"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              🎯 Press Kits
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ====================================== */}
        {/* TALENTBOOK TAB */}
        {/* ====================================== */}
        {activeTab === "talentbook" && (
          <>
        {/* Période */}
        <div className="flex gap-2 mb-8">
          {[
            { value: "24h", label: "24h" },
            { value: "7d", label: "7 jours" },
            { value: "30d", label: "30 jours" },
            { value: "all", label: "Tout" },
          ].map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === p.value
                  ? "bg-[#220101] text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <EyeIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalPageViews || 0}</p>
                <p className="text-sm text-gray-500">Vues totales</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <UsersIcon className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats?.uniqueVisitors || 0}</p>
                <p className="text-sm text-gray-500">Visiteurs uniques</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <MousePointerIcon className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalTalentClicks || 0}</p>
                <p className="text-sm text-gray-500">Clics sur talents</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <DownloadIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalPdfDownloads || 0}</p>
                <p className="text-sm text-gray-500">PDFs téléchargés</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Talents */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">🔥 Talents les plus consultés</h2>
            
            {topTalents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune donnée pour cette période</p>
            ) : (
              <div className="space-y-4">
                {topTalents.map((talent, index) => (
                  <div key={talent.talentId} className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center">
                      {index === 0 && <span className="text-2xl">🥇</span>}
                      {index === 1 && <span className="text-2xl">🥈</span>}
                      {index === 2 && <span className="text-2xl">🥉</span>}
                      {index > 2 && <span className="text-lg text-gray-400 font-medium">{index + 1}</span>}
                    </div>
                    
                    {talent.photo ? (
                      <img
                        src={talent.photo}
                        alt={`${talent.prenom} ${talent.nom}`}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#B06F70] to-[#220101] flex items-center justify-center text-white font-medium">
                        {getInitials(talent.prenom, talent.nom)}
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {talent.prenom} {talent.nom}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">{talent.clicks}</p>
                      <p className="text-xs text-gray-500">clics</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activité récente */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">⚡ Activité récente</h2>
            
            {recentActivity.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune activité récente</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentActivity.map((event) => {
                  const eventInfo = getEventLabel(event.type);
                  return (
                    <div key={event.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                      <span className="text-xl">{eventInfo.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${eventInfo.color}`}>
                            {eventInfo.label}
                          </span>
                          {event.talentName && (
                            <span className="text-sm font-medium text-gray-900">{event.talentName}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{formatTimeAgo(event.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Graphique journalier simple */}
        {dailyStats.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">📈 Évolution</h2>
            
            <div className="flex items-end gap-1 h-48">
              {dailyStats.slice().reverse().map((day, index) => {
                const maxViews = Math.max(...dailyStats.map(d => d.views), 1);
                const heightPercent = (day.views / maxViews) * 100;
                
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1">
                    <div 
                      className="w-full bg-[#220101]/20 rounded-t transition-all hover:bg-[#220101]/40"
                      style={{ height: `${Math.max(heightPercent, 5)}%` }}
                      title={`${day.views} vues, ${day.clicks} clics`}
                    />
                    <span className="text-[10px] text-gray-400 -rotate-45 origin-left">
                      {new Date(day.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
            
            <div className="flex items-center gap-6 mt-4 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#220101]/30 rounded" />
                <span className="text-sm text-gray-500">Vues</span>
              </div>
            </div>
          </div>
        )}
          </>
        )}

        {/* ====================================== */}
        {/* PRESS KITS TAB */}
        {/* ====================================== */}
        {activeTab === "presskits" && presskitStats && (
          <>
            {/* Période */}
            <div className="flex gap-2 mb-8">
              {[
                { value: "24h", label: "24h" },
                { value: "7d", label: "7 jours" },
                { value: "30d", label: "30 jours" },
                { value: "all", label: "Tout" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    period === p.value
                      ? "bg-[#220101] text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Aide / Légende */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 mb-6 border border-blue-100">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💡</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2">Comment lire ces statistiques ?</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">👁️ Vues :</span>
                      <span className="text-gray-700">Nombre total de fois que le press kit a été ouvert</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">🏢 Uniques :</span>
                      <span className="text-gray-700">Nombre de marques différentes qui ont consulté</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold">⏱️ Temps :</span>
                      <span className="text-gray-700">Durée moyenne de consultation (plus c'est long, mieux c'est)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-purple-600 font-bold">📊 Scroll :</span>
                      <span className="text-gray-700">% de la page consultée (&gt;80% = excellent engagement)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">🔥 CTA :</span>
                      <span className="text-gray-700">% de visiteurs qui ont cliqué sur "Contactez-nous"</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">🎯 Talents :</span>
                      <span className="text-gray-700">Nombre de profils de créateurs consultés</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Vue d'ensemble */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Vue d'ensemble</h2>
              <p className="text-sm text-gray-600 mb-6">
                Performance globale de vos press kits personnalisés envoyés aux marques
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Engagement */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">📖 Engagement global</span>
                    <span className="text-sm font-bold text-gray-900">{presskitStats.avgScrollDepth}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${presskitStats.avgScrollDepth}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {presskitStats.avgScrollDepth >= 80 
                      ? "🔥 Excellent ! Les marques consultent tout le contenu" 
                      : presskitStats.avgScrollDepth >= 50
                      ? "✅ Bon engagement, les marques scrollent en moyenne jusqu'à la moitié"
                      : "⚠️ Engagement faible, optimisez le contenu du haut"}
                  </p>
                </div>

                {/* Taux de visite */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">🎯 Taux de visite</span>
                    <span className="text-sm font-bold text-gray-900">
                      {presskitStats.uniqueVisitors > 0 
                        ? Math.round((presskitStats.totalViews / presskitStats.uniqueVisitors) * 100) / 100
                        : 0}x
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-gray-600 mb-1">Visites totales</div>
                      <div className="text-2xl font-bold text-blue-600">{presskitStats.totalViews}</div>
                    </div>
                    <div className="text-2xl text-gray-300">→</div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-600 mb-1">Marques uniques</div>
                      <div className="text-2xl font-bold text-emerald-600">{presskitStats.uniqueVisitors}</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {presskitStats.totalViews > presskitStats.uniqueVisitors 
                      ? "✨ Certaines marques reviennent consulter plusieurs fois !" 
                      : "📌 Chaque marque consulte une seule fois"}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Cards Press Kits */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 shadow-lg text-white group hover:scale-105 transition-transform">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                      👁️
                    </div>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Total</span>
                  </div>
                  <p className="text-4xl font-bold mb-1">{presskitStats.totalViews}</p>
                  <p className="text-sm text-white/90 font-medium mb-2">Press Kits ouverts</p>
                  <p className="text-xs text-white/70">
                    Nombre total de consultations de vos press kits personnalisés
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 shadow-lg text-white group hover:scale-105 transition-transform">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                      🏢
                    </div>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Unique</span>
                  </div>
                  <p className="text-4xl font-bold mb-1">{presskitStats.uniqueVisitors}</p>
                  <p className="text-sm text-white/90 font-medium mb-2">Marques uniques</p>
                  <p className="text-xs text-white/70">
                    Nombre de marques différentes ayant consulté leurs press kits
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 shadow-lg text-white group hover:scale-105 transition-transform">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                      ⏱️
                    </div>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Moyenne</span>
                  </div>
                  <p className="text-4xl font-bold mb-1">
                    {Math.floor(presskitStats.avgDuration / 60)}<span className="text-2xl">m</span>
                    <span className="text-2xl">{presskitStats.avgDuration % 60}s</span>
                  </p>
                  <p className="text-sm text-white/90 font-medium mb-2">Temps de consultation</p>
                  <p className="text-xs text-white/70">
                    Durée moyenne passée sur chaque press kit
                    {presskitStats.avgDuration >= 120 ? " 🔥 Excellent !" : presskitStats.avgDuration >= 60 ? " ✅" : " ⚠️"}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 shadow-lg text-white group hover:scale-105 transition-transform">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                      📊
                    </div>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Scroll</span>
                  </div>
                  <p className="text-4xl font-bold mb-1">{presskitStats.avgScrollDepth}<span className="text-2xl">%</span></p>
                  <p className="text-sm text-white/90 font-medium mb-2">Profondeur de scroll</p>
                  <p className="text-xs text-white/70">
                    % du contenu consulté en moyenne
                    {presskitStats.avgScrollDepth >= 80 ? " 🔥" : presskitStats.avgScrollDepth >= 50 ? " ✅" : " ⚠️"}
                  </p>
                </div>
              </div>
            </div>

            {/* Top Marques */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">🏆 Top Marques</h2>
                  <p className="text-sm text-gray-500 mt-1">Classement des marques par engagement</p>
                </div>
                <div className="text-xs text-gray-400">
                  {presskitStats.topBrands.length} marque{presskitStats.topBrands.length > 1 ? 's' : ''}
                </div>
              </div>
              
              {presskitStats.topBrands.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-gray-500">Aucun press kit consulté pour cette période</p>
                  <p className="text-sm text-gray-400 mt-2">Envoyez des press kits aux marques pour voir les stats ici</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {presskitStats.topBrands.map((brand, index) => {
                    const maxViews = Math.max(...presskitStats.topBrands.map(b => b.views));
                    const viewsPercent = (brand.views / maxViews) * 100;
                    
                    const isExpanded = expandedBrand === brand.brandId;
                    
                    return (
                      <div 
                        key={brand.brandId} 
                        className={`group bg-gradient-to-r rounded-xl transition-all border ${
                          isExpanded 
                            ? 'from-blue-50 to-blue-50/50 border-blue-300 shadow-lg' 
                            : 'from-gray-50 to-white hover:from-blue-50 hover:to-blue-50/30 border-gray-100 hover:border-blue-200 hover:shadow-md'
                        }`}
                      >
                        {/* Header */}
                        <div className="p-4">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white rounded-lg shadow-sm">
                            {index === 0 && <span className="text-2xl">🥇</span>}
                            {index === 1 && <span className="text-2xl">🥈</span>}
                            {index === 2 && <span className="text-2xl">🥉</span>}
                            {index > 2 && <span className="text-lg text-gray-400 font-bold">{index + 1}</span>}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 text-lg truncate">{brand.brandName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-400">📅 Dernière ouverture :</span>
                              <span className="text-xs font-medium text-blue-600">{formatTimeAgo(brand.lastVisit)}</span>
                              <span className="text-xs text-gray-300">•</span>
                              <span className="text-xs text-gray-500">
                                {new Date(brand.lastVisit).toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                          
                          <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                            brand.conversionRate > 0 
                              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg' 
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {brand.conversionRate > 0 ? '🔥' : '📭'} {brand.conversionRate}% CTA
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">👁️</span>
                              <span className="text-xs text-gray-500">Vues</span>
                            </div>
                            <p className="text-xl font-bold text-gray-900">{brand.views}</p>
                          </div>
                          
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">⏱️</span>
                              <span className="text-xs text-gray-500">Temps</span>
                            </div>
                            <p className="text-xl font-bold text-gray-900">
                              {Math.floor(brand.avgDuration / 60)}<span className="text-sm">m</span>
                              {brand.avgDuration % 60}<span className="text-sm">s</span>
                            </p>
                          </div>
                          
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">🎯</span>
                              <span className="text-xs text-gray-500">Talents</span>
                            </div>
                            <p className="text-xl font-bold text-gray-900">{brand.talentsViewedCount}</p>
                          </div>
                        </div>

                        {/* Barre de progression engagement */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-600">Engagement relatif</span>
                              <span className="text-xs font-bold text-blue-600">{Math.round(viewsPercent)}%</span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700"
                                style={{ width: `${viewsPercent}%` }}
                              />
                            </div>
                          </div>
                          
                          {/* Bouton Voir détails */}
                          <button
                            onClick={() => setExpandedBrand(isExpanded ? null : brand.brandId)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              isExpanded
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-white text-blue-600 hover:bg-blue-50 border border-blue-200'
                            }`}
                          >
                            {isExpanded ? '🔼 Masquer' : '🔽 Détails'}
                          </button>
                        </div>
                        </div>

                        {/* Section détails (visible si étendu) */}
                        {isExpanded && (
                          <div className="border-t border-blue-200 bg-white/50 p-4 space-y-4">
                            {/* Talents consultés avec durées */}
                            <div>
                              <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                🎯 Temps passé par talent ({brand.talentsViewed.length})
                              </h4>
                              {brand.talentsViewed.length > 0 ? (
                                <div className="space-y-2">
                                  {brand.talentsViewed
                                    .sort((a, b) => b.duration - a.duration) // Trier par durée décroissante
                                    .map((talent, idx) => {
                                      const maxDuration = Math.max(...brand.talentsViewed.map(t => t.duration));
                                      const durationPercent = maxDuration > 0 ? (talent.duration / maxDuration) * 100 : 0;
                                      
                                      return (
                                        <div 
                                          key={talent.id} 
                                          className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-all"
                                        >
                                          <div className="flex items-center gap-3 mb-2">
                                            {/* Rang */}
                                            <div className="w-6 h-6 flex items-center justify-center">
                                              {idx === 0 && <span className="text-lg">🥇</span>}
                                              {idx === 1 && <span className="text-lg">🥈</span>}
                                              {idx === 2 && <span className="text-lg">🥉</span>}
                                              {idx > 2 && <span className="text-xs text-gray-400 font-bold">{idx + 1}</span>}
                                            </div>
                                            
                                            {/* Photo */}
                                            {talent.photo ? (
                                              <img 
                                                src={talent.photo} 
                                                alt={talent.name}
                                                className="w-10 h-10 rounded-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                                {talent.name.split(' ').map(n => n[0]).join('')}
                                              </div>
                                            )}
                                            
                                            {/* Nom */}
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-bold text-gray-900 truncate">{talent.name}</p>
                                            </div>
                                            
                                            {/* Durée */}
                                            <div className="text-right">
                                              <p className="text-lg font-bold text-blue-600">
                                                {Math.floor(talent.duration / 60)}<span className="text-xs">m</span>
                                                {talent.duration % 60}<span className="text-xs">s</span>
                                              </p>
                                              <p className="text-xs text-gray-500">
                                                {talent.duration === 0 ? "Pas de modal" : "Temps consulté"}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          {/* Barre de progression */}
                                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div 
                                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700"
                                              style={{ width: `${durationPercent}%` }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 italic">Aucun talent consulté</p>
                              )}
                            </div>

                            {/* Historique des visites */}
                            <div>
                              <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                📅 Historique des visites ({brand.visits.length})
                              </h4>
                              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {brand.visits.map((visit, idx) => (
                                  <div 
                                    key={idx}
                                    className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-all"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-blue-600">
                                          Visite #{brand.visits.length - idx}
                                        </span>
                                        <span className="text-xs text-gray-400">•</span>
                                        <span className="text-xs text-gray-600">
                                          {new Date(visit.date).toLocaleDateString('fr-FR', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                          })}
                                        </span>
                                      </div>
                                      <span className="text-xs font-bold text-gray-700">
                                        {new Date(visit.date).toLocaleTimeString('fr-FR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500">⏱️</span>
                                        <span className="text-xs font-medium text-gray-700">
                                          {Math.floor(visit.duration / 60)}m{visit.duration % 60}s
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500">📊</span>
                                        <span className="text-xs font-medium text-gray-700">
                                          {visit.scrollDepth}% scroll
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500">🎯</span>
                                        <span className="text-xs font-medium text-gray-700">
                                          {visit.talentsViewed.length} talents
                                        </span>
                                      </div>
                                    </div>

                                    {visit.talentsViewed.length > 0 && (
                                      <div className="bg-gray-50 rounded p-2 space-y-1">
                                        <p className="text-xs font-medium text-gray-700 mb-1">Temps par talent :</p>
                                        {visit.talentsViewed.map((talentName, tidx) => {
                                          const talentId = Object.keys(visit.talentDurations)[tidx];
                                          const duration = talentId ? visit.talentDurations[talentId] : 0;
                                          
                                          return (
                                            <div key={tidx} className="flex items-center justify-between text-xs">
                                              <span className="text-gray-600 truncate flex-1">{talentName}</span>
                                              <span className="text-gray-900 font-medium ml-2">
                                                {duration > 0 
                                                  ? `${Math.floor(duration / 60)}m${duration % 60}s` 
                                                  : "—"}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    <div className="flex items-center gap-2 mt-2">
                                      {visit.ctaClicked && (
                                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                          ✅ CTA cliqué
                                        </span>
                                      )}
                                      {visit.talentbookClicked && (
                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                          📚 Talent Book consulté
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
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

            {/* ===================================
                TOUS LES PRESS KITS ENVOYÉS
                =================================== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">📋 Tous les Press Kits Envoyés</h3>
                
                {/* Filtres et tri */}
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  {/* Filtre par statut */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">Statut :</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFilterStatus("all")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          filterStatus === "all"
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Tous ({presskitStats.allBrands.length})
                      </button>
                      <button
                        onClick={() => setFilterStatus("opened")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          filterStatus === "opened"
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Ouverts ({presskitStats.allBrands.filter(b => b.hasBeenOpened).length})
                      </button>
                      <button
                        onClick={() => setFilterStatus("pending")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          filterStatus === "pending"
                            ? 'bg-gray-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        En attente ({presskitStats.allBrands.filter(b => !b.hasBeenOpened).length})
                      </button>
                    </div>
                  </div>

                  {/* Tri */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">Trier par :</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:border-blue-300 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="recent">📅 Plus récent</option>
                      <option value="views">👁️ Plus de vues</option>
                      <option value="duration">⏱️ Plus engageant</option>
                      <option value="cta">🔥 Meilleur CTA</option>
                      <option value="name">🔤 Nom (A-Z)</option>
                    </select>
                  </div>
                </div>
              </div>

              {(() => {
                // Appliquer les filtres
                let filtered = presskitStats.allBrands;
                
                if (filterStatus === "opened") {
                  filtered = filtered.filter(b => b.hasBeenOpened);
                } else if (filterStatus === "pending") {
                  filtered = filtered.filter(b => !b.hasBeenOpened);
                }

                // Appliquer le tri
                const sorted = [...filtered].sort((a, b) => {
                  switch (sortBy) {
                    case "recent":
                      // Les ouverts : trier par lastVisit, les non-ouverts : par createdAt
                      if (a.hasBeenOpened && b.hasBeenOpened && a.lastVisit && b.lastVisit) {
                        return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
                      }
                      if (!a.hasBeenOpened && !b.hasBeenOpened) {
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                      }
                      return a.hasBeenOpened ? -1 : 1; // Ouverts en premier
                    
                    case "views":
                      return b.views - a.views;
                    
                    case "duration":
                      return b.avgDuration - a.avgDuration;
                    
                    case "cta":
                      return b.conversionRate - a.conversionRate;
                    
                    case "name":
                      return a.brandName.localeCompare(b.brandName);
                    
                    default:
                      return 0;
                  }
                });

                return sorted.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-400 text-lg">
                      {filterStatus === "opened" && "📭 Aucun press kit ouvert"}
                      {filterStatus === "pending" && "🎉 Tous les press kits ont été ouverts !"}
                      {filterStatus === "all" && "📭 Aucun press kit envoyé"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sorted.map((brand) => (
                    <div 
                      key={brand.brandId}
                      className={`group border rounded-lg p-4 transition-all ${
                        brand.hasBeenOpened
                          ? 'bg-gradient-to-r from-green-50 to-emerald-50/30 border-green-200 hover:border-green-300'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Statut */}
                        <div className="flex-shrink-0">
                          {brand.hasBeenOpened ? (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-2xl shadow-lg">
                              ✅
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-2xl">
                              ⏳
                            </div>
                          )}
                        </div>

                        {/* Info marque */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-bold text-gray-900 truncate">{brand.brandName}</h4>
                            {brand.hasBeenOpened && (
                              <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-bold rounded-full">
                                {brand.views} vue{brand.views > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          
                          {/* Lien press kit */}
                          <div className="flex items-center gap-2">
                            <a 
                              href={brand.pressKitUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium truncate"
                            >
                              {brand.pressKitUrl}
                            </a>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(brand.pressKitUrl);
                                alert('Lien copié !');
                              }}
                              className="flex-shrink-0 p-1.5 rounded-lg bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-all"
                              title="Copier le lien"
                            >
                              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>

                          {/* Stats si ouvert */}
                          {brand.hasBeenOpened && brand.lastVisit && (
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <span>⏱️</span>
                                {Math.floor(brand.avgDuration / 60)}m{brand.avgDuration % 60}s
                              </span>
                              <span className="text-gray-300">•</span>
                              <span className="flex items-center gap-1">
                                <span>📅</span>
                                {formatTimeAgo(brand.lastVisit)}
                              </span>
                              {brand.conversionRate > 0 && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span className="flex items-center gap-1 font-medium text-emerald-600">
                                    <span>🔥</span>
                                    {brand.conversionRate}% CTA
                                  </span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Pas encore ouvert */}
                          {!brand.hasBeenOpened && (
                            <p className="text-xs text-gray-500 italic mt-2">
                              En attente d'ouverture • Créé le {new Date(brand.createdAt).toLocaleDateString('fr-FR')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}