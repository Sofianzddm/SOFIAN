"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  Camera,
  ChevronRight,
  ImageIcon,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";

interface EventItem {
  id: string;
  nom: string;
  date: string | null;
  lieu: string | null;
  logoUrl: string | null;
  createdAt: string;
  photoCount: number;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function EvenementsPhotosPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [date, setDate] = useState("");
  const [lieu, setLieu] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/photo-events");
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les événements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === "ADMIN") load();
    else if (status !== "loading") setLoading(false);
  }, [role, status, load]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nom.trim() || creating) return;
      setCreating(true);
      setError(null);
      try {
        const res = await fetch("/api/photo-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom: nom.trim(),
            date: date || null,
            lieu: lieu.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Erreur");
        }
        setNom("");
        setDate("");
        setLieu("");
        setShowForm(false);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setCreating(false);
      }
    },
    [nom, date, lieu, creating, load]
  );

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (role !== "ADMIN") {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Accès réservé</h1>
        <p className="text-gray-500 mt-2">
          Ce module est réservé aux administrateurs.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Camera className="w-6 h-6 text-glowup-rose" />
            Photos d&apos;événements
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Crée un événement, uploade les photos et tague les talents présents.
            Chaque talent retrouve ses photos via son lien personnel privé.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-glowup-rose text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Nouvel événement
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-white rounded-2xl border border-gray-200 p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Nom de l&apos;événement *
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Festival de Télévision de Monte-Carlo"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose outline-none text-sm"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Lieu
              </label>
              <input
                type="text"
                value={lieu}
                onChange={(e) => setLieu(e.target.value)}
                placeholder="Ex : Monaco"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose outline-none text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating || !nom.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-glowup-rose text-white text-sm font-semibold disabled:opacity-50"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <Camera className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun événement pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {events.map((ev) => (
            <Link
              key={ev.id}
              href={`/evenements-photos/${ev.id}`}
              className="group bg-white rounded-2xl border border-gray-200 p-5 hover:border-glowup-rose hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {ev.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ev.logoUrl}
                      alt={ev.nom}
                      className="w-10 h-10 rounded-lg object-contain bg-white border border-gray-200 shrink-0"
                    />
                  )}
                  <h2 className="font-semibold text-gray-900 group-hover:text-glowup-rose transition-colors truncate">
                    {ev.nom}
                  </h2>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-glowup-rose shrink-0" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                {ev.date && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4" />
                    {formatDate(ev.date)}
                  </span>
                )}
                {ev.lieu && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {ev.lieu}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4" />
                  {ev.photoCount} photo{ev.photoCount > 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
