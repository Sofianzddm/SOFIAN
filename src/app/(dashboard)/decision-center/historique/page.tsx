"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill, EmptyState, LevelBadge } from "@/components/decision-center/ui";

type Req = {
  id: string;
  reference: string;
  title: string;
  status: string;
  domain: string;
  policyLevel: string | null;
  createdAt: string;
  requesterName: string | null;
};

export default function HistoriquePage() {
  const [rows, setRows] = useState<Req[]>([]);

  useEffect(() => {
    fetch("/api/decision-center/requests")
      .then((r) => r.json())
      .then((d) => setRows(d.requests || []));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">Historique</h1>
        <p className="text-gray-600">Les décisions rendues ne sont jamais supprimées.</p>
      </header>
      {!rows.length ? (
        <EmptyState title="Aucune décision" hint="Les demandes ORANGE/RED apparaîtront ici." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.id} href={`/decision-center/demandes/${r.id}`} className="card card-hover block">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-500">{r.reference}</p>
                  <p className="font-medium text-glowup-licorice">{r.title}</p>
                  <p className="text-xs text-gray-500">{r.requesterName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.policyLevel && <LevelBadge level={r.policyLevel} />}
                  <StatusPill status={r.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
