"use client";

import { useEffect, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import {
  isValidContratMarqueContactEmail,
  type ContratMarqueClientContact,
} from "@/lib/contratMarqueClientContact";

export type ContratMarqueUploadContactDraft = {
  nom: string;
  email: string;
  telephone: string;
};

type Props = {
  open: boolean;
  uploading?: boolean;
  /** Prefill (négo / CRM / contact déjà stocké). */
  initialContact?: ContratMarqueClientContact | null;
  /** PDF déjà choisi (glisser-déposer) avant ouverture de la modal. */
  initialFile?: File | null;
  onClose: () => void;
  onConfirm: (payload: { file: File; contact: ContratMarqueUploadContactDraft }) => void | Promise<void>;
};

export default function ContratMarqueUploadModal({
  open,
  uploading = false,
  initialContact = null,
  initialFile = null,
  onClose,
  onConfirm,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(initialFile ?? null);
    setNom(initialContact?.nom?.trim() ?? "");
    setEmail(initialContact?.email?.trim() ?? "");
    setTelephone(initialContact?.telephone?.trim() ?? "");
    setError(null);
  }, [open, initialContact, initialFile]);

  if (!open) return null;

  const submit = () => {
    const n = nom.trim();
    const e = email.trim();
    const t = telephone.trim();
    if (!file) {
      setError("Choisissez un fichier PDF.");
      return;
    }
    const isPdfMime = file.type === "application/pdf";
    const isPdfByName = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfByName) {
      setError("Le contrat doit être un PDF.");
      return;
    }
    if (!n) {
      setError("Le nom du contact client est requis.");
      return;
    }
    if (!e) {
      setError("L’email du contact client est requis.");
      return;
    }
    if (!isValidContratMarqueContactEmail(e)) {
      setError("L’email du contact client est invalide.");
      return;
    }
    setError(null);
    void onConfirm({
      file,
      contact: { nom: n, email: e, telephone: t },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contrat-marque-upload-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="contrat-marque-upload-title" className="text-sm font-semibold text-[#1A1110]">
            Uploader le contrat marque
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-gray-500">
            Le contact client est obligatoire : la juriste pourra le joindre directement.
          </p>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">PDF du contrat</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              disabled={uploading}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
            {file ? <span className="text-[11px] text-gray-500">{file.name}</span> : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">Nom du contact client *</span>
            <input
              type="text"
              value={nom}
              disabled={uploading}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1110] outline-none focus:border-gray-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">Email du contact client *</span>
            <input
              type="email"
              value={email}
              disabled={uploading}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@marque.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1110] outline-none focus:border-gray-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">Téléphone (optionnel)</span>
            <input
              type="tel"
              value={telephone}
              disabled={uploading}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="+33…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1110] outline-none focus:border-gray-400"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Envoyer au juriste
          </button>
        </div>
      </div>
    </div>
  );
}
