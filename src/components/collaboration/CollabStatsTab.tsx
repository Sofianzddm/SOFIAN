"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ClipboardPaste,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  COLLAB_STAT_METRIC_LABELS,
  COLLAB_STAT_TYPES_SELECT,
  COLLAB_STAT_WRITE_ROLES,
  isCollabStatType,
  labelForStatType,
  metricsForType,
  type CollabStatMetricKey,
  type CollabStatType,
} from "@/lib/collab-stats";

type Screenshot = {
  id: string;
  imageUrl: string;
  label: string | null;
  position: number;
};

type Publication = {
  id: string;
  typeContenu: string;
  label: string | null;
  urlPublication: string | null;
  datePublication: string | null;
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
  saves: number | null;
  notes: string | null;
  saisiPar?: { id: string; prenom: string; nom: string } | null;
  saisiAt?: string | null;
  screenshots: Screenshot[];
};

type FormState = {
  typeContenu: CollabStatType;
  label: string;
  urlPublication: string;
  datePublication: string;
  vues: string;
  likes: string;
  commentaires: string;
  partages: string;
  saves: string;
  notes: string;
};

type UploadProgress = {
  done: number;
  total: number;
};

function emptyForm(defaults?: {
  urlPublication?: string | null;
  datePublication?: string | null;
}): FormState {
  return {
    typeContenu: "REEL",
    label: "",
    urlPublication: defaults?.urlPublication || "",
    datePublication: defaults?.datePublication
      ? defaults.datePublication.slice(0, 10)
      : "",
    vues: "",
    likes: "",
    commentaires: "",
    partages: "",
    saves: "",
    notes: "",
  };
}

function fromPublication(p: Publication): FormState {
  const raw = p.typeContenu === "TIKTOK" ? "TIKTOK_VIDEO" : p.typeContenu;
  return {
    typeContenu: isCollabStatType(raw) ? raw : "REEL",
    label: p.label || "",
    urlPublication: p.urlPublication || "",
    datePublication: p.datePublication ? p.datePublication.slice(0, 10) : "",
    vues: p.vues != null ? String(p.vues) : "",
    likes: p.likes != null ? String(p.likes) : "",
    commentaires: p.commentaires != null ? String(p.commentaires) : "",
    partages: p.partages != null ? String(p.partages) : "",
    saves: p.saves != null ? String(p.saves) : "",
    notes: p.notes || "",
  };
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}

function metricValue(
  p: Publication,
  key: CollabStatMetricKey
): number | null {
  return p[key];
}

function collectImageFiles(
  list: FileList | File[] | DataTransferItemList | null | undefined
): File[] {
  if (!list) return [];
  const files: File[] = [];
  if (list instanceof DataTransferItemList) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    return files;
  }
  return Array.from(list as FileList | File[]).filter((f) =>
    f.type.startsWith("image/")
  );
}

type Props = {
  collaborationId: string;
  role: string;
  isViewOnly?: boolean;
  defaultUrlPublication?: string | null;
  defaultDatePublication?: string | null;
};

