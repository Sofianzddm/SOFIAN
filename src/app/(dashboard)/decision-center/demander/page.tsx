"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DC_DOMAINS, DC_RISK_LEVELS, DC_RISK_TYPES } from "@/lib/decision-center/constants";
import { DC_DOMAIN_LABELS, DC_RISK_LABELS, DC_RISK_TYPE_LABELS } from "@/lib/decision-center/labels";

export default function DemanderPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Chargement…</p>}>
      <DemanderInner />
    </Suspense>
  );
}

function DemanderInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [policies, setPolicies] = useState<{ id: string; title: string; domain: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setSet] = useState({
    title: sp.get("title") || "",
    domain: "TRAVEL",
    policyId: sp.get("policyId") || "",
    context: "",
    question: sp.get("question") || "",
    optionA: "Approuver",
    optionB: "Refuser / reporter",
    optionC: "",
    recommendation: "",
    amount: sp.get("amount") || "",
    currency: "EUR",
    amountTaxMode: "TTC",
    recurring: false,
    riskLevel: "MEDIUM",
    riskTypes: [] as string[],
    deadline: "",
  });

  useEffect(() => {
    fetch("/api/decision-center/policies?active=true")
      .then((r) => r.json())
      .then((d) => {
        const list = d.policies || [];
        setPolicies(list);
        const pre = sp.get("policyId");
        if (pre) {
          const p = list.find((x: { id: string; domain: string }) => x.id === pre);
          if (p) setSet((f) => ({ ...f, domain: p.domain, policyId: p.id }));
        }
      });
  }, [sp]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setSet((f) => ({ ...f, [key]: value }));
  }

  async function submit(submit: boolean) {
    if (!form.recommendation.trim()) {
      toast.error("La recommandation est obligatoire.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/decision-center/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        optionC: form.optionC || null,
        amount: form.amount ? Number(form.amount) : null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        policyId: form.policyId || null,
        submit,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Impossible d’enregistrer");
      return;
    }
    const data = await res.json();
    toast.success(submit ? "Décision envoyée" : "Brouillon enregistré");
    router.push(`/decision-center/demandes/${data.request.id}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">Préparer une décision</h1>
        <p className="text-gray-600">
          Uniquement si ça sort de ton cadre. 3 à 5 lignes de contexte. Une recommandation claire.
        </p>
      </header>

      <div className="card space-y-4">
        <div>
          <label className="text-sm font-medium">Sujet</label>
          <input className="input mt-1" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Domaine</label>
            <select className="input mt-1" value={form.domain} onChange={(e) => set("domain", e.target.value)}>
              {DC_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {DC_DOMAIN_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Règle associée</label>
            <select className="input mt-1" value={form.policyId} onChange={(e) => set("policyId", e.target.value)}>
              <option value="">—</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Contexte (3–5 lignes)</label>
          <textarea className="input mt-1 min-h-24" value={form.context} onChange={(e) => set("context", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Décision nécessaire</label>
          <input className="input mt-1" value={form.question} onChange={(e) => set("question", e.target.value)} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Option A</label>
            <input className="input mt-1" value={form.optionA} onChange={(e) => set("optionA", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Option B</label>
            <input className="input mt-1" value={form.optionB} onChange={(e) => set("optionB", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Option C (optionnel)</label>
            <input className="input mt-1" value={form.optionC} onChange={(e) => set("optionC", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Recommandation</label>
          <p className="text-xs text-gray-500">Quelle option recommandes-tu et pourquoi ?</p>
          <textarea className="input mt-1 min-h-24" value={form.recommendation} onChange={(e) => set("recommendation", e.target.value)} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-sm font-medium">Montant</label>
            <input className="input mt-1" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Devise</label>
            <input className="input mt-1" value={form.currency} onChange={(e) => set("currency", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">HT / TTC</label>
            <select className="input mt-1" value={form.amountTaxMode} onChange={(e) => set("amountTaxMode", e.target.value)}>
              <option value="TTC">TTC</option>
              <option value="HT">HT</option>
            </select>
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.recurring} onChange={(e) => set("recurring", e.target.checked)} />
            Récurrent
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Risque</label>
            <select className="input mt-1" value={form.riskLevel} onChange={(e) => set("riskLevel", e.target.value)}>
              {DC_RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {DC_RISK_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Deadline</label>
            <input type="datetime-local" className="input mt-1" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Type de risque</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DC_RISK_TYPES.map((t) => {
              const on = form.riskTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-glowup-rose bg-glowup-lace" : "border-gray-200"}`}
                  onClick={() =>
                    set(
                      "riskTypes",
                      on ? form.riskTypes.filter((x) => x !== t) : [...form.riskTypes, t]
                    )
                  }
                >
                  {DC_RISK_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" disabled={saving} onClick={() => void submit(false)}>
            Brouillon
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void submit(true)}>
            Envoyer à Sofian
          </button>
        </div>
      </div>
    </div>
  );
}
