"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RhButton, RhCard, RhCardHead } from "@/components/rh/ui/primitives";
import type { RhSettingsData } from "@/lib/rh/settings";

type NumKey = {
  [K in keyof RhSettingsData]: RhSettingsData[K] extends number ? K : never;
}[keyof RhSettingsData];

const FIELDS: Array<{
  key: NumKey;
  label: string;
  hint?: string;
  step?: number;
  min?: number;
  max?: number;
  group: string;
}> = [
  { group: "Horaires", key: "defaultWeeklyHours", label: "Heures / semaine (défaut)", step: 0.5, min: 1, max: 48 },
  { group: "Horaires", key: "workdayMinutes", label: "Minutes / journée (réf. récup & HS)", step: 15, min: 60, max: 600 },
  { group: "Horaires", key: "defaultBreakMinutes", label: "Pause défaut (min, légal ≥ 20 dès 6 h)", step: 5, min: 20, max: 180 },
  { group: "Heures supp.", key: "ot25CapHours", label: "HS à 25 % (premières heures)", step: 1, min: 0, max: 20 },
  { group: "Heures supp.", key: "microOtMaxMinutes", label: "Seuil micro-HS (min)", step: 5, min: 0, max: 120 },
  { group: "Télétravail", key: "remoteAbsencesForOneDay", label: "Absences → max 1 j TT", step: 1, min: 1, max: 5 },
  { group: "Télétravail", key: "remoteAbsencesForZero", label: "Absences → 0 j TT", step: 1, min: 1, max: 5 },
  { group: "Congés", key: "cpDaysPerYear", label: "CP jours / an", step: 1, min: 0, max: 40 },
  { group: "Congés", key: "cpExerciseStartMonth", label: "Mois début exercice (0=janv … 6=juil)", step: 1, min: 0, max: 11 },
  { group: "Congés", key: "cpSeniorityYears", label: "Ancienneté avant pose CP (ans)", step: 1, min: 0, max: 5 },
  { group: "Congés", key: "coverageThresholdPercent", label: "Seuil couverture équipe (%)", step: 5, min: 0, max: 100 },
  { group: "Récup", key: "recupMinMinutes", label: "Récup min (min)", step: 5, min: 5, max: 120 },
  { group: "Récup", key: "recupMaxMinutes", label: "Récup max (min)", step: 15, min: 60, max: 600 },
  { group: "Récup", key: "recupStepMinutes", label: "Pas récup (min)", step: 5, min: 5, max: 60 },
  { group: "Récup", key: "recupExpiryDays", label: "Validité récup après crédit (jours, 0=∞)", step: 1, min: 0, max: 365 },
  { group: "TR & IK", key: "trFacial", label: "TR facial (€)", step: 0.1, min: 0, max: 20 },
  { group: "TR & IK", key: "trCompanyShare", label: "TR part entreprise (€)", step: 0.1, min: 0, max: 20 },
  { group: "TR & IK", key: "mileageRatePerKm", label: "IK € / km", step: 0.001, min: 0, max: 2 },
];

function slotLine(slots: Array<{ from: string; to: string }>) {
  return slots.map((s) => `${s.from}-${s.to}`).join(" · ");
}

function parseSlots(text: string): Array<{ from: string; to: string }> {
  return text
    .split(/[·,;|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [from, to] = p.split("-").map((x) => x.trim());
      return { from: from || "09:30", to: to || "12:00" };
    })
    .filter((s) => /^\d{2}:\d{2}$/.test(s.from) && /^\d{2}:\d{2}$/.test(s.to));
}

type AuditItem = {
  id: string;
  action: string;
  detail: unknown;
  createdAt: string;
  actor: string;
  actorEmail: string | null;
};

