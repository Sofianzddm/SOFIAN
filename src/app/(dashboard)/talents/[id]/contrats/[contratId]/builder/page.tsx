"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { DocusealBuilder } from "@docuseal/react";
import Link from "next/link";
import { ArrowLeft, Loader2, FileSignature } from "lucide-react";

type BuilderData = {
  builderToken: string;
  titre: string;
  avecSignatureAgence: boolean;
  talent: { email: string; name: string };
  agence: { email: string; name: string };
};

function ContratBuilderContent() {
  const params = useParams();
  const router = useRouter();
  const talentId = params.id as string;
  const contratId = params.contratId as string;

  const [data, setData] = useState<BuilderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [talentEmail, setTalentEmail] = useState("");

  useEffect(() => {
    if (!talentId || !contratId) return;
    fetch(`/api/talents/${talentId}/contrats/${contratId}/builder`)
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
        setData(d as BuilderData);
        setTalentEmail((d as BuilderData).talent.email || "");
      })
      .catch((e) => setError(e?.message || "Erreur chargement"));
  }, [talentId, contratId]);

  const sendToTalent = async () => {
    if (sending) return;
    const email = talentEmail.trim();
    if (!email) {
      setError("Indiquez l'adresse email du talent");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Adresse email invalide");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/talents/${talentId}/contrats/${contratId}/envoyer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        if (d.emailEnvoye === false) {
          alert(
            "Le contrat est prêt côté DocuSeal, mais l'email Glow Up n'a pas pu être envoyé " +
              "(configuration Resend manquante). Utilisez « Relancer » depuis la fiche talent une fois corrigé."
          );
        }
        router.push(`/talents/${talentId}`);
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
            href={`/talents/${talentId}`}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Retour à la fiche talent
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
          <p className="text-slate-600">Chargement de l'éditeur de signature...</p>
        </div>
      </div>
    );
  }

  const submitters = [
    { email: talentEmail.trim() || data.talent.email, role: "Talent", name: data.talent.name || undefined },
    ...(data.avecSignatureAgence
      ? [{ email: data.agence.email, role: "Agence", name: data.agence.name || undefined }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/talents/${talentId}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </Link>
          <span className="flex items-center gap-2 text-slate-700 min-w-0">
            <FileSignature className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-medium truncate">
              Placer les champs — {data.titre} ({data.talent.name})
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap font-medium">Email talent</span>
            <input
              type="email"
              value={talentEmail}
              onChange={(e) => {
                setTalentEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={sending}
              placeholder="email@exemple.com"
              className="w-56 sm:w-64 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-60"
            />
          </label>
          {/* Bouton d'envoi maison : le bouton natif DocuSeal est désactivé car il
              enverrait les emails DocuSeal et créerait une submission en doublon. */}
          <button
            type="button"
            onClick={sendToTalent}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...
              </>
            ) : (
              "Envoyer au talent"
            )}
          </button>
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
          submitters={submitters}
          language="fr"
          withSendButton={false}
          withSignYourselfButton={false}
        />
      </main>
    </div>
  );
}

export default function ContratBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
      }
    >
      <ContratBuilderContent />
    </Suspense>
  );
}
