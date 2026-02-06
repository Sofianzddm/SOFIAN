"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Handshake,
  FileText,
  Euro,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Sparkles,
  Loader2,
} from "lucide-react";

export default function TalentDashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch("/api/talents/me/dashboard");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-glowup-rose via-pink-500 to-purple-600 rounded-2xl p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-white/80 text-sm">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <h1 className="text-3xl font-bold">
            Salut {session?.user?.name?.split(" ")[0]} ! 👋
          </h1>
          <p className="text-white/80 mt-2">Bienvenue sur ton espace talent Glow Up</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Handshake className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{data?.stats?.totalCollabs || 0}</p>
          <p className="text-sm text-gray-500">Collaborations totales</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-glowup-licorice">{data?.stats?.enCours || 0}</p>
          <p className="text-sm text-gray-500">En cours</p>
        </div>
      </div>

      {/* Collaborations en cours */}
      {data?.collabsEnCours && data.collabsEnCours.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-glowup-licorice mb-4">
            📸 Collaborations en cours
          </h2>
          <div className="space-y-3">
            {data.collabsEnCours.map((collab: any) => (
              <Link
                key={collab.id}
                href={`/talent/collaborations/${collab.id}`}
                className="block p-4 border border-gray-200 rounded-xl hover:border-glowup-rose hover:bg-pink-50/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{collab.marque}</p>
                    <p className="text-sm text-gray-500">{collab.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      }).format(collab.montant)}
                    </p>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {collab.statut}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Factures en attente */}
      {data?.facturesAttente && data.facturesAttente.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-bold text-gray-900">
              ⚠️ {data.facturesAttente.length} facture(s) en attente
            </h2>
          </div>
          <p className="text-sm text-gray-700 mb-4">
            Ces collaborations sont publiées et attendent que tu envoies ta facture
          </p>
          <div className="space-y-2">
            {data.facturesAttente.map((collab: any) => (
              <Link
                key={collab.id}
                href={`/talent/collaborations/${collab.id}`}
                className="block p-3 bg-white rounded-lg hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{collab.marque}</p>
                    <p className="text-xs text-gray-500">{collab.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-600">
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      }).format(collab.montant)}
                    </p>
                    <button className="text-xs text-glowup-rose hover:underline font-medium">
                      Envoyer ma facture →
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/talent/collaborations"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-glowup-rose hover:shadow-lg transition-all group"
        >
          <Handshake className="w-8 h-8 text-glowup-rose mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-gray-900 mb-1">Mes Collaborations</h3>
          <p className="text-sm text-gray-500">Voir toutes mes collaborations</p>
        </Link>

        <Link
          href="/talent/factures"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-glowup-rose hover:shadow-lg transition-all group"
        >
          <FileText className="w-8 h-8 text-glowup-rose mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-gray-900 mb-1">Mes Factures</h3>
          <p className="text-sm text-gray-500">Consulter mes paiements</p>
        </Link>

        <Link
          href="/talent/profil"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-glowup-rose hover:shadow-lg transition-all group"
        >
          <TrendingUp className="w-8 h-8 text-glowup-rose mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-gray-900 mb-1">Mon Profil</h3>
          <p className="text-sm text-gray-500">Voir mes statistiques</p>
        </Link>
      </div>
    </div>
  );
}
