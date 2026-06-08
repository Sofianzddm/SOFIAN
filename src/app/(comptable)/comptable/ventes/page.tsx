"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, FileDown, FileText, Search } from "lucide-react";
import {
  usePeriode,
  PeriodeBar,
  formatEUR,
  formatDateFR,
} from "@/components/comptable/periode";

interface VenteRow {
  date: string;
  reference: string;
  type: "FACTURE" | "AVOIR";
  client: string;
  clientCompteAux: string;
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  regimeTVA: string;
  statut: string;
  echeance: string | null;
  paiement: string | null;
  encaisse: number;
  restantDu: number;
  lettrage: string;
}

const STATUT_BADGE: Record<string, string> = {
  PAYE: "bg-emerald-100 text-emerald-700",
  VALIDE: "bg-blue-100 text-blue-700",
  ENVOYE: "bg-amber-100 text-amber-700",
};

export default function JournalVentesPage() {
  const [periode, setPeriode] = usePeriode();
  const [rows, setRows] = useState<VenteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comptable/journal-ventes?dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`
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

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const t = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.reference.toLowerCase().includes(t) ||
        r.client.toLowerCase().includes(t)
    );
  }, [rows, q]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        const sens = r.type === "AVOIR" ? -1 : 1;
        acc.ht += sens * r.montantHT;
        acc.tva += sens * r.montantTVA;
        acc.ttc += sens * r.montantTTC;
        acc.reste += r.restantDu;
        return acc;
      },
      { ht: 0, tva: 0, ttc: 0, reste: 0 }
    );
  }, [filtered]);

  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">
            Journal des ventes
          </h1>
          <p className="text-sm text-gray-500">
            Factures & avoirs comptabilisés · {periode.label}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/comptable/export?type=ventes-csv&${qs}`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            CSV
          </a>
          <a
            href={`/api/comptable/export?type=ventes&${qs}`}
            className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-glowup-rose/90"
          >
            <FileDown className="h-4 w-4" />
            Excel
          </a>
        </div>
      </div>

      <PeriodeBar periode={periode} onChange={setPeriode} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (référence, client)…"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-glowup-rose focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            Aucune pièce sur la période.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Référence</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 text-right font-medium">HT</th>
                  <th className="px-3 py-2.5 text-right font-medium">TVA</th>
                  <th className="px-3 py-2.5 text-right font-medium">TTC</th>
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  <th className="px-3 py-2.5">Échéance</th>
                  <th className="px-3 py-2.5 text-right font-medium">Restant dû</th>
                  <th className="px-3 py-2.5 font-medium">Lettr.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const sens = r.type === "AVOIR" ? -1 : 1;
                  return (
                    <tr
                      key={`${r.reference}-${i}`}
                      className="border-t border-gray-100 hover:bg-gray-50/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {formatDateFR(r.date)}
                      </td>
                      <td className="px-3 py-2 font-medium text-glowup-licorice">
                        {r.reference}
                      </td>
                      <td className="px-3 py-2">
                        {r.type === "AVOIR" ? (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            Avoir
                          </span>
                        ) : (
                          <span className="rounded bg-glowup-lace px-2 py-0.5 text-xs text-glowup-rose">
                            Facture
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.client}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(sens * r.montantHT)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {formatEUR(sens * r.montantTVA)}
                        <span className="ml-1 text-xs text-gray-400">
                          ({r.tauxTVA}%)
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatEUR(sens * r.montantTTC)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            STATUT_BADGE[r.statut] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.statut}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                        {formatDateFR(r.echeance)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.restantDu > 0.01 ? (
                          <span className="font-medium text-rose-600">
                            {formatEUR(r.restantDu)}
                          </span>
                        ) : (
                          <span className="text-emerald-600">Soldé</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-400">
                        {r.lettrage || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-glowup-licorice">
                <tr>
                  <td className="px-3 py-2.5" colSpan={4}>
                    {filtered.length} pièce(s)
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.ht)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.tva)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.ttc)}
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatEUR(totals.reste)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
