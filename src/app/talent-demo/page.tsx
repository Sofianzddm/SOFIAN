"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, FileText, Handshake } from "lucide-react";

type DemoCollab = {
  id: string;
  marque: string;
  reference: string;
  montant: number;
  statut: string;
  datePublication?: string;
  factureTalentUrl?: string | null;
};

type DemoFacture = {
  id: string;
  marque: string;
  reference: string;
  montant: number;
  statut: string;
  dateEmission?: string;
};

function monthKey(dateLike?: string): string {
  const d = new Date(dateLike || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function TalentDemoPage() {
  const [collabs, setCollabs] = useState<DemoCollab[]>([]);
  const [factures, setFactures] = useState<DemoFacture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, fRes] = await Promise.all([
          fetch("/api/talents/me/collaborations?demo=1"),
          fetch("/api/talents/me/factures?demo=1"),
        ]);
        if (!cancelled) {
          setCollabs(cRes.ok ? await cRes.json() : []);
          setFactures(fRes.ok ? await fRes.json() : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const collabsByMonth = useMemo(() => {
    return collabs.reduce<Record<string, DemoCollab[]>>((acc, c) => {
      const k = monthKey(c.datePublication);
      if (!acc[k]) acc[k] = [];
      acc[k].push(c);
      return acc;
    }, {});
  }, [collabs]);

  const facturesByMonth = useMemo(() => {
    return factures.reduce<Record<string, DemoFacture[]>>((acc, f) => {
      const k = monthKey(f.dateEmission);
      if (!acc[k]) acc[k] = [];
      acc[k].push(f);
      return acc;
    }, {});
  }, [factures]);

  const collabMonths = Object.keys(collabsByMonth).sort((a, b) => b.localeCompare(a));
  const factureMonths = Object.keys(facturesByMonth).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Chargement de la démo…</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Demo Espace Talent</h1>
        <p className="text-sm text-slate-500">
          Vue de présentation: collaborations publiées et factures classées par mois.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Collaborations publiées</h2>
          </div>
          <div className="space-y-4">
            {collabMonths.map((mk) => (
              <div key={mk}>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">{monthLabel(mk)}</p>
                <div className="space-y-2">
                  {collabsByMonth[mk].map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-medium text-slate-900">{c.marque}</p>
                      <p className="text-xs text-slate-500">{c.reference}</p>
                      <p className="text-sm text-slate-700 mt-1">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        }).format(c.montant)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Factures</h2>
          </div>
          <div className="space-y-4">
            {factureMonths.map((mk) => (
              <div key={mk}>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">{monthLabel(mk)}</p>
                <div className="space-y-2">
                  {facturesByMonth[mk].map((f) => (
                    <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{f.marque}</p>
                          <p className="text-xs text-slate-500">{f.reference}</p>
                        </div>
                        <span className="text-xs rounded-full px-2 py-1 bg-slate-100 text-slate-600">
                          {f.statut}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        }).format(f.montant)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 flex items-center gap-2">
        <Calendar className="w-4 h-4" />
        URL de demo: <span className="font-medium">/talent-demo</span>
      </div>
    </div>
  );
}
