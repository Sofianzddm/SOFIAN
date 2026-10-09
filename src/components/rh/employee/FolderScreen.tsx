"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileText, PenLine, Trash2 } from "lucide-react";
import {
  RhAvatar,
  RhButton,
  RhCard,
  RhCardHead,
} from "@/components/rh/ui/primitives";
import { EmpField, EmpLabel, EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

type FolderData = {
  avatarUrl?: string | null;
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
    url?: string | null;
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<FolderData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    telephone: "",
    addressLine1: "",
    city: "",
    postalCode: "",
  });

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/rh/folder");
    if (!res.ok) {
      setLoadError("Impossible de charger ton dossier. Réessaie dans un instant.");
      return;
    }
    const json = (await res.json()) as FolderData;
    setData(json);
    setAvatarUrl(json.avatarUrl || me?.employee.avatarUrl || null);
    setForm({
      telephone: json.contact.telephone || "",
      addressLine1: json.contact.address.line1 || "",
      city: json.contact.address.city || "",
      postalCode: json.contact.address.postalCode || "",
    });
  }, [me?.employee.avatarUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/rh/me/avatar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload impossible");
      setAvatarUrl(json.avatarUrl);
      setMsg("Photo de profil mise à jour");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur photo");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/rh/me/avatar", { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Suppression impossible");
      }
      setAvatarUrl(null);
      setMsg("Photo retirée");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function requestChange() {
    const hasAddress = !!(
      form.addressLine1.trim() ||
      form.city.trim() ||
      form.postalCode.trim()
    );
    const res = await fetch("/api/rh/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: hasAddress ? "addressChange" : "contactChange",
        comment: hasAddress
          ? "Demande d’adresse de télétravail"
          : "Mise à jour coordonnées",
        proposed: form,
      }),
    });
    const json = await res.json();
    setMsg(
      res.ok
        ? `Demande ${json.request?.reference} envoyée — validation RH`
        : json.error
    );
    if (res.ok) await refresh();
  }

  if (loadError) {
    return (
      <div className="rh-screen flex flex-col items-start gap-3">
        <p className="m-0 text-[12.5px]" style={{ color: EMP_COLORS.danger }}>
          {loadError}
        </p>
        <RhButton variant="secondary" onClick={() => void load()}>
          Réessayer
        </RhButton>
      </div>
    );
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
      <p
        className="m-0 mb-1 text-[12.5px] leading-[1.45]"
        style={{ color: EMP_COLORS.muted }}
      >
        Contrat, mutuelle et documents. Pour changer téléphone ou adresse TT,
        envoie une demande — ton manager / RH valide.
      </p>
      <div className="rh-layout-inspect">
        <div className="flex flex-col gap-3">
          <RhCard>
            <RhCardHead title="Documents" />
            <div className="p-2">
              {data.documents.length === 0 ? (
                <div className="p-4 text-[13.5px]" style={{ color: EMP_COLORS.muted }}>
                  Aucun document pour l&apos;instant. La RH pourra en déposer ici
                  (contrats, bulletins…).
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
                      <div className="text-[13.5px] font-medium" style={{ color: EMP_COLORS.text }}>
                        {d.title}
                      </div>
                      <div className="text-[12px]" style={{ color: EMP_COLORS.dim }}>
                        {d.kind} · {d.status}
                        {d.period ? ` · ${d.period}` : ""}
                      </div>
                    </div>
                    {"url" in d && d.url ? (
                      <a
                        href={String(d.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12.5px] font-medium shrink-0"
                      >
                        Ouvrir
                      </a>
                    ) : null}
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
            <RhCardHead title="Photo de profil" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <RhAvatar
                  initials={me?.employee.initials || "??"}
                  color={me?.employee.avatarColor || "#E5F2B5"}
                  size={56}
                  radius={14}
                  src={avatarUrl}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="m-0 text-[12.5px] leading-[1.4]"
                    style={{ color: EMP_COLORS.muted }}
                  >
                    JPG, PNG ou WEBP · max 5 Mo. Visible pour ton manager et la RH.
                  </p>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <RhButton
                  className="flex-1"
                  disabled={avatarBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera size={13} />
                  {avatarBusy ? "Envoi…" : avatarUrl ? "Changer" : "Ajouter"}
                </RhButton>
                {avatarUrl ? (
                  <RhButton
                    variant="ghost"
                    disabled={avatarBusy}
                    onClick={() => void removeAvatar()}
                  >
                    <Trash2 size={13} />
                  </RhButton>
                ) : null}
              </div>
            </div>
          </RhCard>

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
