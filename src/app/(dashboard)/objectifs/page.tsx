"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Target,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

interface UserOption {
  id: string;
  prenom: string;
  nom: string;
  role: string;
}

interface Objectif {
  id: string;
  titre: string;
  description?: string | null;
  valeurCible?: number | null;
  valeurActuelle?: number | null;
  dateLimite?: string | null;
  createur: { prenom: string; nom: string };
}

export default function ObjectifsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingObjectifs, setLoadingObjectifs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    titre: "",
    description: "",
    valeurCible: "",
    dateLimite: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated" || (session?.user as { role?: string })?.role !== "ADMIN") {
      if (session && (session.user as { role?: string })?.role !== "ADMIN") {
        router.replace("/dashboard");
      }
      return;
    }
    fetch("/api/users?role=HEAD_OF_INFLUENCE,HEAD_OF")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: UserOption[]) => {
        const list = Array.isArray(data) ? data : [];
        setUsers(list);
        if (list.length > 0 && !selectedUserId) setSelectedUserId(list[0].id);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [status, session, router, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) {
      setObjectifs([]);
      return;
    }
    setLoadingObjectifs(true);
    fetch(`/api/objectifs?userId=${selectedUserId}`)
      .then((r) => (r.ok ? r.json() : { objectifs: [] }))
      .then((data: { objectifs?: Objectif[] }) => setObjectifs(data.objectifs ?? []))
      .finally(() => setLoadingObjectifs(false));
  }, [selectedUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titre.trim() || !selectedUserId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/objectifs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          titre: form.titre.trim(),
          description: form.description.trim() || undefined,
          valeurCible: form.valeurCible ? Number(form.valeurCible) : undefined,
          dateLimite: form.dateLimite || undefined,
        }),
      });
      if (res.ok) {
        setForm({ titre: "", description: "", valeurCible: "", dateLimite: "" });
        const data = await res.json();
        setObjectifs((prev) => [data.objectif, ...prev]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cet objectif ?")) return;
    const res = await fetch(`/api/objectifs/${id}`, { method: "DELETE" });
    if (res.ok) setObjectifs((prev) => prev.filter((o) => o.id !== id));
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Target className="w-7 h-7 text-indigo-600" />
        Objectifs
      </h1>
      <p className="text-slate-600 mt-1">
        Assigner des objectifs (ex. recrutement talents) aux Head of Influence / Head of.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row gap-4 items-start">
        <label className="flex flex-col gap-1 w-full sm:w-64">
          <span className="text-sm font-medium text-slate-700">Bénéficiaire</span>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom} ({u.role})
              </option>
            ))}
          </select>
        </label>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouvel objectif</h2>
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Titre *</label>
            <input
              type="text"
              value={form.titre}
              onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))}
              placeholder="Ex. Recrutement talents"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description (optionnel)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Détails ou consignes"
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valeur cible (optionnel)</label>
              <input
                type="number"
                min={0}
                value={form.valeurCible}
                onChange={(e) => setForm((f) => ({ ...f, valeurCible: e.target.value }))}
                placeholder="Ex. 5"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date limite (optionnel)</label>
              <input
                type="date"
                value={form.dateLimite}
                onChange={(e) => setForm((f) => ({ ...f, dateLimite: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting || !form.titre.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Ajouter l&apos;objectif
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Objectifs de {selectedUser ? `${selectedUser.prenom} ${selectedUser.nom}` : "…"}
        </h2>
        {loadingObjectifs ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : objectifs.length === 0 ? (
          <p className="text-slate-500 py-6">Aucun objectif assigné.</p>
        ) : (
          <ul className="space-y-3">
            {objectifs.map((o) => (
              <li
                key={o.id}
                className="flex items-start justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{o.titre}</p>
                  {o.description && <p className="text-sm text-slate-600 mt-0.5">{o.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {o.valeurCible != null && (
                      <span>Objectif : {o.valeurActuelle ?? 0} / {o.valeurCible}</span>
                    )}
                    {o.dateLimite && (
                      <span>Échéance : {new Date(o.dateLimite).toLocaleDateString("fr-FR")}</span>
                    )}
                    <span>par {o.createur.prenom} {o.createur.nom}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(o.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