export function RhSettingsPanel() {
  const [settings, setSettings] = useState<RhSettingsData | null>(null);
  const [draft, setDraft] = useState<RhSettingsData | null>(null);
  const [weekdayText, setWeekdayText] = useState("");
  const [fridayText, setFridayText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rh/settings");
      if (!res.ok) throw new Error("Chargement impossible");
      const data = await res.json();
      setSettings(data.settings);
      setDraft(data.settings);
      setWeekdayText(slotLine(data.settings.slotsWeekday));
      setFridayText(slotLine(data.settings.slotsFriday));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/rh/settings/audit");
      if (!res.ok) return;
      const data = await res.json();
      setAudit(data.items || []);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAudit();
  }, [load, loadAudit]);

  function setNum(key: NumKey, value: number) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!draft) return;
    const slotsWeekday = parseSlots(weekdayText);
    const slotsFriday = parseSlots(fridayText);
    if (!slotsWeekday.length || !slotsFriday.length) {
      toast.error("Créneaux invalides (format 09:30-12:00 · 14:00-18:30)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rh/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ...draft, slotsWeekday, slotsFriday },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setSettings(data.settings);
      setDraft(data.settings);
      setWeekdayText(slotLine(data.settings.slotsWeekday));
      setFridayText(slotLine(data.settings.slotsFriday));
      toast.success("Paramètres enregistrés — applicables immédiatement");
      void loadAudit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  function auditSummary(item: AuditItem): string {
    if (item.action === "settings.update") {
      const d = item.detail as {
        keys?: string[];
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      } | null;
      if (d?.keys?.length) return `Paramètres · ${d.keys.join(", ")}`;
      if (d?.before && d?.after) {
        const keys = Object.keys(d.after).filter(
          (k) => JSON.stringify(d.before?.[k]) !== JSON.stringify(d.after?.[k])
        );
        return keys.length ? keys.join(", ") : "Paramètres enregistrés";
      }
      return "Paramètres enregistrés";
    }
    if (item.action === "employee.update") return "Fiche collaborateur";
    if (item.action === "timesheet.monthlySignatures") {
      const d = item.detail as { sent?: number; month?: number; year?: number } | null;
      return `Batch signatures ${d?.month ?? "?"}/${d?.year ?? "?"} · ${d?.sent ?? 0} envoyée(s)`;
    }
    return item.action;
  }

  if (loading || !draft) {
    return (
      <div className="text-[13px]" style={{ color: "#8B95A5" }}>
        Chargement des paramètres…
      </div>
    );
  }

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RhButton disabled={busy} onClick={() => void save()}>
          Enregistrer les paramètres
        </RhButton>
        <RhButton
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (settings) {
              setDraft(settings);
              setWeekdayText(slotLine(settings.slotsWeekday));
              setFridayText(slotLine(settings.slotsFriday));
            }
          }}
        >
          Annuler
        </RhButton>
        <span className="text-[12.5px]" style={{ color: "#8B95A5" }}>
          Ces règles s’appliquent à toute la plateforme (TT, HS, TR, CP…).
        </span>
      </div>

      <RhCard className="p-4">
        <RhCardHead title="Créneaux semaine type" />
        <div className="grid gap-3 p-1 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px]" style={{ color: "#8B95A5" }}>
              Lun–jeu (ex. 09:30-12:00 · 14:00-18:30)
            </span>
            <input
              className="rh-input rh-mono"
              value={weekdayText}
              onChange={(e) => setWeekdayText(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px]" style={{ color: "#8B95A5" }}>
              Vendredi (ex. 09:30-12:00 · 13:00-17:30)
            </span>
            <input
              className="rh-input rh-mono"
              value={fridayText}
              onChange={(e) => setFridayText(e.target.value)}
            />
          </label>
        </div>
      </RhCard>

      {groups.map((group) => (
        <RhCard key={group} className="p-4">
          <RhCardHead title={group} />
          <div className="grid gap-3 p-1 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {FIELDS.filter((f) => f.group === group).map((f) => (
              <label key={f.key} className="flex flex-col gap-1.5">
                <span className="text-[12.5px]" style={{ color: "#8B95A5" }}>
                  {f.label}
                </span>
                <input
                  type="number"
                  className="rh-input rh-mono"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={draft[f.key]}
                  onChange={(e) => setNum(f.key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        </RhCard>
      ))}

      <RhCard className="p-4">
        <RhCardHead
          title="Historique des changements"
          right={
            <RhButton
              variant="secondary"
              disabled={auditLoading}
              onClick={() => void loadAudit()}
            >
              Actualiser
            </RhButton>
          }
        />
        {auditLoading && !audit.length ? (
          <div className="text-[12.5px] p-2" style={{ color: "#8B95A5" }}>
            Chargement…
          </div>
        ) : audit.length === 0 ? (
          <div className="text-[12.5px] p-2" style={{ color: "#8B95A5" }}>
            Aucun changement enregistré pour l’instant.
          </div>
        ) : (
          <div className="flex flex-col">
            {audit.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 py-2.5"
                style={{ borderBottom: "1px solid #15191F" }}
              >
                <span className="rh-mono text-[11px]" style={{ color: "#5F6978", minWidth: 120 }}>
                  {new Date(item.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[12.5px] font-medium" style={{ color: "#E8ECF2" }}>
                  {item.actor}
                </span>
                <span className="text-[12.5px]" style={{ color: "#8B95A5" }}>
                  {auditSummary(item)}
                </span>
              </div>
            ))}
          </div>
        )}
      </RhCard>
    </div>
  );
}
