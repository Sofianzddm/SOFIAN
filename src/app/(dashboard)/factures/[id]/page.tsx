"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Download,
  Send,
  Check,
  XCircle,
  Calendar,
  Building2,
  User,
  FileStack,
  MoreVertical,
  ChevronDown,
  Pencil,
  Plane,
  Printer,
  Copy,
  FileSignature,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MessageSquare,
  Trash2,
} from "lucide-react";

type DocStatut = "BROUILLON" | "VALIDE" | "ENVOYE" | "PAYE" | "ANNULE" | "REFUSE";

interface DocDetail {
  id: string;
  reference: string;
  type: string;
  statut: DocStatut;
  titre?: string | null;
  montantHT: number | string;
  tauxTVA: number | string;
  montantTVA: number | string;
  montantTTC: number | string;
  dateEmission: string | null;
  dateEcheance: string | null;
  datePaiement: string | null;
  dateValidation: string | null;
  modePaiement: string | null;
  referencePaiement: string | null;
  poClient: string | null;
  notes: string | null;
  lignes?: unknown;
  collaboration?: {
    id: string;
    reference: string;
    talent?: { id: string; prenom: string; nom: string };
    marque?: {
      id: string;
      nom: string;
      raisonSociale?: string | null;
      adresseRue?: string | null;
      adresseComplement?: string | null;
      codePostal?: string | null;
      ville?: string | null;
      pays?: string | null;
    };
    quotes?: Array<{
      id: string;
      reference: string;
      issueDate: string;
      status: string;
      invoiceId: string | null;
    }>;
  } | null;
  events?: Array<{
    id: string;
    type: string;
    description: string | null;
    createdAt: string;
    user: { id: string; prenom: string; nom: string };
  }>;
  comments?: Array<{
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; prenom: string; nom: string };
  }>;
  linkedQuote?: {
    id: string;
    reference: string;
    issueDate: string;
    status: string;
  } | null;
}

function formatMoney(amount: number, currency = "EUR") {
  return (
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0) + (currency === "EUR" ? " €" : "")
  );
}

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(s: string) {
  const d = new Date(s);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffM / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffM < 1) return "À l'instant";
  if (diffM < 60) return `Il y a ${diffM} min`;
  if (diffH < 24) return `Il y a ${diffH} h`;
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return formatDate(s);
}

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  VALIDE: "Enregistré",
  ENVOYE: "Envoyé",
  PAYE: "Payé",
  ANNULE: "Annulé",
  REFUSE: "Refusé",
};

const PIPELINE_STEPS: { key: DocStatut; label: string }[] = [
  { key: "BROUILLON", label: "Brouillon" },
  { key: "VALIDE", label: "Enregistré" },
  { key: "ENVOYE", label: "Envoyé" },
  { key: "PAYE", label: "Payé" },
];

function StatutBadge({ statut, isLate }: { statut: DocStatut; isLate?: boolean }) {
  if (isLate) {
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-0.5 text-xs font-medium text-red-700">
        En retard
      </span>
    );
  }
  const config: Record<string, { label: string; className: string }> = {
    BROUILLON: { label: "Brouillon", className: "border border-gray-200 bg-gray-100 text-gray-600" },
    VALIDE: { label: "Enregistré", className: "border border-[#F5D68B] bg-[#FEF3E2] text-[#8B6914]" },
    ENVOYE: { label: "Envoyé", className: "border border-blue-200 bg-blue-50 text-blue-700" },
    PAYE: { label: "Payé", className: "border border-green-200 bg-green-50 text-green-700" },
    ANNULE: { label: "Annulé", className: "border border-gray-200 bg-gray-50 text-gray-400" },
    REFUSE: { label: "Refusé", className: "border border-red-200 bg-red-50 text-red-600" },
  };
  const c = config[statut] || { label: statut, className: "border border-gray-200 bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex rounded-full px-3 py-0.5 text-xs font-medium ${c.className}`}>{c.label}</span>
  );
}

