"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, Plus, Loader2, ChevronRight } from "lucide-react";

type ConfirmationRow = {
  id: string;
  marque: string;
  budgetNet: number;
  statut: string;
  decidedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  talent: { id: string; prenom: string; nom: string; photo: string | null } | null;
};

const STATUTS: Record<string, { label: string; className: string }> = {
  EN_ATTENTE: { label: "En attente", className: "bg-blue-500/10 text-blue-600" },
  REFUSE: { label: "Refusé", className: "bg-slate-100 text-slate-600" },
  SOUS_CONDITIONS: { label: "Sous conditions", className: "bg-amber-500/10 text-amber-600" },
  OPTION: { label: "Option", className: "bg-indigo-500/10 text-indigo-600" },
  CONFIRME: { label: "Confirmé", className: "bg-emerald-500/10 text-emerald-600" },
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n);
}

export default function ConfirmationsPage() {
  const [rows, setRows] = useState<ConfirmationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/confirmations");
        if (res.ok) setRows(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Link2 className="h-6 w-6 text-glowup-rose" /> Confirmations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Envoie un lien au talent pour qu&apos;il confirme formellement une offre. Rien
            n&apos;est transmis à la marque tant qu&apos;il n&apos;a pas confirmé.
          </p>
        </div>
        <Link
          href="/confirmations/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> Nouvelle demande
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-24 text-center">
          <p className="text-slate-600 font-medium">Aucune demande de confirmation</p>
          <p className="text-sm text-slate-500 mt-1">Crée ta première demande pour envoyer un lien à un talent.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60 divide-y divide-slate-100">
          {rows.map((r) => {
            const st = STATUTS[r.statut] || { label: r.statut, className: "bg-slate-100 text-slate-600" };
            return (
              <Link
                key={r.id}
                href={`/confirmations/${r.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-glowup-rose/20 to-pink-100 flex items-center justify-center">
                  {r.talent?.photo ? (
                    <img src={r.talent.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-glowup-rose">
                      {r.talent ? `${r.talent.prenom.charAt(0)}${r.talent.nom.charAt(0)}` : "?"}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">
                    {r.talent ? `${r.talent.prenom} ${r.talent.nom}` : "Talent inconnu"} × {r.marque}
                  </p>
                  <p className="text-sm text-slate-500">
                    {fmtMoney(r.budgetNet)} net · {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${st.className}`}>{st.label}</span>
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
