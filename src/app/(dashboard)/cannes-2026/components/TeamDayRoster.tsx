"use client";

import { useMemo, useState } from "react";

import { CANNES_2026_DAYS, isUtcDayInIsoRange, parisDayKey } from "@/lib/cannes/dates";
import { listCannesEventsForPresenceOnDay } from "@/lib/cannes/eventPresenceOnDay";
import { formatParisLongHeadingFromYmd, formatParisYmd } from "@/lib/cannes/teamPlanningSlotTimes";

import type { CannesEvent, CannesPresence } from "../types";
import { downloadTeamDayIndividualPdfs } from "../downloadPlanningPdf";
import { toast } from "sonner";

function personLabel(p: CannesPresence) {
  return `${p.user?.prenom ?? ""} ${p.user?.nom ?? ""}`.trim() || "Sans nom";
}

function cellState(p: CannesPresence, day: Date) {
  const onPresenceWindow = isUtcDayInIsoRange(day, p.arrivalDate, p.departureDate);
  const absenceDay = (p.teamUnavailabilities ?? []).some((u) =>
    isUtcDayInIsoRange(day, u.startDate, u.endDate)
  );
  const disponible = onPresenceWindow && !absenceDay;
  return { onPresenceWindow, absenceDay, disponible };
}

function slotsCountForDay(p: CannesPresence, ymd: string): number {
  return (p.planningSlots ?? []).filter((s) => formatParisYmd(new Date(s.startsAt)) === ymd).length;
}

type Props = {
  rows: CannesPresence[];
  /** Événements onglet Agenda (participants = présences). */
  events: CannesEvent[];
  selectedDayYmd: string;
  isAdmin?: boolean;
  /** `defaultPresenceId` = premier collaborateur sur place ce jour (pour ouvrir l’éditeur tout de suite). */
  onSelectDay: (ymd: string, defaultPresenceId: string | null) => void;
  onPickCollaborator: (presenceId: string) => void;
};

