"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, FileDown, Search } from "lucide-react";
import {
  usePeriode,
  PeriodeBar,
  formatEUR,
  formatDateFR,
} from "@/components/comptable/periode";

interface BanqueRow {
  date: string;
  libelle: string;
  emetteur: string;
  reference: string;
  montant: number;
  statut: string;
  facturesRapprochees: string[];
  rapproche: boolean;
  horsPlateforme: boolean;
}

export default function JournalBanquePage() {
  const [periode, setPeriode] = usePeriode();
  const [rows, setRows] = useState<BanqueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comptable/journal-banque?dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`
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
        r.libelle.toLowerCase().includes(t) ||
        r.emetteur.toLowerCase().includes(t) ||
        r.facturesRapprochees.join(" ").toLowerCase().includes(t)
    );
  }, [rows, q]);

  const total = useMemo(
    () => filtered.reduce((s, r) => s + r.montant, 0),
    [filtered]
  );

  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">
            Journal de banque
          </h1>
          <p className="text-sm text-gray-500">
            Encaissements bancaires (Qonto) · {periode.label}
          </p>
        </div>
        <a
          href={`/api/comptable/export?type=banque&${qs}`}
          className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-glowup-rose/90"
        >
          <FileDown className="h-4 w-4" />
          Excel
        </a>
      </div>

      <PeriodeBar periode={periode} onChange={setPeriode} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (émetteur, libellé, facture)…"
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
            Aucun encaissement sur la période.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Émetteur / Libellé</th>
                  <th className="px-3 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-3 py-2.5 font-medium">Rapprochement</th>
                  <th className="px-3 py-2.5 font-medium">Factures</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={i}
                    className="border-t border-gray-100 hover:bg-gray-50/60"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {formatDateFR(r.date)}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-glowup-licorice">
                        {r.emetteur || r.libelle}
                      </p>
                      {r.emetteur && r.libelle && (
                        <p className="text-xs text-gray-400">{r.libelle}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-emerald-600">
                      {formatEUR(r.montant)}
                    </td>
                    <td className="px-3 py-2">
                      {r.horsPlateforme ? (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          Hors plateforme
                        </span>
                      ) : r.rapproche ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          Rapproché
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          À rapprocher
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {r.facturesRapprochees.length > 0
                        ? r.facturesRapprochees.join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-glowup-licorice">
                <tr>
                  <td className="px-3 py-2.5" colSpan={2}>
                    {filtered.length} encaissement(s)
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatEUR(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
