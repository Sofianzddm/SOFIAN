"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
} from "@/components/rh/ui/primitives";

type AuditItem = {
  id: string;
  action: string;
  detail: unknown;
  createdAt: string;
  actor: string;
  actorEmail: string | null;
  target: string | null;
  targetId: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  "settings.update": "Paramètres",
  "employee.update": "Fiche collab",
  "timesheet.submit": "Feuille envoyée",
  "timesheet.approve": "Feuille validée",
  "timesheet.refuse": "Feuille refusée",
  "timesheet.requestSignature": "Signature demandée",
  "timesheet.sign": "Feuille signée",
  "timesheet.monthlySignatures": "Signatures mensuelles",
  "leave.create": "Absence posée",
  "leave.approve": "Absence validée",
  "leave.refuse": "Absence refusée",
  "expense.submit": "NDF envoyée",
  "expense.approve": "NDF validée",
  "expense.refuse": "NDF refusée",
  "remote.exception": "TT exceptionnel",
  "request.cancel": "Demande annulée",
  "payroll.export": "Export paie",
  "payroll.comptable": "Export comptable",
  "payslip.apply": "Bulletin appliqué",
  "payslip.reject": "Bulletin rejeté",
  "admin.forceLeave": "Force absence",
  "admin.adjustBalance": "Ajustement solde",
  "document.upload": "Document",
};

export function AuditTimelinePanel() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = filter.trim()
        ? `?action=${encodeURIComponent(filter.trim())}`
        : "";
      const res = await fetch(`/api/rh/audit${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de charger l’audit");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RhCard>
      <RhCardHead
        title="Journal d’audit"
        badge={
          <span className="text-[11px]" style={{ color: "#8B95A5" }}>
            Actions à impact · HR
          </span>
        }
        right={
          <RhButton type="button" variant="ghost" onClick={() => void load()}>
            Rafraîchir
          </RhButton>
        }
      />
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {[
          "",
          "timesheet",
          "leave",
          "expense",
          "payroll",
          "admin",
          "payslip",
        ].map((f) => (
          <button
            key={f || "all"}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              filter === f
                ? "bg-[#E5F2B5] text-[#0B0F14]"
                : "bg-[#1D2530] text-[#8B95A5]"
            }`}
          >
            {f || "Tout"}
          </button>
        ))}
      </div>
      {error && (
        <p className="px-4 pb-3 text-sm text-[#F2604E]">{error}</p>
      )}
      {loading ? (
        <p className="px-4 pb-4 text-sm text-[#8B95A5]">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[#8B95A5]">Aucun événement.</p>
      ) : (
        <ul className="max-h-[420px] space-y-2 overflow-y-auto px-4 pb-4">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-lg border border-[#1D2530] bg-[#121820] px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <RhBadge bg="#1D2530" fg="#8B95A5">
                  {ACTION_LABEL[it.action] || it.action}
                </RhBadge>
                <span className="text-xs text-[#8B95A5]">
                  {new Date(it.createdAt).toLocaleString("fr-FR")}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#E8ECF1]">
                {it.actor}
                {it.target ? ` → ${it.target}` : ""}
              </p>
              {it.actorEmail && (
                <p className="text-xs text-[#8B95A5]">{it.actorEmail}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </RhCard>
  );
}
