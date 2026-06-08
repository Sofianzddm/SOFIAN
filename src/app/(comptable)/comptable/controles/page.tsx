"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  FileDown,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
} from "lucide-react";
import {
  usePeriode,
  PeriodeBar,
  formatEUR,
} from "@/components/comptable/periode";

interface Anomalie {
  gravite: "error" | "warning";
  categorie: string;
  message: string;
  reference: string | null;
  montant: number | null;
}

export default function ControlesPage() {
  const [periode, setPeriode] = usePeriode();
  const [anomalies, setAnomalies] = useState<Anomalie[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<"all" | "error" | "warning">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comptable/controles?dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`
      );
      const json = await res.json();
      setAnomalies(json.success ? json.anomalies : []);
    } catch {
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }, [periode.dateDebut, periode.dateFin]);

  useEffect(() => {
    load();
  }, [load]);

  const nbErrors = anomalies.filter((a) => a.gravite === "error").length;
  const nbWarnings = anomalies.filter((a) => a.gravite === "warning").length;

  const parCategorie = useMemo(() => {
    const visibles =
      filtre === "all" ? anomalies : anomalies.filter((a) => a.gravite === filtre);
    const map = new Map<string, Anomalie[]>();
    for (const a of visibles) {
      const arr = map.get(a.categorie) || [];
      arr.push(a);
      map.set(a.categorie, arr);
    }
    return Array.from(map.entries());
  }, [anomalies, filtre]);

  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">
            Contrôles de cohérence
          </h1>
          <p className="text-sm text-gray-500">
            Anomalies à corriger avant transmission · {periode.label}
          </p>
        </div>
        <a
          href={`/api/comptable/export?type=controles&${qs}`}
          className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-glowup-rose/90"
        >
          <FileDown className="h-4 w-4" />
          Excel
        </a>
      </div>

      <PeriodeBar periode={periode} onChange={setPeriode} />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <button
              onClick={() => setFiltre("all")}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition-all ${
                filtre === "all" ? "border-glowup-rose ring-1 ring-glowup-rose/20" : "border-gray-200"
              }`}
            >
              <p className="text-sm text-gray-500">Total anomalies</p>
              <p className="mt-1 text-2xl font-bold text-glowup-licorice">
                {anomalies.length}
              </p>
            </button>
            <button
              onClick={() => setFiltre("error")}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition-all ${
                filtre === "error" ? "border-red-400 ring-1 ring-red-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 text-red-600">
                <AlertOctagon className="h-4 w-4" />
                <p className="text-sm">Bloquantes</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-red-600">{nbErrors}</p>
            </button>
            <button
              onClick={() => setFiltre("warning")}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition-all ${
                filtre === "warning" ? "border-amber-400 ring-1 ring-amber-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm">À vérifier</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-amber-600">{nbWarnings}</p>
            </button>
          </div>

          {anomalies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-emerald-700">
                Aucune anomalie détectée
              </p>
              <p className="text-sm text-emerald-600">
                Toutes les pièces de la période sont cohérentes.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {parCategorie.map(([categorie, items]) => (
                <div
                  key={categorie}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                    <h3 className="font-semibold text-glowup-licorice">
                      {categorie}
                    </h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {items.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {items.map((a, i) => (
                      <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                        {a.gravite === "error" ? (
                          <AlertOctagon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm text-gray-700">{a.message}</p>
                          {a.reference && (
                            <span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
                              {a.reference}
                            </span>
                          )}
                        </div>
                        {a.montant != null && (
                          <span className="text-sm font-medium tabular-nums text-gray-500">
                            {formatEUR(a.montant)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
