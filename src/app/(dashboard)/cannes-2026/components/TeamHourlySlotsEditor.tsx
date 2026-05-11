"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CANNES_2026_DAYS, parisDayKey } from "@/lib/cannes/dates";
import { listCannesEventsForPresenceOnDay } from "@/lib/cannes/eventPresenceOnDay";
import {
  formatParisHhmmFromUtc,
  formatParisLongHeadingFromYmd,
  formatParisYmd,
} from "@/lib/cannes/teamPlanningSlotTimes";
import { isCannesTaskNotesEmpty, sanitizeCannesTaskHtml } from "@/lib/cannes/cannesTaskNotes";

import TeamCommonSlotForm from "./TeamCommonSlotForm";
import { TeamTaskNotesDisplay, TeamTaskRichEditor } from "./TeamTaskRichEditor";

import type { CannesEvent, CannesPresence, CannesTeamPlanningSlot } from "../types";

function personLabel(p: CannesPresence) {
  return `${p.user?.prenom ?? ""} ${p.user?.nom ?? ""}`.trim() || "Sans nom";
}

const ACTIVITY_PRESETS = [
  "Sur place",
  "Créa contenu",
  "Réunion",
  "Navette",
  "Accueil",
  "Shooting",
  "Pause repas",
  "Événement marque",
] as const;

const LOCATION_PRESETS = [
  "Villa",
  "Palais / Croisette",
  "Hôtel",
  "Bureau / remote",
  "Navette",
] as const;

type Props = {
  presences: CannesPresence[];
  /** Événements onglet Agenda — pour voir si la personne est invitée ce jour-là. */
  events?: CannesEvent[];
  isAdmin: boolean;
  /** Si défini, le collaborateur est fixé (ex. fiche modale). */
  lockedPresenceId?: string | null;
  compact?: boolean;
  /** Synchronisé avec la grille « un jour » (Planning équipe). */
  rosterDayYmd?: string;
  rosterPresenceId?: string | null;
  onDayYmdChange?: (ymd: string) => void;
  onPresenceIdChange?: (id: string) => void;
};

function slotDayKey(s: CannesTeamPlanningSlot): string {
  return formatParisYmd(new Date(s.startsAt));
}

function slotSummaryLine(s: CannesTeamPlanningSlot): { range: string; detail: string } {
  const t0 = formatParisHhmmFromUtc(new Date(s.startsAt));
  const t1 = formatParisHhmmFromUtc(new Date(s.endsAt));
  const loc = (s.location || "").trim();
  const act = (s.title || "").trim();
  let detail = "";
  if (loc && act) detail = `${loc} — ${act}`;
  else if (loc) detail = loc;
  else if (act) detail = act;
  else detail = "—";
  return { range: `${t0} – ${t1}`, detail };
}

