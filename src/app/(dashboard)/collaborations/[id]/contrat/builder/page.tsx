"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { DocusealBuilder } from "@docuseal/react";
import Link from "next/link";
import { ArrowLeft, Loader2, FileSignature, Plus, Trash2 } from "lucide-react";

type Signataire = { name: string; email: string; role: string };

type BuilderData = {
  builderToken: string;
  titre: string;
  signataires: Signataire[];
  talentName: string;
  marqueName: string;
};

function CollabContratBuilderContent() {
  const params = useParams();
  const router = useRouter();
  const collabId = params.id as string;

  const [data, setData] = useState<BuilderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [signataires, setSignataires] = useState<Signataire[]>([]);

  useEffect(() => {
    if (!collabId) return;
    fetch(`/api/collaborations/${collabId}/contrat/builder`)
      .then((res) => res.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        if (!d.builderToken) {
          setError("Token builder manquant");
          return;
        }
        const payload = d as BuilderData;
        setData(payload);
        setSignataires(
          (payload.signataires || []).map((s, i) => ({
            name: s.name || "",
            email: s.email || "",
            role: s.role || `Signataire ${i + 1}`,
          }))
        );
      })
      .catch((e) => setError(e?.message || "Erreur chargement"));
  }, [collabId]);

  const updateSignataire = (
    index: number,
    patch: Partial<Pick<Signataire, "name" | "email">>
  ) => {
    setSignataires((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
    if (error) setError(null);
  };

  const addSignataire = () => {
    setSignataires((prev) => [
      ...prev,
      {
        name: "",
        email: "",
        role: `Signataire ${prev.length + 1}`,
      },
    ]);
  };

  const removeSignataire = (index: number) => {
    setSignataires((prev) => {
      if (prev.length <= 1) return prev;
      return prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, role: `Signataire ${i + 1}` }));
    });
  };

  const sendForSignature = async () => {
    if (sending) return;
    const cleaned = signataires
      .map((s, i) => ({
        name: s.name.trim(),
        email: s.email.trim(),
        role: `Signataire ${i + 1}`,
      }))
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
    setError(null);
    setSending(true);
    try {
      const res = await fetch(
        `/api/collaborations/${collabId}/contrat/envoyer-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signataires: cleaned }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        if (d.partial) {
          alert(d.partial);
        }
        router.push(`/collaborations/${collabId}`);
      } else {
        setError(d.error || "Erreur lors de l'envoi");
        setSending(false);
      }
    } catch {
      setError("Erreur réseau");
      setSending(false);
    }
  };

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <Link
            href={`/collaborations/${collabId}`}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Retour à la collaboration
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-slate-600">Chargement de l&apos;éditeur de signature...</p>
        </div>
      </div>
    );
  }

  const builderSubmitters = signataires
    .filter((s) => s.email.trim())
    .map((s, i) => ({
      email: s.email.trim(),
      role: `Signataire ${i + 1}`,
      name: s.name.trim() || undefined,
    }));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/collaborations/${collabId}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" /> Retour
            </Link>
            <span className="flex items-center gap-2 text-slate-700 min-w-0">
              <FileSignature className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="font-medium truncate">
                Placer les champs — {data.titre}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={sendForSignature}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...
              </>
            ) : (
              "Envoyer en signature"
            )}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Signataires ({signataires.length})
            </p>
            <button
              type="button"
              onClick={addSignataire}
              disabled={sending || signataires.length >= 10}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
            {signataires.map((s, index) => (
              <div
                key={s.role + index}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">
                  {`Signataire ${index + 1}`}
                </span>
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => updateSignataire(index, { name: e.target.value })}
                  disabled={sending}
                  placeholder="Nom"
                  className="w-40 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-60"
                />
                <input
                  type="email"
                  value={s.email}
                  onChange={(e) => updateSignataire(index, { email: e.target.value })}
                  disabled={sending}
                  placeholder="email@exemple.com"
                  className="w-56 sm:w-64 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-60"
                />
                {signataires.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSignataire(index)}
                    disabled={sending}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    title="Retirer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Placez les champs (signature, nom…) pour chaque rôle dans l&apos;éditeur,
            puis envoyez.
          </p>
        </div>
      </header>
      {error && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <main className="flex-1 min-h-0">
        <DocusealBuilder
          token={data.builderToken}
          submitters={builderSubmitters}
          language="fr"
          withSendButton={false}
          withSignYourselfButton={false}
        />
      </main>
    </div>
  );
}

export default function CollabContratBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
      }
    >
      <CollabContratBuilderContent />
    </Suspense>
  );
}
