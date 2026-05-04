"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CannesPresence, CannesTeamUnavailability } from "../types";

type Props = {
  presence: CannesPresence;
};

function formatRange(u: CannesTeamUnavailability) {
  const a = new Date(u.startDate).toLocaleDateString("fr-FR");
  const b = new Date(u.endDate).toLocaleDateString("fr-FR");
  return a === b ? a : `${a} → ${b}`;
}

export default function TeamUnavailabilitiesEditor({ presence }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(
    () => new Date(presence.arrivalDate).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    () => new Date(presence.arrivalDate).toISOString().slice(0, 10)
  );
  const [label, setLabel] = useState("");

  const list = useMemo(() => presence.teamUnavailabilities ?? [], [presence.teamUnavailabilities]);

  async function add() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cannes/presences/${presence.id}/team-unavailabilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, label: label.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Erreur");
      }
      toast.success("Indisponibilité enregistrée");
      setLabel("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/cannes/team-unavailabilities/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Indisponibilité supprimée");
      router.refresh();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 border-t border-[#E5E0D8] pt-4">
      <p className="text-sm font-medium text-[#1A1110]">Indisponibilités</p>
      <p className="mt-1 text-xs text-[#1A1110]/60">
        {`Dates libres (avant, pendant ou après la présence sur place). Le bandeau passe en noir dès qu'un jour est hors présence enregistrée ou couvert par une de ces périodes.`}
      </p>

      {list.length > 0 && (
        <ul className="mt-3 space-y-2">
          {list.map((u) => (
            <li
              key={u.id}
              className="flex items-start justify-between gap-2 rounded border border-[#E5E0D8] bg-[#F5EBE0]/50 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-[#1A1110]">{formatRange(u)}</p>
                {u.label ? <p className="text-xs text-[#1A1110]/70">{u.label}</p> : null}
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => remove(u.id)}
                className="shrink-0 text-xs text-[#C08B8B] hover:underline"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded border border-[#E5E0D8] p-2 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded border border-[#E5E0D8] p-2 text-sm"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Motif (optionnel)"
          className="rounded border border-[#E5E0D8] p-2 text-sm sm:col-span-2"
        />
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={add}
        className="mt-3 rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-50"
      >
        {loading ? "..." : "Ajouter la période"}
      </button>
    </div>
  );
}