export default function TeamHourlySlotsEditor({
  presences,
  events = [],
  isAdmin,
  lockedPresenceId = null,
  compact = false,
  rosterDayYmd,
  rosterPresenceId = null,
  onDayYmdChange,
  onPresenceIdChange,
}: Props) {
  const router = useRouter();
  const rows = useMemo(() => presences.filter((p) => p.user), [presences]);

  const defaultDay = useMemo(() => {
    const d0 = CANNES_2026_DAYS[0];
    return d0 ? parisDayKey(d0) : "";
  }, []);

  const [presenceId, setPresenceId] = useState("");
  const [dateYmd, setDateYmd] = useState(defaultDay);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (lockedPresenceId) {
      setPresenceId(lockedPresenceId);
      return;
    }
    setPresenceId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      return rows[0]?.id ?? "";
    });
  }, [lockedPresenceId, rows]);

  useEffect(() => {
    if (lockedPresenceId) return;
    if (rosterDayYmd === undefined) return;
    setDateYmd(rosterDayYmd);
  }, [lockedPresenceId, rosterDayYmd]);

  useEffect(() => {
    if (lockedPresenceId) return;
    if (!rosterPresenceId) return;
    if (rows.some((r) => r.id === rosterPresenceId)) setPresenceId(rosterPresenceId);
  }, [lockedPresenceId, rosterPresenceId, rows]);

  const selected = useMemo(
    () => rows.find((r) => r.id === presenceId) ?? null,
    [rows, presenceId]
  );

  const slots: CannesTeamPlanningSlot[] = useMemo(() => {
    const list = selected?.planningSlots ?? [];
    return [...list].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  }, [selected]);

  const slotsForChosenDay = useMemo(
    () => slots.filter((s) => slotDayKey(s) === dateYmd),
    [slots, dateYmd]
  );

  const agendaEventsThisDay = useMemo(() => {
    if (!events.length || !presenceId) return [];
    return listCannesEventsForPresenceOnDay(events, presenceId, dateYmd);
  }, [events, presenceId, dateYmd]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setStartTime("09:00");
    setEndTime("12:00");
    setTitle("");
    setLocation("");
    setNotes("");
  }, []);

  const loadSlotIntoForm = useCallback(
    (s: CannesTeamPlanningSlot) => {
      const ymd = formatParisYmd(new Date(s.startsAt));
      setEditingId(s.id);
      setPresenceId(s.presenceId);
      setDateYmd(ymd);
      setStartTime(formatParisHhmmFromUtc(new Date(s.startsAt)));
      setEndTime(formatParisHhmmFromUtc(new Date(s.endsAt)));
      setTitle(s.title || "");
      setLocation(s.location || "");
      setNotes(s.notes || "");
      onDayYmdChange?.(ymd);
      onPresenceIdChange?.(s.presenceId);
    },
    [onDayYmdChange, onPresenceIdChange]
  );

  const submit = useCallback(async () => {
    if (!isAdmin || !presenceId) return;
    setBusy(true);
    try {
      const payload = {
        presenceId,
        date: dateYmd,
        startTime,
        endTime,
        title: title.trim(),
        location: location.trim() || null,
        notes: isCannesTaskNotesEmpty(notes) ? null : sanitizeCannesTaskHtml(notes),
      };
      if (editingId) {
        const res = await fetch(`/api/cannes/team-planning-slots/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Erreur");
        }
        toast.success("Créneau mis à jour");
      } else {
        const res = await fetch("/api/cannes/team-planning-slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Erreur");
        }
        toast.success("Créneau ajouté");
      }
      resetForm();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }, [
    dateYmd,
    editingId,
    endTime,
    isAdmin,
    location,
    notes,
    presenceId,
    resetForm,
    router,
    startTime,
    title,
  ]);

  const remove = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/cannes/team-planning-slots/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Erreur");
        }
        toast.success("Créneau supprimé");
        if (editingId === id) resetForm();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      } finally {
        setBusy(false);
      }
    },
    [editingId, isAdmin, resetForm, router]
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#1A1110]/60">
        Aucun collaborateur enregistré — ajoute d’abord une présence équipe.
      </p>
    );
  }

  const firstName = selected
    ? selected.user?.prenom?.trim() || personLabel(selected)
    : "—";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <h3 className={`font-semibold text-[#1A1110] ${compact ? "text-sm" : "text-base"}`}>
          Planning individuel (créneaux)
        </h3>
        <p className="mt-1 text-xs text-[#1A1110]/55">
          Exemple : <span className="italic">9h–12h</span> sur la villa, puis{" "}
          <span className="italic">13h–14h</span> créa contenu — plusieurs blocs par jour pour chaque personne.
          Heures en <span className="font-medium">Europe/Paris</span>.
        </p>
      </div>

      {!lockedPresenceId && !compact && (
        <TeamCommonSlotForm rows={rows} dateYmd={dateYmd} isAdmin={isAdmin} />
      )}

      {!lockedPresenceId && (
        <label className="block text-xs font-medium text-[#1A1110]/80">
          Qui ?
          <select
            value={presenceId}
            onChange={(e) => {
              const v = e.target.value;
              setPresenceId(v);
              setEditingId(null);
              onPresenceIdChange?.(v);
            }}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm text-[#1A1110]"
          >
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {personLabel(r)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="rounded-lg border border-[#C08B8B]/35 bg-[#FDF8F5] p-3">
        <p className="text-xs font-semibold text-[#1A1110]">
          {firstName} · {formatParisLongHeadingFromYmd(dateYmd)}
        </p>
        {events.length > 0 && (
          <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900/75">
              Événements agenda (invitation)
            </p>
            {agendaEventsThisDay.length === 0 ? (
              <p className="mt-1 text-xs text-[#1A1110]/55">
                Pas inscrit(e) sur un événement ce jour — à ajouter depuis l’onglet{" "}
                <span className="font-medium">Agenda</span> si besoin.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-xs text-indigo-950">
                {agendaEventsThisDay.map((ev) => (
                  <li key={ev.id} className="leading-snug">
                    <span className="font-semibold tabular-nums">
                      {ev.startTime}
                      {ev.endTime ? ` – ${ev.endTime}` : ""}
                    </span>
                    {" · "}
                    <span className="font-medium">{ev.title}</span>
                    <span className="text-indigo-900/75"> — {ev.location}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {slotsForChosenDay.length === 0 ? (
          <p className="mt-2 text-sm text-[#1A1110]/50">Rien de planifié pour ce jour — ajoute des créneaux ci-dessous.</p>
        ) : (
          <ol className="mt-2 space-y-2 border-t border-[#E5E0D8]/80 pt-2">
            {slotsForChosenDay.map((s) => {
              const { range, detail } = slotSummaryLine(s);
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold tabular-nums text-[#1A1110]">{range}</span>
                    <span className="text-[#1A1110]/80"> — {detail}</span>
                    {s.notes ? <TeamTaskNotesDisplay html={s.notes} /> : null}
                  </div>
                  {isAdmin && (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => loadSlotIntoForm(s)}
                        disabled={busy}
                        className="rounded border border-[#E5E0D8] bg-white px-2 py-0.5 text-[11px] hover:bg-[#F5EBE0]/50"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(s.id)}
                        disabled={busy}
                        className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] text-red-800 hover:bg-red-50"
                      >
                        Suppr.
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {isAdmin && (
        <div className="rounded-lg border border-[#E5E0D8] bg-[#FCFAF8] p-3 space-y-3">
          <p className="text-xs font-semibold text-[#1A1110]/75">
            {editingId ? "Modifier le créneau" : "Ajouter un créneau ce jour-là"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[#1A1110]/80">
              Jour
              <select
                value={dateYmd}
                onChange={(e) => {
                  const v = e.target.value;
                  setDateYmd(v);
                  onDayYmdChange?.(v);
                }}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
              >
                {CANNES_2026_DAYS.map((d) => {
                  const v = parisDayKey(d);
                  const label = d.toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  });
                  return (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-[#1A1110]/80">
                De
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-[#1A1110]/80">
                À
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-[#1A1110]/80">Lieu / où elle est</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {LOCATION_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => setLocation(p)}
                  className="rounded-full border border-[#E5E0D8] bg-white px-2 py-0.5 text-[11px] text-[#1A1110]/85 hover:border-[#C08B8B]/50"
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={busy}
              placeholder="ex. Villa, stand marque X, hôtel Martinez…"
              className="mt-2 w-full rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="text-xs font-medium text-[#1A1110]/80">Activité</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {ACTIVITY_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => setTitle(p)}
                  className="rounded-full border border-[#E5E0D8] bg-white px-2 py-0.5 text-[11px] text-[#1A1110]/85 hover:border-[#C08B8B]/50"
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="ex. Créa contenu, accueil talents…"
              className="mt-2 w-full rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="text-xs font-medium text-[#1A1110]/80">Tâche / consignes (optionnel)</span>
            <p className="mt-0.5 text-[10px] text-[#1A1110]/45">
              Texte riche : gras, listes, titres — pour détailler exactement quoi faire.
            </p>
            <div className="mt-1.5">
              <TeamTaskRichEditor value={notes} onChange={setNotes} disabled={busy} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !presenceId}
              className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-50"
            >
              {busy ? "…" : editingId ? "Enregistrer" : "Ajouter ce créneau"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={busy}
                className="rounded-lg border border-[#E5E0D8] px-4 py-2 text-sm text-[#1A1110] hover:bg-white"
              >
                Annuler l’édition
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1A1110]/55">
          Tout le festival · {selected ? personLabel(selected) : "—"}
        </p>
        {slots.length === 0 ? (
          <p className="text-sm text-[#1A1110]/45">Aucun créneau sur la période.</p>
        ) : (
          <ul className="space-y-2">
            {slots.map((s) => {
              const { range, detail } = slotSummaryLine(s);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[#1A1110]">
                      <span className="font-semibold tabular-nums">{range}</span>
                      <span className="text-[#1A1110]/75"> · {formatParisLongHeadingFromYmd(slotDayKey(s))}</span>
                    </p>
                    <p className="text-xs text-[#1A1110]/70">{detail}</p>
                    {s.notes ? <TeamTaskNotesDisplay html={s.notes} className="text-[11px]" /> : null}
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => loadSlotIntoForm(s)}
                        disabled={busy}
                        className="rounded border border-[#E5E0D8] px-2 py-1 text-xs hover:bg-[#F5EBE0]/50"
                      >
                        Éditer
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(s.id)}
                        disabled={busy}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-800 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