export default function TeamDayRoster({
  rows,
  events,
  selectedDayYmd,
  isAdmin = false,
  onSelectDay,
  onPickCollaborator,
}: Props) {
  const [dayPdfBusy, setDayPdfBusy] = useState(false);

  const dayDate = useMemo(
    () => CANNES_2026_DAYS.find((d) => parisDayKey(d) === selectedDayYmd) ?? null,
    [selectedDayYmd]
  );

  const { surPlace, horsLieu, indispo } = useMemo(() => {
    if (!dayDate) {
      return { surPlace: [] as CannesPresence[], horsLieu: [] as CannesPresence[], indispo: [] as CannesPresence[] };
    }
    const surPlace: CannesPresence[] = [];
    const horsLieu: CannesPresence[] = [];
    const indispo: CannesPresence[] = [];
    for (const p of rows) {
      const st = cellState(p, dayDate);
      if (st.disponible) surPlace.push(p);
      else if (!st.onPresenceWindow) horsLieu.push(p);
      else indispo.push(p);
    }
    return { surPlace, horsLieu, indispo };
  }, [rows, dayDate]);

  if (rows.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-[#1A1110]/12 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#1A1110]">Un jour → qui est là → à planifier</p>
      <p className="mt-1 text-xs text-[#1A1110]/55">
        Clique une date : collaborateurs sur place, créneaux horaires à compléter, et inscription aux{" "}
        <span className="font-medium">événements agenda</span> (soirées, dîners…).
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CANNES_2026_DAYS.map((d) => {
          const ymd = parisDayKey(d);
          const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
          const active = ymd === selectedDayYmd;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => {
                const d = CANNES_2026_DAYS.find((x) => parisDayKey(x) === ymd);
                const firstHere =
                  d != null ? rows.find((p) => cellState(p, d).disponible) ?? null : null;
                onSelectDay(ymd, firstHere?.id ?? null);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-[#1A1110] bg-[#1A1110] text-[#F5EBE0]"
                  : "border-[#E5E0D8] bg-[#FCFAF8] text-[#1A1110]/80 hover:border-[#C08B8B]/50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {dayDate ? (
        <div className="mt-4 border-t border-[#E5E0D8] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#C08B8B]">
              {formatParisLongHeadingFromYmd(selectedDayYmd)}
            </p>
            {isAdmin ? (
              <button
                type="button"
                disabled={dayPdfBusy || surPlace.length === 0}
                onClick={() => {
                  if (surPlace.length === 0) {
                    toast.message("Personne sur place ce jour — rien à exporter.");
                    return;
                  }
                  setDayPdfBusy(true);
                  void downloadTeamDayIndividualPdfs(
                    selectedDayYmd,
                    surPlace.map((p) => p.id)
                  ).finally(() => setDayPdfBusy(false));
                }}
                className="shrink-0 rounded-lg border border-[#C08B8B]/55 bg-[#FDF8F5] px-3 py-1.5 text-[11px] font-semibold text-[#1A1110] hover:bg-white disabled:opacity-50"
                title="Un PDF par personne réellement sur place (créneaux + agenda, liste horaire)"
              >
                {dayPdfBusy
                  ? "PDF…"
                  : surPlace.length === 0
                    ? "PDF (aucun sur place)"
                    : `PDF — ${surPlace.length} fichier${surPlace.length > 1 ? "s" : ""} (sur place)`}
              </button>
            ) : null}
          </div>

          <p className="mt-2 text-xs font-semibold text-[#1A1110]">
            Sur place ({surPlace.length}) — clique un nom pour ouvrir son planning en dessous
          </p>
          {surPlace.length === 0 ? (
            <p className="mt-1 text-sm text-[#1A1110]/50">Personne de disponible ce jour (hors fenêtre ou indispo).</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {surPlace.map((p) => {
                const n = slotsCountForDay(p, selectedDayYmd);
                const needs = n === 0;
                const evs =
                  events.length > 0
                    ? listCannesEventsForPresenceOnDay(events, p.id, selectedDayYmd)
                    : [];
                const onEvent = evs.length > 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPickCollaborator(p.id)}
                      className="flex w-full flex-col gap-2 rounded-lg border border-[#E5E0D8] bg-[#FDF8F5] px-3 py-2 text-left text-sm transition hover:border-[#C08B8B]/60 hover:bg-white"
                    >
                      <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#1A1110]">{personLabel(p)}</span>
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                          {needs ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                              Créneaux à planifier
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                              {n === 1 ? "1 créneau" : `${n} créneaux`}
                            </span>
                          )}
                          {events.length > 0 &&
                            (onEvent ? (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-950">
                                {evs.length === 1 ? "1 événement" : `${evs.length} événements`}
                              </span>
                            ) : (
                              <span className="rounded-full border border-indigo-200/60 bg-white px-2 py-0.5 text-[11px] text-indigo-900/70">
                                Pas sur agenda
                              </span>
                            ))}
                          <span className="text-[11px] text-[#1A1110]/45">→</span>
                        </span>
                      </div>
                      {events.length > 0 && onEvent ? (
                        <div className="flex flex-wrap gap-1 border-t border-dashed border-[#E5E0D8] pt-1.5">
                          {evs.map((ev) => (
                            <span
                              key={ev.id}
                              className="max-w-full truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-indigo-950 ring-1 ring-indigo-100"
                              title={`${ev.title} — ${ev.location}`}
                            >
                              {ev.startTime}
                              {ev.endTime ? `–${ev.endTime}` : ""} · {ev.title}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {(indispo.length > 0 || horsLieu.length > 0) && (
            <details className="mt-4 text-xs text-[#1A1110]/65">
              <summary className="cursor-pointer font-medium text-[#1A1110]/75">
                Pas sur place ce jour ({indispo.length + horsLieu.length})
              </summary>
              <ul className="mt-2 space-y-1 pl-3 list-disc">
                {indispo.map((p) => (
                  <li key={p.id}>{personLabel(p)} — indisponible (créneau)</li>
                ))}
                {horsLieu.map((p) => (
                  <li key={p.id}>{personLabel(p)} — hors fenêtre arrivée / départ</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : null}
    </div>
  );
}