export default function CollabStatsTab({
  collaborationId,
  role,
  isViewOnly = false,
  defaultUrlPublication,
  defaultDatePublication,
}: Props) {
  const canEdit =
    !isViewOnly && (COLLAB_STAT_WRITE_ROLES as readonly string[]).includes(role);

  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm({
      urlPublication: defaultUrlPublication,
      datePublication: defaultDatePublication,
    })
  );
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null
  );
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingScreenFiles, setPendingScreenFiles] = useState<File[]>([]);
  const [pendingScreenPreviews, setPendingScreenPreviews] = useState<string[]>(
    []
  );
  const [dragOver, setDragOver] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const formVisibleFields = metricsForType(form.typeContenu);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/collaborations/${collaborationId}/stats`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Impossible de charger les stats");
      }
      const data = await res.json();
      setPublications(data.publications || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [collaborationId]);

  useEffect(() => {
    load();
  }, [load]);

  const clearPendingScreens = () => {
    setPendingScreenPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setPendingScreenFiles([]);
  };

  const addPendingScreens = useCallback((incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setPendingScreenFiles((prev) => [...prev, ...images]);
    setPendingScreenPreviews((prev) => [
      ...prev,
      ...images.map((f) => URL.createObjectURL(f)),
    ]);
  }, []);

  const removePendingScreen = (index: number) => {
    setPendingScreenPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setPendingScreenFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Collage Ctrl/Cmd+V quand le formulaire est ouvert (même depuis un input texte)
  useEffect(() => {
    if (!showForm || !canEdit) return;

    const onPaste = (e: ClipboardEvent) => {
      const images = collectImageFiles(e.clipboardData?.items ?? null);
      if (images.length === 0) return;
      e.preventDefault();
      addPendingScreens(images);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [showForm, canEdit, addPendingScreens]);

  const openCreate = () => {
    setEditingId(null);
    clearPendingScreens();
    setUploadProgress(null);
    setForm(
      emptyForm({
        urlPublication: defaultUrlPublication,
        datePublication: defaultDatePublication,
      })
    );
    setShowForm(true);
  };

  const openEdit = (p: Publication) => {
    setEditingId(p.id);
    clearPendingScreens();
    setUploadProgress(null);
    setForm(fromPublication(p));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    clearPendingScreens();
    setUploadProgress(null);
    setDragOver(false);
  };

  const payloadFromForm = () => {
    const visible = new Set(metricsForType(form.typeContenu));
    const num = (key: CollabStatMetricKey) => {
      if (!visible.has(key)) return null;
      return form[key] === "" ? null : Number(form[key]);
    };
    return {
      typeContenu: form.typeContenu,
      label: form.label.trim() || null,
      urlPublication: form.urlPublication.trim() || null,
      datePublication: form.datePublication || null,
      vues: num("vues"),
      likes: num("likes"),
      commentaires: num("commentaires"),
      partages: num("partages"),
      saves: num("saves"),
      notes: form.notes.trim() || null,
    };
  };

  const uploadOneFile = async (file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Fichier non image");
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new Error("Chaque image ne doit pas dépasser 100MB");
    }

    const signatureRes = await fetch("/api/upload/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collaborationId,
        purpose: "collabStatScreenshots",
      }),
    });
    if (!signatureRes.ok) throw new Error("Erreur de signature");
    const { signature, timestamp, folder, publicId, cloudName, apiKey } =
      await signatureRes.json();
    if (!cloudName || !apiKey) {
      throw new Error("Configuration Cloudinary manquante");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("signature", signature);
    formData.append("timestamp", String(timestamp));
    formData.append("folder", folder);
    formData.append("public_id", publicId);
    formData.append("api_key", apiKey);

    const cloudinaryRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!cloudinaryRes.ok) throw new Error("Erreur upload Cloudinary");
    const cloudinaryData = await cloudinaryRes.json();
    if (!cloudinaryData.secure_url) {
      throw new Error("URL Cloudinary manquante");
    }
    return cloudinaryData.secure_url as string;
  };

  const uploadScreenFiles = async (
    publicationId: string,
    files: File[]
  ): Promise<void> => {
    if (files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      throw new Error("Aucune image valide à uploader");
    }

    setUploadProgress({ done: 0, total: images.length });
    let done = 0;

    const urls = await Promise.all(
      images.map(async (file) => {
        const url = await uploadOneFile(file);
        done += 1;
        setUploadProgress({ done, total: images.length });
        return url;
      })
    );

    const res = await fetch(
      `/api/collaborations/${collaborationId}/stats/${publicationId}/screenshots`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err?.error || "Erreur lors de l'enregistrement des screens"
      );
    }
  };

  const handleSave = async () => {
    if (!editingId && pendingScreenFiles.length === 0) {
      setError("Ajoutez au moins un screenshot Insights avant d'enregistrer.");
      return;
    }

    setSaving(true);
    setError(null);
    setUploadProgress(null);
    try {
      const url = editingId
        ? `/api/collaborations/${collaborationId}/stats/${editingId}`
        : `/api/collaborations/${collaborationId}/stats`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur d'enregistrement");
      }
      const data = await res.json();
      const publicationId: string = editingId || data.publication?.id;
      if (!publicationId) {
        throw new Error("Publication introuvable après enregistrement");
      }

      if (pendingScreenFiles.length > 0) {
        await uploadScreenFiles(publicationId, pendingScreenFiles);
      }

      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (publicationId: string) => {
    if (!confirm("Supprimer ce contenu et ses screens ?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/collaborations/${collaborationId}/stats/${publicationId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur de suppression");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de suppression");
    }
  };

  const uploadScreens = async (
    publicationId: string,
    files: FileList | null
  ) => {
    const images = collectImageFiles(files);
    if (images.length === 0) return;
    setUploadingId(publicationId);
    setError(null);
    try {
      await uploadScreenFiles(publicationId, images);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploadingId(null);
      setUploadProgress(null);
    }
  };

  const removeScreenshot = async (
    publicationId: string,
    screenshotId: string
  ) => {
    if (!confirm("Supprimer ce screenshot ?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/collaborations/${collaborationId}/stats/${publicationId}/screenshots`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenshotId }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur de suppression");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de suppression");
    }
  };

  const onDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const onDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      dropZoneRef.current &&
      e.relatedTarget instanceof Node &&
      dropZoneRef.current.contains(e.relatedTarget)
    ) {
      return;
    }
    setDragOver(false);
  };

  const onDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    addPendingScreens(collectImageFiles(e.dataTransfer.files));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Chargement des statistiques…
      </div>
    );
  }

  const progressPct =
    uploadProgress && uploadProgress.total > 0
      ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-600" />
            Statistiques de la collaboration
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Champs adaptés au type · screens obligatoires (drag &amp; drop ou
            Ctrl+V).
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un contenu
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && canEdit && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">
              {editingId ? "Modifier le contenu" : "Nouveau contenu"}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="p-1.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Type</span>
              <select
                value={form.typeContenu}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    typeContenu: e.target.value as CollabStatType,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                {COLLAB_STAT_TYPES_SELECT.map((t) => (
                  <option key={t} value={t}>
                    {labelForStatType(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Label (optionnel)</span>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="ex. Story 2/3"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600 font-medium">URL publication</span>
              <input
                value={form.urlPublication}
                onChange={(e) =>
                  setForm((f) => ({ ...f, urlPublication: e.target.value }))
                }
                placeholder="https://…"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Date</span>
              <input
                type="date"
                value={form.datePublication}
                onChange={(e) =>
                  setForm((f) => ({ ...f, datePublication: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </label>
          </div>

          <div
            className={`grid gap-3 ${
              formVisibleFields.length === 1
                ? "grid-cols-1 sm:grid-cols-2"
                : formVisibleFields.length <= 2
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-4"
            }`}
          >
            {formVisibleFields.map((key) => (
              <label key={key} className="block text-sm">
                <span className="text-slate-600 font-medium">
                  {COLLAB_STAT_METRIC_LABELS[key]}
                </span>
                <input
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                />
              </label>
            ))}
          </div>
          {formVisibleFields.length === 0 && (
            <p className="text-sm text-slate-500">
              Pour ce type (event / shooting / ambassadeur), joignez surtout les
              screens et une note — pas de KPI feed.
            </p>
          )}

          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                Screenshots Insights
                {!editingId && (
                  <span className="text-red-500 font-normal"> *</span>
                )}
              </p>
              <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                <ClipboardPaste className="w-3.5 h-3.5" />
                Glisser-déposer ou coller (Ctrl/Cmd+V)
              </p>
            </div>

            <div
              ref={dropZoneRef}
              onDragOver={onDropZoneDragOver}
              onDragLeave={onDropZoneDragLeave}
              onDrop={onDropZoneDrop}
              className={`rounded-xl border-2 border-dashed transition-colors ${
                dragOver
                  ? "border-violet-500 bg-violet-100/80"
                  : "border-violet-300 bg-white"
              }`}
            >
              {pendingScreenPreviews.length === 0 ? (
                <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 cursor-pointer hover:bg-violet-50/60 transition-colors rounded-xl">
                  <Upload className="w-7 h-7 text-violet-500" />
                  <span className="text-sm font-semibold text-violet-800">
                    Déposer / coller les screens Insights
                  </span>
                  <span className="text-xs text-slate-500">
                    Ou cliquer pour parcourir (JPG, PNG…)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addPendingScreens(collectImageFiles(e.target.files));
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : (
                <div className="p-3 flex flex-wrap gap-3">
                  {pendingScreenPreviews.map((src, index) => (
                    <div key={`${src}-${index}`} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Screen ${index + 1}`}
                        className="h-28 w-auto rounded-lg border border-slate-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingScreen(index)}
                        className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-600 shadow"
                        title="Retirer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="h-28 w-28 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-violet-300 text-violet-700 cursor-pointer hover:bg-violet-50">
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-xs font-medium">Ajouter</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addPendingScreens(collectImageFiles(e.target.files));
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {uploadProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Upload {uploadProgress.done}/{uploadProgress.total}
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-violet-100 overflow-hidden">
                <div
                  className="h-full bg-violet-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!editingId && pendingScreenFiles.length === 0)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving
                ? uploadProgress
                  ? `Upload ${uploadProgress.done}/${uploadProgress.total}…`
                  : "Enregistrement…"
                : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {publications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">Aucune statistique saisie</p>
          <p className="text-sm text-slate-500 mt-1">
            Ajoutez chaque contenu (reel, post, TikTok, story) avec ses chiffres et
            screens.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {publications.map((p) => {
            const typeKey =
              p.typeContenu === "TIKTOK" ? "TIKTOK_VIDEO" : p.typeContenu;
            const type: CollabStatType = isCollabStatType(typeKey)
              ? typeKey
              : "REEL";
            const typeLabel = labelForStatType(p.typeContenu);
            const visibleMetrics = metricsForType(type);
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">
                        {typeLabel}
                      </span>
                      {p.label && (
                        <span className="text-sm font-medium text-slate-800">
                          {p.label}
                        </span>
                      )}
                      {p.datePublication && (
                        <span className="text-xs text-slate-400">
                          {new Date(p.datePublication).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                    {p.urlPublication && (
                      <a
                        href={p.urlPublication}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                      >
                        Lien publication <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className={`mt-4 grid gap-3 ${
                    visibleMetrics.length === 1
                      ? "grid-cols-1 sm:grid-cols-2"
                      : visibleMetrics.length <= 2
                        ? "grid-cols-2"
                        : "grid-cols-2 sm:grid-cols-4"
                  }`}
                >
                  {visibleMetrics.map((key) => (
                    <div
                      key={key}
                      className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        {COLLAB_STAT_METRIC_LABELS[key]}
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        {formatNum(metricValue(p, key))}
                      </p>
                    </div>
                  ))}
                </div>

                {p.notes && (
                  <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">
                    {p.notes}
                  </p>
                )}

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">
                      Screenshots
                      {p.screenshots.length === 0 && (
                        <span className="ml-2 text-amber-600 font-normal">
                          — à uploader
                        </span>
                      )}
                    </p>
                    {canEdit && (
                      <label className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-800 cursor-pointer">
                        {uploadingId === p.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ImagePlus className="w-4 h-4" />
                        )}
                        Ajouter des screens
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploadingId === p.id}
                          onChange={(e) => {
                            uploadScreens(p.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {uploadingId === p.id && uploadProgress && (
                    <div className="mb-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          Upload {uploadProgress.done}/{uploadProgress.total}
                        </span>
                        <span>
                          {Math.round(
                            (uploadProgress.done / uploadProgress.total) * 100
                          )}
                          %
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-violet-100 overflow-hidden">
                        <div
                          className="h-full bg-violet-600 transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (uploadProgress.done / uploadProgress.total) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {p.screenshots.length === 0 ? (
                    canEdit ? (
                      <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-8 cursor-pointer hover:bg-violet-50 transition-colors">
                        <Upload className="w-6 h-6 text-violet-500" />
                        <span className="text-sm text-violet-700 font-medium">
                          Déposer les screens Insights
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploadingId === p.id}
                          onChange={(e) => {
                            uploadScreens(p.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <p className="text-sm text-slate-400">Aucun screenshot</p>
                    )
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {p.screenshots.map((s) => (
                        <div key={s.id} className="relative group">
                          <button
                            type="button"
                            onClick={() => setLightbox(s.imageUrl)}
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={s.imageUrl}
                              alt={s.label || "Screenshot stats"}
                              className="h-28 w-auto rounded-lg border border-slate-200 object-cover"
                            />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeScreenshot(p.id, s.id)}
                              className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 shadow"
                              title="Supprimer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Screenshot"
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
