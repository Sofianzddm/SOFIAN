"use client";

import { useState } from "react";
import {
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { LIME, RTT } from "@/components/rh/people/people-utils";

type SalariesData = {
  rows: Array<Record<string, unknown>>;
  masseSalariale: number;
};

type Props = {
  rhRole: string;
  salaries: SalariesData | null;
};

export function PayrollScreen({ rhRole, salaries }: Props) {
  const [exportMonth, setExportMonth] = useState(
    () => new Date().getMonth() + 1
  );
  const [exportYear, setExportYear] = useState(() => new Date().getFullYear());

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow="RH"
        title="Paie & dossiers"
        subtitle="Masse salariale, couverture santé et export mensuel pour l’expert-comptable."
        actions={
          rhRole === "HR" ? (
            <>
              <RhButton
                variant="secondary"
                onClick={() => {
                  window.location.href = "/api/rh/payroll/export";
                }}
              >
                Export absences XLSX
              </RhButton>
              <RhButton
                onClick={() => {
                  const y = exportYear;
                  const m = exportMonth;
                  window.location.href = `/api/rh/payroll/comptable?year=${y}&month=${m}`;
                }}
              >
                Export expert-comptable
              </RhButton>
            </>
          ) : null
        }
      />
      {rhRole !== "HR" ? (
        <div className="text-[12.5px]" style={{ color: "#8B95A5" }}>
          Réservé au rôle HR
        </div>
      ) : (
        <>
          <RhCard>
            <RhCardHead title="Export mensuel expert-comptable" />
            <div className="p-4 flex flex-col gap-3">
              <p
                className="m-0 text-[12.5px] leading-[1.5]"
                style={{ color: "#B9C2CE" }}
              >
                Classeur complet : synthèse collab, absences, heures, HS,
                titres-resto, notes de frais, présence & TT. Une clé =
                matricule sur tous les onglets.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: "#8B95A5" }}
                  >
                    Mois
                  </span>
                  <select
                    className="rh-input"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(Number(e.target.value))}
                    style={{ minWidth: 140 }}
                  >
                    {[
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
                    ].map((label, i) => (
                      <option key={label} value={i + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: "#8B95A5" }}
                  >
                    Année
                  </span>
                  <input
                    type="number"
                    className="rh-input rh-mono"
                    value={exportYear}
                    onChange={(e) =>
                      setExportYear(Number(e.target.value) || exportYear)
                    }
                    style={{ width: 100 }}
                  />
                </label>
                <RhButton
                  onClick={() => {
                    window.location.href = `/api/rh/payroll/comptable?year=${exportYear}&month=${exportMonth}`;
                  }}
                >
                  Télécharger le dossier XLSX
                </RhButton>
              </div>
            </div>
          </RhCard>
          <RhCard>
            <RhCardHead
              title="Masse salariale"
              right={
                <span className="rh-mono text-[16px]" style={{ color: LIME }}>
                  {salaries
                    ? `${Math.round(salaries.masseSalariale).toLocaleString("fr-FR")} €`
                    : "…"}
                </span>
              }
            />
            {(salaries?.rows || []).map((r) => (
              <div
                key={String(r.id)}
                className="grid items-center px-4 py-[10px]"
                style={{
                  gridTemplateColumns: "1.4fr 90px 90px 80px 70px",
                  borderBottom: "1px solid #15191F",
                }}
              >
                <span className="text-[12px] font-medium truncate">
                  {String(r.name)}
                </span>
                <span className="rh-mono text-[10px]">
                  {String(r.matricule)}
                </span>
                <span className="rh-mono text-right text-[12px]">
                  {r.grossSalary != null ? `${r.grossSalary} €` : "—"}
                </span>
                <span className="rh-mono text-[11px]">
                  {String(r.healthCover)}
                </span>
                <span
                  className="rh-mono text-right text-[11px]"
                  style={{ color: RTT }}
                >
                  {Number(r.ot25 || 0) + Number(r.ot50 || 0)} h
                </span>
              </div>
            ))}
          </RhCard>
        </>
      )}
    </div>
  );
}
