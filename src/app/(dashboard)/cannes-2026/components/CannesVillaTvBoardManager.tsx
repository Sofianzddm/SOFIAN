"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CANNES_2026_DAYS, parisDayKey } from "@/lib/cannes/dates";

type BoardRow = {
  id: string;
  dateYmd: string;
  timeLabel: string;
  endTimeLabel: string | null;
  title: string;
  body: string | null;
  sortOrder: number;
};

const DAY_OPTIONS = CANNES_2026_DAYS.map((d) => ({
  ymd: parisDayKey(d),
  label: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
}));

export default function CannesVillaTvBoardManager() {
  const [items, setItems] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [dateYmd, setDateYmd] = useState(DAY_OPTIONS[0]?.ymd ?? "");
  const [timeLabel, setTimeLabel] = useState("12:00");
  const [endTimeLabel, setEndTimeLabel] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cannes/villa-tv-board-items", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: BoardRow[] };
      setItems(data.items ?? []);
    } catch {
      toast.error("Impossible de charger les entrées TV villa");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setDateYmd(DAY_OPTIONS[0]?.ymd ?? "");
    setTimeLabel("12:00");
    setEndTimeLabel("");
    setTitle("");
    setBody("");
    setSortOrder(0);
  }

  function startEdit(row: BoardRow) {
    setEditingId(row.id);
    setDateYmd(row.dateYmd);
    setTimeLabel(row.timeLabel || "12:00");
    setEndTimeLabel(row.endTimeLabel?.trim() ? row.endTimeLabel : "");
    setTitle(row.title);
    setBody(row.body || "");
    setSortOrder(row.sortOrder ?? 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.message("Indique un titre");
      return;
    }
    const endPayload = endTimeLabel.trim() ? endTimeLabel.trim() : null;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/cannes/villa-tv-board-items/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateYmd,
            timeLabel: timeLabel.trim() || "12:00",
            endTimeLabel: endPayload,
            title: title.trim(),
            body: body.trim() || null,
            sortOrder,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Erreur");
        }
        toast.success("Entrée mise à jour — visible sur la TV au prochain rafraîchissement");
      } else {
        const res = await fetch("/api/cannes/villa-tv-board-items", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateYmd,
            timeLabel: timeLabel.trim() || "12:00",
            endTimeLabel: endPayload,
            title: title.trim(),
            body: body.trim() || null,
            sortOrder,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Erreur");
        }
        toast.success("Ajouté — visible sur la TV au prochain rafraîchissement");
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Retirer cette entrée de l’écran TV ?")) return;
    try {
      const res = await fetch(`/api/cannes/villa-tv-board-items/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      if (editingId === id) resetForm();
      toast.success("Entrée supprimée");
      await load();
    } catch {
      toast.error("Suppression impossible");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#1A1110]">Messages sur l’écran TV villa</p>
      <p className="mt-1 text-xs text-[#1A1110]/55">
        Annonces manuelles (réunion villa, rappel transport, etc.) : créneau optionnel (ex. 12:00–14:00). Affichage sur{" "}
        <span className="font-medium">/r/cannes-villa-tv/agenda</span> dans la chronologie du jour, avec l’agenda.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-[#E5E0D8] pt-4 sm:grid-cols-2 lg:grid-cols-7">
        <label className="text-xs font-medium text-[#1A1110]/80 sm:col-span-1">
          Jour
          <select
            value={dateYmd}
            onChange={(e) => setDateYmd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FCFAF8] px-2 py-2 text-sm"
          >
            {DAY_OPTIONS.map((o) => (
              <option key={o.ymd} value={o.ymd}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-[#1A1110]/80 sm:col-span-1">
          Début (Paris)
          <input
            value={timeLabel}
            onChange={(e) => setTimeLabel(e.target.value)}
            placeholder="12:00"
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] px-2 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs font-medium text-[#1A1110]/80 sm:col-span-1">
          Fin (optionnel)
          <input
            value={endTimeLabel}
            onChange={(e) => setEndTimeLabel(e.target.value)}
            placeholder="14:00"
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] px-2 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs font-medium text-[#1A1110]/80 sm:col-span-2 lg:col-span-2">
          Titre (ligne principale sur la TV)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] px-2 py-2 text-sm"
            placeholder="Brief équipe — hall villa"
          />
        </label>
        <label className="text-xs font-medium text-[#1A1110]/80 sm:col-span-1">
          Ordre
          <input
            type="number"
            min={0}
            max={999}
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] px-2 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-[#F5EBE0] disabled:opacity-50"
          >
            {editingId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg border border-[#E5E0D8] px-3 py-2 text-sm">
              Annuler
            </button>
          ) : null}
        </div>
        <label className="text-xs font-medium text-[#1A1110]/80 sm:col-span-2 lg:col-span-6">
          Détail (optionnel, affiché sous le titre sur la TV)
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-[#E5E0D8] px-2 py-2 text-sm"
            placeholder="Consignes, lieu de rendez-vous, etc."
          />
        </label>
      </form>

      <div className="mt-4 border-t border-[#E5E0D8] pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[#C08B8B]">Entrées actuelles</p>
        {loading ? (
          <p className="mt-2 text-sm text-[#1A1110]/50">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-[#1A1110]/50">Aucune entrée manuelle — seul l’agenda apparaît sur la TV.</p>
        ) : (
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto text-sm">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#E5E0D8] bg-[#FCFAF8] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#1A1110]">
                    <span className="tabular-nums text-[#1A1110]/60">{row.dateYmd}</span> ·{" "}
                    <span className="tabular-nums">
                      {row.timeLabel}
                      {row.endTimeLabel ? ` – ${row.endTimeLabel}` : ""}
                    </span>{" "}
                    — {row.title}
                  </p>
                  {row.body ? <p className="mt-0.5 line-clamp-2 text-xs text-[#1A1110]/55">{row.body}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="rounded border border-[#E5E0D8] px-2 py-1 text-xs hover:bg-white"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-800 hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
