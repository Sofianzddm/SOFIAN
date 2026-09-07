"use client";

import { useEffect, useMemo, useState } from "react";
import { DC_DOMAINS, DC_LEVELS, DC_ROLES } from "@/lib/decision-center/constants";
import {
  DC_DOMAIN_LABELS,
  DC_ROLE_LABELS,
  DC_CEO_VISIBILITY_LABELS,
} from "@/lib/decision-center/labels";
import { LevelBadge } from "@/components/decision-center/ui";
import { DC_PRINCIPLES, CEO_RESERVED_TOPICS } from "@/lib/decision-center/principles";

type Policy = {
  id: string;
  domain: string;
  title: string;
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
};

export default function MatricePage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [domain, setDomain] = useState("");
  const [owner, setOwner] = useState("");
  const [level, setLevel] = useState("");
  const [active, setActive] = useState("true");
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (owner) params.set("owner", owner);
    if (level) params.set("level", level);
    if (active) params.set("active", active);
    fetch(`/api/decision-center/policies?${params}`)
      .then((r) => r.json())
      .then((d) => setPolicies(d.policies || []));
  }, [domain, owner, level, active]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return policies;
    return policies.filter((p) =>
      `${p.title} ${p.autonomyRule} ${p.domain}`.toLowerCase().includes(n)
    );
  }, [policies, q]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">Matrice</h1>
        <p className="text-gray-600">Référentiel officiel des droits de décision Glow Up.</p>
      </header>

      <section className="card">
        <h2 className="font-semibold text-glowup-licorice">Principes de décision</h2>
        <ol className="mt-3 space-y-2 text-sm text-gray-700">
          {DC_PRINCIPLES.map((p) => (
            <li key={p.id}>
              <span className="font-medium">{p.id}. {p.title}.</span> {p.body}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm font-medium">
          Une décision déjà approuvée ne doit pas nécessiter une nouvelle validation au moment
          de son exécution, sauf si les conditions ont changé.
        </p>
      </section>

      <div className="grid gap-2 md:grid-cols-5">
        <input className="input" placeholder="Recherche" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">Tous les domaines</option>
          {DC_DOMAINS.map((d) => (
            <option key={d} value={d}>{DC_DOMAIN_LABELS[d]}</option>
          ))}
        </select>
        <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Tous les owners</option>
          {DC_ROLES.map((r) => (
            <option key={r} value={r}>{DC_ROLE_LABELS[r]}</option>
          ))}
        </select>
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {DC_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select className="input" value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="true">Actives</option>
          <option value="">Toutes</option>
          <option value="false">Inactives</option>
        </select>
      </div>

      <div className="hidden md:block table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Domaine</th>
              <th>Décision</th>
              <th>Owner</th>
              <th>Exécutant</th>
              <th>Décideur final</th>
              <th>Niveau</th>
              <th>Règle</th>
              <th>Seuil</th>
              <th>Escalade</th>
              <th>CEO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
                <td>{DC_DOMAIN_LABELS[p.domain as keyof typeof DC_DOMAIN_LABELS]}</td>
                <td>{p.title}</td>
                <td>{DC_ROLE_LABELS[p.ownerRole as keyof typeof DC_ROLE_LABELS]}</td>
                <td>{p.executorRole ? DC_ROLE_LABELS[p.executorRole as keyof typeof DC_ROLE_LABELS] : "—"}</td>
                <td>{DC_ROLE_LABELS[p.finalDecisionRole as keyof typeof DC_ROLE_LABELS]}</td>
                <td><LevelBadge level={p.level} /></td>
                <td className="max-w-xs text-xs text-gray-600">{p.autonomyRule}</td>
                <td>{p.thresholdValue != null ? `${p.thresholdValue} ${p.thresholdUnit || ""}` : "—"}</td>
                <td className="max-w-xs text-xs text-gray-600">{p.escalationRule}</td>
                <td className="text-xs">{DC_CEO_VISIBILITY_LABELS[p.ceoVisibility as keyof typeof DC_CEO_VISIBILITY_LABELS]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((p) => (
          <article key={p.id} className="card">
            <p className="text-xs text-gray-500">{DC_DOMAIN_LABELS[p.domain as keyof typeof DC_DOMAIN_LABELS]}</p>
            <h3 className="mt-1 font-medium">{p.title}</h3>
            <div className="mt-2"><LevelBadge level={p.level} /></div>
            <p className="mt-2 text-sm">Owner : {DC_ROLE_LABELS[p.ownerRole as keyof typeof DC_ROLE_LABELS]}</p>
            <p className="mt-2 text-sm text-gray-600">{p.autonomyRule}</p>
          </article>
        ))}
      </div>

      <section className="card">
        <h2 className="font-semibold text-glowup-licorice">Ce qui reste chez Sofian</h2>
        <ul className="mt-3 grid gap-1 text-sm text-gray-700 md:grid-cols-2">
          {CEO_RESERVED_TOPICS.map((t) => (
            <li key={t}>• {t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
