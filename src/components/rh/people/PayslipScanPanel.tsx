"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ScanLine,
  Upload,
} from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";

type ScanRow = {
  employeeId: string;
  matricule: string;
  name: string;
  email: string;
  department: string;
  currentCpSolde: number | null;
  scan: {
    id: string;
    status: string;
    cpAcquis: number | null;
    cpPris: number | null;
    cpSolde: number | null;
    rttSolde: number | null;
    grossSalary: number | null;
    netPay: number | null;
    fileUrl: string;
    fileName: string | null;
    ocrVerified: boolean;
    appliedAt: string | null;
    rawHeader: string | null;
  } | null;
};

type MonthData = {
  year: number;
  month: number;
  label: string;
  firstMonth: boolean;
  totals: {
    employees: number;
    applied: number;
    pending: number;
    missing: number;
    complete: boolean;
  };
  rows: ScanRow[];
};

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function PayslipScanPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthData | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    cpAcquis: "",
    cpPris: "",
    cpSolde: "",
    rttSolde: "",
    grossSalary: "",
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/rh/payslips?year=${year}&month=${month}`);
    if (!res.ok) {
      // Fallback : liste salariés pour ne pas bloquer le sélecteur
      const empRes = await fetch("/api/rh/employees");
      if (empRes.ok) {
        const empData = await empRes.json();
        const rows = (empData.employees || []).map(
          (e: {
            id: string;
            matricule: string;
            name: string;
            email?: string;
            department?: string;
          }) => ({
            employeeId: e.id,
            matricule: e.matricule,
            name: e.name,
            email: e.email || "",
            department: e.department || "",
            currentCpSolde: null,
            scan: null,
          })
        );
        setData({
          year,
          month,
          label: `${MONTHS[month - 1]} ${year}`,
          firstMonth: false,
          totals: {
            employees: rows.length,
            applied: 0,
            pending: 0,
            missing: rows.length,
            complete: false,
          },
          rows,
        });
        toast.message(
          "Bulletins indisponibles — liste salariés chargée. Relance le serveur si besoin."
        );
        return;
      }
      toast.error("Impossible de charger les bulletins");
      return;
    }
    setData(await res.json());
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Premier manquant sélectionné par défaut
  useEffect(() => {
    if (!data?.rows?.length || employeeId) return;
    const missing = data.rows.find((r) => !r.scan);
    if (missing) setEmployeeId(missing.employeeId);
  }, [data, employeeId]);

  async function onUpload(file: File) {
    if (mode === "single" && !employeeId) {
      toast.error("Choisis d’abord le salarié concerné");
      return;
    }
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("year", String(year));
      fd.append("month", String(month));
      fd.append("mode", mode);
      if (mode === "single") fd.append("employeeId", employeeId);
      const res = await fetch("/api/rh/payslips/scan", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scan KO");
      const n = json.created?.length || 0;
      toast.success(
        n
          ? `${n} bulletin${n > 1 ? "s" : ""} scanné${n > 1 ? "s" : ""} — à vérifier`
          : "Aucun salarié reconnu"
      );
      if (json.unmatched?.length) {
        toast.message(`Non trouvés : ${json.unmatched.join(", ")}`);
      }
      if (json.errors?.length) {
        toast.error(json.errors[0]);
      }
      // Passe au prochain manquant
      if (mode === "single" && data) {
        const next = data.rows.find(
          (r) => r.employeeId !== employeeId && !r.scan
        );
        if (next) setEmployeeId(next.employeeId);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan impossible");
    } finally {
      setScanning(false);
    }
  }

  function openEdit(row: ScanRow) {
    if (!row.scan) return;
    setEditId(row.scan.id);
    setForm({
      cpAcquis: row.scan.cpAcquis != null ? String(row.scan.cpAcquis) : "",
      cpPris: row.scan.cpPris != null ? String(row.scan.cpPris) : "",
      cpSolde: row.scan.cpSolde != null ? String(row.scan.cpSolde) : "",
      rttSolde: row.scan.rttSolde != null ? String(row.scan.rttSolde) : "",
      grossSalary:
        row.scan.grossSalary != null ? String(row.scan.grossSalary) : "",
    });
  }

  async function applyScan(scanId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/rh/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          scanId,
          cpAcquis: form.cpAcquis === "" ? null : Number(form.cpAcquis),
          cpPris: form.cpPris === "" ? null : Number(form.cpPris),
          cpSolde: form.cpSolde === "" ? null : Number(form.cpSolde),
          rttSolde: form.rttSolde === "" ? null : Number(form.rttSolde),
          grossSalary:
            form.grossSalary === "" ? null : Number(form.grossSalary),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      toast.success("Soldes mis à jour depuis le bulletin");
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function applyAll() {
    if (
      !confirm(
        "Appliquer tous les bulletins en attente de ce mois ? Vérifie les soldes avant."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rh/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "applyAllPending",
          year,
          month,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      const ok = (json.results || []).filter(
        (r: { ok: boolean }) => r.ok
      ).length;
      const ko = (json.results || []).filter(
        (r: { ok: boolean }) => !r.ok
      ).length;
      toast.success(`${ok} appliqué(s)${ko ? ` · ${ko} en erreur` : ""}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-4">
      <RhCard>
        <RhCardHead
          title="Scan bulletins de salaire"
          right={
            totals ? (
              <span
                className="rh-mono text-[12px]"
                style={{
                  color: totals.complete
                    ? EMP_COLORS.success
                    : EMP_COLORS.accent,
                }}
              >
                {totals.applied}/{totals.employees} appliqués
              </span>
            ) : null
          }
        />
        <div className="p-4 flex flex-col gap-4">
          {data?.firstMonth ? (
            <div
              className="rounded-[12px] px-3 py-2.5 text-[12.5px] leading-[1.45] flex gap-2"
              style={{
                background: "rgba(242,135,78,.12)",
                border: "1px solid rgba(242,135,78,.35)",
                color: "#F2874E",
              }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <strong>Premier mois</strong> — pour chaque salarié : choisis-le
                dans la liste, uploade son bulletin, vérifie Acquis / Pris /
                Solde, puis applique. Obligatoire pour tous les actifs.
              </span>
            </div>
          ) : (
            <p
              className="m-0 text-[12.5px] leading-[1.45]"
              style={{ color: EMP_COLORS.muted }}
            >
              Chaque mois : uploade le PDF des bulletins (format Glow Up
              Silae). On lit le matricule automatiquement, tu vérifies les
              soldes, puis on met à jour CP / RTT.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="border-0 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: mode === "single" ? "#1D2530" : "#12161C",
                color: mode === "single" ? EMP_COLORS.accent : EMP_COLORS.muted,
                border: `1px solid ${mode === "single" ? "#2B333F" : "#232932"}`,
              }}
              onClick={() => setMode("single")}
            >
              1 salarié (choisir)
            </button>
            <button
              type="button"
              className="border-0 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: mode === "batch" ? "#1D2530" : "#12161C",
                color: mode === "batch" ? EMP_COLORS.accent : EMP_COLORS.muted,
                border: `1px solid ${mode === "batch" ? "#2B333F" : "#232932"}`,
              }}
              onClick={() => setMode("batch")}
            >
              Lot PDF (auto matricule)
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span
                className="text-[11px] font-medium"
                style={{ color: EMP_COLORS.dim }}
              >
                Mois
              </span>
              <select
                className="rh-input"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                style={{ minWidth: 140 }}
              >
                {MONTHS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-[11px] font-medium"
                style={{ color: EMP_COLORS.dim }}
              >
                Année
              </span>
              <input
                type="number"
                className="rh-input rh-mono"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
                style={{ width: 100 }}
              />
            </label>
            {mode === "single" ? (
              <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
                <span
                  className="text-[11px] font-medium"
                  style={{ color: EMP_COLORS.dim }}
                >
                  Salarié *
                </span>
                <select
                  className="rh-input"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">Choisir le salarié…</option>
                  {(data?.rows || []).map((r) => (
                    <option key={r.employeeId} value={r.employeeId}>
                      {r.name} · {r.matricule}
                      {r.scan
                        ? r.scan.status === "APPLIED"
                          ? " ✓"
                          : " (à vérifier)"
                        : " — manquant"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label
              className="rh-btn-secondary cursor-pointer inline-flex items-center gap-2 px-3 py-2"
              style={{
                opacity:
                  scanning || busy || (mode === "single" && !employeeId)
                    ? 0.5
                    : 1,
              }}
            >
              {scanning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {scanning
                ? "Scan en cours…"
                : mode === "single"
                  ? "Uploader son bulletin"
                  : "Uploader PDF lot"}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={
                  scanning || busy || (mode === "single" && !employeeId)
                }
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <RhButton
              variant="secondary"
              disabled={busy || !totals?.pending}
              onClick={() => void applyAll()}
            >
              Appliquer tous les en attente
            </RhButton>
          </div>

          {totals ? (
            <div
              className="grid gap-2 text-[12px]"
              style={{
                gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
              }}
            >
              <Stat label="Salariés" value={String(totals.employees)} />
              <Stat
                label="Appliqués"
                value={String(totals.applied)}
                tone="ok"
              />
              <Stat
                label="À vérifier"
                value={String(totals.pending)}
                tone="warn"
              />
              <Stat
                label="Manquants"
                value={String(totals.missing)}
                tone={totals.missing ? "danger" : "ok"}
              />
            </div>
          ) : null}
        </div>
      </RhCard>

      <RhCard>
        <RhCardHead title={data?.label || "Collaborateurs"} />
        <div className="flex flex-col">
          {(data?.rows || []).map((row) => {
            const st = row.scan?.status;
            const editing = editId === row.scan?.id;
            return (
              <div
                key={row.employeeId}
                className="px-4 py-3"
                style={{ borderBottom: "1px solid #15191F" }}
              >
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">
                      {row.name}{" "}
                      <span
                        className="rh-mono text-[11px] font-normal"
                        style={{ color: EMP_COLORS.dim }}
                      >
                        · {row.matricule}
                      </span>
                    </div>
                    <div
                      className="text-[11.5px] mt-0.5"
                      style={{ color: EMP_COLORS.muted }}
                    >
                      {row.department}
                      {row.currentCpSolde != null
                        ? ` · Solde CP actuel ${row.currentCpSolde} j`
                        : ""}
                    </div>
                  </div>
                  <StatusBadge status={st} missing={!row.scan} />
                </div>

                {row.scan ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <div
                      className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] rh-mono"
                      style={{ color: EMP_COLORS.body }}
                    >
                      <span>Acquis {row.scan.cpAcquis ?? "—"}</span>
                      <span>Pris {row.scan.cpPris ?? "—"}</span>
                      <span>Solde {row.scan.cpSolde ?? "—"}</span>
                      {row.scan.rttSolde != null ? (
                        <span>RTT {row.scan.rttSolde}</span>
                      ) : null}
                      {row.scan.grossSalary != null ? (
                        <span>Brut {row.scan.grossSalary} €</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={row.scan.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px]"
                        style={{ color: EMP_COLORS.accent }}
                      >
                        <FileText size={13} /> Voir bulletin
                      </a>
                      {st === "PENDING_VERIFY" ? (
                        <RhButton
                          variant="secondary"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          onClick={() => openEdit(row)}
                        >
                          <ScanLine size={13} /> Vérifier & appliquer
                        </RhButton>
                      ) : null}
                    </div>

                    {editing ? (
                      <div
                        className="rounded-[12px] p-3 flex flex-col gap-2 mt-1"
                        style={{
                          background: "rgba(229,242,181,.06)",
                          border: `1px solid ${EMP_COLORS.accent}`,
                        }}
                      >
                        <div
                          className="text-[12px] font-medium"
                          style={{ color: EMP_COLORS.accent }}
                        >
                          Vérifie les compteurs du bulletin puis applique
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {(
                            [
                              ["cpAcquis", "CP Acquis"],
                              ["cpPris", "CP Pris"],
                              ["cpSolde", "CP Solde"],
                              ["rttSolde", "RTT Solde"],
                              ["grossSalary", "Brut €"],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="flex flex-col gap-1">
                              <span
                                className="text-[10px]"
                                style={{ color: EMP_COLORS.dim }}
                              >
                                {label}
                              </span>
                              <input
                                className="rh-input rh-mono"
                                value={form[key]}
                                onChange={(e) =>
                                  setForm({ ...form, [key]: e.target.value })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <RhButton
                            disabled={busy}
                            onClick={() =>
                              row.scan && void applyScan(row.scan.id)
                            }
                          >
                            <CheckCircle2 size={14} />
                            Appliquer → maj soldes
                          </RhButton>
                          <RhButton
                            variant="ghost"
                            onClick={() => setEditId(null)}
                          >
                            Annuler
                          </RhButton>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className="text-[12px]"
                      style={{ color: EMP_COLORS.warning }}
                    >
                      Bulletin manquant
                    </span>
                    <button
                      type="button"
                      className="border-0 bg-transparent cursor-pointer text-[12px] font-medium p-0"
                      style={{ color: EMP_COLORS.accent }}
                      onClick={() => {
                        setMode("single");
                        setEmployeeId(row.employeeId);
                      }}
                    >
                      Choisir → uploader
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!data?.rows?.length ? (
            <div
              className="p-6 text-[13px]"
              style={{ color: EMP_COLORS.muted }}
            >
              Aucun collaborateur actif.
            </div>
          ) : null}
        </div>
      </RhCard>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const color =
    tone === "ok"
      ? EMP_COLORS.success
      : tone === "warn"
        ? EMP_COLORS.warning
        : tone === "danger"
          ? EMP_COLORS.danger
          : EMP_COLORS.text;
  return (
    <div
      className="rounded-[10px] px-3 py-2"
      style={{ background: EMP_COLORS.inset }}
    >
      <div className="text-[10px]" style={{ color: EMP_COLORS.dim }}>
        {label}
      </div>
      <div className="rh-mono text-[16px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  missing,
}: {
  status?: string;
  missing?: boolean;
}) {
  if (missing) {
    return (
      <span
        className="rh-badge"
        style={{ background: "rgba(242,96,78,.15)", color: "#F2604E" }}
      >
        Manquant
      </span>
    );
  }
  if (status === "APPLIED") {
    return (
      <span
        className="rh-badge"
        style={{ background: "rgba(70,214,192,.13)", color: "#46D6C0" }}
      >
        Appliqué
      </span>
    );
  }
  if (status === "PENDING_VERIFY") {
    return (
      <span
        className="rh-badge"
        style={{ background: "rgba(240,194,78,.15)", color: "#F0C24E" }}
      >
        À vérifier
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span
        className="rh-badge"
        style={{ background: "#1D2530", color: "#8B95A5" }}
      >
        Rejeté
      </span>
    );
  }
  return null;
}
