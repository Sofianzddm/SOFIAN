"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Instagram,
  Music2,
  ExternalLink,
  X,
  Check,
} from "lucide-react";

export type PerformanceMensuelle = {
  id: string;
  talentId: string;
  annee: number;
  mois: number;
  igMoyenneVuesReels: number | null;
  igMoyenneLikes: number | null;
  igMeilleurReelUrl: string | null;
  igMeilleurReelVues: number | null;
  ttMoyenneVues: number | null;
  ttMoyenneLikes: number | null;
  ttMeilleurTiktokUrl: string | null;
  ttMeilleurTiktokVues: number | null;
  notes: string | null;
};

type FormState = {
  annee: string;
  mois: string;
  igMoyenneVuesReels: string;
  igMoyenneLikes: string;
  igMeilleurReelUrl: string;
  igMeilleurReelVues: string;
  ttMoyenneVues: string;
  ttMoyenneLikes: string;
  ttMeilleurTiktokUrl: string;
  ttMeilleurTiktokVues: string;
  notes: string;
};

const MOIS_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function emptyForm(now = new Date()): FormState {
  return {
    annee: String(now.getFullYear()),
    mois: String(now.getMonth() + 1),
    igMoyenneVuesReels: "",
    igMoyenneLikes: "",
    igMeilleurReelUrl: "",
    igMeilleurReelVues: "",
    ttMoyenneVues: "",
    ttMoyenneLikes: "",
    ttMeilleurTiktokUrl: "",
    ttMeilleurTiktokVues: "",
    notes: "",
  };
}

function fromPerformance(p: PerformanceMensuelle): FormState {
  return {
    annee: String(p.annee),
    mois: String(p.mois),
    igMoyenneVuesReels: p.igMoyenneVuesReels?.toString() ?? "",
    igMoyenneLikes: p.igMoyenneLikes?.toString() ?? "",
    igMeilleurReelUrl: p.igMeilleurReelUrl ?? "",
    igMeilleurReelVues: p.igMeilleurReelVues?.toString() ?? "",
    ttMoyenneVues: p.ttMoyenneVues?.toString() ?? "",
    ttMoyenneLikes: p.ttMoyenneLikes?.toString() ?? "",
    ttMeilleurTiktokUrl: p.ttMeilleurTiktokUrl ?? "",
    ttMeilleurTiktokVues: p.ttMeilleurTiktokVues?.toString() ?? "",
    notes: p.notes ?? "",
  };
}

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR");
}

function payloadFromForm(form: FormState) {
  const toInt = (v: string) => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  return {
    annee: Number(form.annee),
    mois: Number(form.mois),
    igMoyenneVuesReels: toInt(form.igMoyenneVuesReels),
    igMoyenneLikes: toInt(form.igMoyenneLikes),
    igMeilleurReelUrl: form.igMeilleurReelUrl.trim() || null,
    igMeilleurReelVues: toInt(form.igMeilleurReelVues),
    ttMoyenneVues: toInt(form.ttMoyenneVues),
    ttMoyenneLikes: toInt(form.ttMoyenneLikes),
    ttMeilleurTiktokUrl: form.ttMeilleurTiktokUrl.trim() || null,
    ttMeilleurTiktokVues: toInt(form.ttMeilleurTiktokVues),
    notes: form.notes.trim() || null,
  };
}

function Field({
  label,
  value,
  onChange,
  type = "number",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "number" | "text" | "url";
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-violet-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm text-glowup-licorice focus:outline-none focus:ring-2 focus:ring-violet-300"
      />
    </div>
  );
}

