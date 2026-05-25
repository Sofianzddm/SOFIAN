"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  MentionTextarea,
  renderCommentWithMentions,
  type MentionableUser,
} from "@/components/MentionTextarea";
import { formatMontant } from "@/lib/devises";
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
  Link2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";

type DocStatut = "BROUILLON" | "VALIDE" | "ENVOYE" | "PAYE" | "ANNULE" | "REFUSE";

interface ReconcileTransaction {
  id: string;
  qontoId: string;
  montant: number;
  libelle: string;
  reference: string | null;
  dateTransaction: string;
  emetteur: string | null;
  emetteurIban: string | null;
  associe: boolean;
  document?: {
    id: string;
    reference: string;
    type: string;
  } | null;
}

interface DocDetail {
  id: string;
  reference: string;
  type: string;
  statut: DocStatut;
  titre?: string | null;
  devise?: string | null;
  montantHT: number | string;
  tauxTVA: number | string;
  montantTVA: number | string;
  montantTTC: number | string;
  dateEmission: string | null;
  dateEcheance: string | null;
  datePaiement: string | null;
  dateValidation: string | null;
  createdAt?: string | null;
  modePaiement: string | null;
  referencePaiement: string | null;
  poClient: string | null;
  notes: string | null;
  mentionTVA?: string | null;
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
  transactionsQonto?: Array<{
    id: string;
    qontoId: string;
    montant: number | string;
    libelle: string | null;
    reference: string | null;
    dateTransaction: string;
    emetteur: string | null;
    emetteurIban: string | null;
    statut: string;
  }>;
}

