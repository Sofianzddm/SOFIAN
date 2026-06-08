"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  TrendingUp,
  Receipt,
  Landmark,
  AlertTriangle,
  Percent,
  Banknote,
  FileDown,
  FileText,
  ArrowRight,
  ShieldCheck,
  AlertOctagon,
  BookOpen,
  Scale,
  Coins,
} from "lucide-react";
import {
  usePeriode,
  PeriodeBar,
  formatEUR,
} from "@/components/comptable/periode";

interface TvaRow {
  taux: number;
  regime: string;
  baseHT: number;
  montantTVA: number;
  nbPieces: number;
}

interface Summary {
  caHT: number;
  tvaCollectee: number;
  caTTC: number;
  totalAvoirsHT: number;
  nbFactures: number;
  nbAvoirs: number;
  encaissementsBanque: number;
  encaissementsRapproches: number;
  encaissementsNonRapproches: number;
  creancesClients: number;
  creancesEnRetard: number;
  nbEcritures: number;
  tvaParTaux: TvaRow[];
  tvaExigibleEncaissement: number;
  encaissementsNonLettres: number;
  nbAnomalies: number;
  nbAnomaliesBloquantes: number;
}

export default function ComptableDashboard() {
  const [periode, setPeriode] = usePeriode();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comptable/summary?dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`
      );
      const json = await res.json();
      if (json.success) setSummary(json.summary);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [periode.dateDebut, periode.dateFin]);

  useEffect(() => {
    load();
  }, [load]);

  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">
            Tableau de bord comptable
          </h1>
          <p className="text-sm text-gray-500">
            Synthèse des écritures, TVA et créances · {periode.label}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/comptable/export?type=fec&${qs}`}
            className="inline-flex items-center gap-2 rounded-lg border border-glowup-rose px-4 py-2 text-sm font-medium text-glowup-rose transition-colors hover:bg-glowup-lace"
          >
            <FileText className="h-4 w-4" />
            Export FEC
          </a>
          <a
            href={`/api/comptable/export?type=liasse&${qs}`}
            className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-glowup-rose/90"
          >
            <FileDown className="h-4 w-4" />
            Liasse complète
          </a>
        </div>
      </div>

      <PeriodeBar periode={periode} onChange={setPeriode} />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
        </div>
      ) : !summary ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          Aucune donnée disponible pour cette période.
        </div>
      ) : (
        <>
          {summary.nbAnomalies > 0 && (
            <Link
              href="/comptable/controles"
              className={`flex items-center justify-between rounded-xl border p-4 shadow-sm transition-all hover:shadow-md ${
                summary.nbAnomaliesBloquantes > 0
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-center gap-3">
                {summary.nbAnomaliesBloquantes > 0 ? (
                  <AlertOctagon className="h-5 w-5 text-red-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                <div>
                  <p className="font-semibold text-glowup-licorice">
                    {summary.nbAnomalies} anomalie(s) détectée(s)
                  </p>
                  <p className="text-xs text-gray-600">
                    {summary.nbAnomaliesBloquantes > 0
                      ? `${summary.nbAnomaliesBloquantes} bloquante(s) à corriger avant transmission`
                      : "Points à vérifier — cliquez pour voir le détail"}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={TrendingUp}
              color="text-emerald-600"
              bg="bg-emerald-50"
              label="CA HT"
              value={formatEUR(summary.caHT)}
              sub={`${summary.nbFactures} factures · ${summary.nbAvoirs} avoirs`}
            />
            <KpiCard
              icon={Percent}
              color="text-amber-600"
              bg="bg-amber-50"
              label="TVA collectée (débits)"
              value={formatEUR(summary.tvaCollectee)}
              sub="sur factures émises"
            />
            <KpiCard
              icon={Coins}
              color="text-orange-600"
              bg="bg-orange-50"
              label="TVA exigible (encaissements)"
              value={formatEUR(summary.tvaExigibleEncaissement)}
              sub="CA3 services — réellement due"
            />
            <KpiCard
              icon={Receipt}
              color="text-indigo-600"
              bg="bg-indigo-50"
              label="CA TTC"
              value={formatEUR(summary.caTTC)}
              sub={`${summary.nbEcritures} lignes d'écritures`}
            />
            <KpiCard
              icon={Banknote}
              color="text-blue-600"
              bg="bg-blue-50"
              label="Encaissements"
              value={formatEUR(summary.encaissementsBanque)}
              sub={`${formatEUR(summary.encaissementsNonRapproches)} à rapprocher`}
            />
            <KpiCard
              icon={Landmark}
              color="text-rose-600"
              bg="bg-rose-50"
              label="Créances clients"
              value={formatEUR(summary.creancesClients)}
              sub="restant dû (compte 411)"
            />
            <KpiCard
              icon={AlertTriangle}
              color="text-red-600"
              bg="bg-red-50"
              label="Dont en retard"
              value={formatEUR(summary.creancesEnRetard)}
              sub="échéance dépassée"
            />
            <KpiCard
              icon={FileText}
              color="text-gray-600"
              bg="bg-gray-100"
              label="Avoirs émis"
              value={formatEUR(summary.totalAvoirsHT)}
              sub={`${summary.nbAvoirs} avoir(s)`}
            />
            <KpiCard
              icon={Banknote}
              color="text-teal-600"
              bg="bg-teal-50"
              label="Encaissé rapproché"
              value={formatEUR(summary.encaissementsRapproches)}
              sub="lettré aux factures"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-glowup-licorice">
                Récapitulatif TVA — préparation CA3
              </h2>
              <a
                href={`/api/comptable/export?type=tva&${qs}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-glowup-rose hover:underline"
              >
                <FileDown className="h-4 w-4" />
                Excel
              </a>
            </div>
            {summary.tvaParTaux.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Aucune pièce sur la période.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4 font-medium">Régime / Taux</th>
                      <th className="py-2 pr-4 text-right font-medium">Base HT</th>
                      <th className="py-2 pr-4 text-right font-medium">TVA collectée</th>
                      <th className="py-2 text-right font-medium">Nb pièces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tvaParTaux.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 pr-4">
                          <span className="font-medium text-glowup-licorice">
                            {r.taux}%
                          </span>{" "}
                          <span className="text-gray-500">· {r.regime}</span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatEUR(r.baseHT)}
                        </td>
                        <td className="py-2 pr-4 text-right font-medium tabular-nums">
                          {formatEUR(r.montantTVA)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-500">
                          {r.nbPieces}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-glowup-licorice">
                      <td className="py-2 pr-4">Total</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatEUR(
                          summary.tvaParTaux.reduce((s, r) => s + r.baseHT, 0)
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatEUR(
                          summary.tvaParTaux.reduce((s, r) => s + r.montantTVA, 0)
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NavCard
              href="/comptable/ventes"
              icon={Receipt}
              title="Journal des ventes"
              desc="Factures & avoirs détaillés"
            />
            <NavCard
              href="/comptable/banque"
              icon={Banknote}
              title="Journal de banque"
              desc="Encaissements Qonto"
            />
            <NavCard
              href="/comptable/grand-livre"
              icon={BookOpen}
              title="Grand livre"
              desc="Mouvements par compte"
            />
            <NavCard
              href="/comptable/balance"
              icon={Scale}
              title="Balance générale"
              desc="Soldes par compte"
            />
            <NavCard
              href="/comptable/controles"
              icon={ShieldCheck}
              title="Contrôles"
              desc="Anomalies à corriger"
            />
            <NavCard
              href="/comptable/exports"
              icon={FileDown}
              title="Centre d'export"
              desc="FEC, liasse, formats logiciels"
            />
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  color,
  bg,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums text-glowup-licorice">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function NavCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-glowup-rose hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-glowup-lace p-2.5">
          <Icon className="h-5 w-5 text-glowup-rose" />
        </div>
        <div>
          <p className="font-semibold text-glowup-licorice">{title}</p>
          <p className="text-xs text-gray-500">{desc}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-glowup-rose" />
    </Link>
  );
}