export default function PerformanceMensuelleBloc({
  talentId,
  canEdit,
}: {
  talentId: string;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<PerformanceMensuelle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/talents/${talentId}/performances-mensuelles`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError("Impossible de charger les performances");
    } finally {
      setLoading(false);
    }
  }, [talentId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  };

  const openEdit = (p: PerformanceMensuelle) => {
    setEditingId(p.id);
    setForm(fromPerformance(p));
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  };

  const handleSave = async () => {
    const payload = payloadFromForm(form);
    if (
      !Number.isInteger(payload.annee) ||
      payload.annee < 2000 ||
      payload.annee > 2100
    ) {
      setError("Année invalide");
      return;
    }
    if (!Number.isInteger(payload.mois) || payload.mois < 1 || payload.mois > 12) {
      setError("Mois invalide");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/talents/${talentId}/performances-mensuelles/${editingId}`
        : `/api/talents/${talentId}/performances-mensuelles`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de l'enregistrement");
      }
      closeForm();
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette performance mensuelle ?")) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/talents/${talentId}/performances-mensuelles/${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la suppression");
      }
      if (editingId === id) closeForm();
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  // Toujours visible pour les éditeurs ; sinon seulement s'il y a des données
  if (!canEdit && !loading && items.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-violet-50 via-white to-violet-50 rounded-3xl shadow-xl shadow-violet-100/80 p-8 border border-violet-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-violet-100 rounded-xl">
          <TrendingUp className="w-5 h-5 text-violet-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-glowup-licorice">
            Performance mensuelle
          </h2>
          <p className="text-sm text-gray-500">
            Moyennes Reels / TikTok et meilleurs contenus, mois par mois.
          </p>
        </div>
        {canEdit && !showForm && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un mois
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {showForm && canEdit && (
        <div className="mb-6 p-5 bg-white/90 rounded-2xl border border-violet-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-glowup-licorice">
              {editingId ? "Modifier le mois" : "Nouveau mois"}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-violet-700 mb-1">Mois</label>
              <select
                value={form.mois}
                onChange={(e) => setField("mois", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {MOIS_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-violet-700 mb-1">Année</label>
              <select
                value={form.annee}
                onChange={(e) => setField("annee", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-pink-600">
              <Instagram className="w-4 h-4" />
              Instagram Reels
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Moyenne vues Reels (IGR)"
                value={form.igMoyenneVuesReels}
                onChange={(v) => setField("igMoyenneVuesReels", v)}
                placeholder="45000"
              />
              <Field
                label="Moyenne likes"
                value={form.igMoyenneLikes}
                onChange={(v) => setField("igMoyenneLikes", v)}
                placeholder="3200"
              />
              <Field
                label="Meilleur Reel (URL)"
                value={form.igMeilleurReelUrl}
                onChange={(v) => setField("igMeilleurReelUrl", v)}
                type="url"
                placeholder="https://instagram.com/reel/…"
              />
              <Field
                label="Vues du meilleur Reel"
                value={form.igMeilleurReelVues}
                onChange={(v) => setField("igMeilleurReelVues", v)}
                placeholder="250000"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Music2 className="w-4 h-4" />
              TikTok
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Moyenne vues"
                value={form.ttMoyenneVues}
                onChange={(v) => setField("ttMoyenneVues", v)}
                placeholder="80000"
              />
              <Field
                label="Moyenne likes"
                value={form.ttMoyenneLikes}
                onChange={(v) => setField("ttMoyenneLikes", v)}
                placeholder="5500"
              />
              <Field
                label="Meilleur TikTok (URL)"
                value={form.ttMeilleurTiktokUrl}
                onChange={(v) => setField("ttMeilleurTiktokUrl", v)}
                type="url"
                placeholder="https://tiktok.com/@…/video/…"
              />
              <Field
                label="Vues du meilleur TikTok"
                value={form.ttMeilleurTiktokVues}
                onChange={(v) => setField("ttMeilleurTiktokVues", v)}
                placeholder="500000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-violet-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              placeholder="Contexte, tendances, remarques…"
              className="w-full px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm text-glowup-licorice focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-violet-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          Aucune performance mensuelle enregistrée.
          {canEdit && " Cliquez sur « Ajouter un mois » pour commencer."}
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((p) => (
            <div
              key={p.id}
              className="bg-white/80 rounded-2xl border border-violet-100 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <h3 className="font-semibold text-glowup-licorice">
                  {MOIS_LABELS[p.mois - 1]} {p.annee}
                </h3>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="p-1.5 text-violet-600 hover:bg-violet-100 rounded-lg transition-colors"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Supprimer"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-pink-600 uppercase tracking-wide">
                    <Instagram className="w-3.5 h-3.5" />
                    Instagram
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Moy. vues Reels</p>
                      <p className="font-semibold text-glowup-licorice">
                        {formatNumber(p.igMoyenneVuesReels)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Moy. likes</p>
                      <p className="font-semibold text-glowup-licorice">
                        {formatNumber(p.igMoyenneLikes)}
                      </p>
                    </div>
                  </div>
                  {(p.igMeilleurReelUrl || p.igMeilleurReelVues !== null) && (
                    <div className="text-sm">
                      <p className="text-xs text-gray-500">Meilleur Reel</p>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-glowup-licorice">
                          {formatNumber(p.igMeilleurReelVues)} vues
                        </span>
                        {p.igMeilleurReelUrl && (
                          <a
                            href={p.igMeilleurReelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-pink-600 hover:underline text-xs"
                          >
                            Voir <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 uppercase tracking-wide">
                    <Music2 className="w-3.5 h-3.5" />
                    TikTok
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Moy. vues</p>
                      <p className="font-semibold text-glowup-licorice">
                        {formatNumber(p.ttMoyenneVues)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Moy. likes</p>
                      <p className="font-semibold text-glowup-licorice">
                        {formatNumber(p.ttMoyenneLikes)}
                      </p>
                    </div>
                  </div>
                  {(p.ttMeilleurTiktokUrl || p.ttMeilleurTiktokVues !== null) && (
                    <div className="text-sm">
                      <p className="text-xs text-gray-500">Meilleur TikTok</p>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-glowup-licorice">
                          {formatNumber(p.ttMeilleurTiktokVues)} vues
                        </span>
                        {p.ttMeilleurTiktokUrl && (
                          <a
                            href={p.ttMeilleurTiktokUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-gray-700 hover:underline text-xs"
                          >
                            Voir <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {p.notes && (
                <p className="mt-3 text-sm text-gray-600 border-t border-violet-50 pt-3">
                  {p.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