function formatMoney(amount: number, currency: string | null | undefined = "EUR") {
  return formatMontant(amount, currency);
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

function paymentTermsLabelFromNotes(notes?: string | null) {
  const text = notes || "";
  if (/Paiement\s+comptant/i.test(text)) return "Comptant";
  const match = text.match(/Paiement\s+sous\s+(\d+)\s+jours/i);
  if (match?.[1]) return `${match[1]} jours fin de mois`;
  return "30 jours fin de mois";
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
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileSyncing, setReconcileSyncing] = useState(false);
  const [reconcileSearch, setReconcileSearch] = useState("");
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileAssociating, setReconcileAssociating] = useState<string | null>(null);
  const [reconcileTransactions, setReconcileTransactions] = useState<ReconcileTransaction[]>([]);
  const { data: session, status } = useSession();
  const sendRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const role = (session?.user as { role?: string })?.role;

  if (status === "loading") {
    return <div className="p-6 text-sm text-gray-500">Chargement...</div>;
  }
  if (!role || !["ADMIN", "HEAD_OF_SALES"].includes(role)) {
    if (typeof window !== "undefined") {
      router.replace("/dashboard");
    }
    return null;
  }

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
    const fetchMentionable = async () => {
      try {
        const r = await fetch("/api/users/mentionable");
        if (r.ok) {
          const data = await r.json();
          setMentionableUsers(data);
        }
      } catch {
        // ignore
      }
    };
    if (session?.user) fetchMentionable();
  }, [session?.user]);

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
        body: JSON.stringify({
          datePaiement: new Date().toISOString(),
          ...(doc?.collaboration?.id && { collaborationId: doc.collaboration.id }),
        }),
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
  }, [id, doc, fetchDoc]);

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
          ...(doc?.collaboration?.id && { collaborationId: doc.collaboration.id }),
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

  const loadReconcileTransactions = useCallback(async () => {
    setReconcileLoading(true);
    setReconcileError(null);
    try {
      const r = await fetch("/api/qonto/transactions?nonAssociees=true", {
        cache: "no-store",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setReconcileError(data.error || "Impossible de charger les transactions");
        setReconcileTransactions([]);
        return;
      }
      const data = await r.json();
      setReconcileTransactions(
        (data.transactions || []).map((t: ReconcileTransaction) => ({
          ...t,
          montant: Number(t.montant),
        }))
      );
    } catch (err) {
      console.error("Erreur chargement transactions Qonto:", err);
      setReconcileError("Erreur réseau");
      setReconcileTransactions([]);
    } finally {
      setReconcileLoading(false);
    }
  }, []);

  const handleReconcileOpen = useCallback(() => {
    setReconcileOpen(true);
    setReconcileSearch("");
    void loadReconcileTransactions();
  }, [loadReconcileTransactions]);

  const handleReconcileSync = useCallback(async () => {
    setReconcileSyncing(true);
    setReconcileError(null);
    try {
      const r = await fetch("/api/qonto/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 30 }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setReconcileError(
          data.details || data.error || "Erreur de synchronisation Qonto"
        );
        return;
      }
      await loadReconcileTransactions();
    } catch (err) {
      console.error("Erreur sync Qonto:", err);
      setReconcileError("Erreur de synchronisation Qonto");
    } finally {
      setReconcileSyncing(false);
    }
  }, [loadReconcileTransactions]);

  const handleAssociateTransaction = useCallback(
    async (transactionId: string) => {
      if (!id) return;
      setReconcileAssociating(transactionId);
      setReconcileError(null);
      try {
        const r = await fetch("/api/qonto/associate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId, documentId: id }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setReconcileError(data.error || "Erreur lors de l'association");
          return;
        }
        setReconcileOpen(false);
        await fetchDoc();
      } catch (err) {
        console.error("Erreur association transaction:", err);
        setReconcileError("Erreur lors de l'association");
      } finally {
        setReconcileAssociating(null);
      }
    },
    [id, fetchDoc]
  );

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
  const paymentTermsLabel = paymentTermsLabelFromNotes(doc.notes);
  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.key === doc.statut);
  const marque = doc.collaboration?.marque;
  const talent = doc.collaboration?.talent;
  const clientName = marque?.nom ?? (doc as any).clientNom ?? "—";
  const talentName = talent ? `${talent.prenom} ${talent.nom}` : null;

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
                  <StatutBadge statut={doc.statut} isLate={!!isLate} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {doc.type}{" "}
                  {isFacture &&
                    (marque
                      ? "• Facture marque"
                      : "• Facture libre")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isCancelled && doc.statut !== "PAYE" && isFacture && (session?.user as { role?: string })?.role === "ADMIN" && (
                <button
                  type="button"
                  onClick={handleReconcileOpen}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1A1110] text-[#1A1110] text-sm font-medium hover:bg-[#1A1110] hover:text-white transition-colors"
                  title="Rapprocher avec une transaction Qonto"
                >
                  <Link2 className="w-4 h-4" />
                  Rapprocher
                </button>
              )}
              {!isCancelled && doc.statut !== "PAYE" && (session?.user as { role?: string })?.role === "ADMIN" && (
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#1A1110] to-[#C08B8B] text-white text-sm font-medium shadow-sm hover:opacity-95 transition-opacity"
                >
                  <Check className="w-4 h-4" />
                  Entrer un paiement
                </button>
              )}
              <Link
                href={isFacture ? `/factures/new?edit=${doc.id}` : "#"}
                className={`p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 ${!isFacture ? "pointer-events-none opacity-50" : ""}`}
                title="Modifier"
              >
                <Pencil className="w-4 h-4" />
              </Link>

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
            de {formatMoney(Number(doc.montantTTC), doc.devise)} TTC
          </p>

          {/* Pipeline — étape "Payé" visible uniquement pour les ADMIN (info confidentielle) */}
          {!isCancelled && (
            <div className="mt-6">
              <div className="flex items-center gap-0">
                {(() => {
                  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
                  const steps = isAdmin ? PIPELINE_STEPS : PIPELINE_STEPS.filter((s) => s.key !== "PAYE");
                  return steps.map((step, i) => {
                    const isDone = currentStepIndex > i;
                    const isActive = doc.statut === step.key;
                    const isClickable = currentStepIndex < i && (step.key !== "PAYE" || isAdmin);
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
                        {i < steps.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 min-w-[20px] mx-1 ${
                            currentStepIndex > i ? "bg-gradient-to-r from-[#1A1110] to-[#C08B8B]" : "bg-gray-200"
                          }`}
                        />
                        )}
                      </div>
                    );
                  });
                })()}
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
                    <p className="text-xs text-gray-400 mt-0.5">({paymentTermsLabel})</p>
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
                {talentName && (
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
                )}
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
            {marque ? (
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
            ) : (
              <div className="bg-[#FAFAFA] rounded-xl border border-gray-200 border-l-4 border-l-[#C08B8B] p-4">
                <p className="text-xs text-gray-500 uppercase font-medium mb-2">Client</p>
                <p className="font-semibold text-[#1A1110]">{(doc as any).clientNom ?? "—"}</p>
                {(doc as any).clientAdresse && (
                  <p className="text-sm text-gray-600 mt-1">
                    {(doc as any).clientAdresse}
                  </p>
                )}
                {(doc as any).clientEmail && (
                  <p className="text-sm text-gray-600 mt-1">
                    {(doc as any).clientEmail}
                  </p>
                )}
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
                          <td className="py-3 px-4 text-right">{formatMoney(Number(line.prixUnitaire ?? 0), doc.devise)}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatMoney(Number(line.totalHT ?? line.montantHT ?? 0), doc.devise)}
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
                  <span className="font-medium w-24">{formatMoney(Number(doc.montantHT), doc.devise)}</span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-gray-500">TVA ({Number(doc.tauxTVA) || 0} %)</span>
                  <span className="font-medium w-24">{formatMoney(Number(doc.montantTVA), doc.devise)}</span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-gray-500">Total TTC</span>
                  <span className="font-medium w-24">{formatMoney(Number(doc.montantTTC), doc.devise)}</span>
                </div>
              </div>
              <div className="px-4 py-3 bg-[#1A1110] rounded-b-xl flex justify-between items-center">
                <span className="font-bold text-white text-lg">NET À PAYER</span>
                <span className="font-bold text-white text-lg">{formatMoney(Number(doc.montantTTC), doc.devise)}</span>
              </div>
            </div>

            {(session?.user as { role?: string })?.role === "ADMIN" &&
              doc.transactionsQonto &&
              doc.transactionsQonto.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-[#1A1110] flex items-center gap-2 text-sm">
                      <Link2 className="w-4 h-4" />
                      Rapprochement bancaire
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      {doc.transactionsQonto.length} transaction
                      {doc.transactionsQonto.length > 1 ? "s" : ""} associée
                      {doc.transactionsQonto.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {doc.transactionsQonto.map((t) => (
                      <li key={t.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1A1110] truncate">
                            {t.emetteur || "Émetteur inconnu"}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {t.libelle || "—"}
                          </p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">
                            {formatDate(t.dateTransaction)}
                            {t.reference ? ` · ${t.reference}` : ""}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[#1A1110] tabular-nums">
                          {formatMoney(Number(t.montant))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
                {doc.notes || `${doc.mentionTVA || "TVA 0%"} — Paiement sous 30 jours fin de mois à réception de facture.`}
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
                <MentionTextarea
                  value={commentContent}
                  onChange={setCommentContent}
                  placeholder="Votre commentaire... (tapez @ pour mentionner)"
                  rows={3}
                  mentionableUsers={mentionableUsers}
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
                      <p className="text-sm text-gray-600 mt-0.5">
                        {renderCommentWithMentions(
                          c.content,
                          new Map<string, { firstName: string; lastName: string }>([
                            ...mentionableUsers.map(
                              (u): [string, { firstName: string; lastName: string }] => [
                                u.id,
                                { firstName: u.firstName, lastName: u.lastName },
                              ]
                            ),
                            ...(doc.comments || []).map(
                              (com): [string, { firstName: string; lastName: string }] => [
                                com.user.id,
                                { firstName: com.user.prenom, lastName: com.user.nom },
                              ]
                            ),
                          ]),
                          (session?.user as { id?: string })?.id
                        )}
                      </p>
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
                <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm">{doc?.devise || "EUR"}</span>
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

      {/* Modale rapprochement Qonto */}
      {reconcileOpen && doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[#1A1110] flex items-center gap-2">
                  <Link2 className="w-5 h-5" />
                  Rapprocher la facture {doc.reference}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Sélectionnez une transaction Qonto à associer à cette facture (montant
                  : <span className="font-medium text-[#1A1110]">{formatMoney(Number(doc.montantTTC), doc.devise)}</span>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReconcileOpen(false)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50/60">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  placeholder="Rechercher (libellé, émetteur, référence)"
                  value={reconcileSearch}
                  onChange={(e) => setReconcileSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#1A1110]"
                />
              </div>
              <button
                type="button"
                onClick={handleReconcileSync}
                disabled={reconcileSyncing}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                {reconcileSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {reconcileSyncing ? "Synchronisation…" : "Synchroniser Qonto"}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {reconcileError && (
                <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{reconcileError}</span>
                </div>
              )}

              {reconcileLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                (() => {
                  const factureAmount = Number(doc.montantTTC);
                  const lowerSearch = reconcileSearch.trim().toLowerCase();
                  const filtered = reconcileTransactions.filter((t) => {
                    if (!lowerSearch) return true;
                    return (
                      t.libelle?.toLowerCase().includes(lowerSearch) ||
                      t.emetteur?.toLowerCase().includes(lowerSearch) ||
                      t.reference?.toLowerCase().includes(lowerSearch)
                    );
                  });
                  const suggestions = filtered.filter(
                    (t) => Math.abs(Number(t.montant) - factureAmount) < 1
                  );
                  const others = filtered.filter(
                    (t) => Math.abs(Number(t.montant) - factureAmount) >= 1
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="px-6 py-12 text-center">
                        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-700">
                          {reconcileTransactions.length === 0
                            ? "Aucune transaction Qonto à rapprocher"
                            : `Aucun résultat pour « ${reconcileSearch} »`}
                        </p>
                        {reconcileTransactions.length === 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Cliquez sur « Synchroniser Qonto » pour récupérer les
                            dernières transactions.
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="px-6 py-4 space-y-6">
                      {suggestions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                            Correspondances par montant ({suggestions.length})
                          </p>
                          <div className="space-y-2">
                            {suggestions.map((t) => (
                              <ReconcileRow
                                key={t.id}
                                transaction={t}
                                highlight
                                associating={reconcileAssociating === t.id}
                                onAssociate={() => handleAssociateTransaction(t.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {others.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                            {suggestions.length > 0
                              ? "Autres transactions"
                              : "Transactions disponibles"}{" "}
                            ({others.length})
                          </p>
                          <div className="space-y-2">
                            {others.map((t) => (
                              <ReconcileRow
                                key={t.id}
                                transaction={t}
                                associating={reconcileAssociating === t.id}
                                onAssociate={() => handleAssociateTransaction(t.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50/60 rounded-b-xl">
              <p className="text-xs text-gray-500">
                Une fois associée, la facture passera en statut{" "}
                <span className="font-medium text-[#1A1110]">Payé</span> et la marque
                sera marquée comme nous ayant payés.
              </p>
              <button
                type="button"
                onClick={() => setReconcileOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-white"
              >
                Fermer
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

function ReconcileRow({
  transaction,
  highlight,
  associating,
  onAssociate,
}: {
  transaction: ReconcileTransaction;
  highlight?: boolean;
  associating?: boolean;
  onAssociate: () => void;
}) {
  const dateLabel = new Date(transaction.dateTransaction).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const amountLabel = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(transaction.montant) || 0);

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${
        highlight
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#1A1110] truncate">
            {transaction.emetteur || "Émetteur inconnu"}
          </span>
          {highlight && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Montant identique
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {transaction.libelle || "—"}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">
          {dateLabel}
          {transaction.reference ? ` · ${transaction.reference}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <span className="text-sm font-semibold text-[#1A1110] tabular-nums">
          {amountLabel}
        </span>
        <button
          type="button"
          onClick={onAssociate}
          disabled={associating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1110] text-white text-xs font-medium hover:bg-black transition-colors disabled:opacity-50"
        >
          {associating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )}
          Associer
        </button>
      </div>
    </div>
  );
}
