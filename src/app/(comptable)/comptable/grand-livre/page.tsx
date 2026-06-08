"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, FileDown, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import {
  usePeriode,
  PeriodeBar,
  formatEUR,
} from "@/components/comptable/periode";

interface GrandLivreLigne {
  date: string;
  journal: string;
  piece: string;
  libelle: string;
  compAux: string;
  debit: number;
  credit: number;
  solde: number;
  lettrage: string;
}

interface GrandLivreCompte {
  compteNum: string;
  compteLib: string;
  lignes: GrandLivreLigne[];
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

function fmtDate(fec: string): string {
  if (!fec || fec.length !== 8) return fec;
  return `${fec.slice(6, 8)}/${fec.slice(4, 6)}/${fec.slice(0, 4)}`;
}

export default function GrandLivrePage() {
  const [periode, setPeriode] = usePeriode();
  const [comptes, setComptes] = useState<GrandLivreCompte[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comptable/grand-livre?dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`
      );
      const json = await res.json();
      setComptes(json.success ? json.comptes : []);
    } catch {
      setComptes([]);
    } finally {
      setLoading(false);
    }
  }, [periode.dateDebut, periode.dateFin]);

  useEffect(() => {
    load();
  }, [load]);

  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">Grand livre</h1>
          <p className="text-sm text-gray-500">
            Détail des mouvements par compte · {periode.label}
          </p>
        </div>
        <a
          href={`/api/comptable/export?type=grand-livre&${qs}`}
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
      ) : comptes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          Aucun mouvement sur la période.
        </div>
      ) : (
        <div className="space-y-3">
          {comptes.map((c) => {
            const isOpen = open[c.compteNum] ?? false;
            return (
              <div
                key={c.compteNum}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <button
                  onClick={() =>
                    setOpen((o) => ({ ...o, [c.compteNum]: !isOpen }))
                  }
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <BookOpen className="h-4 w-4 text-glowup-rose" />
                    <span className="font-mono text-sm font-semibold text-glowup-licorice">
                      {c.compteNum}
                    </span>
                    <span className="text-sm text-gray-600">{c.compteLib}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {c.lignes.length} lignes
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="hidden text-gray-500 sm:inline">
                      D {formatEUR(c.totalDebit)} · C {formatEUR(c.totalCredit)}
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        c.solde >= 0 ? "text-blue-600" : "text-rose-600"
                      }`}
                    >
                      Solde {formatEUR(c.solde)}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Jrn</th>
                          <th className="px-3 py-2 font-medium">Pièce</th>
                          <th className="px-3 py-2 font-medium">Libellé</th>
                          <th className="px-3 py-2 text-right font-medium">Débit</th>
                          <th className="px-3 py-2 text-right font-medium">Crédit</th>
                          <th className="px-3 py-2 text-right font-medium">Solde</th>
                          <th className="px-3 py-2 font-medium">Let.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.lignes.map((l, i) => (
                          <tr key={i} className="border-t border-gray-50">
                            <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">
                              {fmtDate(l.date)}
                            </td>
                            <td className="px-3 py-1.5 text-gray-500">{l.journal}</td>
                            <td className="px-3 py-1.5 font-medium text-glowup-licorice">
                              {l.piece}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600">{l.libelle}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {l.debit ? formatEUR(l.debit) : ""}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {l.credit ? formatEUR(l.credit) : ""}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                              {formatEUR(l.solde)}
                            </td>
                            <td className="px-3 py-1.5 text-gray-400">
                              {l.lettrage || ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
