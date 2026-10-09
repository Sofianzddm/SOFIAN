"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Copy, Inbox, RefreshCw } from "lucide-react";
import { toast } from "sonner";
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

const STATUS_TONE: Record<RequestStatus, string> = {
  pending: EMP_COLORS.warning,
  approved: EMP_COLORS.success,
  refused: EMP_COLORS.danger,
};

type RowItem = EmployeeRequest & {
  id: string;
  reviewNote?: string;
  rawStatus: string;
};

const TYPE_LABEL: Record<string, string> = {
  LEAVE: "Absence",
  UNPAID_LEAVE: "Sans solde",
  REMOTE_EXCEPTION: "Exception TT",
  REMOTE_PLAN: "Plan TT",
  TIMESHEET: "Feuille de temps",
  EXPENSE: "Note de frais",
  CONTACT_CHANGE: "Coordonnées",
  ADDRESS_CHANGE: "Adresse TT",
  PAUSE_AMEND: "Pause temps",
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
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rh/my-requests", { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de charger tes demandes");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const list: RowItem[] = useMemo(
    () =>
      items.map((item) => {
        const rawStatus = String(item.status || "PENDING");
        const status = mapStatus(rawStatus);
        const typeKey = String(item.type || "");
        const reviewNote =
          typeof item.reviewNote === "string" ? item.reviewNote : undefined;
        const cancelled = rawStatus === "CANCELLED";
        return {
          id: String(item.id),
          ref: String(item.reference || item.id),
          type: TYPE_LABEL[typeKey] || typeKey,
          typeColor: EMP_COLORS.accent,
          period: item.dateFrom
            ? [
                new Date(String(item.dateFrom)).toLocaleDateString("fr-FR"),
                item.dateTo
                  ? new Date(String(item.dateTo)).toLocaleDateString("fr-FR")
                  : null,
              ]
                .filter(Boolean)
                .join(" → ")
            : "—",
          duration: item.days != null ? `${item.days} j` : "—",
          submittedAt: item.createdAt
            ? new Date(String(item.createdAt)).toLocaleString("fr-FR")
            : "—",
          approver: "Manager / RH",
          status: cancelled ? ("refused" as const) : status,
          statusLabel: cancelled
            ? "ANNULÉE"
            : status === "approved"
              ? "APPROUVÉE"
              : status === "refused"
                ? "REFUSÉE"
                : "EN ATTENTE",
          summary: String(item.comment || item.title || ""),
          reviewNote,
          rawStatus,
          flow: [
            {
              label: "Demande déposée",
              meta: item.createdAt
                ? new Date(String(item.createdAt)).toLocaleDateString("fr-FR")
                : "",
              state: "done" as const,
            },
            {
              label: cancelled
                ? "Annulée par toi"
                : "Validation manager / RH",
              meta:
                status === "refused" && reviewNote
                  ? `Motif : ${reviewNote}`
                  : "",
              state:
                status === "pending" && !cancelled
                  ? ("current" as const)
                  : ("done" as const),
            },
            {
              label: cancelled
                ? "Clôturée"
                : status === "refused"
                  ? "Refusée"
                  : "Clôturée",
              meta: "",
              state:
                status === "pending" && !cancelled
                  ? ("todo" as const)
                  : ("done" as const),
            },
          ],
        };
      }),
    [items]
  );

  async function cancelSelected(id: string) {
    if (
      !window.confirm(
        "Annuler cette demande ? Elle disparaîtra de la file de ton manager."
      )
    ) {
      return;
    }
    setCancelling(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/rh/requests/${id}/cancel`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Annulation impossible"
        );
      }
      setActionMsg("Demande annulée");
      toast.success("Demande annulée");
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Erreur";
      setActionMsg(err);
      toast.error(err);
    } finally {
      setCancelling(false);
    }
  }

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

  if (loading) {
    return (
      <div className="rh-screen">
        <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.muted }}>
          Chargement de tes demandes…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rh-screen">
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.danger }}>
            {error}
          </p>
          <RhButton variant="secondary" onClick={() => void load()}>
            <RefreshCw size={12} /> Réessayer
          </RhButton>
        </div>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="rh-screen">
        <div className="flex flex-col items-center gap-[9px] py-[42px]">
          <Inbox size={20} style={{ color: EMP_COLORS.faint }} />
          <span className="text-[13px] font-medium" style={{ color: EMP_COLORS.text }}>
            Aucune demande pour l’instant
          </span>
          <span className="text-[12.5px] text-center max-w-[320px]" style={{ color: EMP_COLORS.muted }}>
            Quand tu poses une absence, une feuille de temps ou une note de frais,
            elle apparaît ici avec son statut.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rh-screen">
      <div>
        <h1
          className="m-0 text-[26px] font-semibold tracking-[-0.03em]"
          style={{ color: EMP_COLORS.text }}
        >
          Mes demandes
        </h1>
        <p
          className="m-0 mt-2 text-[14px] leading-[1.5] max-w-[520px]"
          style={{ color: EMP_COLORS.muted }}
        >
          Le suivi de ce que tu as envoyé. Pour valider celles de ton équipe,
          ouvre l’espace manager.
        </p>
      </div>

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
        <RhButton
          variant="secondary"
          style={{ padding: "7px 12px", fontSize: 12 }}
          onClick={() => void load()}
        >
          <RefreshCw size={12} />
          Actualiser
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
                <div
                  className="text-[13px] font-medium"
                  style={{ color: EMP_COLORS.text }}
                >
                  {selected.ref}
                </div>
                <EmpKeyValue label="Statut" value={selected.statusLabel} mono />
                <EmpKeyValue label="Période" value={selected.period} mono />
                <EmpKeyValue
                  label="Déposée le"
                  value={selected.submittedAt}
                  mono
                />
                <p
                  className="m-0 text-[13px]"
                  style={{ color: EMP_COLORS.secondary }}
                >
                  {selected.summary || "Pas de commentaire."}
                </p>
                {selected.reviewNote ? (
                  <div
                    className="rounded-[12px] px-3 py-2.5 text-[13px]"
                    style={{
                      background: "rgba(242,96,78,.08)",
                      border: "1px solid rgba(242,96,78,.28)",
                      color: EMP_COLORS.danger,
                    }}
                  >
                    Motif du refus : {selected.reviewNote}
                  </div>
                ) : null}
                <EmpFlow steps={selected.flow} />
                {actionMsg ? (
                  <p
                    className="m-0 text-[12.5px]"
                    style={{ color: EMP_COLORS.accent }}
                  >
                    {actionMsg}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <RhButton
                    variant="secondary"
                    style={{ flex: 1, fontSize: 12 }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(selected.ref);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <Copy size={12} /> {copied ? "Copié !" : "Copier"}
                  </RhButton>
                  {selected.rawStatus === "PENDING" ||
                  selected.rawStatus === "PAUSED" ||
                  selected.rawStatus === "DRAFT" ? (
                    <RhButton
                      variant="danger"
                      style={{ flex: 1, fontSize: 12 }}
                      disabled={cancelling}
                      onClick={() => void cancelSelected(selected.id)}
                    >
                      <Ban size={12} />
                      {cancelling ? "…" : "Annuler"}
                    </RhButton>
                  ) : null}
                </div>
              </div>
            </RhCard>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
