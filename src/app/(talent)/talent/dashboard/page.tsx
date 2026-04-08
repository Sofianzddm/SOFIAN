"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Sparkles,
  Loader2,
  Handshake,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Clock3,
  Receipt,
} from "lucide-react";

export default function TalentDashboardPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const [data, setData] = useState<any>(null);
  const [isDemoFallback, setIsDemoFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [isDemo]);

  async function fetchData() {
    setLoading(true);
    try {
      if (isDemo) {
        const demoRes = await fetch("/api/talents/me/dashboard?demo=1");
        if (demoRes.ok) {
          setData(await demoRes.json());
          setIsDemoFallback(true);
        }
        return;
      }

      const realRes = await fetch("/api/talents/me/dashboard");
      if (realRes.ok) {
        const realData = await realRes.json();
        const hasRealContent =
          (Array.isArray(realData?.facturesAttente) && realData.facturesAttente.length > 0) ||
          (Array.isArray(realData?.collabsEnCours) && realData.collabsEnCours.length > 0);

        if (hasRealContent) {
          setData(realData);
          setIsDemoFallback(false);
          return;
        }
      }

      const demoRes = await fetch("/api/talents/me/dashboard?demo=1");
      if (demoRes.ok) {
        setData(await demoRes.json());
        setIsDemoFallback(true);
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

  const totalCollabs = data?.stats?.totalCollabs ?? data?.collabsEnCours?.length ?? 0;
  const facturesAttenteCount = data?.facturesAttente?.length ?? 0;
  const facturesEnvoyeesCount = Math.max(
    0,
    (data?.collabsEnCours?.length ?? 0) - facturesAttenteCount
  );
  const progression = totalCollabs > 0 ? Math.round((facturesEnvoyeesCount / totalCollabs) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="rounded-3xl bg-[#220101] p-8 text-white shadow-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-[#F5EDE0] text-sm">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
            <h1 className="text-3xl font-bold">
              Salut {session?.user?.name?.split(" ")[0]} ! 👋
            </h1>
            <p className="mt-2 text-[#F5EDE0]">
              Ton cockpit talent pour suivre tes collaborations publiées et l'avancement des factures.
            </p>
            {(isDemo || isDemoFallback) && (
              <p className="mt-4 inline-flex rounded-full bg-[#F5EDE0]/20 px-3 py-1 text-xs font-semibold text-[#F5EDE0]">
                Mode démo actif
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[#B06F70] bg-[#2b0b0c] p-4">
            <p className="text-xs uppercase tracking-wide text-[#F5EDE0]">Progression facturation</p>
            <p className="mt-2 text-3xl font-bold">{progression}%</p>
            <div className="mt-3 h-2 w-full rounded-full bg-[#F5EDE0]/30">
              <div
                className="h-2 rounded-full bg-[#E5F2B5]"
                style={{ width: `${progression}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-[#F5EDE0]">
              {facturesEnvoyeesCount}/{totalCollabs} collaborations avec facture envoyée
            </p>
          </div>
        </div>
      </div>

      {/* Grille KPI */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 inline-flex rounded-xl bg-[#F5EDE0] p-2.5">
            <Handshake className="h-5 w-5 text-[#220101]" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalCollabs}</p>
          <p className="text-sm text-slate-500">Collaborations publiées</p>
          <p className="mt-2 text-xs text-slate-400">Base de travail du mois en cours</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 inline-flex rounded-xl bg-[#F5EDE0] p-2.5">
            <AlertTriangle className="h-5 w-5 text-[#B06F70]" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{facturesAttenteCount}</p>
          <p className="text-sm text-slate-500">Factures en attente</p>
          <p className="mt-2 text-xs text-slate-400">Priorité pour déclencher le paiement</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 inline-flex rounded-xl bg-[#E5F2B5] p-2.5">
            <CheckCircle2 className="h-5 w-5 text-[#220101]" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{facturesEnvoyeesCount}</p>
          <p className="text-sm text-slate-500">Factures envoyées</p>
          <p className="mt-2 text-xs text-slate-400">Suivies par l'équipe finance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Factures en attente */}
        <div className="xl:col-span-2 rounded-2xl border border-[#B06F70]/25 bg-gradient-to-br from-[#F5EDE0] to-[#f0e4d5] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-[#220101]" />
              <h2 className="text-lg font-bold text-[#220101]">Actions prioritaires</h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#220101]">
              {facturesAttenteCount} en attente
            </span>
          </div>
          {data?.facturesAttente && data.facturesAttente.length > 0 ? (
            <div className="space-y-2">
              {data.facturesAttente.map((collab: any) => (
                <Link
                  key={collab.id}
                  href={isDemo || isDemoFallback ? "/talent/collaborations?demo=1" : `/talent/collaborations/${collab.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{collab.marque}</p>
                      <p className="text-xs text-gray-500">{collab.reference}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-800">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        }).format(collab.montant)}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs text-[#220101] font-medium">
                        Envoyer ma facture
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              Tout est à jour: aucune facture en attente.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#220101]" />
            <h2 className="text-lg font-semibold text-[#220101]">Vue rapide</h2>
          </div>
          <div className="space-y-3">
            <Link
              href={isDemo || isDemoFallback ? "/talent/collaborations?demo=1" : "/talent/collaborations"}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[#F5EDE0] p-2">
                  <Handshake className="h-4 w-4 text-[#220101]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Collaborations publiées</p>
                  <p className="text-xs text-slate-500">{totalCollabs} collaboration(s)</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
            <Link
              href={isDemo || isDemoFallback ? "/talent/factures?demo=1" : "/talent/factures"}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[#E5F2B5] p-2">
                  <Receipt className="h-4 w-4 text-[#220101]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Mes factures</p>
                  <p className="text-xs text-slate-500">{facturesEnvoyeesCount} envoyée(s)</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bloc collaborations récentes */}
      {Array.isArray(data?.collabsEnCours) && data.collabsEnCours.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Collaborations récentes</h2>
            <Link
              href={isDemo || isDemoFallback ? "/talent/collaborations?demo=1" : "/talent/collaborations"}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#220101] hover:underline"
            >
              Voir tout
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.collabsEnCours.slice(0, 4).map((collab: any) => (
              <div key={collab.id} className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition">
                <p className="font-semibold text-slate-900">{collab.marque}</p>
                <p className="text-xs text-slate-500">{collab.reference}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex rounded-full bg-[#F5EDE0] px-2.5 py-1 text-xs text-[#220101]">
                    {collab.statut}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(collab.montant)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!data?.facturesAttente || data.facturesAttente.length === 0) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">
            Aucune facture en attente pour le moment. Tu peux consulter uniquement tes
            collaborations publiées ici :
          </p>
          <Link
            href={isDemo || isDemoFallback ? "/talent/collaborations?demo=1" : "/talent/collaborations"}
            className="inline-flex mt-3 text-sm font-medium text-[#220101] hover:underline"
          >
            Voir mes collaborations publiées
          </Link>
        </div>
      )}
    </div>
  );
}
