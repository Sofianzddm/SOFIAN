"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Copy,
  Eye,
  Loader2,
  Building2,
  Users,
  Mail,
  MousePointerClick,
  Reply,
  Crown,
} from "lucide-react";

interface AgencyContact {
  id: string;
  prenom: string;
  nom: string | null;
  email: string;
  poste: string | null;
  language: string;
  principal: boolean;
  excluded: boolean;
  createdAt: string;
  inProspection: boolean;
  status: "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED" | null;
  cycleCount: number;
  lastSentAt: string | null;
  lastRepliedAt: string | null;
  nextRecontactAt: string | null;
  openCount: number;
  clickCount: number;
  replied: boolean;
  relanceSent: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  TO_CONTACT: { label: "À contacter", className: "bg-gray-100 text-gray-700" },
  WAITING: { label: "En attente", className: "bg-blue-100 text-blue-700" },
  TO_RECONTACT: { label: "À recontacter", className: "bg-amber-100 text-amber-700" },
  STOPPED: { label: "Stoppé", className: "bg-red-100 text-red-700" },
};

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

      {/* Fiche client : contacts de l'agence (Prospection Agences) */}
      <div className="bg-white rounded-lg border p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            Contacts de l'agence
            <span className="text-sm font-normal text-gray-400">
              ({(partner.agencyContacts || []).length})
            </span>
          </h2>
          <Link
            href="/agency-outreach"
            className="text-sm text-blue-600 hover:underline"
          >
            Gérer la prospection →
          </Link>
        </div>

        {(partner.agencyContacts || []).length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500 mb-2">Aucun contact pour cette agence.</p>
            <p className="text-sm text-gray-400">
              Ajoute des contacts ou importe un Excel depuis la{" "}
              <Link href="/agency-outreach" className="text-blue-600 hover:underline">
                Prospection Agences
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4 font-medium">Contact</th>
                  <th className="py-2 pr-4 font-medium">Poste</th>
                  <th className="py-2 pr-4 font-medium">Langue</th>
                  <th className="py-2 pr-4 font-medium">Statut</th>
                  <th className="py-2 pr-4 font-medium">Engagement</th>
                  <th className="py-2 pr-4 font-medium">Dernier envoi</th>
                </tr>
              </thead>
              <tbody>
                {(partner.agencyContacts as AgencyContact[]).map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b last:border-0 ${c.excluded ? "opacity-50" : ""}`}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {c.prenom} {c.nom || ""}
                        </span>
                        {c.principal && (
                          <span
                            title="Contact principal"
                            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700"
                          >
                            <Crown className="w-3 h-3" /> Principal
                          </span>
                        )}
                        {c.excluded && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            Exclu
                          </span>
                        )}
                      </div>
                      <a
                        href={`mailto:${c.email}`}
                        className="text-xs text-gray-500 hover:text-blue-600"
                      >
                        {c.email}
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{c.poste || "—"}</td>
                    <td className="py-3 pr-4 text-gray-600 uppercase">{c.language}</td>
                    <td className="py-3 pr-4">
                      {c.inProspection && c.status ? (
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                            STATUS_LABELS[c.status]?.className || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {STATUS_LABELS[c.status]?.label || c.status}
                          {c.cycleCount > 0 ? ` · ${c.cycleCount} cycle(s)` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Hors prospection</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {c.inProspection ? (
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-1" title="Ouvertures">
                            <Eye className="w-3.5 h-3.5" /> {c.openCount}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Clics">
                            <MousePointerClick className="w-3.5 h-3.5" /> {c.clickCount}
                          </span>
                          {c.replied && (
                            <span
                              className="inline-flex items-center gap-1 text-green-600"
                              title="A répondu"
                            >
                              <Reply className="w-3.5 h-3.5" /> Répondu
                            </span>
                          )}
                          {c.relanceSent && (
                            <span
                              className="inline-flex items-center gap-1 text-amber-600"
                              title="Relance envoyée"
                            >
                              <Mail className="w-3.5 h-3.5" /> Relancé
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {formatDate(c.lastSentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
