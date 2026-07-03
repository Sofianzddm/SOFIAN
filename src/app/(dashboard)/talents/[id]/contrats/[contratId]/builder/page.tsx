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
      })
      .catch((e) => setError(e?.message || "Erreur chargement"));
  }, [talentId, contratId]);

  const sendToTalent = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/talents/${talentId}/contrats/${contratId}/envoyer`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
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

  if (error) {
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
    { email: data.talent.email, role: "Talent", name: data.talent.name || undefined },
    ...(data.avecSignatureAgence
      ? [{ email: data.agence.email, role: "Agence", name: data.agence.name || undefined }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/talents/${talentId}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </Link>
          <span className="flex items-center gap-2 text-slate-700">
            <FileSignature className="w-4 h-4 text-blue-600" />
            <span className="font-medium">
              Placer les champs — {data.titre} ({data.talent.name})
            </span>
          </span>
        </div>
        {sending && (
          <span className="flex items-center gap-2 text-sm text-amber-700">
            <Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...
          </span>
        )}
      </header>
      <main className="flex-1 min-h-0">
        <DocusealBuilder
          token={data.builderToken}
          submitters={submitters}
          onSend={sendToTalent}
          language="fr"
          withSendButton={true}
          sendButtonText="Envoyer au talent"
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
