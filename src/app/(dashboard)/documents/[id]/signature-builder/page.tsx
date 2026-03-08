"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { DocusealBuilder } from "@docuseal/react";
import Link from "next/link";
import { ArrowLeft, Loader2, FileSignature } from "lucide-react";

function SignatureBuilderContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const templateId = searchParams.get("templateId");
  const email = searchParams.get("email") ?? "";
  const name = searchParams.get("name") ?? "";
  const agenceEmail = searchParams.get("agenceEmail") ?? "";
  const agenceName = searchParams.get("agenceName") ?? "Agence";

  const [builderToken, setBuilderToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id || !templateId || !email) {
      setError("Paramètres manquants (document, templateId, email)");
      return;
    }
    if (!agenceEmail) {
      setError("Paramètres manquants (agenceEmail)");
      return;
    }
    const q = new URLSearchParams({
      templateId,
      email,
      name: name || "Signataire",
      ...(agenceEmail && { agenceEmail, agenceName: agenceName || "Agence" }),
    });
    fetch(`/api/documents/${id}/signature-builder?${q}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setBuilderToken(data.builderToken ?? null);
        if (!data.builderToken) setError("Token builder manquant");
      })
      .catch((e) => {
        setError(e?.message || "Erreur chargement");
      });
  }, [id, templateId, email, name, agenceEmail, agenceName]);

  const sendToSigner = async () => {
    if (!templateId || !email || !agenceEmail) return;
    setSending(true);
    try {
      const res = await fetch(`/api/documents/${id}/envoyer-signature-avec-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: Number(templateId),
          signerEmail: email,
          signerName: name || "Client",
          agenceEmail,
          agenceName: agenceName || "Agence",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.collaborationId) {
          router.push(`/collaborations/${data.collaborationId}`);
        } else {
          router.push("/documents");
        }
      } else {
        setError(data.error || "Erreur lors de l'envoi");
        setSending(false);
      }
    } catch (e) {
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
            href="/documents"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Retour aux documents
          </Link>
        </div>
      </div>
    );
  }

  if (!builderToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-slate-600">Chargement de l'éditeur de signature...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </Link>
          <span className="flex items-center gap-2 text-slate-700">
            <FileSignature className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Placer les champs de signature sur le devis</span>
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
          token={builderToken}
          submitters={[
            { email, role: "Client", name: name || undefined },
            { email: agenceEmail, role: "Agence", name: agenceName || undefined },
          ]}
          onSend={sendToSigner}
          language="fr"
          withSendButton={true}
          sendButtonText="Envoyer au signataire"
        />
      </main>
    </div>
  );
}

export default function SignatureBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
      }
    >
      <SignatureBuilderContent />
    </Suspense>
  );
}
