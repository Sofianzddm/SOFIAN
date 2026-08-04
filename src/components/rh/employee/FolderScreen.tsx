"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, PenLine } from "lucide-react";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import { EmpField, EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

type FolderData = {
  contact: {
    email: string;
    telephone: string | null;
    address: {
      line1?: string | null;
      city?: string | null;
      postalCode?: string | null;
      country?: string | null;
    };
  };
  contract: {
    type: string;
    hireDate: string;
    weeklyHours: number;
    jobTitle: string;
    department: string;
    manager: string | null;
    remoteAgreement: number;
  };
  mutuelle: { status: string };
  documents: Array<{
    id: string;
    kind: string;
    title: string;
    status: string;
    period?: string | null;
    expiresOn?: string | null;
  }>;
  vehicle: {
    label?: string | null;
    fiscalHorsepower: number;
    yearKm: number;
    insuranceExpiresOn?: string | null;
  } | null;
};

export function FolderScreen() {
  const { me, refresh } = useRhData();
  const [data, setData] = useState<FolderData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    telephone: "",
    addressLine1: "",
    city: "",
    postalCode: "",
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/rh/folder");
    if (!res.ok) return;
    const json = (await res.json()) as FolderData;
    setData(json);
    setForm({
      telephone: json.contact.telephone || "",
      addressLine1: json.contact.address.line1 || "",
      city: json.contact.address.city || "",
      postalCode: json.contact.address.postalCode || "",
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestChange() {
    const res = await fetch("/api/rh/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "contactChange",
        comment: "Mise à jour coordonnées",
        proposed: form,
      }),
    });
    const json = await res.json();
    setMsg(res.ok ? `Demande ${json.request?.reference} envoyée` : json.error);
    if (res.ok) await refresh();
  }

  if (!data) {
    return (
      <div className="rh-screen text-[12px]" style={{ color: EMP_COLORS.muted }}>
        Chargement du dossier…
      </div>
    );
  }

  return (
    <div className="rh-screen">
      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-3">
          <RhCard>
            <RhCardHead title="Documents" />
            <div className="p-2">
              {data.documents.length === 0 ? (
                <div className="p-4 text-[12px]" style={{ color: EMP_COLORS.muted }}>
                  Aucun document pour l&apos;instant
                </div>
              ) : (
                data.documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                    style={{ borderBottom: "1px solid #15191F" }}
                  >
                    <FileText size={14} style={{ color: EMP_COLORS.dim }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium" style={{ color: EMP_COLORS.text }}>
                        {d.title}
                      </div>
                      <div className="rh-mono text-[10px]" style={{ color: EMP_COLORS.dim }}>
                        {d.kind} · {d.status}
                        {d.period ? ` · ${d.period}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </RhCard>

          <RhCard>
            <RhCardHead title="Contrat" />
            <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              <EmpField label="Type" value={data.contract.type} />
              <EmpField label="Poste" value={data.contract.jobTitle} />
              <EmpField label="Équipe" value={data.contract.department} />
              <EmpField
                label="Entrée"
                value={new Date(data.contract.hireDate).toLocaleDateString("fr-FR")}
              />
              <EmpField label="Horaires" value={`${data.contract.weeklyHours} h / semaine`} />
              <EmpField label="Manager" value={data.contract.manager || "—"} />
              <EmpField
                label="Avenant TT"
                value={
                  data.contract.remoteAgreement
                    ? `${data.contract.remoteAgreement} j / semaine`
                    : "Aucun"
                }
              />
              <EmpField
                label="Mutuelle"
                value={data.mutuelle.status === "ENROLLED" ? "Adhérent" : "Dispense"}
              />
            </div>
          </RhCard>

          {data.vehicle ? (
            <RhCard>
              <RhCardHead title="Véhicule" />
              <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                <EmpField label="Libellé" value={data.vehicle.label || "—"} />
                <EmpField label="CV fiscaux" value={String(data.vehicle.fiscalHorsepower)} />
                <EmpField label="Km année" value={String(data.vehicle.yearKm)} />
                <EmpField
                  label="Assurance"
                  value={
                    data.vehicle.insuranceExpiresOn
                      ? new Date(data.vehicle.insuranceExpiresOn).toLocaleDateString("fr-FR")
                      : "—"
                  }
                />
              </div>
            </RhCard>
          ) : null}
        </div>

        <aside className="rh-inspector">
          <RhCard strong>
            <RhCardHead title="Coordonnées" />
            <div className="flex flex-col gap-3 p-4">
              <EmpField label="Email" value={data.contact.email} />
              <label className="flex flex-col gap-1">
                <EmpLabel>Téléphone</EmpLabel>
                <input
                  className="rh-input"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <EmpLabel>Adresse</EmpLabel>
                <input
                  className="rh-input"
                  value={form.addressLine1}
                  onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rh-input"
                  placeholder="CP"
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
                <input
                  className="rh-input"
                  placeholder="Ville"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              {msg ? (
                <p className="m-0 text-[12px]" style={{ color: EMP_COLORS.accent }}>{msg}</p>
              ) : null}
              <RhButton className="w-full" onClick={() => void requestChange()}>
                <PenLine size={13} /> Demander une modification
              </RhButton>
              <p className="m-0 text-[11px]" style={{ color: EMP_COLORS.dim }}>
                Validation RH puis diffusion paie / mutuelle / TT.
                {me ? ` · ${me.employee.matricule}` : ""}
              </p>
            </div>
          </RhCard>
        </aside>
      </div>
    </div>
  );
}
