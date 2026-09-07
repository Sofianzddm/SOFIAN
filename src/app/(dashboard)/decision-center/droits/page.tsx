"use client";

import { useEffect, useMemo, useState } from "react";
import { LevelBadge, PrincipleBanner, EmptyState } from "@/components/decision-center/ui";
import { DC_DOMAIN_LABELS, DC_ROLE_LABELS } from "@/lib/decision-center/labels";
import type { DcLevel, DcRole } from "@/lib/decision-center/constants";
import { myRightsRoles } from "@/lib/decision-center/visibility";

type Policy = {
  id: string;
  code: string;
  domain: string;
  title: string;
  autonomyRule: string;
  level: DcLevel;
  ownerRole: DcRole;
  executorRole: DcRole | null;
  finalDecisionRole: DcRole;
  isActive: boolean;
};

export default function MesDroitsPage() {
  const [role, setRole] = useState<DcRole | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);

  useEffect(() => {
    fetch("/api/decision-center/session")
      .then((r) => r.json())
      .then((s) => setRole(s.dcRole));
    fetch("/api/decision-center/policies?active=true")
      .then((r) => r.json())
      .then((d) => setPolicies(d.policies || []));
  }, []);

  const mine = useMemo(() => {
    if (!role) return { green: [] as Policy[], orange: [] as Policy[], red: [] as Policy[] };
    const roles = myRightsRoles(role);
    const relevant = policies.filter((p) => {
      if (role === "CEO") return true;
      return (
        roles.includes(p.ownerRole) ||
        (p.executorRole && roles.includes(p.executorRole)) ||
        roles.includes(p.finalDecisionRole)
      );
    });
    return {
      green: relevant.filter((p) => p.level === "GREEN"),
      orange: relevant.filter((p) => p.level === "ORANGE"),
      red: relevant.filter(
        (p) =>
          p.level === "RED" &&
          (role === "CEO" ||
            roles.includes(p.ownerRole) ||
            (p.executorRole && roles.includes(p.executorRole)))
      ),
    };
  }, [policies, role]);

  function Group({
    title,
    items,
  }: {
    title: string;
    items: Policy[];
  }) {
    if (!items.length) return null;
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold text-glowup-licorice">{title}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((p) => (
            <article key={p.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-500">
                  {DC_DOMAIN_LABELS[p.domain as keyof typeof DC_DOMAIN_LABELS]}
                </p>
                <LevelBadge level={p.level} />
              </div>
              <h3 className="mt-2 font-medium text-glowup-licorice">{p.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{p.autonomyRule}</p>
              <p className="mt-2 text-xs text-gray-500">
                Owner : {DC_ROLE_LABELS[p.ownerRole]}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">
          Mes droits de décision
        </h1>
        <p className="text-gray-600">Ce que tu peux décider, dans quel cadre, et ce qui remonte.</p>
      </header>
      <PrincipleBanner />
      {!role ? (
        <EmptyState title="Chargement" hint="Récupération de tes droits…" />
      ) : (
        <>
          <Group title="Je peux décider seul" items={mine.green} />
          <Group title="Je peux décider dans un cadre" items={mine.orange} />
          <Group
            title={role === "CEO" ? "Je dois trancher" : "Je dois escalader"}
            items={mine.red}
          />
        </>
      )}
    </div>
  );
}
