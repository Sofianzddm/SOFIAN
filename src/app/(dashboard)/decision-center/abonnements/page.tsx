"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/decision-center/ui";
import { DC_ROLES } from "@/lib/decision-center/constants";
import { DC_ROLE_LABELS } from "@/lib/decision-center/labels";

type Sub = {
  id: string;
  name: string;
  vendor: string;
  ownerRole: string;
  monthlyCost: number;
  annualCost: number | null;
  renewalDate: string | null;
  status: string;
};

export default function AbonnementsPage() {
  const [rows, setRows] = useState<Sub[]>([]);
  const [form, setForm] = useState({
    name: "",
    vendor: "",
    ownerRole: "EXECUTIVE_ASSISTANT",
    monthlyCost: "",
    renewalDate: "",
  });

  function load() {
    fetch("/api/decision-center/subscriptions")
      .then((r) => (r.ok ? r.json() : { subscriptions: [] }))
      .then((d) => setRows(d.subscriptions || []));
  }

  useEffect(() => { load(); }, []);

  async function create() {
    const res = await fetch("/api/decision-center/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        monthlyCost: Number(form.monthlyCost),
        annualCost: form.monthlyCost ? Number(form.monthlyCost) * 12 : null,
        renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : null,
      }),
    });
    if (!res.ok) {
      toast.error("Création refusée");
      return;
    }
    toast.success("Abonnement enregistré");
    setForm({ name: "", vendor: "", ownerRole: "EXECUTIVE_ASSISTANT", monthlyCost: "", renewalDate: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">Registre des abonnements</h1>
        <p className="text-gray-600">Aucun IBAN ni donnée bancaire. Uniquement ce qu’il faut pour les alertes J-60 / J-30 / J-7.</p>
      </header>

      <div className="card grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Éditeur" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
        <select className="input" value={form.ownerRole} onChange={(e) => setForm({ ...form, ownerRole: e.target.value })}>
          {DC_ROLES.map((r) => <option key={r} value={r}>{DC_ROLE_LABELS[r]}</option>)}
        </select>
        <input className="input" placeholder="Coût mensuel €" value={form.monthlyCost} onChange={(e) => setForm({ ...form, monthlyCost: e.target.value })} />
        <input type="date" className="input" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} />
        <button className="btn btn-primary" onClick={() => void create()}>Ajouter</button>
      </div>

      {!rows.length ? (
        <EmptyState title="Aucun abonnement" hint="Ajoute HubSpot, outils juridiques, etc. quand tu as les montants réels." />
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <article key={s.id} className="card">
              <p className="font-medium">{s.name} · {s.vendor}</p>
              <p className="text-sm text-gray-600">
                {s.monthlyCost} € / mois
                {s.annualCost ? ` · ${s.annualCost} € / an` : ""}
                {s.renewalDate ? ` · renouvellement ${new Date(s.renewalDate).toLocaleDateString("fr-FR")}` : ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
