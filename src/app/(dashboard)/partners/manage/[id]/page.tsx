"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Copy, Eye, Loader2, Building2 } from "lucide-react";

interface PartnerStats {
  period: string;
  totalViews: number;
  uniqueVisitors: number;
  talentClicks: number;
  ctaClicks: number;
  lastVisit: string | null;
  avgDurationSeconds: number | null;
}

interface TopTalent {
  talentId: string | null;
  talentName: string | null;
  clicks: number;
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<any>(null);
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [topTalents, setTopTalents] = useState<TopTalent[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [period, setPeriod] = useState("7d");

  useEffect(() => {
    if (params.id) {
      fetchData();
    }
  }, [params.id, period]);

  async function fetchData() {
    try {
      const res = await fetch(`/api/partners/${params.id}?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setPartner(data.partner);
        setStats(data.stats);
        setTopTalents(data.topTalents || []);
        setRecentActivity(data.recentActivity || []);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!partner) return;
    const url = `${window.location.origin}/partners/${partner.slug}`;
    navigator.clipboard.writeText(url);
    alert("Lien copié !");
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Jamais";
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="p-8">
        <p className="text-red-600">Partenaire introuvable</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link href="/partners" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour à la liste
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {partner.logo ? (
            <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 p-1">
              <img src={partner.logo} alt={partner.name} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Building2 className="w-10 h-10 text-gray-400" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold">{partner.name}</h1>
            <p className="text-gray-600">/{partner.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            <Copy className="w-4 h-4" />
            Copier le lien
          </button>
          <Link
            href={`/partners/manage/${partner.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Pencil className="w-4 h-4" />
            Éditer
          </Link>
        </div>
      </div>

      {/* Période */}
      <div className="flex gap-2 mb-6">
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
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats.totalViews}</p>
                <p className="text-sm text-gray-500">Vues (entrées site)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">⏱</span>
              </div>
              <div>
                <p className="text-3xl font-bold">
                  {stats.avgDurationSeconds != null
                    ? (() => {
                        const m = Math.floor(stats.avgDurationSeconds / 60);
                        const s = stats.avgDurationSeconds % 60;
                        return s > 0 ? `${m} min ${s} s` : `${m} min`;
                      })()
                    : "—"}
                </p>
                <p className="text-sm text-gray-500">Temps moyen sur le site</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">👥</span>
              </div>
              <div>
                <p className="text-3xl font-bold">{stats.uniqueVisitors}</p>
                <p className="text-sm text-gray-500">Visiteurs uniques</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">👆</span>
              </div>
              <div>
                <p className="text-3xl font-bold">{stats.talentClicks}</p>
                <p className="text-sm text-gray-500">Clics sur talents</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🔥</span>
              </div>
              <div>
                <p className="text-3xl font-bold">{stats.ctaClicks}</p>
                <p className="text-sm text-gray-500">Clics CTA</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top talents */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-6">🔥 Top talents consultés</h2>
          {topTalents.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucune donnée</p>
          ) : (
            <div className="space-y-4">
              {topTalents.map((talent, index) => (
                <div key={talent.talentId || index} className="flex items-center gap-4">
                  <div className="w-8 h-8 flex items-center justify-center">
                    {index === 0 && <span className="text-2xl">🥇</span>}
                    {index === 1 && <span className="text-2xl">🥈</span>}
                    {index === 2 && <span className="text-2xl">🥉</span>}
                    {index > 2 && <span className="text-lg text-gray-400">{index + 1}</span>}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{talent.talentName || "Inconnu"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{talent.clicks}</p>
                    <p className="text-xs text-gray-500">clics</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activité récente */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-6">⚡ Activité récente</h2>
          {recentActivity.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucune activité</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {recentActivity.map((event) => (
                <div key={event.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-xl">
                    {event.action === "view" && "👁️"}
                    {event.action === "talent_click" && "👆"}
                    {event.action === "cta_click" && "🔥"}
                    {event.action === "session_end" && "⏱"}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {event.action}
                      </span>
                      {event.talentName && (
                        <span className="text-sm font-medium">{event.talentName}</span>
                      )}
                      {event.action === "session_end" && event.duration != null && (
                        <span className="text-xs text-gray-500">
                          {event.duration >= 60
                            ? `${Math.floor(event.duration / 60)} min ${event.duration % 60} s`
                            : `${event.duration} s`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
