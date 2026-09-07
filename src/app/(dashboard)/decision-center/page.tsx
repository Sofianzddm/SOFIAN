"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, FilePlus2, LayoutGrid, Shield } from "lucide-react";
import { PrincipleBanner, KpiCard } from "@/components/decision-center/ui";
import { DC_PHILOSOPHY } from "@/lib/decision-center/principles";
import { DC_ROLE_LABELS } from "@/lib/decision-center/labels";
import type { DcRole } from "@/lib/decision-center/constants";

type Session = {
  dcRole: DcRole;
  name: string;
  capabilities: string[];
};

export default function DecisionCenterHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [dash, setDash] = useState<{
    kpis: {
      toDecide: number;
      exceptions: number;
      urgent: number;
      decidedThisWeek: number;
      pendingExecution: number;
      drafts: number;
    };
  } | null>(null);

  useEffect(() => {
    fetch("/api/decision-center/session")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSession);
    fetch("/api/decision-center/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDash);
  }, []);

  const isCeo = session?.dcRole === "CEO";
  const isEa = session?.dcRole === "EXECUTIVE_ASSISTANT";
  const isHos = session?.dcRole === "HEAD_OF_SALES";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-glowup-rose">Decision Center</p>
        <h1 className="mt-1 text-3xl font-semibold text-glowup-licorice">
          Decision Center
        </h1>
        <p className="mt-1 text-gray-600">{DC_PHILOSOPHY.homeLead}</p>
        {session && (
          <p className="mt-2 text-sm text-gray-500">
            {session.name} · {DC_ROLE_LABELS[session.dcRole]}
          </p>
        )}
      </header>

      <PrincipleBanner />

      <form action="/decision-center/qui-decide" className="card">
        <label htmlFor="dc-q" className="text-sm font-medium text-glowup-licorice">
          Qui décide ?
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="dc-q"
            name="q"
            className="input"
            placeholder="Décris ce que tu veux faire…"
          />
          <button type="submit" className="btn btn-primary">
            Chercher
          </button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/decision-center/droits" className="card card-hover">
          <Shield className="h-5 w-5 text-glowup-rose" />
          <h2 className="mt-2 font-semibold text-glowup-licorice">Mes droits</h2>
          <p className="mt-1 text-sm text-gray-600">
            Ce que je peux décider sans escalade.
          </p>
        </Link>
        <Link href="/decision-center/demander" className="card card-hover">
          <FilePlus2 className="h-5 w-5 text-glowup-rose" />
          <h2 className="mt-2 font-semibold text-glowup-licorice">
            Préparer une décision
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Faire remonter uniquement ce qui nécessite réellement un arbitrage.
          </p>
        </Link>
        <Link href="/decision-center/matrice" className="card card-hover">
          <LayoutGrid className="h-5 w-5 text-glowup-rose" />
          <h2 className="mt-2 font-semibold text-glowup-licorice">Matrice</h2>
          <p className="mt-1 text-sm text-gray-600">
            Référentiel officiel des droits de décision Glow Up.
          </p>
        </Link>
        {isCeo && (
          <Link href="/decision-center/queue" className="card card-hover">
            <Compass className="h-5 w-5 text-glowup-rose" />
            <h2 className="mt-2 font-semibold text-glowup-licorice">CEO Queue</h2>
            <p className="mt-1 text-sm text-gray-600">
              Décisions nécessitant ton arbitrage.
            </p>
          </Link>
        )}
      </div>

      {dash && isCeo && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Décisions à prendre" value={dash.kpis.toDecide} href="/decision-center/queue" />
          <KpiCard label="Exceptions ouvertes" value={dash.kpis.exceptions} />
          <KpiCard label="Décisions urgentes" value={dash.kpis.urgent} />
          <KpiCard label="Rendues cette semaine" value={dash.kpis.decidedThisWeek} />
        </div>
      )}

      {dash && isEa && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="À préparer pour Sofian" value={dash.kpis.drafts} href="/decision-center/demander" />
          <KpiCard label="Décisions en attente d’exécution" value={dash.kpis.pendingExecution} href="/decision-center/historique" />
          <KpiCard label="Exceptions" value={dash.kpis.exceptions} />
        </div>
      )}

      {dash && isHos && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Décisions Sofian en attente" value={dash.kpis.toDecide} href="/decision-center/historique" />
          <KpiCard label="Exceptions" value={dash.kpis.exceptions} />
        </div>
      )}

      <p className="text-sm text-gray-500">{DC_PHILOSOPHY.decideVsExecute}</p>
    </div>
  );
}
