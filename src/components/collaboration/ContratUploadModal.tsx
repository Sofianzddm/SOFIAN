"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2, Plus, Trash2, Upload, X } from "lucide-react";

export type ContratUploadSignataire = {
  name: string;
  email: string;
};

type Props = {
  collaborationId: string;
  open: boolean;
  onClose: () => void;
  defaultTitre?: string;
  defaultSignataires: ContratUploadSignataire[];
};

export default function ContratUploadModal({
  collaborationId,
  open,
  onClose,
  defaultTitre = "",
  defaultSignataires,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [titre, setTitre] = useState(defaultTitre);
  const [signataires, setSignataires] = useState<ContratUploadSignataire[]>(
    defaultSignataires.length > 0
      ? defaultSignataires
      : [{ name: "", email: "" }]
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const selectFile = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Seuls les fichiers PDF sont acceptés");
      return;
    }
    setFile(f);
    if (!titre.trim()) {
      setTitre(f.name.replace(/\.pdf$/i, ""));
    }
  };

  const updateSignataire = (
    index: number,
    patch: Partial<ContratUploadSignataire>
  ) => {
    setSignataires((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const handleSubmit = async () => {
    if (!file || uploading) return;
    const cleaned = signataires
      .map((s) => ({ name: s.name.trim(), email: s.email.trim() }))
      .filter((s) => s.email);
    if (cleaned.length === 0) {
      setError("Ajoutez au moins un signataire");
      return;
    }
    for (const s of cleaned) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) {
        setError(`Adresse email invalide : ${s.email}`);
        return;
      }
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("titre", titre.trim() || file.name.replace(/\.pdf$/i, ""));
      formData.append("signataires", JSON.stringify(cleaned));

      const res = await fetch(
        `/api/collaborations/${collaborationId}/contrat/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        router.push(`/collaborations/${collaborationId}/contrat/builder`);
      } else {
        setError(data.error || "Erreur lors de l'upload");
        setUploading(false);
      }
    } catch {
      setError("Erreur réseau");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="text-xl font-bold text-glowup-licorice">
              Uploader un contrat
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              PDF libre → placement des champs → envoi en signature électronique
              (même système que les contrats talent).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 mt-6">
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                selectFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-indigo-500" />
              <p className="font-medium text-glowup-licorice text-center">
                Glissez un PDF ici, ou cliquez pour choisir
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  selectFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50">
              <FileSignature className="w-5 h-5 text-indigo-600 shrink-0" />
              <span className="font-medium text-glowup-licorice truncate flex-1">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={uploading}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Changer
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Titre du contrat
            </label>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              disabled={uploading}
              placeholder="Contrat collab — Campagne X"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Signataires
              </label>
              <button
                type="button"
                onClick={() =>
                  setSignataires((prev) => [...prev, { name: "", email: "" }])
                }
                disabled={uploading || signataires.length >= 10}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {signataires.map((s, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) =>
                      updateSignataire(index, { name: e.target.value })
                    }
                    disabled={uploading}
                    placeholder="Nom"
                    className="flex-1 min-w-[120px] px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                  <input
                    type="email"
                    value={s.email}
                    onChange={(e) =>
                      updateSignataire(index, { email: e.target.value })
                    }
                    disabled={uploading}
                    placeholder="email@exemple.com"
                    className="flex-[1.4] min-w-[160px] px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                  {signataires.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSignataires((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                      disabled={uploading}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 px-5 py-3 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="flex-1 px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Préparation...
              </>
            ) : (
              <>
                <FileSignature className="w-4 h-4" /> Continuer : placer les champs
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