export default function FactureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annulerMotif, setAnnulerMotif] = useState("");
  const [showAnnulerModal, setShowAnnulerModal] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pipelineConfirm, setPipelineConfirm] = useState<DocStatut | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("Virement");
  const [paymentRef, setPaymentRef] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const sendRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const fetchDoc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/documents/${id}`, { cache: "no-store" });
      if (!r.ok) {
        if (r.status === 404) setDoc(null);
        else setError("Erreur lors du chargement");
        return;
      }
      const data = await r.json();
      setDoc(data);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  // Close dropdowns on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (
        sendRef.current && !sendRef.current.contains(e.target as Node) &&
        downloadRef.current && !downloadRef.current.contains(e.target as Node) &&
        moreRef.current && !moreRef.current.contains(e.target as Node)
      ) {
        setSendOpen(false);
        setDownloadOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handlePdf = useCallback(() => {
    if (!id) return;
    setActionLoading("pdf");
    window.open(`/api/documents/${id}/pdf`, "_blank");
    setTimeout(() => setActionLoading(null), 500);
  }, [id]);

  const handleEnvoyer = useCallback(async () => {
    if (!id) return;
    setSendOpen(false);
    setActionLoading("envoyer");
    try {
      const r = await fetch(`/api/documents/${id}/envoyer`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error || "Erreur lors de l'envoi");
        return;
      }
      await fetchDoc();
    } finally {
      setActionLoading(null);
    }
  }, [id, fetchDoc]);

  const handlePayer = useCallback(async () => {
    if (!id) return;
    setActionLoading("payer");
    try {
      const r = await fetch(`/api/documents/${id}/payer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datePaiement: new Date().toISOString() }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error || "Erreur lors du marquage du paiement");
        return;
      }
      await fetchDoc();
    } finally {
      setActionLoading(null);
    }
  }, [id, fetchDoc]);

  const handlePayerWithModal = useCallback(async () => {
    if (!id || !doc) return;
    const amount = parseFloat(paymentAmount.replace(/\s/g, "").replace(",", ".")) || Number(doc.montantTTC);
    setActionLoading("payer");
    try {
      const r = await fetch(`/api/documents/${id}/payer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datePaiement: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
          referencePaiement: paymentRef || undefined,
          modePaiement: paymentMode || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error || "Erreur lors de l'enregistrement du paiement");
        return;
      }
      setPaymentModalOpen(false);
      setPaymentAmount("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setPaymentRef("");
      await fetchDoc();
    } finally {
      setActionLoading(null);
    }
  }, [id, doc, paymentAmount, paymentDate, paymentMode, paymentRef, fetchDoc]);

  const handleAnnulerOpen = useCallback(() => setShowAnnulerModal(true), []);
  const handleAnnulerClose = useCallback(() => {
    setShowAnnulerModal(false);
    setAnnulerMotif("");
  }, []);

  const handleAnnulerConfirm = useCallback(async () => {
    if (!id || !annulerMotif.trim()) return;
    setActionLoading("annuler");
    try {
      const r = await fetch(`/api/documents/${id}/annuler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif: annulerMotif.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error || "Erreur lors de l'annulation");
        return;
      }
      handleAnnulerClose();
      await fetchDoc();
    } finally {
      setActionLoading(null);
    }
  }, [id, annulerMotif, fetchDoc, handleAnnulerClose]);

  const handlePipelineStep = useCallback(
    async (targetStatut: DocStatut) => {
      if (!doc || doc.statut === "ANNULE") return;
      const idx = PIPELINE_STEPS.findIndex((s) => s.key === targetStatut);
      const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === doc.statut);
      if (idx <= currentIdx || idx === -1) return;
      setPipelineConfirm(targetStatut);
    },
    [doc]
  );

  const confirmPipelineStep = useCallback(async () => {
    if (!pipelineConfirm || !id) return;
    if (pipelineConfirm === "VALIDE") {
      setPipelineConfirm(null);
      setActionLoading("enregistrer");
      try {
        const r = await fetch(`/api/documents/${id}/enregistrer`, { method: "POST" });
        if (!r.ok) {
          const d = await r.json();
          alert(d.error || "Erreur");
          return;
        }
        await fetchDoc();
      } finally {
        setActionLoading(null);
      }
      return;
    }
    if (pipelineConfirm === "ENVOYE") {
      setPipelineConfirm(null);
      await handleEnvoyer();
      return;
    }
    if (pipelineConfirm === "PAYE") {
      setPipelineConfirm(null);
      setPaymentModalOpen(true);
      return;
    }
    setPipelineConfirm(null);
  }, [pipelineConfirm, id, handleEnvoyer, fetchDoc]);

  const handleAddComment = useCallback(async () => {
    if (!id || !commentContent.trim()) return;
    setCommentSubmitting(true);
    try {
      const r = await fetch(`/api/documents/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent.trim() }),
      });
      if (!r.ok) {
        const d = await r.json();
        alert(d.error || "Erreur");
        return;
      }
      setCommentContent("");
      setCommentOpen(false);
      await fetchDoc();
    } finally {
      setCommentSubmitting(false);
    }
  }, [id, commentContent, fetchDoc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-[#1A1110]" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Link
          href="/factures"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-[#1A1110] font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à la liste des factures
        </Link>
        <p className="text-gray-500">{error || "Facture introuvable."}</p>
      </div>
    );
  }

  const isLate =
    doc.statut === "ENVOYE" &&
    doc.dateEcheance &&
    new Date(doc.dateEcheance) < new Date();
  const isCancelled = doc.statut === "ANNULE";
  const isFacture = String(doc.type).toUpperCase() === "FACTURE";
  const lignesArray = Array.isArray(doc.lignes) ? doc.lignes : [];
  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.key === doc.statut);
  const marque = doc.collaboration?.marque;
  const talent = doc.collaboration?.talent;
  const clientName = marque?.nom ?? "—";
  const talentName = talent ? `${talent.prenom} ${talent.nom}` : "—";

  // Historique : events ou dérivé
  const historyItems = (doc.events && doc.events.length > 0)
    ? doc.events.map((e) => ({
        user: `${e.user.prenom} ${e.user.nom}`,
        event: e.type === "CREATED" ? "Création" : e.type === "REGISTERED" ? "Enregistrement" : e.type === "SENT" ? "Envoi" : e.type === "PAYMENT" ? "Paiement" : e.description || e.type,
        document: `Facture (${doc.reference})`,
        date: e.createdAt,
      }))
    : [
        ...(doc.datePaiement
          ? [
              {
                user: "Système",
                event: "Paiement",
                document: `Facture (${doc.reference})`,
                date: doc.datePaiement,
              },
            ]
          : []),
        ...(doc.createdAt
          ? [
              {
                user: "Système",
                event: "Création",
                document: `Facture (${doc.reference})`,
                date: doc.createdAt,
              },
            ]
          : []),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ═══ ZONE 1 : Header + Actions (sticky) ═══ */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <Link
            href="/factures"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#1A1110] font-medium transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à la liste des factures
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[#1A1110] to-[#C08B8B] text-white">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-[#1A1110]">{doc.reference}</h1>
                  <StatutBadge statut={doc.statut} isLate={isLate} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {doc.type} {isFacture && "• Facture marque"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isCancelled && doc.statut !== "PAYE" && (
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#1A1110] to-[#C08B8B] text-white text-sm font-medium shadow-sm hover:opacity-95 transition-opacity"
                >
                  <Check className="w-4 h-4" />
                  Entrer un paiement
                </button>
              )}
              <button type="button" className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50" title="Modifier">
                <Pencil className="w-4 h-4" />
              </button>

              <div className="relative" ref={sendRef}>
                <button
                  type="button"
                  onClick={() => setSendOpen(!sendOpen)}
                  disabled={isCancelled}
                  className="inline-flex items-center gap-1 p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Plane className="w-4 h-4" />
                  <ChevronDown className="w-4 h-4" />
                </button>
                {sendOpen && (
                  <div className="absolute right-0 mt-1 w-56 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-50">
                    <button
                      type="button"
                      onClick={handleEnvoyer}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Envoyer par email
                    </button>
                    <button
                      type="button"
                      onClick={handleEnvoyer}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Marquer comme envoyé
                    </button>
                  </div>
                )}
              </div>

              <div className="relative" ref={downloadRef}>
                <button
                  type="button"
                  onClick={() => setDownloadOpen(!downloadOpen)}
                  className="inline-flex items-center gap-1 p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />
                  <ChevronDown className="w-4 h-4" />
                </button>
                {downloadOpen && (
                  <div className="absolute right-0 mt-1 w-48 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-50">
                    <button
                      type="button"
                      onClick={() => { handlePdf(); setDownloadOpen(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Télécharger PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => { handlePdf(); setDownloadOpen(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Imprimer
                    </button>
                  </div>
                )}
              </div>

              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen(!moreOpen)}
                  disabled={isCancelled}
                  className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {moreOpen && (
                  <div className="absolute right-0 mt-1 w-52 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-50">
                    <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                      <Copy className="w-4 h-4" />
                      Dupliquer la facture
                    </button>
                    <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                      <FileSignature className="w-4 h-4" />
                      Créer un avoir
                    </button>
                    {!isCancelled && doc.statut !== "PAYE" && (
                      <button
                        type="button"
                        onClick={() => { setMoreOpen(false); handleAnnulerOpen(); }}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Annuler la facture
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-600 mt-2">
            Facture du {formatDate(doc.dateEmission)} pour{" "}
            {marque?.id ? (
              <Link href={`/marques/${marque.id}`} className="text-[#1A1110] font-medium hover:underline">
                {clientName}
              </Link>
            ) : (
              clientName
            )}{" "}
            de {formatMoney(Number(doc.montantTTC))} TTC
          </p>

          {/* Pipeline */}
          {!isCancelled && (
            <div className="mt-6">
              <div className="flex items-center gap-0">
                {PIPELINE_STEPS.map((step, i) => {
                  const isDone = currentStepIndex > i;
                  const isActive = doc.statut === step.key;
                  const isClickable = currentStepIndex < i;
                  return (
                    <div key={step.key} className="flex items-center flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => isClickable && handlePipelineStep(step.key)}
                        disabled={!isClickable}
                        className={`flex flex-col items-center gap-1 flex-1 py-2 ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                            isDone || isActive
                              ? "bg-gradient-to-r from-[#1A1110] to-[#C08B8B] border-transparent"
                              : "bg-white border-gray-300"
                          } ${isActive ? "ring-2 ring-[#B6D5A8] ring-offset-2" : ""}`}
                        />
                        <span
                          className={`text-xs truncate max-w-full ${
                            isActive ? "font-bold text-[#1A1110]" : isDone ? "font-medium text-gray-900" : "text-gray-400"
                          }`}
                        >
                          {step.label}
                        </span>
                      </button>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 min-w-[20px] mx-1 ${
                            currentStepIndex > i ? "bg-gradient-to-r from-[#1A1110] to-[#C08B8B]" : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modale confirmation pipeline */}
      {pipelineConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#1A1110]">
              Passer cette facture en {STATUT_LABELS[pipelineConfirm]} ?
            </h3>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPipelineConfirm(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmPipelineStep}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#1A1110] to-[#C08B8B] text-white text-sm font-medium"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ZONE 2 : 2 colonnes ═══ */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-6">
          {/* Colonne gauche */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-0.5">Date d&apos;émission</p>
                  <p className="font-semibold text-[#1A1110] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {formatDate(doc.dateEmission)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-0.5">Date d&apos;échéance</p>
                  <p className="font-semibold text-[#1A1110] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {formatDate(doc.dateEcheance)}
                  </p>
                  {doc.dateEcheance && (
                    <p className="text-xs text-gray-400 mt-0.5">(30 jours fin de mois)</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-0.5">Client</p>
                  <p className="font-semibold text-[#1A1110] flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    {marque?.id ? (
                      <Link href={`/marques/${marque.id}`} className="hover:underline">{clientName}</Link>
                    ) : (
                      clientName
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-0.5">Talent</p>
                  <p className="font-semibold text-[#1A1110] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-gray-400" />
                    {talent?.id ? (
                      <Link href={`/talents/${talent.id}`} className="hover:underline">{talentName}</Link>
                    ) : (
                      talentName
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-medium mb-0.5">Objet</p>
                <p className="text-sm text-[#1A1110]">{doc.titre || doc.poClient || "—"}</p>
              </div>
              <div className="mt-2">
                <p className="text-xs text-gray-500 uppercase font-medium mb-0.5">Mode de paiement</p>
                <p className="text-sm text-[#1A1110]">{doc.modePaiement || "Virement"}</p>
              </div>
            </div>

            {/* Bloc Client */}
            {marque && (
              <div className="bg-[#FAFAFA] rounded-xl border border-gray-200 border-l-4 border-l-[#C08B8B] p-4">
                <p className="text-xs text-gray-500 uppercase font-medium mb-2">Client</p>
                <p className="font-semibold text-[#1A1110]">{marque.nom}</p>
                {(marque.adresseRue || marque.ville) && (
                  <p className="text-sm text-gray-600 mt-1">
                    {[marque.adresseRue, marque.adresseComplement, marque.codePostal, marque.ville]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {marque.pays && <p className="text-sm text-gray-600">{marque.pays}</p>}
              </div>
            )}

            {/* Détail des lignes */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-[#1A1110] flex items-center gap-2">
                  <FileStack className="w-4 h-4" />
                  Détail des lignes
                </h3>
                <button type="button" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
                      <th className="text-left py-3 px-4">Réf. / Description</th>
                      <th className="text-right py-3 px-4">Qté</th>
                      <th className="text-right py-3 px-4">P.U. HT</th>
                      <th className="text-right py-3 px-4">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesArray.length > 0 ? (
                      (lignesArray as Record<string, unknown>[]).map((line: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-3 px-4 text-[#1A1110]">
                            {String(line.description ?? line.libelle ?? "—")}
                          </td>
                          <td className="py-3 px-4 text-right">{Number(line.quantite ?? 1)}</td>
                          <td className="py-3 px-4 text-right">{formatMoney(Number(line.prixUnitaire ?? 0))}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatMoney(Number(line.totalHT ?? line.montantHT ?? 0))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">
                          Aucune ligne
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-4 border-t border-gray-100 space-y-1 text-sm text-right">
                <div className="flex justify-end gap-4">
                  <span className="text-gray-500">Total HT</span>
                  <span className="font-medium w-24">{formatMoney(Number(doc.montantHT))}</span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-gray-500">TVA ({Number(doc.tauxTVA) || 0} %)</span>
                  <span className="font-medium w-24">{formatMoney(Number(doc.montantTVA))}</span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-gray-500">Total TTC</span>
                  <span className="font-medium w-24">{formatMoney(Number(doc.montantTTC))}</span>
                </div>
              </div>
              <div className="px-4 py-3 bg-[#1A1110] rounded-b-xl flex justify-between items-center">
                <span className="font-bold text-white text-lg">NET À PAYER</span>
                <span className="font-bold text-white text-lg">{formatMoney(Number(doc.montantTTC))}</span>
              </div>
            </div>

            {doc.notes && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-[#1A1110] mb-2">Notes</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{doc.notes}</p>
              </div>
            )}

            {doc.collaboration?.id && (
              <Link
                href={`/collaborations/${doc.collaboration.id}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#1A1110] hover:underline"
              >
                Voir la collaboration {doc.collaboration.reference} →
              </Link>
            )}
          </div>

          {/* Colonne droite - PDF */}
          <div className="lg:sticky lg:top-[280px] lg:self-start">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm">
                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-200" title="Vue page">
                  <FileText className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-200" title="Rechercher">
                  <Search className="w-4 h-4" />
                </button>
                <span className="flex-1 text-center text-gray-500 text-xs">1 sur 1</span>
                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-200">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-200">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-200">
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={handlePdf} className="p-1.5 rounded text-gray-500 hover:bg-gray-200">
                  <Download className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-gray-200 p-4 min-h-[400px] flex items-center justify-center">
                <iframe
                  title="Aperçu PDF"
                  src={`/api/documents/${id}/pdf`}
                  className="w-full h-[500px] max-h-[70vh] bg-white rounded shadow-lg"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ZONE 3 : Sections pleine largeur ═══ */}
        <div className="mt-8 space-y-6">
          {/* Conditions particulières */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-[#1A1110] mb-4">Conditions particulières</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Taux de pénalité</p>
                <p className="text-sm text-gray-600">
                  En cas de retard de paiement, application d&apos;intérêts de retard au taux légal.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Frais de recouvrement</p>
                <p className="text-sm text-gray-600">
                  En cas de retard, application d&apos;une indemnité forfaitaire pour frais de recouvrement.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">CGV</p>
                <p className="text-sm text-gray-600">CGV sélectionnées : Mes CGV</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-900 mb-1">Commentaires</p>
              <p className="text-sm text-gray-600">
                {doc.mentionTVA || "TVA 0%"} — Paiement sous 30 jours fin de mois à réception de facture.
              </p>
            </div>
          </div>

          {/* Historique */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-[#1A1110] px-6 py-4 border-b border-gray-100">
              Historique des événements
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
                    <th className="text-left py-3 px-4">Utilisateur</th>
                    <th className="text-left py-3 px-4">Événement</th>
                    <th className="text-left py-3 px-4">Document</th>
                    <th className="text-left py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.length > 0 ? (
                    historyItems.map((item, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-3 px-4 text-[#1A1110] font-medium">{item.user}</td>
                        <td className="py-3 px-4 text-gray-600">{item.event}</td>
                        <td className="py-3 px-4 text-gray-600">{item.document}</td>
                        <td className="py-3 px-4 text-gray-500">{formatDateTime(item.date)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500">
                        Aucun événement
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Devis lié(s) — s'il y a une collab, les devis de la collab sont forcément liés */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-[#1A1110] px-6 py-4 border-b border-gray-100">
              Devis lié(s)
            </h2>
            {(doc.collaboration?.quotes && doc.collaboration.quotes.length > 0) || doc.linkedQuote ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
                      <th className="text-left py-3 px-4">Devis n°</th>
                      <th className="text-left py-3 px-4">Date de devis</th>
                      <th className="text-left py-3 px-4">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(doc.collaboration?.quotes && doc.collaboration.quotes.length > 0
                      ? doc.collaboration.quotes
                      : doc.linkedQuote
                        ? [{ id: doc.linkedQuote.id, reference: doc.linkedQuote.reference, issueDate: doc.linkedQuote.issueDate, status: doc.linkedQuote.status, invoiceId: doc.id }]
                        : []
                    ).map((q) => (
                      <tr key={q.id} className="border-t border-gray-100">
                        <td className="py-3 px-4">
                          <Link
                            href={`/quotes/${q.id}`}
                            className="text-[#1A1110] font-medium hover:underline"
                          >
                            {q.reference}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {formatDate(q.issueDate)}
                        </td>
                        <td className="py-3 px-4">
                          {q.invoiceId === doc.id ? (
                            <span className="inline-flex rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                              Facturé
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-medium">
                              {q.status === "INVOICED" ? "Facturé" : q.status === "SENT" ? "Envoyé" : q.status === "DRAFT" ? "Brouillon" : q.status === "CANCELLED" ? "Annulé" : q.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">
                <p className="mb-2">Aucun devis lié à cette facture</p>
                <button
                  type="button"
                  className="text-sm font-medium text-[#1A1110] hover:underline"
                >
                  Lier un devis
                </button>
              </div>
            )}
          </div>

          {/* Conversation */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1A1110] flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Conversation
              </h2>
              <button
                type="button"
                onClick={() => setCommentOpen(!commentOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Écrire
              </button>
            </div>
            {commentOpen && (
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Votre commentaire..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none min-h-[80px]"
                  rows={3}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => { setCommentOpen(false); setCommentContent(""); }}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={!commentContent.trim() || commentSubmitting}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#1A1110] to-[#C08B8B] text-white text-sm font-medium disabled:opacity-50"
                  >
                    {commentSubmitting ? "Envoi..." : "Envoyer"}
                  </button>
                </div>
              </div>
            )}
            <div className="divide-y divide-gray-100">
              {(doc.comments && doc.comments.length > 0) ? (
                doc.comments.map((c) => (
                  <div key={c.id} className="px-6 py-4 flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#1A1110] to-[#C08B8B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(c.user.prenom?.[0] || "") + (c.user.nom?.[0] || "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1A1110]">
                        {c.user.prenom} {c.user.nom}
                        <span className="text-gray-400 font-normal ml-2">{formatRelative(c.createdAt)}</span>
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center text-gray-500 text-sm">
                  Aucun commentaire
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ZONE 4 : Modale Entrer un paiement ═══ */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#1A1110]">Enregistrer un paiement</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant *</label>
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={paymentAmount || (doc ? String(doc.montantTTC) : "")}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm"
                  placeholder="0,00"
                />
                <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm">€</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date du paiement *</label>
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm"
                />
                <span className="px-3 py-2 bg-gray-50 text-gray-500">
                  <Calendar className="w-4 h-4" />
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="Virement">Virement</option>
                <option value="Chèque">Chèque</option>
                <option value="Carte">Carte</option>
                <option value="Espèces">Espèces</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Référence du virement</label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Optionnel"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handlePayerWithModal}
                disabled={!!actionLoading}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#1A1110] to-[#C08B8B] text-white text-sm font-medium disabled:opacity-50"
              >
                {actionLoading === "payer" ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal annulation */}
      {showAnnulerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#1A1110]">Annuler le document</h3>
            <p className="text-sm text-gray-600">Indiquez le motif d&apos;annulation (obligatoire).</p>
            <textarea
              value={annulerMotif}
              onChange={(e) => setAnnulerMotif(e.target.value)}
              placeholder="Motif..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none h-24"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleAnnulerClose}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleAnnulerConfirm}
                disabled={!annulerMotif.trim() || actionLoading === "annuler"}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === "annuler" ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
