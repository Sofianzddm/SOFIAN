"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Sparkles,
  Loader2,
} from "lucide-react";

export default function TalentDashboardPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [isDemo]);

  async function fetchData() {
    try {
      const url = isDemo ? "/api/talents/me/dashboard?demo=1" : "/api/talents/me/dashboard";
      const res = await fetch(url);
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
          {isDemo && (
            <p className="mt-3 inline-flex rounded-md bg-white/20 px-2.5 py-1 text-xs font-medium">
              Version démo
            </p>
          )}
        </div>
      </div>

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
                href={isDemo ? "/talent/collaborations?demo=1" : `/talent/collaborations/${collab.id}`}
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

      {(!data?.facturesAttente || data.facturesAttente.length === 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-600">
            Aucune facture en attente pour le moment. Tu peux consulter uniquement tes
            collaborations publiées ici :
          </p>
          <Link
            href={isDemo ? "/talent/collaborations?demo=1" : "/talent/collaborations"}
            className="inline-flex mt-3 text-sm font-medium text-glowup-rose hover:underline"
          >
            Voir mes collaborations publiées
          </Link>
        </div>
      )}
    </div>
  );
}
