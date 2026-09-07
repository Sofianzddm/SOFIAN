"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LevelBadge } from "@/components/decision-center/ui";
import { DC_LEVELS, DC_ROLES } from "@/lib/decision-center/constants";
import { DC_ROLE_LABELS } from "@/lib/decision-center/labels";

type Policy = {
  id: string;
  code: string;
  title: string;
  description: string;
  ownerRole: string;
  executorRole: string | null;
  finalDecisionRole: string;
  level: string;
  autonomyRule: string;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  escalationRule: string;
  ceoVisibility: string;
  isActive: boolean;
  version: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [members, setMembers] = useState<{ email: string; dcRole: string; name: string }[]>([]);
  const [logs, setLogs] = useState<{ id: string; action: string; actorName: string | null; createdAt: string; comment: string | null }[]>([]);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [reason, setReason] = useState("");

  function load() {
    fetch("/api/decision-center/policies").then((r) => r.json()).then((d) => setPolicies(d.policies || []));
    fetch("/api/decision-center/memberships").then((r) => r.ok ? r.json() : null).then((d) => d && setMembers(d.members || []));
    fetch("/api/decision-center/audit").then((r) => r.ok ? r.json() : null).then((d) => d && setLogs(d.logs || []));
  }

  useEffect(() => {
    fetch("/api/decision-center/session").then((r) => r.json()).then((s) => {
      if (s.dcRole && s.dcRole !== "CEO") router.replace("/decision-center");
    });
    load();
  }, [router]);

  async function save() {
    if (!selected) return;
    const res = await fetch(`/api/decision-center/policies/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: selected.title,
        description: selected.description,
        ownerRole: selected.ownerRole,
        executorRole: selected.executorRole,
        finalDecisionRole: selected.finalDecisionRole,
        level: selected.level,
        autonomyRule: selected.autonomyRule,
        thresholdValue: selected.thresholdValue,
        thresholdUnit: selected.thresholdUnit,
        escalationRule: selected.escalationRule,
        isActive: selected.isActive,
        changeReason: reason,
      }),
    });
    if (!res.ok) {
      toast.error("Modification refusée");
      return;
    }
    toast.success("Nouvelle version publiée");
    setReason("");
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">Administration</h1>
        <p className="text-gray-600">
          Une règle n’est jamais supprimée. Toute modification crée une nouvelle version audité.
        </p>
      </header>

      <section className="card">
        <h2 className="font-semibold">Comptes phase 1</h2>
        <ul className="mt-2 text-sm">
          {members.map((m) => (
            <li key={m.email}>{m.name} · {m.email} · {m.dcRole}</li>
          ))}
          {!members.length && (
            <li className="text-gray-500">
              s.zeddam@ / sofian@ · maud@ · leyna@glowupagence.fr
            </li>
          )}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 max-h-[480px] overflow-auto">
          {policies.map((p) => (
            <button
              key={p.id}
              className={`card w-text-left w-full text-left ${selected?.id === p.id ? "ring-2 ring-glowup-rose" : ""}`}
              onClick={() => setSelected(p)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <LevelBadge level={p.level} />
              </div>
              <p className="text-xs text-gray-500">{p.code} · v{p.version}{p.isActive ? "" : " · inactive"}</p>
            </button>
          ))}
        </div>

        {selected && (
          <div className="card space-y-3">
            <input className="input" value={selected.title} onChange={(e) => setSelected({ ...selected, title: e.target.value })} />
            <textarea className="input min-h-24" value={selected.description} onChange={(e) => setSelected({ ...selected, description: e.target.value })} />
            <textarea className="input min-h-20" value={selected.autonomyRule} onChange={(e) => setSelected({ ...selected, autonomyRule: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={selected.ownerRole} onChange={(e) => setSelected({ ...selected, ownerRole: e.target.value })}>
                {DC_ROLES.map((r) => <option key={r} value={r}>{DC_ROLE_LABELS[r]}</option>)}
              </select>
              <select className="input" value={selected.finalDecisionRole} onChange={(e) => setSelected({ ...selected, finalDecisionRole: e.target.value })}>
                {DC_ROLES.map((r) => <option key={r} value={r}>{DC_ROLE_LABELS[r]}</option>)}
              </select>
              <select className="input" value={selected.level} onChange={(e) => setSelected({ ...selected, level: e.target.value })}>
                {DC_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.isActive} onChange={(e) => setSelected({ ...selected, isActive: e.target.checked })} />
                Active
              </label>
            </div>
            <input className="input" placeholder="Raison du changement (facultatif)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn btn-primary" onClick={() => void save()}>Publier une nouvelle version</button>
          </div>
        )}
      </div>

      <section className="card">
        <h2 className="font-semibold">Audit</h2>
        <ul className="mt-2 max-h-64 overflow-auto text-sm">
          {logs.map((l) => (
            <li key={l.id} className="border-b border-gray-100 py-1">
              {new Date(l.createdAt).toLocaleString("fr-FR")} · {l.actorName} · {l.action}
              {l.comment ? ` — ${l.comment}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
