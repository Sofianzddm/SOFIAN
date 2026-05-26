"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Copy,
  ExternalLink,
  Trash2,
  UploadCloud,
  Image as ImageIcon,
  Lock,
  Pencil,
  X,
  Check,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface Screenshot {
  id: string;
  imageUrl: string;
  label: string | null;
  position: number;
}

interface ReportTalent {
  id: string;
  talentId: string;
  prenom: string;
  nom: string;
  photo: string | null;
  instagram: string | null;
  position: number;
  screenshots: Screenshot[];
}

interface Report {
  id: string;
  name: string;
  clientAccessToken: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; prenom: string; nom: string } | null;
  talents: ReportTalent[];
}

interface TalentRow {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  instagram: string | null;
}

export default function ManageReportClient({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTalentId, setActiveTalentId] = useState<string | null>(null);

  const [editName, setEditName] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showTalentPicker, setShowTalentPicker] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/activation-stats/${reportId}`);
    if (!res.ok) {
      toast.error("Rapport introuvable");
      router.push("/activation-stats");
      return;
    }
    const data = await res.json();
    setReport(data.report);
    setName(data.report.name);
    setActiveTalentId((prev) => prev ?? data.report.talents[0]?.id ?? null);
    setLoading(false);
  }, [reportId, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeTalent = useMemo(
    () => report?.talents.find((t) => t.id === activeTalentId) ?? null,
    [report, activeTalentId]
  );

  async function copyLink() {
    if (!report) return;
    const link = `${window.location.origin}/r/activations/${report.clientAccessToken}`;
    await navigator.clipboard.writeText(link);
    toast.success("Lien copié");
  }

  async function saveName() {
    if (!name.trim() || !report) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/activation-stats/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Nom mis a jour");
      setEditName(false);
      await reload();
    } catch {
      toast.error("Erreur");
    } finally {
      setSavingName(false);
    }
  }

  async function removeTalent(reportTalentId: string) {
    if (!report) return;
    if (
      !confirm(
        "Retirer ce talent du rapport ? Ses screenshots seront definitivement supprimes."
      )
    )
      return;
    const remainingIds = report.talents
      .filter((t) => t.id !== reportTalentId)
      .map((t) => t.talentId);
    const res = await fetch(`/api/activation-stats/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talentIds: remainingIds }),
    });
    if (!res.ok) {
      toast.error("Erreur");
      return;
    }
    toast.success("Talent retire");
    if (activeTalentId === reportTalentId) setActiveTalentId(null);
    await reload();
  }

  async function deleteReport() {
    if (!report) return;
    if (!confirm("Supprimer ce rapport ? Action irreversible.")) return;
    const res = await fetch(`/api/activation-stats/${report.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Erreur");
      return;
    }
    toast.success("Rapport supprime");
    router.push("/activation-stats");
  }

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const publicLink = `${typeof window !== "undefined" ? window.location.origin : ""}/r/activations/${report.clientAccessToken}`;

  return (
    <div className="max-w-7xl mx-auto">
      <Link
        href="/activation-stats"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux rapports
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          {editName ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-3xl font-bold text-glowup-licorice bg-transparent border-b-2 border-glowup-rose focus:outline-none px-1"
                autoFocus
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="p-2 rounded-lg bg-glowup-rose text-white"
              >
                {savingName ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => {
                  setEditName(false);
                  setName(report.name);
                }}
                className="p-2 rounded-lg border border-gray-200 text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditName(true)}
              className="group inline-flex items-center gap-2 text-3xl font-bold text-glowup-licorice"
            >
              {report.name}
              <Pencil className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </button>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Cree le {new Date(report.createdAt).toLocaleDateString("fr-FR")}
            {report.createdBy && ` · par ${report.createdBy.prenom} ${report.createdBy.nom}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
          >
            <Lock className="w-4 h-4" />
            Mot de passe
          </button>
          <button
            onClick={deleteReport}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      </div>

      {/* Lien client */}
      <div className="bg-gradient-to-r from-glowup-lace/40 via-white to-glowup-lace/30 border border-glowup-rose/20 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
              Lien client
            </p>
            <code className="text-sm text-gray-800 break-all">{publicLink}</code>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm"
            >
              <Copy className="w-4 h-4" />
              Copier
            </button>
            <a
              href={publicLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-glowup-rose text-white hover:bg-glowup-rose/90 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Apercu
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar talents */}
        <aside className="bg-white rounded-xl border border-gray-100 p-3 h-fit lg:sticky lg:top-6">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-sm font-semibold text-glowup-licorice">
              Talents ({report.talents.length})
            </span>
            <button
              onClick={() => setShowTalentPicker(true)}
              className="p-1.5 rounded-lg text-glowup-rose hover:bg-glowup-lace/50"
              title="Ajouter des talents"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {report.talents.length === 0 && (
              <p className="text-xs text-gray-400 px-2 py-3 text-center">
                Aucun talent. Clique sur + pour en ajouter.
              </p>
            )}
            {report.talents.map((t) => {
              const isActive = t.id === activeTalentId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTalentId(t.id)}
                  className={`group w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                    isActive
                      ? "bg-glowup-rose text-white"
                      : "hover:bg-glowup-lace/40 text-gray-700"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                    {t.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.photo} alt={t.prenom} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-gray-500">
                        {t.prenom[0]}
                        {t.nom[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.prenom} {t.nom}
                    </p>
                    <p
                      className={`text-[11px] truncate ${
                        isActive ? "text-white/80" : "text-gray-400"
                      }`}
                    >
                      {t.screenshots.length} stat{t.screenshots.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Zone screenshots */}
        <section>
          {activeTalent ? (
            <TalentScreenshotsPanel
              key={activeTalent.id}
              reportId={report.id}
              talent={activeTalent}
              onRemoveTalent={() => removeTalent(activeTalent.id)}
              onReload={reload}
            />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <ImageIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                Selectionne un talent dans la liste pour ajouter ses stats.
              </p>
            </div>
          )}
        </section>
      </div>

      {showPasswordModal && (
        <PasswordModal
          reportId={report.id}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {showTalentPicker && (
        <TalentPickerModal
          report={report}
          onClose={() => setShowTalentPicker(false)}
          onSaved={async () => {
            setShowTalentPicker(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau d'un talent : drop zone + grille screenshots
// ---------------------------------------------------------------------------
function TalentScreenshotsPanel({
  reportId,
  talent,
  onRemoveTalent,
  onReload,
}: {
  reportId: string;
  talent: ReportTalent;
  onRemoveTalent: () => void;
  onReload: () => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; preview: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;

      // Previews provisoires
      const tempPreviews = images.map((f) => ({
        name: f.name,
        preview: URL.createObjectURL(f),
      }));
      setUploading((u) => [...u, ...tempPreviews]);

      try {
        for (const file of images) {
          if (file.size > 15 * 1024 * 1024) {
            toast.error(`${file.name} > 15 Mo`);
            continue;
          }

          const sigRes = await fetch("/api/activation-stats/upload-signature", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportTalentId: talent.id }),
          });
          if (!sigRes.ok) {
            toast.error("Erreur signature");
            continue;
          }
          const { signature, timestamp, folder, publicId, cloudName, apiKey } =
            await sigRes.json();

          const fd = new FormData();
          fd.append("file", file);
          fd.append("signature", signature);
          fd.append("timestamp", String(timestamp));
          fd.append("folder", folder);
          fd.append("public_id", publicId);
          fd.append("api_key", apiKey);

          const cloudRes = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            { method: "POST", body: fd }
          );
          if (!cloudRes.ok) {
            toast.error(`Echec upload ${file.name}`);
            continue;
          }
          const cloudJson = await cloudRes.json();

          await fetch(`/api/activation-stats/${reportId}/screenshots`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reportTalentId: talent.id,
              imageUrl: cloudJson.secure_url,
            }),
          });
        }
        toast.success(`${images.length} image${images.length > 1 ? "s" : ""} ajoutee${images.length > 1 ? "s" : ""}`);
        await onReload();
      } finally {
        setUploading((u) => u.filter((x) => !tempPreviews.find((t) => t.preview === x.preview)));
        tempPreviews.forEach((t) => URL.revokeObjectURL(t.preview));
      }
    },
    [reportId, talent.id, onReload]
  );

  // Coller depuis le presse-papier (screenshot rapide)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles]);

  async function deleteScreenshot(id: string) {
    if (!confirm("Supprimer cette image ?")) return;
    const res = await fetch(`/api/activation-stats/screenshots/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return toast.error("Erreur");
    toast.success("Image supprimee");
    await onReload();
  }

  async function updateLabel(id: string, label: string) {
    const res = await fetch(`/api/activation-stats/screenshots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) return toast.error("Erreur");
    await onReload();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
            {talent.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={talent.photo} alt={talent.prenom} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-gray-500">
                {talent.prenom[0]}
                {talent.nom[0]}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-glowup-licorice">
              {talent.prenom} {talent.nom}
            </h2>
            {talent.instagram && (
              <p className="text-xs text-gray-500">@{talent.instagram}</p>
            )}
          </div>
        </div>
        <button
          onClick={onRemoveTalent}
          className="text-xs text-red-600 hover:underline"
        >
          Retirer du rapport
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files);
          handleFiles(files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-xl px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-glowup-rose bg-glowup-lace/40"
            : "border-gray-200 hover:border-glowup-rose/60 hover:bg-glowup-lace/20"
        }`}
      >
        <UploadCloud className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">
          Glisse-depose des screenshots ici
        </p>
        <p className="text-xs text-gray-400 mt-1">
          ou clique pour selectionner · tu peux aussi coller (Ctrl+V)
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length) handleFiles(files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {/* Previews + galerie */}
      {(uploading.length > 0 || talent.screenshots.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-5">
          {uploading.map((u) => (
            <div
              key={u.preview}
              className="relative aspect-[3/4] rounded-xl overflow-hidden border border-gray-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.preview} alt={u.name} className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            </div>
          ))}

          {talent.screenshots.map((s) => (
            <ScreenshotCard
              key={s.id}
              screenshot={s}
              onDelete={() => deleteScreenshot(s.id)}
              onLabelChange={(label) => updateLabel(s.id, label)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScreenshotCard({
  screenshot,
  onDelete,
  onLabelChange,
}: {
  screenshot: Screenshot;
  onDelete: () => void;
  onLabelChange: (label: string) => void;
}) {
  const [labelEditing, setLabelEditing] = useState(false);
  const [label, setLabel] = useState(screenshot.label || "");

  return (
    <div className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <div className="aspect-[3/4] bg-white">
        <a href={screenshot.imageUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot.imageUrl}
            alt={screenshot.label || "Screenshot"}
            className="w-full h-full object-contain"
          />
        </a>
      </div>
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur rounded-full text-red-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity shadow"
        title="Supprimer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="px-3 py-2 border-t border-gray-100 bg-white">
        {labelEditing ? (
          <div className="flex items-center gap-1">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-glowup-rose"
            />
            <button
              onClick={() => {
                setLabelEditing(false);
                onLabelChange(label);
              }}
              className="p-1 text-glowup-rose"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setLabelEditing(true)}
            className="w-full text-left text-xs text-gray-600 hover:text-glowup-licorice truncate"
          >
            {screenshot.label || (
              <span className="text-gray-400 italic">Ajouter une legende</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal mot de passe
// ---------------------------------------------------------------------------
function PasswordModal({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (password.length < 4) return toast.error("Minimum 4 caracteres");
    setSaving(true);
    try {
      const res = await fetch(`/api/activation-stats/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error();
      toast.success("Mot de passe mis a jour");
      onClose();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-glowup-licorice mb-1">
          Changer le mot de passe
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Le client devra utiliser ce nouveau mot de passe.
        </p>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nouveau mot de passe"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-glowup-rose/40 font-mono mb-4"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving || password.length < 4}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-glowup-rose text-white text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal ajout talents
// ---------------------------------------------------------------------------
function TalentPickerModal({
  report,
  onClose,
  onSaved,
}: {
  report: Report;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [talents, setTalents] = useState<TalentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const existingIds = useMemo(() => new Set(report.talents.map((t) => t.talentId)), [report]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/talents")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.talents || [];
        setTalents(
          list.map((t: any) => ({
            id: t.id,
            prenom: t.prenom,
            nom: t.nom,
            photo: t.photo,
            instagram: t.instagram,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return talents
      .filter((t) => !existingIds.has(t.id))
      .filter(
        (t) =>
          !q ||
          t.prenom.toLowerCase().includes(q) ||
          t.nom.toLowerCase().includes(q) ||
          (t.instagram || "").toLowerCase().includes(q)
      );
  }, [talents, existingIds, search]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    if (selected.length === 0) return onClose();
    setSaving(true);
    try {
      const allIds = [...report.talents.map((t) => t.talentId), ...selected];
      const res = await fetch(`/api/activation-stats/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentIds: allIds }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${selected.length} talent${selected.length > 1 ? "s" : ""} ajoute${selected.length > 1 ? "s" : ""}`);
      await onSaved();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-glowup-licorice">
              Ajouter des talents au rapport
            </h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-glowup-rose/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-glowup-rose" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Tous les talents sont deja dans le rapport.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filtered.map((t) => {
                const isSel = selected.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={`relative text-left p-3 rounded-xl border-2 transition-all ${
                      isSel
                        ? "border-glowup-rose bg-glowup-lace/40"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {t.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.photo} alt={t.prenom} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-gray-500">
                            {t.prenom[0]}
                            {t.nom[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {t.prenom} {t.nom}
                        </p>
                        {t.instagram && (
                          <p className="text-xs text-gray-500 truncate">@{t.instagram}</p>
                        )}
                      </div>
                    </div>
                    {isSel && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-glowup-rose text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving || selected.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-glowup-rose text-white text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Ajouter {selected.length > 0 && `(${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
