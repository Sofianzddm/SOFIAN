"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  History,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  X,
} from "lucide-react";
import {
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

type Line = {
  id: string;
  n: number;
  date: string;
  category: string;
  label: string;
  nature: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  reimbursed: number;
  receiptUrl: string | null;
  receiptName: string | null;
  missingReceipt: boolean;
  comment: string | null;
  isMileage: boolean;
  km: number | null;
  status: string;
  warning: boolean;
};

type Summary = {
  horsKm: number;
  vat: number;
  mileage: number;
  distance: number;
  reimbursed: number;
  total: number;
  warnings: number;
};

type Report = {
  id: string;
  number: number;
  label: string;
  periodTitle: string;
  status: string;
  periodMonth: number;
  periodYear: number;
  totalAmount: number;
  createdAt: string;
  paidBy: string;
  nextApprover: string | null;
  summary: Summary;
  lines: Line[];
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Créée",
  SUBMITTED: "Soumise",
  APPROVED: "Approuvée",
  REFUSED: "Refusée",
  PAID: "Payée",
};

const NATURES = [
  "Admin",
  "Carburant tourisme",
  "Transport",
  "Repas",
  "Hébergement",
  "Fournitures",
  "Frais kilométriques",
];

function euro(n: number) {
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function ExpensesScreen() {
  const { me, refresh } = useRhData();
  const [reports, setReports] = useState<Report[]>([]);
  const [declarant, setDeclarant] = useState("");
  const [tr, setTr] = useState<{
    count: number;
    facial: number;
    companyShare: number;
    payrollDeduction: number;
  } | null>(null);
  const [vehicle, setVehicle] = useState<{
    fiscalHorsepower?: number;
    yearKm?: number;
    insuranceExpiresOn?: string | null;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [receiptLine, setReceiptLine] = useState<Line | null>(null);
  const [commentLine, setCommentLine] = useState<Line | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: "Admin",
    label: "",
    amount: "",
    vatRate: "20",
    comment: "",
    isMileage: false,
    km: "",
    receiptUrl: "",
    receiptName: "",
  });

  const load = useCallback(async () => {
    const [expRes, trRes] = await Promise.all([
      fetch("/api/rh/expenses"),
      fetch("/api/rh/tr/month"),
    ]);
    if (expRes.ok) {
      const data = await expRes.json();
      setReports(data.reports || []);
      setDeclarant(data.declarant || "");
      setVehicle(data.vehicle);
      setActiveId((prev) => prev || data.reports?.[0]?.id || null);
    }
    if (trRes.ok) {
      const data = await trRes.json();
      setTr(data.tr);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => reports.find((r) => r.id === activeId) || reports[0] || null,
    [reports, activeId]
  );

  async function createReport() {
    setBusy(true);
    setMsg(null);
    try {
      const now = new Date();
      const res = await fetch("/api/rh/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          periodMonth: now.getMonth() + 1,
          periodYear: now.getFullYear(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setActiveId(data.report.id);
      await load();
      setMsg("Note créée");
      setShowAdd(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/rh/expenses/receipt", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload impossible");
    setForm((f) => ({ ...f, receiptUrl: data.url, receiptName: data.name }));
  }

  async function addLine() {
    if (!active || active.status !== "DRAFT") {
      setMsg("Ouvre ou crée une note brouillon");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/rh/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addLine",
          reportId: active.id,
          date: form.date,
          category: form.isMileage ? "Frais kilométriques" : form.category,
          label: form.label || form.category,
          amount: Number(form.amount) || 0,
          vatRate: form.isMileage ? 0 : Number(form.vatRate) || 0,
          comment: form.comment || undefined,
          isMileage: form.isMileage,
          km: form.isMileage ? Number(form.km) || 0 : undefined,
          fiscalHp: vehicle?.fiscalHorsepower,
          receiptUrl: form.receiptUrl || undefined,
          receiptName: form.receiptName || undefined,
          missingReceipt: !form.isMileage && !form.receiptUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setForm({
        date: new Date().toISOString().slice(0, 10),
        category: "Admin",
        label: "",
        amount: "",
        vatRate: "20",
        comment: "",
        isMileage: false,
        km: "",
        receiptUrl: "",
        receiptName: "",
      });
      setShowAdd(false);
      await load();
      setMsg("Dépense ajoutée");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rh/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", reportId: active.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMsg("Note soumise pour approbation");
      await load();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const statusText = active
    ? active.nextApprover
      ? `${STATUS_LABEL[active.status] || active.status} (Prochain approbateur : ${active.nextApprover})`
      : STATUS_LABEL[active.status] || active.status
    : "";

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow={`NDF · ${me?.employee.matricule || "—"}`}
        title="Situation et notes de frais"
        actions={
          <>
            <RhButton
              variant="secondary"
              disabled={busy}
              onClick={() => void createReport()}
            >
              <Plus size={14} /> Nouvelle note
            </RhButton>
            <RhButton
              disabled={busy || !active || active.status !== "DRAFT"}
              onClick={() => void submit()}
            >
              <Send size={14} /> Soumettre
            </RhButton>
          </>
        }
      />

      {msg ? (
        <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.accent }}>
          {msg}
        </p>
      ) : null}

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "220px minmax(0,1fr)" }}
      >
        <RhCard>
          <RhCardHead title="Mes notes" />
          <div className="flex flex-col">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveId(r.id)}
                className="text-left border-0 cursor-pointer px-3 py-3"
                style={{
                  background: r.id === active?.id ? "#151C23" : "transparent",
                  borderBottom: "1px solid #15191F",
                  boxShadow:
                    r.id === active?.id ? "inset 2px 0 0 #E5F2B5" : undefined,
                  color: EMP_COLORS.text,
                }}
              >
                <div className="text-[12.5px] font-semibold">{r.periodTitle}</div>
                <div
                  className="rh-mono text-[10px] mt-0.5"
                  style={{ color: EMP_COLORS.dim }}
                >
                  N° {r.number} · {STATUS_LABEL[r.status] || r.status}
                </div>
                <div
                  className="rh-mono text-[11px] mt-1"
                  style={{ color: EMP_COLORS.accent }}
                >
                  {euro(r.summary.total)}
                </div>
              </button>
            ))}
            {!reports.length ? (
              <div className="p-4 text-[12px]" style={{ color: EMP_COLORS.muted }}>
                Aucune note — crée-en une.
              </div>
            ) : null}
          </div>
        </RhCard>

        <RhCard strong>
          {!active ? (
            <div className="p-8 text-[13px]" style={{ color: EMP_COLORS.muted }}>
              Sélectionne ou crée une note de frais.
            </div>
          ) : (
            <div className="flex flex-col">
              <div
                className="flex items-start justify-between gap-4 px-5 pt-5 pb-4"
                style={{ borderBottom: "1px solid #1B212A" }}
              >
                <div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
                      {active.periodTitle}
                    </h2>
                    <span
                      className="rh-mono text-[12px]"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      N° {active.number}
                    </span>
                    <span
                      className="rh-mono text-[12px]"
                      style={{ color: EMP_COLORS.dim }}
                    >
                      {fmtDate(active.createdAt)}
                    </span>
                  </div>
                  <div
                    className="grid gap-x-6 gap-y-1 mt-3 text-[12.5px]"
                    style={{
                      gridTemplateColumns: "auto 1fr",
                      color: EMP_COLORS.body,
                    }}
                  >
                    <span style={{ color: EMP_COLORS.dim }}>Déclarant :</span>
                    <span style={{ color: EMP_COLORS.text }}>{declarant}</span>
                    <span style={{ color: EMP_COLORS.dim }}>Réglée par :</span>
                    <span style={{ color: EMP_COLORS.text }}>{active.paidBy}</span>
                    <span style={{ color: EMP_COLORS.dim }}>Statut :</span>
                    <span style={{ color: EMP_COLORS.text }}>{statusText}</span>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2"
                  style={{ color: EMP_COLORS.dim }}
                >
                  <button
                    type="button"
                    className="rh-btn-secondary p-2"
                    title="Historique"
                    disabled
                  >
                    <History size={15} />
                  </button>
                  <button
                    type="button"
                    className="rh-btn-secondary p-2"
                    title="PDF"
                    disabled
                  >
                    <FileText size={15} />
                  </button>
                  <button
                    type="button"
                    className="rh-btn-secondary p-2"
                    title="Excel"
                    disabled
                  >
                    <FileSpreadsheet size={15} />
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                <div
                  className="grid gap-4 rounded-[10px] px-4 py-3"
                  style={{
                    gridTemplateColumns: "repeat(4, 1fr)",
                    border: "1px solid rgba(70, 214, 192, 0.45)",
                    background: "rgba(70, 214, 192, 0.06)",
                  }}
                >
                  <SummaryCell
                    label="Montant total (hors km)"
                    value={euro(active.summary.horsKm)}
                  />
                  <SummaryCell label="Dont TVA" value={euro(active.summary.vat)} />
                  <SummaryCell
                    label="Indemnités kilométriques"
                    value={euro(active.summary.mileage)}
                  />
                  <SummaryCell
                    label="Distance"
                    value={String(active.summary.distance)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-5 pb-3">
                <div className="flex gap-2">
                  <ToggleBtn
                    active={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                  >
                    Affichage liste
                  </ToggleBtn>
                  <ToggleBtn
                    active={viewMode === "table"}
                    onClick={() => setViewMode("table")}
                  >
                    Affichage tableau
                  </ToggleBtn>
                </div>
                {active.status === "DRAFT" ? (
                  <RhButton disabled={busy} onClick={() => void submit()}>
                    Soumettre
                  </RhButton>
                ) : null}
              </div>

              <div className="px-5 pb-2 overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr
                      style={{
                        color: EMP_COLORS.dim,
                        borderBottom: "1px solid #1B212A",
                      }}
                    >
                      <th className="text-left font-medium py-2 pr-2 w-10">N°</th>
                      <th className="text-left font-medium py-2 pr-2 w-[90px]">
                        Date
                      </th>
                      <th className="text-left font-medium py-2 pr-2">Nature</th>
                      <th className="text-right font-medium py-2 pr-2">Dépensé</th>
                      <th className="text-right font-medium py-2 pr-2">TVA</th>
                      <th className="text-right font-medium py-2 pr-2">
                        Pris en charge
                      </th>
                      <th className="w-10" />
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {active.lines.map((l) => (
                      <tr
                        key={l.id}
                        style={{
                          borderBottom: "1px solid #15191F",
                          boxShadow: l.warning
                            ? "inset 3px 0 0 #F2874E"
                            : undefined,
                        }}
                      >
                        <td
                          className="py-2.5 pr-2 rh-mono"
                          style={{ color: EMP_COLORS.dim }}
                        >
                          {l.n}
                        </td>
                        <td className="py-2.5 pr-2 rh-mono">{fmtDate(l.date)}</td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span>{l.nature}</span>
                            {l.warning ? (
                              <AlertTriangle
                                size={14}
                                style={{ color: "#F0C24E" }}
                              />
                            ) : null}
                          </div>
                          {viewMode === "list" && l.label !== l.nature ? (
                            <div
                              className="text-[11px] mt-0.5"
                              style={{ color: EMP_COLORS.dim }}
                            >
                              {l.label}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-2 text-right rh-mono">
                          {euro(l.amount)}
                        </td>
                        <td className="py-2.5 pr-2 text-right rh-mono">
                          {euro(l.vatAmount)}
                        </td>
                        <td
                          className="py-2.5 pr-2 text-right rh-mono font-semibold"
                          style={{
                            color: l.warning ? "#F2874E" : EMP_COLORS.text,
                          }}
                        >
                          {euro(l.reimbursed)}
                        </td>
                        <td className="py-2.5 text-center">
                          {l.receiptUrl ? (
                            <button
                              type="button"
                              className="border-0 bg-transparent cursor-pointer p-1"
                              style={{ color: EMP_COLORS.accent }}
                              onClick={() => setReceiptLine(l)}
                              title={l.receiptName || "Justificatif"}
                            >
                              <Paperclip size={14} />
                            </button>
                          ) : l.isMileage ? null : (
                            <span style={{ color: EMP_COLORS.dim }}>
                              <Paperclip size={14} />
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          {l.comment ? (
                            <button
                              type="button"
                              className="border-0 bg-transparent cursor-pointer p-1"
                              style={{ color: EMP_COLORS.body }}
                              onClick={() => setCommentLine(l)}
                            >
                              <MessageSquare size={14} />
                            </button>
                          ) : (
                            <span style={{ color: "#2B333F" }}>
                              <MessageSquare size={14} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "1px solid #2B333F" }}>
                      <td colSpan={3} className="py-3 font-semibold">
                        Totaux
                      </td>
                      <td className="py-3 text-right rh-mono font-semibold">
                        {euro(active.summary.total)}
                      </td>
                      <td className="py-3 text-right rh-mono font-semibold">
                        {euro(active.summary.vat)}
                      </td>
                      <td className="py-3 text-right rh-mono font-semibold">
                        {euro(active.summary.reimbursed)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                {!active.lines.length ? (
                  <div
                    className="py-8 text-center text-[12.5px]"
                    style={{ color: EMP_COLORS.muted }}
                  >
                    Aucune dépense — clique sur « Ajouter dépense ».
                  </div>
                ) : null}
              </div>

              <div className="px-5 pb-5 pt-2 flex items-center gap-3">
                <RhButton
                  disabled={busy || active.status !== "DRAFT"}
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={14} /> Ajouter dépense
                </RhButton>
                {active.status === "DRAFT" ? (
                  <RhButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    <Send size={14} /> Soumettre pour approbation
                  </RhButton>
                ) : null}
              </div>
            </div>
          )}
        </RhCard>
      </div>

      <RhCard>
        <RhCardHead
          title="Titres-restaurant du mois"
          badge={
            <RhBadge bg="#1D2530" fg="#8B95A5">
              AUTO
            </RhBadge>
          }
        />
        <div className="p-4 flex items-end gap-6">
          <div>
            <div
              className="rh-mono text-[38px] font-medium leading-none"
              style={{ color: EMP_COLORS.accent }}
            >
              {tr?.count ?? "—"}
            </div>
            <div
              className="rh-mono text-[9px] mt-1"
              style={{ color: EMP_COLORS.dim }}
            >
              TITRES
            </div>
          </div>
          <div
            className="grid grid-cols-3 gap-2 flex-1 rh-mono text-[11px]"
            style={{ color: EMP_COLORS.body }}
          >
            <div
              className="rounded-[8px] p-2"
              style={{ background: EMP_COLORS.inset }}
            >
              {tr?.facial?.toFixed(2) ?? "9,00"} €
              <div className="text-[9px]" style={{ color: EMP_COLORS.dim }}>
                FACIALE
              </div>
            </div>
            <div
              className="rounded-[8px] p-2"
              style={{ background: EMP_COLORS.inset }}
            >
              {tr?.companyShare?.toFixed(2) ?? "5,40"} €
              <div className="text-[9px]" style={{ color: EMP_COLORS.dim }}>
                PART AGENCE
              </div>
            </div>
            <div
              className="rounded-[8px] p-2"
              style={{ background: EMP_COLORS.inset }}
            >
              {tr?.payrollDeduction?.toFixed(2) ?? "—"} €
              <div className="text-[9px]" style={{ color: EMP_COLORS.dim }}>
                RETENUE PAIE
              </div>
            </div>
          </div>
        </div>
      </RhCard>

      {showAdd && active ? (
        <Modal title="Ajouter dépense" onClose={() => setShowAdd(false)}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <EmpLabel>Date</EmpLabel>
              <input
                type="date"
                className="rh-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label
              className="flex items-center gap-2 text-[12.5px]"
              style={{ color: EMP_COLORS.body }}
            >
              <input
                type="checkbox"
                checked={form.isMileage}
                onChange={(e) =>
                  setForm({
                    ...form,
                    isMileage: e.target.checked,
                    category: e.target.checked
                      ? "Frais kilométriques"
                      : "Admin",
                    vatRate: e.target.checked ? "0" : "20",
                  })
                }
              />
              Indemnités kilométriques
            </label>
            {!form.isMileage ? (
              <label className="flex flex-col gap-1">
                <EmpLabel>Nature</EmpLabel>
                <select
                  className="rh-input"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {NATURES.filter((n) => n !== "Frais kilométriques").map(
                    (n) => (
                      <option key={n}>{n}</option>
                    )
                  )}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1">
              <EmpLabel>Libellé</EmpLabel>
              <input
                className="rh-input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex. ACTION Plan de Campagne"
              />
            </label>
            {form.isMileage ? (
              <label className="flex flex-col gap-1">
                <EmpLabel>Distance (km)</EmpLabel>
                <input
                  className="rh-input rh-mono"
                  value={form.km}
                  onChange={(e) => setForm({ ...form, km: e.target.value })}
                />
              </label>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <EmpLabel>Montant TTC €</EmpLabel>
                    <input
                      className="rh-input rh-mono"
                      value={form.amount}
                      onChange={(e) =>
                        setForm({ ...form, amount: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <EmpLabel>Taux TVA %</EmpLabel>
                    <input
                      className="rh-input rh-mono"
                      value={form.vatRate}
                      onChange={(e) =>
                        setForm({ ...form, vatRate: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <EmpLabel>Justificatif</EmpLabel>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="rh-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void uploadReceipt(file).catch((err) =>
                          setMsg(
                            err instanceof Error ? err.message : "Upload KO"
                          )
                        );
                    }}
                  />
                  {form.receiptName ? (
                    <span
                      className="rh-mono text-[10px]"
                      style={{ color: EMP_COLORS.accent }}
                    >
                      {form.receiptName}
                    </span>
                  ) : null}
                </label>
              </>
            )}
            <label className="flex flex-col gap-1">
              <EmpLabel>Commentaire</EmpLabel>
              <textarea
                className="rh-input"
                rows={2}
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </label>
            {vehicle ? (
              <div
                className="rh-mono text-[10px]"
                style={{ color: EMP_COLORS.dim }}
              >
                Véhicule {vehicle.fiscalHorsepower} CV · {vehicle.yearKm} km YTD
              </div>
            ) : form.isMileage ? (
              <div className="text-[11px]" style={{ color: EMP_COLORS.warning }}>
                Pas de véhicule déclaré — IK impossibles.
              </div>
            ) : null}
            <RhButton
              className="w-full"
              disabled={busy}
              onClick={() => void addLine()}
            >
              Enregistrer la dépense
            </RhButton>
          </div>
        </Modal>
      ) : null}

      {receiptLine?.receiptUrl ? (
        <Modal
          title={`Justificatif · ${receiptLine.nature}`}
          onClose={() => setReceiptLine(null)}
          wide
        >
          <div
            className="text-[12px] mb-3"
            style={{ color: EMP_COLORS.body }}
          >
            {fmtDate(receiptLine.date)} · {euro(receiptLine.amount)}
            {receiptLine.receiptName ? ` · ${receiptLine.receiptName}` : ""}
          </div>
          {/\.pdf($|\?)/i.test(receiptLine.receiptUrl) ? (
            <iframe
              title="Justificatif"
              src={receiptLine.receiptUrl}
              className="w-full rounded-[8px] border-0"
              style={{ height: "70vh", background: "#fff" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receiptLine.receiptUrl}
              alt="Justificatif"
              className="max-w-full rounded-[8px] mx-auto"
              style={{ maxHeight: "70vh" }}
            />
          )}
        </Modal>
      ) : null}

      {commentLine ? (
        <Modal title="Commentaire" onClose={() => setCommentLine(null)}>
          <p
            className="m-0 text-[13px] leading-[1.55]"
            style={{ color: EMP_COLORS.body }}
          >
            {commentLine.comment}
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px]" style={{ color: EMP_COLORS.dim }}>
        {label}
      </div>
      <div
        className="rh-mono text-[18px] font-semibold mt-1"
        style={{ color: EMP_COLORS.text }}
      >
        {value}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-0 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12px] font-medium"
      style={{
        background: active ? "#1D2530" : "#12161C",
        color: active ? EMP_COLORS.accent : EMP_COLORS.muted,
        border: `1px solid ${active ? "#2B333F" : "#232932"}`,
      }}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,.65)" }}
      onClick={onClose}
    >
      <div
        className="rounded-[14px] w-full flex flex-col"
        style={{
          maxWidth: wide ? 860 : 440,
          background: "#10141A",
          border: "1px solid #1F252E",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid #1B212A" }}
        >
          <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
          <button
            type="button"
            className="border-0 bg-transparent cursor-pointer p-1"
            style={{ color: EMP_COLORS.muted }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
