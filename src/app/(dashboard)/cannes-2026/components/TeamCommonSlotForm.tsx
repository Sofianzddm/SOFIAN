"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CANNES_2026_DAYS, parisDayKey } from "@/lib/cannes/dates";
import { teamPresenceDisponibleOnDay } from "@/lib/cannes/teamPresenceDisponible";

import { isCannesTaskNotesEmpty, sanitizeCannesTaskHtml } from "@/lib/cannes/cannesTaskNotes";

import { TeamTaskRichEditor } from "./TeamTaskRichEditor";

import type { CannesPresence } from "../types";

type Scope = "on_site" | "all";

type Props = {
  rows: CannesPresence[];
  /** Jour pré-rempli (grille planning / éditeur). */
  dateYmd: string;
  isAdmin: boolean;
};

function personLabel(p: CannesPresence) {
  return `${p.user?.prenom ?? ""} ${p.user?.nom ?? ""}`.trim() || "Sans nom";
}

export default function TeamCommonSlotForm({ rows, dateYmd, isAdmin }: Props) {
  const router = useRouter();
  const [startTime, setStartTime] = useState("10:30");
  const [endTime, setEndTime] = useState("11:00");
  const [title, setTitle] = useState("Réunion d'équipe");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<Scope>("on_site");
  const [busy, setBusy] = useState(false);

  const dayDate = useMemo(
    () => CANNES_2026_DAYS.find((d) => parisDayKey(d) === dateYmd) ?? null,
    [dateYmd]
  );

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const onSiteIds = useMemo(() => {
    if (!dayDate) return allIds;
    return rows.filter((p) => teamPresenceDisponibleOnDay(p, dayDate)).map((p) => p.id);
  }, [rows, dayDate, allIds]);

  const targetIds = scope === "all" ? allIds : onSiteIds;
  const targetCount = targetIds.length;

  if (!isAdmin || rows.length === 0) return null;

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Ajoute un titre (ex. Réunion d'équipe)");
      return;
    }
    if (targetCount === 0) {
      toast.error("Personne dans la cible — change le périmètre ou le jour.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cannes/team-planning-slots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateYmd,
          startTime,
          endTime,
          title: title.trim(),
          location: location.trim() || null,
          notes: isCannesTaskNotesEmpty(notes) ? null : sanitizeCannesTaskHtml(notes),
          presenceIds: targetIds,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; created?: number };
      if (!res.ok) throw new Error(j.error || "Erreur");
      toast.success(`Créneau créé pour ${j.created ?? targetCount} collaborateur(s)`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#1A1110]/15 bg-gradient-to-br from-[#F8F6F3] to-[#EEE8E2]/40 p-3">
      <p className="text-xs font-semibold text-[#1A1110]">Créneau commun (toute l’équipe)</p>
      <p className="mt-1 text-[11px] text-[#1A1110]/55">
        Une seule saisie : le même créneau horaire est ajouté pour chaque personne concernée (ex. réunion à 10h30).
        Jour utilisé : <span className="font-medium">{dateYmd}</span> (celui de l’éditeur / la grille jour).
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] font-medium text-[#1A1110]/80">
            De
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded border border-[#E5E0D8] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-[11px] font-medium text-[#1A1110]/80">
            À
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded border border-[#E5E0D8] bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <label className="block text-[11px] font-medium text-[#1A1110]/80">
          Titre
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            placeholder="Réunion d'équipe"
            className="mt-1 w-full rounded border border-[#E5E0D8] bg-white px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="mt-2 block text-[11px] font-medium text-[#1A1110]/80">
        Lieu (optionnel)
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded border border-[#E5E0D8] bg-white px-2 py-1.5 text-sm"
        />
      </label>

      <fieldset className="mt-3 space-y-1.5">
        <legend className="text-[11px] font-medium text-[#1A1110]/80">Pour qui ?</legend>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#1A1110]">
          <input
            type="radio"
            name="common-slot-scope"
            checked={scope === "on_site"}
            onChange={() => setScope("on_site")}
            disabled={busy}
          />
          <span>
            Uniquement <strong>sur place et dispo</strong> ce jour ({onSiteIds.length} pers.)
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#1A1110]">
          <input
            type="radio"
            name="common-slot-scope"
            checked={scope === "all"}
            onChange={() => setScope("all")}
            disabled={busy}
          />
          <span>
            <strong>Toute l’équipe</strong> enregistrée ({rows.length} fiches)
          </span>
        </label>
      </fieldset>

      {scope === "on_site" && dayDate && (
        <p className="mt-2 text-[10px] text-[#1A1110]/50">
          Cible :{" "}
          {targetCount === 0
            ? "aucun — tous indispos ou hors dates."
            : rows
                .filter((p) => targetIds.includes(p.id))
                .map(personLabel)
                .join(", ")}
        </p>
      )}

      <div className="mt-2">
        <span className="text-[11px] font-medium text-[#1A1110]/80">Consignes communes (optionnel)</span>
        <p className="text-[10px] text-[#1A1110]/45">Même texte riche pour tout le monde sur ce créneau groupé.</p>
        <div className="mt-1">
          <TeamTaskRichEditor
            value={notes}
            onChange={setNotes}
            disabled={busy}
            placeholder="Tâche détaillée pour toute l’équipe sur ce créneau…"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || targetCount === 0}
        className="mt-3 w-full rounded-lg bg-[#1A1110] py-2 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-45 sm:w-auto sm:px-5"
      >
        {busy ? "…" : `Créer pour ${targetCount} personne(s)`}
      </button>
    </div>
  );
}
