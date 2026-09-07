"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, KpiCard, LevelBadge, StatusPill } from "@/components/decision-center/ui";
import { DC_RISK_LABELS, DC_DOMAIN_LABELS } from "@/lib/decision-center/labels";

type Req = {
  id: string;
  title: string;
  domain: string;
  requesterName: string | null;
  deadline: string | null;
  recommendation: string;
  riskLevel: string;
  policyLevel: string | null;
  amount: number | null;
  amountTaxMode: string;
  currency: string;
  recurring: boolean;
};

export default function QueuePage() {
  const router = useRouter();
  const [dash, setDash] = useState<{
    kpis: { toDecide: number; exceptions: number; urgent: number; decidedThisWeek: number };
    queue: Req[];
    finance: { caTotal: number; margeMoyenne: number } | null;
    receivables: { over30: number; over45: number; over60: number } | null;
    signedUnbilled: number | null;
    saas: { name: string; renewalDate: string | null }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/decision-center/session")
      .then((r) => r.json())
      .then((s) => {
        if (s.dcRole && s.dcRole !== "CEO") router.replace("/decision-center");
      });
    fetch("/api/decision-center/dashboard")
      .then((r) => r.json())
      .then(setDash);
  }, [router]);

  if (!dash) return <EmptyState title="Chargement" hint="Queue CEO…" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">CEO Queue</h1>
        <p className="text-gray-600">Uniquement les décisions où tu apportes vraiment de la valeur.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Décisions à prendre" value={dash.kpis.toDecide} />
        <KpiCard label="Exceptions ouvertes" value={dash.kpis.exceptions} />
        <KpiCard label="Urgentes" value={dash.kpis.urgent} />
        <KpiCard label="Rendues cette semaine" value={dash.kpis.decidedThisWeek} />
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Décisions à traiter</h2>
        <div className="space-y-3">
          {dash.queue.map((r) => (
            <Link key={r.id} href={`/decision-center/demandes/${r.id}`} className="card card-hover block">
              <div className="flex flex-wrap items-center gap-2">
                {r.policyLevel && <LevelBadge level={r.policyLevel} />}
                <h3 className="font-semibold text-glowup-licorice">{r.title}</h3>
                <StatusPill status="SUBMITTED" />
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {DC_DOMAIN_LABELS[r.domain as keyof typeof DC_DOMAIN_LABELS]} · {r.requesterName}
                {r.deadline ? ` · ${new Date(r.deadline).toLocaleString("fr-FR")}` : ""}
              </p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Reco : </span>
                {r.recommendation}
              </p>
              {(r.amount != null || r.riskLevel) && (
                <p className="mt-2 text-xs text-gray-500">
                  {r.amount != null
                    ? `${r.amount} ${r.currency} ${r.amountTaxMode}${r.recurring ? " récurrent" : " ponctuel"}`
                    : ""}
                  {r.riskLevel ? ` · ${DC_RISK_LABELS[r.riskLevel as keyof typeof DC_RISK_LABELS]}` : ""}
                </p>
              )}
            </Link>
          ))}
          {!dash.queue.length && (
            <EmptyState title="Rien à arbitrer" hint="C’est exactement l’objectif." />
          )}
        </div>
      </section>

      {(dash.finance || dash.receivables || dash.signedUnbilled != null || dash.saas.length > 0) && (
        <section className="grid gap-3 md:grid-cols-2">
          {dash.finance && (
            <div className="card">
              <p className="text-xs uppercase text-gray-500">Finance MTD</p>
              <p className="mt-1 text-lg font-semibold">
                CA {dash.finance.caTotal.toLocaleString("fr-FR")} €
              </p>
              <p className="text-sm text-gray-600">Marge moy. {dash.finance.margeMoyenne} %</p>
            </div>
          )}
          {dash.signedUnbilled != null && (
            <div className="card">
              <p className="text-xs uppercase text-gray-500">Signé non facturé</p>
              <p className="mt-1 text-lg font-semibold">{dash.signedUnbilled}</p>
            </div>
          )}
          {dash.receivables && (
            <div className="card">
              <p className="text-xs uppercase text-gray-500">Impayés</p>
              <p className="mt-1 text-sm">&gt;30 j : {dash.receivables.over30}</p>
              <p className="text-sm">&gt;60 j : {dash.receivables.over60}</p>
            </div>
          )}
          {dash.saas.length > 0 && (
            <div className="card">
              <p className="text-xs uppercase text-gray-500">Renouvellements SaaS</p>
              <ul className="mt-1 text-sm">
                {dash.saas.slice(0, 5).map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
