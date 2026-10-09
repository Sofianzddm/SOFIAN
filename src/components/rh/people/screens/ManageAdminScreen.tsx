"use client";

import { useState } from "react";
import {
  RhButton,
  RhCard,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { RhSettingsPanel } from "@/components/rh/people/RhSettingsPanel";
import { PayslipScanPanel } from "@/components/rh/people/PayslipScanPanel";
import { AuditTimelinePanel } from "@/components/rh/people/AuditTimelinePanel";
import type { ForceForm } from "@/components/rh/people/people-utils";

type Props = {
  rhRole: string;
  employees: Array<Record<string, unknown>>;
  busy: boolean;
  onForceLeave: (form: ForceForm) => void | Promise<void>;
};

export function ManageAdminScreen({
  rhRole,
  employees,
  busy,
  onForceLeave,
}: Props) {
  const [forceForm, setForceForm] = useState<ForceForm>({
    employeeId: "",
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    accountCode: "CP",
    minutes: "",
  });

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow="ADMIN"
        title="Paramètres & saisie"
        subtitle="Règles société (TT, HS, TR, CP…) et saisie forcée — réservé HR."
      />
      {rhRole !== "HR" ? (
        <div className="text-[12.5px]" style={{ color: "#8B95A5" }}>
          Réservé HR
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h2
              className="m-0 mb-3 text-[16px] font-semibold"
              style={{ color: "#E7ECF2" }}
            >
              Bulletins de salaire
            </h2>
            <PayslipScanPanel />
          </div>
          <div>
            <h2
              className="m-0 mb-3 text-[16px] font-semibold"
              style={{ color: "#E7ECF2" }}
            >
              Paramètres plateforme
            </h2>
            <RhSettingsPanel />
          </div>
          <div>
            <h2
              className="m-0 mb-3 text-[16px] font-semibold"
              style={{ color: "#E7ECF2" }}
            >
              Saisie forcée
            </h2>
            <div className="rh-layout-inspect-wide">
              <RhCard className="p-4 flex flex-col gap-3">
                <select
                  className="rh-input"
                  value={forceForm.employeeId}
                  onChange={(e) =>
                    setForceForm({ ...forceForm, employeeId: e.target.value })
                  }
                >
                  <option value="">Choisir un collaborateur</option>
                  {employees.map((e) => (
                    <option key={String(e.id)} value={String(e.id)}>
                      {String(e.name)} · {String(e.matricule)}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="rh-input"
                    value={forceForm.from}
                    onChange={(e) =>
                      setForceForm({ ...forceForm, from: e.target.value })
                    }
                  />
                  <input
                    type="date"
                    className="rh-input"
                    value={forceForm.to}
                    onChange={(e) =>
                      setForceForm({ ...forceForm, to: e.target.value })
                    }
                  />
                </div>
                <select
                  className="rh-input"
                  value={
                    forceForm.minutes === "" ? "" : String(forceForm.minutes)
                  }
                  onChange={(e) =>
                    setForceForm({
                      ...forceForm,
                      minutes: e.target.value ? Number(e.target.value) : "",
                    })
                  }
                >
                  <option value="">Journée(s) entière(s)</option>
                  {[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420].map(
                    (m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    )
                  )}
                </select>
                <select
                  className="rh-input"
                  value={forceForm.accountCode}
                  onChange={(e) =>
                    setForceForm({
                      ...forceForm,
                      accountCode: e.target.value,
                    })
                  }
                >
                  <option value="CP">Congés payés</option>
                  <option value="RECUP">Récupération</option>
                  <option value="SS">Maladie</option>
                  <option value="SCHOOL">École</option>
                  <option value="AUTHORIZED">Absence autorisée</option>
                  <option value="UNPAID">Sans solde</option>
                  <option value="RTT">RTT</option>
                </select>
                <RhButton
                  disabled={busy || !forceForm.employeeId}
                  onClick={() => void onForceLeave(forceForm)}
                >
                  Enregistrer (tracé)
                </RhButton>
              </RhCard>
            </div>
          </div>
          <div>
            <h2
              className="m-0 mb-3 text-[16px] font-semibold"
              style={{ color: "#E7ECF2" }}
            >
              Journal d’audit
            </h2>
            <AuditTimelinePanel />
          </div>
        </div>
      )}
    </div>
  );
}
