"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, FileDown } from "lucide-react";
import {
  usePeriode,
  PeriodeBar,
  formatEUR,
} from "@/components/comptable/periode";

interface BalanceLigne {
  compteNum: string;
  compteLib: string;
  debit: number;
  credit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

export default function BalancePage() {
  const [periode, setPeriode] = usePeriode();
  const [rows, setRows] = useState<BalanceLigne[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comptable/balance?dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`
      );
      const json = await res.json();
      setRows(json.success ? json.rows : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periode.dateDebut, periode.dateFin]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.debit += r.debit;
          acc.credit += r.credit;
          acc.sd += r.soldeDebiteur;
          acc.sc += r.soldeCrediteur;
          return acc;
        },
        { debit: 0, credit: 0, sd: 0, sc: 0 }
      ),
    [rows]
  );

  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;
  const equilibre = Math.abs(totals.debit - totals.credit) < 0.01;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">
            Balance générale
          </h1>
          <p className="text-sm text-gray-500">
            Soldes par compte · {periode.label}
          </p>
        </div>
        <a
          href={`/api/comptable/export?type=balance&${qs}`}
          className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-glowup-rose/90"
        >
          <FileDown className="h-4 w-4" />
          Excel
        </a>
      </div>

      <PeriodeBar periode={periode} onChange={setPeriode} />

      {!loading && rows.length > 0 && (
        <div
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            equilibre
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {equilibre
            ? "✓ Balance équilibrée (total débit = total crédit)"
            : `⚠ Déséquilibre détecté : ${formatEUR(totals.debit - totals.credit)}`}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            Aucun mouvement sur la période.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Compte</th>
                  <th className="px-4 py-2.5 font-medium">Libellé</th>
                  <th className="px-4 py-2.5 text-right font-medium">Débit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Crédit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Solde déb.</th>
                  <th className="px-4 py-2.5 text-right font-medium">Solde créd.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.compteNum} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-mono font-medium text-glowup-licorice">
                      {r.compteNum}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.compteLib}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatEUR(r.debit)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatEUR(r.credit)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-blue-600">
                      {r.soldeDebiteur ? formatEUR(r.soldeDebiteur) : ""}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600">
                      {r.soldeCrediteur ? formatEUR(r.soldeCrediteur) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-glowup-licorice">
                <tr>
                  <td className="px-4 py-2.5" colSpan={2}>
                    TOTAUX
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.debit)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.credit)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.sd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.sc)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
