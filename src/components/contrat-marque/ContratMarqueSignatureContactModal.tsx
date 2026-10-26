"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";
import {
  isValidContratMarqueContactEmail,
  type ContratMarqueClientContact,
} from "@/lib/contratMarqueClientContact";

export type SignatureContactDraft = {
  nom: string;
  email: string;
  telephone: string;
};

export type SignatureContactSuggestion = {
  nom: string;
  email: string;
  telephone?: string | null;
  sourceLabel: string;
};

type Props = {
  open: boolean;
  busy?: boolean;
  /** Prefill (collab / négo / CRM). */
  initialContact?: ContratMarqueClientContact | null;
  /** Contacts CRM / négo proposés au clic. */
  suggestions?: SignatureContactSuggestion[];
  onClose: () => void;
  onConfirm: (contact: SignatureContactDraft) => void | Promise<void>;
};

function suggestionKey(s: SignatureContactSuggestion): string {
  return `${s.email.trim().toLowerCase()}|${s.nom.trim().toLowerCase()}`;
}

export default function ContratMarqueSignatureContactModal({
  open,
  busy = false,
  initialContact = null,
  suggestions = [],
  onClose,
  onConfirm,
}: Props) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const uniqueSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: SignatureContactSuggestion[] = [];
    for (const s of suggestions) {
      const emailOk = s.email?.trim();
      if (!emailOk || !isValidContratMarqueContactEmail(emailOk)) continue;
      const key = suggestionKey(s);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        nom: s.nom.trim(),
        email: emailOk.trim(),
        telephone: s.telephone?.trim() || null,
        sourceLabel: s.sourceLabel,
      });
    }
    return out;
  }, [suggestions]);

  useEffect(() => {
    if (!open) return;
    setNom(initialContact?.nom?.trim() ?? "");
    setEmail(initialContact?.email?.trim() ?? "");
    setTelephone(initialContact?.telephone?.trim() ?? "");
    setError(null);
  }, [open, initialContact]);

  if (!open) return null;

  const applySuggestion = (s: SignatureContactSuggestion) => {
    setNom(s.nom);
    setEmail(s.email);
    setTelephone(s.telephone?.trim() ?? "");
    setError(null);
  };

  const submit = () => {
    const n = nom.trim();
    const e = email.trim();
    const t = telephone.trim();
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
    void onConfirm({ nom: n, email: e, telephone: t });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contrat-marque-signature-contact-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2
            id="contrat-marque-signature-contact-title"
            className="text-sm font-semibold text-[#1A1110]"
          >
            Destinataire de la signature
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-gray-500">
            Choisissez un contact proposé ou saisissez l’email du client qui doit
            recevoir le lien DocuSeal.
          </p>

          {uniqueSuggestions.length > 0 ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-700">Contacts proposés</span>
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 p-1.5">
                {uniqueSuggestions.map((s) => {
                  const selected =
                    email.trim().toLowerCase() === s.email.toLowerCase() &&
                    nom.trim().toLowerCase() === s.nom.toLowerCase();
                  return (
                    <li key={suggestionKey(s)}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => applySuggestion(s)}
                        className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
                          selected
                            ? "bg-[#1A1110] text-white"
                            : "bg-white text-[#1A1110] hover:bg-gray-100"
                        }`}
                      >
                        <Mail
                          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                            selected ? "text-white/80" : "text-gray-400"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium truncate">
                            {s.nom || s.email}
                          </span>
                          <span
                            className={`block truncate ${
                              selected ? "text-white/75" : "text-gray-500"
                            }`}
                          >
                            {s.email}
                          </span>
                          <span
                            className={`block text-[10px] ${
                              selected ? "text-white/60" : "text-gray-400"
                            }`}
                          >
                            {s.sourceLabel}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">Nom du contact *</span>
            <input
              type="text"
              value={nom}
              disabled={busy}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1110] outline-none focus:border-gray-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">Email du contact *</span>
            <input
              type="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@marque.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1110] outline-none focus:border-gray-400"
              autoFocus
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-700">Téléphone (optionnel)</span>
            <input
              type="tel"
              value={telephone}
              disabled={busy}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="+33…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1110] outline-none focus:border-gray-400"
            />
          </label>

          {error ? (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Continuer vers DocuSeal
          </button>
        </div>
      </div>
    </div>
  );
}
