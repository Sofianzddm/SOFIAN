"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "./Modal";

type PrestLite = {
  id: string;
  title: string;
  slug: string;
  durationMinutes: number;
  bufferMinutes: number;
};

type AvRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breaks: unknown;
  note: string | null;
  /** `null` = fenêtre ouverte à toutes les prestations (grille selon la prestation choisie sur le lien public). */
  prestation: PrestLite | null;
};

function breaksToInputs(breaks: unknown): { start: string; end: string }[] {
  if (!Array.isArray(breaks)) return [];
  const out: { start: string; end: string }[] = [];
  for (const item of breaks) {
    if (item && typeof item === "object" && "start" in item && "end" in item) {
      out.push({
        start: String((item as { start: string }).start),
        end: String((item as { end: string }).end),
      });
    }
  }
  return out;
}

export default function CoiffeurAvailabilitiesSection() {
  const [rows, setRows] = useState<AvRow[]>([]);
  const [prestations, setPrestations] = useState<PrestLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<false | { mode: "create" } | { mode: "edit"; row: AvRow }>(false);

  /** "" = toutes les prestations ; sinon id d’une prestation réservée à cette ligne. */
  const [prestationId, setPrestationId] = useState("");
  /** Création uniquement : une date ou une plage inclusive (tous les jours du calendrier). */
  const [dateMode, setDateMode] = useState<"single" | "range">("range");
  const [dateStr, setDateStr] = useState("");
  const [dateFromStr, setDateFromStr] = useState("");
  const [dateToStr, setDateToStr] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("19:00");
  const [note, setNote] = useState("");
  const [breakRows, setBreakRows] = useState<{ start: string; end: string }[]>([]);

  const loadPrestations = useCallback(async () => {
    try {
      const res = await fetch("/api/cannes/coiffeur/prestations", { cache: "no-store" });
      if (!res.ok) throw new Error("prest");
      const list = (await res.json()) as PrestLite[];
      setPrestations(list);
      setPrestationId((cur) => {
        if (cur === "") return "";
        if (cur && list.some((p) => p.id === cur)) return cur;
        return "";
      });
    } catch {
      toast.error("Impossible de charger les prestations");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/availabilities", { cache: "no-store" });
      if (!res.ok) throw new Error("load");
      setRows(await res.json());
    } catch {
      toast.error("Impossible de charger les disponibilités");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrestations();
  }, [loadPrestations]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFormDefaults = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const one = d.toISOString().slice(0, 10);
    setDateMode("range");
    setDateStr(one);
    /** Plage type festival Cannes (modifiable) : du 1er au 31 mai 2026. */
    setDateFromStr("2026-05-01");
    setDateToStr("2026-05-31");
    setStartTime("10:00");
    setEndTime("19:00");
    setNote("");
    setBreakRows([]);
    setPrestationId("");
  };

  const openCreate = () => {
    resetFormDefaults();
    setModal({ mode: "create" });
  };

  const openEdit = (row: AvRow) => {
    setDateMode("single");
    setDateStr(row.date);
    setDateFromStr(row.date);
    setDateToStr(row.date);
    setStartTime(row.startTime);
    setEndTime(row.endTime);
    setPrestationId(row.prestation?.id ?? "");
    setNote(row.note || "");
    setBreakRows(breaksToInputs(row.breaks));
    setModal({ mode: "edit", row });
  };

  const save = async () => {
    const breaksPayload = breakRows
      .map((r) => ({ start: r.start.trim(), end: r.end.trim() }))
      .filter((r) => r.start && r.end);
    const isEdit = modal && modal.mode === "edit";
    const payload: Record<string, unknown> = {
      startTime,
      endTime,
      prestationId: prestationId === "" ? null : prestationId,
      breaks: breaksPayload,
      note: note.trim() || null,
    };
    if (!isEdit && dateMode === "range") {
      payload.dateFrom = dateFromStr;
      payload.dateTo = dateToStr;
    } else {
      payload.date = dateStr;
    }
    const url = isEdit ? `/api/cannes/coiffeur/availabilities/${modal.row.id}` : "/api/cannes/coiffeur/availabilities";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      batch?: boolean;
      created?: number;
      dates?: string[];
    };
    if (!res.ok) {
      toast.error(json.error || "Enregistrement impossible");
      return;
    }
    if (!isEdit && json.batch === true && typeof json.created === "number" && Array.isArray(json.dates)) {
      const a = json.dates[0];
      const b = json.dates[json.dates.length - 1];
      toast.success(`${json.created} jour(s) ajoutés (${a} → ${b})`);
    } else {
      toast.success(isEdit ? "Mis à jour" : "Ajouté");
    }
    setModal(false);
    void load();
  };

  const remove = async (row: AvRow) => {
    if (!confirm("Supprimer cette règle de disponibilité ?")) return;
    const res = await fetch(`/api/cannes/coiffeur/availabilities/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Suppression impossible");
      return;
    }
    toast.success("Supprimé");
    void load();
  };

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[Spectral] text-2xl text-[#1A1110]">Disponibilités</h2>
          <p className="mt-1 text-sm text-[#1A1110]/60">
            Définis une <strong>plage horaire</strong> (Paris + pauses). Tu peux laisser « toutes les prestations » :
            la personne choisit sa formule sur le lien public (sans compte) et les créneaux s&apos;espacent selon la
            durée de cette formule. Tu peux aussi verrouiller une ligne sur <strong>une seule</strong> prestation (ex.
            un atelier dédié). En création, tu peux appliquer la{" "}
            <strong>même plage horaire sur toute une période</strong> (chaque jour inclus).
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="rounded-lg bg-[#1A1110] px-4 py-2.5 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B]"
        >
          Ajouter une disponibilité
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[#1A1110]/50">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-[#1A1110]/50">
          Aucune règle. Ajoute au moins une journée (fenêtre « toutes prestations » ou une prestation précise).
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] px-4 py-3 text-sm text-[#1A1110]"
            >
              <div>
                <div className="font-medium">{r.date}</div>
                <div className="text-[#1A1110]/70">
                  <span className="font-medium">
                    {r.prestation ? `${r.prestation.title} (réservé)` : "Toutes les prestations"}
                  </span>
                  {" · "}
                  {r.startTime} – {r.endTime}
                  {r.prestation ? (
                    <>
                      {" · "}
                      grille {r.prestation.durationMinutes}&apos; + buffer {r.prestation.bufferMinutes}&apos;
                    </>
                  ) : (
                    <span className="text-[#1A1110]/55"> · grille selon la prestation choisie sur le lien</span>
                  )}
                  {(() => {
                    try {
                      const arr = breaksToInputs(r.breaks)
                        .map((b) => `${b.start}–${b.end}`)
                        .join(", ");
                      return arr ? ` · pauses ${arr}` : "";
                    } catch {
                      return "";
                    }
                  })()}
                </div>
                {r.note && <div className="mt-1 text-xs text-[#1A1110]/55">{r.note}</div>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="rounded border border-[#E5E0D8] px-3 py-1 text-xs hover:bg-[#F5EBE0]"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="rounded border border-[#F0C4C4] px-3 py-1 text-xs text-[#7A3535] hover:bg-[#FFF3F3]"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!modal}
        title={modal && modal.mode === "edit" ? "Modifier disponibilité" : "Nouvelle disponibilité"}
        onClose={() => setModal(false)}
      >
        <div className="space-y-4 text-sm text-[#1A1110]">
          <label className="block">
            Prestation (optionnel)
            <select
              value={prestationId}
              onChange={(e) => setPrestationId(e.target.value)}
              className="mt-1 w-full rounded border border-[#E5E0D8] bg-white p-2"
            >
              <option value="">
                Toutes les prestations — choix sur le lien public (sans compte), la grille s&apos;adapte
              </option>
              {prestations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.durationMinutes} min)
                </option>
              ))}
            </select>
          </label>
          {modal !== false && modal.mode === "create" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-xs ${dateMode === "range" ? "border-[#1A1110] bg-[#1A1110] text-[#F5EBE0]" : "border-[#E5E0D8]"}`}
                onClick={() => setDateMode("range")}
              >
                Plusieurs jours (plage)
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-xs ${dateMode === "single" ? "border-[#1A1110] bg-[#1A1110] text-[#F5EBE0]" : "border-[#E5E0D8]"}`}
                onClick={() => setDateMode("single")}
              >
                Un seul jour
              </button>
            </div>
          )}

          {modal !== false && modal.mode === "create" && dateMode === "range" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                Du (inclus, Paris)
                <input
                  type="date"
                  value={dateFromStr}
                  onChange={(e) => setDateFromStr(e.target.value)}
                  className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
                />
              </label>
              <label className="block">
                Au (inclus, Paris)
                <input
                  type="date"
                  value={dateToStr}
                  onChange={(e) => setDateToStr(e.target.value)}
                  className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
                />
              </label>
            </div>
          ) : (
            <label className="block">
              Date (Paris)
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label>
              Début
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
            <label>
              Fin
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
          </div>
          <div>
            <div className="mb-2 font-medium">Pauses (optionnel)</div>
            <p className="mb-2 text-xs text-[#1A1110]/55">
              Aucune pause n&apos;est imposée. Ajoute une plage uniquement si tu veux bloquer des créneaux.
            </p>
            <div className="space-y-2">
              {breakRows.map((br, idx) => (
                <div key={idx} className="flex flex-wrap gap-2">
                  <input
                    type="time"
                    value={br.start}
                    onChange={(e) =>
                      setBreakRows((xs) =>
                        xs.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x))
                      )
                    }
                    className="rounded border border-[#E5E0D8] p-2"
                  />
                  <input
                    type="time"
                    value={br.end}
                    onChange={(e) =>
                      setBreakRows((xs) =>
                        xs.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x))
                      )
                    }
                    className="rounded border border-[#E5E0D8] p-2"
                  />
                  <button
                    type="button"
                    className="text-xs text-[#C08B8B]"
                    onClick={() => setBreakRows((xs) => xs.filter((_, i) => i !== idx))}
                  >
                    Retirer
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-[#1A1110]/70 underline"
                onClick={() => setBreakRows((xs) => [...xs, { start: "13:00", end: "14:00" }])}
              >
                + Pause
              </button>
            </div>
          </div>
          <label className="block">
            Note interne (optionnel)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModal(false)}
              className="rounded border border-[#E5E0D8] px-4 py-2 text-xs"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="rounded bg-[#1A1110] px-4 py-2 text-xs text-[#F5EBE0] hover:bg-[#C08B8B]"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
