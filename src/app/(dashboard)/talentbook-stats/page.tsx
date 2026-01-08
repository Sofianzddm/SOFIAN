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
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7d");

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
          <h1 className="text-2xl font-bold mb-2">📊 Stats Talentbook</h1>
          <p className="text-white/60">Suivez l'activité sur votre Talentbook</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
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
      </div>
    </div>
  );
}