"use client";

import { useMemo, useState } from "react";
import { Ban, Copy, Download, Inbox } from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import type { EmployeeRequest, RequestStatus } from "@/components/rh/mock/employee";
import {
  EmpFlow,
  EmpKeyValue,
  EmpLabel,
  EmpStatus,
  EmpTd,
  EmpTh,
  EMP_COLORS,
} from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

const STATUS_TONE: Record<RequestStatus, string> = {
  pending: EMP_COLORS.warning,
  approved: EMP_COLORS.success,
  refused: EMP_COLORS.danger,
};

function mapStatus(raw: string): RequestStatus {
  const s = raw.toLowerCase();
  if (s === "approved" || s === "signed") return "approved";
  if (s === "refused" || s === "cancelled") return "refused";
  return "pending";
}

export function RequestsScreen({
  sel,
  onSelect,
}: {
  sel: number;
  onSelect: (index: number) => void;
}) {
  const { inbox } = useRhData();
  const [filter, setFilter] = useState("all");

  const list: EmployeeRequest[] = useMemo(
    () =>
      inbox.map((item) => {
        const status = mapStatus(String(item.status || "PENDING"));
        return {
          ref: String(item.reference || item.id),
          type: String(item.type || ""),
          typeColor: EMP_COLORS.accent,
          period: item.dateFrom
            ? new Date(String(item.dateFrom)).toLocaleDateString("fr-FR")
            : "—",
          duration: item.days != null ? `${item.days} j` : "—",
          submittedAt: item.createdAt
            ? new Date(String(item.createdAt)).toLocaleString("fr-FR")
            : "—",
          approver: "Manager",
          status,
          statusLabel:
            status === "approved"
              ? "APPROUVÉE"
              : status === "refused"
                ? "REFUSÉE"
                : "EN ATTENTE",
          summary: String(item.comment || item.title || ""),
          flow: [
            { label: "Demande déposée", meta: "", state: "done" as const },
            {
              label: "Validation manager",
              meta: "",
              state:
                status === "pending" ? ("current" as const) : ("done" as const),
            },
            {
              label: "Clôture",
              meta: "",
              state: status === "pending" ? ("todo" as const) : ("done" as const),
            },
          ],
        };
      }),
    [inbox]
  );

  const filters = [
    { id: "all", label: "Toutes", count: list.length },
    {
      id: "pending",
      label: "En cours",
      count: list.filter((r) => r.status === "pending").length,
    },
    {
      id: "approved",
      label: "Approuvées",
      count: list.filter((r) => r.status === "approved").length,
    },
    {
      id: "refused",
      label: "Refusées",
      count: list.filter((r) => r.status === "refused").length,
    },
  ];

  const visible = list
    .map((r, i) => ({ req: r, index: i }))
    .filter(({ req }) => filter === "all" || req.status === filter);
  const selected = list[sel] ?? list[0];

  if (list.length === 0) {
    return (
      <div className="rh-screen">
        <div className="flex flex-col items-center gap-[9px] py-[42px]">
          <Inbox size={20} style={{ color: EMP_COLORS.faint }} />
          <span className="text-[12.5px]" style={{ color: EMP_COLORS.muted }}>
            Aucune demande pour le moment
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rh-screen">
      <div className="flex flex-wrap items-center gap-[8px]">
        {filters.map((f) => {
          const on = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="flex cursor-pointer items-center gap-[7px] rounded-[8px] border-0 px-[12px] py-[7px] text-[12.5px] font-medium"
              style={{
                background: on ? "rgba(229,242,181,.09)" : EMP_COLORS.control,
                border: `1px solid ${on ? "rgba(229,242,181,.4)" : EMP_COLORS.borderControl}`,
                color: on ? EMP_COLORS.accent : EMP_COLORS.muted,
              }}
            >
              {f.label}
              <span
                className="rh-mono text-[10px] font-bold"
                style={{ color: on ? EMP_COLORS.accent : EMP_COLORS.dim }}
              >
                {f.count}
              </span>
            </button>
          );
        })}
        <span className="flex-1" />
        <RhButton variant="secondary" style={{ padding: "7px 12px", fontSize: 12 }}>
          <Download size={12} />
          Exporter l&apos;historique
        </RhButton>
      </div>

      <div className="rh-layout-inspect">
        <RhCard className="overflow-hidden">
          <RhCardHead
            title="Historique de mes demandes"
            badge={
              <span
                className="rh-badge"
                style={{ background: EMP_COLORS.chip, color: EMP_COLORS.secondary }}
              >
                {visible.length} AFFICHÉES
              </span>
            }
          />
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-[9px] py-[42px]">
              <Inbox size={20} style={{ color: EMP_COLORS.faint }} />
              <span className="text-[12.5px]" style={{ color: EMP_COLORS.muted }}>
                Aucune demande dans ce filtre
              </span>
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <EmpTh>Réf.</EmpTh>
                  <EmpTh>Type</EmpTh>
                  <EmpTh>Statut</EmpTh>
                  <EmpTh align="right">Durée</EmpTh>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ req, index }) => {
                  const on = index === sel;
                  return (
                    <tr
                      key={req.ref}
                      onClick={() => onSelect(index)}
                      className="cursor-pointer"
                      style={{
                        background: on ? "#151C23" : undefined,
                        boxShadow: on ? "inset 2px 0 0 #E5F2B5" : undefined,
                      }}
                    >
                      <EmpTd mono>{req.ref}</EmpTd>
                      <EmpTd bold>{req.type}</EmpTd>
                      <EmpTd>
                        <EmpStatus
                          label={req.statusLabel}
                          tone={STATUS_TONE[req.status]}
                        />
                      </EmpTd>
                      <EmpTd align="right" mono>
                        {req.duration}
                      </EmpTd>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </RhCard>

        {selected ? (
          <aside className="rh-inspector">
            <RhCard strong>
              <RhCardHead title={selected.type} />
              <div className="flex flex-col gap-[10px] p-[14px]">
                <EmpLabel>Référence</EmpLabel>
                <div className="rh-mono text-[12px]" style={{ color: EMP_COLORS.text }}>
                  {selected.ref}
                </div>
                <EmpKeyValue label="Statut" value={selected.statusLabel} mono />
                <EmpKeyValue label="Période" value={selected.period} mono />
                <p className="m-0 text-[12px]" style={{ color: EMP_COLORS.secondary }}>
                  {selected.summary}
                </p>
                <EmpFlow steps={selected.flow} />
                <div className="flex gap-2">
                  <RhButton variant="secondary" style={{ flex: 1, fontSize: 12 }}>
                    <Copy size={12} /> Copier
                  </RhButton>
                  <RhButton variant="danger" style={{ flex: 1, fontSize: 12 }}>
                    <Ban size={12} /> Annuler
                  </RhButton>
                </div>
              </div>
            </RhCard>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
