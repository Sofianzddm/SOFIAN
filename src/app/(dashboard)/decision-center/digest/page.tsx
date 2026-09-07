"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, LevelBadge } from "@/components/decision-center/ui";

export default function DigestPage() {
  const [data, setData] = useState<{
    generatedAt: string;
    red: { id: string; title: string; policyLevel: string | null }[];
    orange: { id: string; title: string; policyLevel: string | null }[];
    finance: { caTotal: number; margeMoyenne: number } | null;
    receivables: { over30: number; over60: number } | null;
    saas: { name: string; renewalDate: string | null }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/decision-center/digest")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);

  if (!data) return <EmptyState title="Chargement" hint="Digest CEO…" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">CEO Weekly Brief</h1>
        <p className="text-gray-500 text-sm">
          Généré le {new Date(data.generatedAt).toLocaleString("fr-FR")}
        </p>
      </header>

      <section className="card">
        <h2 className="font-semibold">🔴 Décisions nécessaires</h2>
        <ul className="mt-2 space-y-2">
          {data.red.map((r) => (
            <li key={r.id}>
              <Link href={`/decision-center/demandes/${r.id}`} className="flex items-center gap-2">
                {r.policyLevel && <LevelBadge level={r.policyLevel} />}
                {r.title}
              </Link>
            </li>
          ))}
          {!data.red.length && <p className="text-sm text-gray-500">Aucune.</p>}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-semibold">🟠 Exceptions</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.orange.map((r) => (
            <li key={r.id}>{r.title}</li>
          ))}
          {!data.orange.length && <p className="text-sm text-gray-500">Aucune cette semaine.</p>}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-semibold">💰 Finance</h2>
        {data.finance ? (
          <p className="mt-2 text-sm">
            CA MTD {data.finance.caTotal.toLocaleString("fr-FR")} € · marge moy.{" "}
            {data.finance.margeMoyenne} %
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Données financières non affichées pour ce rôle.</p>
        )}
        {data.receivables && (
          <p className="mt-1 text-sm">
            Impayés &gt;30 j : {data.receivables.over30} · &gt;60 j : {data.receivables.over60}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold">🔄 Échéances SaaS</h2>
        <ul className="mt-2 text-sm">
          {data.saas.map((s) => (
            <li key={s.name}>
              {s.name}
              {s.renewalDate ? ` · ${new Date(s.renewalDate).toLocaleDateString("fr-FR")}` : ""}
            </li>
          ))}
          {!data.saas.length && (
            <p className="text-sm text-gray-500">Aucun renouvellement enregistré.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
