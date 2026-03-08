"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { LISTE_PAYS } from "@/lib/pays";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  Euro,
  Loader2,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  FileText,
  ExternalLink,
  AlertTriangle,
  Package,
  Download,
  Receipt,
  Calendar,
  MoreHorizontal,
  Copy,
  Share2,
  Check,
  ChevronRight,
  Upload,
  Search,
  Sparkles,
  MessageSquare,
  FileSignature,
  RefreshCw,
} from "lucide-react";
import {
  MentionTextarea,
  renderCommentWithMentions,
  type MentionableUser,
} from "@/components/MentionTextarea";

interface Livrable {
  id: string;
  typeContenu: string;
  quantite: number;
  prixUnitaire: number;
  description: string | null;
}

interface DocumentInfo {
  id: string;
  reference: string;
  type: string;
  statut: string;
  montantHT?: number;
  montantTTC: number;
  dateEmission: string | null;
  avoirRef: string | null;
  factureRef: string | null;
  signatureStatus?: string | null;
  signatureSubmissionId?: string | null;
  signatureSentAt?: string | null;
  signatureSignedAt?: string | null;
  signatureSignerEmail?: string | null;
  signedDocumentUrl?: string | null;
  signaturesCount?: number;
  signaturesTotal?: number;
  events?: { id: string }[];
}

interface CollabDetail {
  id: string;
  reference: string;
  source: string;
  description: string | null;
  livrables: Livrable[];
  montantBrut: number;
  commissionPercent: number;
  commissionEuros: number;
  montantNet: number;
  statut: string;
  raisonPerdu: string | null;
  lienPublication: string | null;
  datePublication: string | null;
  isLongTerme: boolean;
  createdAt: string;
  factureTalentUrl: string | null;
  factureTalentRecueAt: string | null;
  factureValidee: boolean;
  factureValideeAt: string | null;
  marquePayeeAt: string | null;
  paidAt: string | null;
  talent: { id: string; prenom: string; nom: string; email: string; photo: string | null };
  marque: { 
    id: string; 
    nom: string; 
    secteur: string | null;
    raisonSociale?: string;
    adresseRue?: string;
    codePostal?: string;
    ville?: string;
    pays?: string;
    siret?: string;
    numeroTVA?: string;
    email?: string | null;
    contacts?: Array< { id: string; email: string | null; nom: string; prenom: string | null; principal: boolean } >;
  };
  documents?: DocumentInfo[];
  comments?: Array<{
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; prenom: string; nom: string };
  }>;
}

const STATUTS = [
  { value: "NEGO", label: "En négo", color: "bg-amber-500", bgLight: "bg-amber-50", textColor: "text-amber-600", icon: Clock },
  { value: "GAGNE", label: "Gagné", color: "bg-emerald-500", bgLight: "bg-emerald-50", textColor: "text-emerald-600", icon: CheckCircle2 },
  { value: "PERDU", label: "Perdu", color: "bg-red-500", bgLight: "bg-red-50", textColor: "text-red-600", icon: XCircle },
  { value: "EN_COURS", label: "En cours", color: "bg-blue-500", bgLight: "bg-blue-50", textColor: "text-blue-600", icon: ArrowRight },
  { value: "PUBLIE", label: "Publié", color: "bg-violet-500", bgLight: "bg-violet-50", textColor: "text-violet-600", icon: Eye },
  { value: "FACTURE_RECUE", label: "Facturé", color: "bg-orange-500", bgLight: "bg-orange-50", textColor: "text-orange-600", icon: FileText },
  { value: "PAYE", label: "Payé", color: "bg-green-500", bgLight: "bg-green-50", textColor: "text-green-600", icon: Euro },
];

const WORKFLOW = {
  NEGO: ["GAGNE", "PERDU"],
  GAGNE: ["EN_COURS", "PERDU"],
  EN_COURS: ["PUBLIE", "PERDU"],
  PUBLIE: ["FACTURE_RECUE"],
  FACTURE_RECUE: ["PAYE"],
  PAYE: [],
  PERDU: [],
};

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story", STORY_CONCOURS: "Story Concours", POST: "Post",
  POST_CONCOURS: "Post Concours", POST_COMMUN: "Post Commun", REEL: "Reel",
  TIKTOK_VIDEO: "Vidéo TikTok", YOUTUBE_VIDEO: "Vidéo YouTube",
  YOUTUBE_SHORT: "YouTube Short", EVENT: "Event", SHOOTING: "Shooting", AMBASSADEUR: "Ambassadeur",
};

export default function CollabDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [collab, setCollab] = useState<CollabDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [showPerduModal, setShowPerduModal] = useState(false);
  const [raisonPerdu, setRaisonPerdu] = useState("");
  const [showPublieModal, setShowPublieModal] = useState(false);
  const [lienPublication, setLienPublication] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCompleteMarqueModal, setShowCompleteMarqueModal] = useState(false);
  const [pendingDocType, setPendingDocType] = useState<"DEVIS" | "FACTURE" | null>(null);
  const [marqueFormData, setMarqueFormData] = useState({
    raisonSociale: "", adresseRue: "", codePostal: "", ville: "", pays: "France", siret: "", numeroTVA: "",
  });
  // Recherche Pappers (modal compléter marque)
  const [pappersSearchQuery, setPappersSearchQuery] = useState("");
  const [pappersSearching, setPappersSearching] = useState(false);
  const [pappersSearchResults, setPappersSearchResults] = useState<any[]>([]);
  const [pappersShowResults, setPappersShowResults] = useState(false);
  const [savingMarque, setSavingMarque] = useState(false);
  const [selectedFactureTalent, setSelectedFactureTalent] = useState<File | null>(null);
  const [uploadingFactureTalent, setUploadingFactureTalent] = useState(false);
  const [validatingFacture, setValidatingFacture] = useState(false);
  const [facturePreviewUrl, setFacturePreviewUrl] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesDevis, setNotesDevis] = useState("");
  const [paysDevis, setPaysDevis] = useState("France");
  const [numeroTVADevis, setNumeroTVADevis] = useState("");
  const [pendingGenerateType, setPendingGenerateType] = useState<"DEVIS" | "FACTURE" | null>(null);
  const [showEditDocModal, setShowEditDocModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentInfo | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureDoc, setSignatureDoc] = useState<DocumentInfo | null>(null);
  const [signatureEmail, setSignatureEmail] = useState("");
  const [signatureSignerName, setSignatureSignerName] = useState("");
  const [signatureAgenceEmail, setSignatureAgenceEmail] = useState("");
  const [signatureAgenceName, setSignatureAgenceName] = useState("");
  const [signatureSending, setSignatureSending] = useState(false);
  const [checkingSignatureDocId, setCheckingSignatureDocId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    titre: string;
    commentaires: string;
    typeTVA: string;
    clientZone?: string;
    dateEmission: string;
    dateEcheance: string;
    poClient: string;
    modePaiement: string;
    referencePaiement: string;
    lignes: Array<{
      description: string;
      quantite: number;
      prixUnitaire: number;
    }>;
  }>({
    titre: "",
    commentaires: "",
    typeTVA: "FRANCE",
    dateEmission: "",
    dateEcheance: "",
    poClient: "",
    modePaiement: "Virement",
    referencePaiement: "",
    lignes: [],
  });
  const [editModalTab, setEditModalTab] = useState<"general" | "lignes" | "facturation">("general");
  const [savingDoc, setSavingDoc] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);

  useEffect(() => { if (params.id) fetchCollab(); }, [params.id]);

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
    if (params.id) fetchMentionable();
  }, [params.id]);

  const pendingSignatureDocs = (collab?.documents || []).filter(
    (d) => d.type === "DEVIS" && d.signatureStatus === "PENDING"
  );
  const hasPendingSignature = pendingSignatureDocs.length > 0;

  useEffect(() => {
    if (!hasPendingSignature) return;
    const docIds = pendingSignatureDocs.map((d) => d.id);
    const interval = setInterval(async () => {
      for (const docId of docIds) {
        await fetch(`/api/documents/${docId}/check-signature-status`);
      }
      await fetchCollab();
    }, 30000);
    return () => clearInterval(interval);
  }, [hasPendingSignature, pendingSignatureDocs.map((d) => d.id).join(",")]);

  const fetchCollab = async () => {
    try {
      const res = await fetch(`/api/collaborations/${params.id}`);
      if (res.ok) setCollab(await res.json());
    } catch (error) { console.error("Erreur:", error); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer cette collaboration ?")) return;
    await fetch(`/api/collaborations/${params.id}`, { method: "DELETE" });
    router.push("/collaborations");
  };

  const updateStatut = async (newStatut: string, extraData?: object) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/collaborations/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: newStatut, ...extraData }),
      });
      if (res.ok) { setCollab(await res.json()); setShowPerduModal(false); setShowPublieModal(false); }
    } finally { setUpdating(false); }
  };

  const handleStatutChange = (newStatut: string) => {
    if (newStatut === "PERDU") setShowPerduModal(true);
    else if (newStatut === "PUBLIE") setShowPublieModal(true);
    else updateStatut(newStatut);
  };

  const marquerMarquePayee = async () => {
    if (!collab?.id) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/collaborations/${collab.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marquePayeeAt: new Date().toISOString() }),
      });
      if (res.ok) setCollab(await res.json());
      else { const d = await res.json(); alert(d.error || "Erreur"); }
    } catch (e) { console.error(e); alert("Erreur"); }
    finally { setUpdating(false); }
  };

  const confirmPerdu = () => { if (!raisonPerdu.trim()) return alert("Indiquez la raison"); updateStatut("PERDU", { raisonPerdu }); };
  const confirmPublie = () => { updateStatut("PUBLIE", { lienPublication: lienPublication || null, datePublication: new Date().toISOString() }); };

  const checkMarqueInfos = (type: "DEVIS" | "FACTURE"): boolean => {
    if (!collab) return false;
    const marque = collab.marque as any;
    return !!(marque.adresseRue && marque.codePostal && marque.ville);
  };

  const initMarqueForm = () => {
    if (!collab) return;
    const marque = collab.marque as any;
    setMarqueFormData({
      raisonSociale: marque.raisonSociale || marque.nom || "",
      adresseRue: marque.adresseRue || "", codePostal: marque.codePostal || "",
      ville: marque.ville || "", pays: marque.pays || "France",
      siret: marque.siret || "", numeroTVA: marque.numeroTVA || "",
    });
  };

  const saveMarqueAndGenerate = async () => {
    if (!collab || !pendingDocType) return;
    setSavingMarque(true);
    try {
      const res = await fetch(`/api/marques/${collab.marque.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(marqueFormData),
      });
      if (res.ok) { setShowCompleteMarqueModal(false); setPappersShowResults(false); setPappersSearchQuery(""); await fetchCollab(); await generateDocument(pendingDocType, true); }
      else alert("Erreur lors de la mise à jour de la marque");
    } catch (error) { alert("Erreur lors de la mise à jour"); }
    finally { setSavingMarque(false); setPendingDocType(null); }
  };

  const handlePappersSearch = async () => {
    if (!pappersSearchQuery.trim()) return;
    setPappersSearching(true);
    setPappersShowResults(false);
    try {
      const res = await fetch(`/api/recherche-entreprise?query=${encodeURIComponent(pappersSearchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setPappersSearchResults(data.results || []);
        setPappersShowResults(true);
      } else {
        const err = await res.json();
        alert(err.error || "Erreur lors de la recherche");
      }
    } catch (error) {
      alert("Erreur de connexion");
    } finally {
      setPappersSearching(false);
    }
  };

  const fillMarqueFromPappers = (entreprise: any) => {
    setMarqueFormData((prev) => ({
      ...prev,
      raisonSociale: entreprise.nom_entreprise || entreprise.denomination || prev.raisonSociale,
      adresseRue: entreprise.adresse || "",
      codePostal: entreprise.code_postal || "",
      ville: entreprise.ville || "",
      pays: entreprise.pays || "France",
      siret: entreprise.siret || "",
      numeroTVA: entreprise.numero_tva_intracommunautaire || "",
    }));
    setPappersShowResults(false);
    setPappersSearchQuery("");
  };

  const openNotesModal = (type: "DEVIS" | "FACTURE") => {
    if (!collab) return;
    if (!checkMarqueInfos(type)) { 
      setPendingDocType(type); 
      initMarqueForm(); 
      setShowCompleteMarqueModal(true); 
      return; 
    }
    setPendingGenerateType(type);
    setNotesDevis("");
    setPaysDevis(collab.marque?.pays || "France");
    setNumeroTVADevis(collab.marque?.numeroTVA || "");
    setShowNotesModal(true);
  };

  const generateDocument = async (
    type: "DEVIS" | "FACTURE",
    skipCheck = false,
    notes?: string,
    pays?: string,
    numeroTVA?: string
  ) => {
    if (!collab) return;
    if (!skipCheck && !checkMarqueInfos(type)) { setPendingDocType(type); initMarqueForm(); setShowCompleteMarqueModal(true); return; }
    setGeneratingDoc(true);
    setShowNotesModal(false);
    try {
      const lignes = collab.livrables.map((l) => {
        const baseLabel = TYPE_LABELS[l.typeContenu] || l.typeContenu;
        return {
          description: `${l.quantite}x ${baseLabel}${l.description ? ` - ${l.description}` : ""}`,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
        };
      });
      const res = await fetch("/api/documents/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type, 
          collaborationId: collab.id, 
          lignes,
          titre: `${collab.talent.prenom} x ${collab.marque.nom}`,
          // Notes de la modale en priorité, sinon description globale de la collab
          commentaires: notes || collab.description || undefined,
          pays: pays || undefined,
          numeroTVA: numeroTVA?.trim() || undefined,
        }),
      });
      if (res.ok) { const data = await res.json(); window.open(`/api/documents/${data.document.id}/pdf`, "_blank"); fetchCollab(); }
      else { const err = await res.json(); alert(err.error || "Erreur lors de la génération"); }
    } catch (error) { alert("Erreur lors de la génération"); }
    finally { setGeneratingDoc(false); setPendingGenerateType(null); }
  };

  const createAvoir = async (factureId: string) => {
    if (!confirm("Créer un avoir pour annuler cette facture ?")) return;
    setGeneratingDoc(true);
    try {
      const res = await fetch(`/api/documents/${factureId}/avoir`, { method: "POST" });
      if (res.ok) fetchCollab();
      else { const err = await res.json(); alert(err.error || "Erreur"); }
    } catch (error) { console.error(error); }
    finally { setGeneratingDoc(false); }
  };

  const openEditModal = async (doc: DocumentInfo) => {
    // Récupérer les détails du document pour avoir les lignes
    console.log("🔍 Opening edit modal for doc:", doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`);
      console.log("📡 API Response status:", res.status);
      if (res.ok) {
        const docData = await res.json();
        console.log("📄 Document data:", docData);
        setEditingDoc(doc);
        // Déterminer la zone client à partir du régime de TVA existant
        const initialTypeTVA = docData.typeTVA || "FRANCE";
        const initialClientZone =
          initialTypeTVA === "FRANCE"
            ? "FRANCE"
            : initialTypeTVA === "HORS_EU"
            ? "HORS_EU"
            : "UE";

        setEditFormData({
          titre: docData.titre || collab?.talent.prenom + " x " + collab?.marque.nom || "",
          commentaires: docData.notes || "",
          typeTVA: initialTypeTVA,
          // Nouvelle info purement UI : zone/pays du client
          clientZone: initialClientZone,
          dateEmission: docData.dateEmission ? new Date(docData.dateEmission).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          dateEcheance: docData.dateEcheance ? new Date(docData.dateEcheance).toISOString().split('T')[0] : "",
          poClient: docData.poClient || "",
          modePaiement: docData.modePaiement || "Virement",
          referencePaiement: docData.referencePaiement || "",
          lignes: (docData.lignes || []).map((l: any) => ({
            description: l.description,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
          })),
        });
        setEditModalTab("general");
        setShowEditDocModal(true);
        console.log("✅ Modal opened successfully");
      } else {
        const error = await res.json();
        console.error("❌ API Error:", error);
        alert(`Erreur: ${error.error || "Impossible de charger le document"}`);
      }
    } catch (error) {
      console.error("❌ Erreur:", error);
      alert("Erreur lors du chargement du document");
    }
  };

  const openSignatureModal = (doc: DocumentInfo) => {
    setSignatureDoc(doc);
    const contacts = collab?.marque?.contacts ?? [];
    const contactPrincipal = contacts.find((c) => c.principal);
    const email = (
      contactPrincipal?.email?.trim() ??
      contacts[0]?.email?.trim() ??
      (collab?.marque as { email?: string | null })?.email?.trim() ??
      ""
    );
    const contactPourNom = contactPrincipal ?? contacts[0];
    const name = contactPourNom
      ? `${contactPourNom.prenom ?? ""} ${contactPourNom.nom ?? ""}`.trim()
      : "";
    setSignatureEmail(email);
    setSignatureSignerName(name);
    setSignatureAgenceEmail(process.env.NEXT_PUBLIC_AGENCE_EMAIL || "contrat@glowupagence.fr");
    setSignatureAgenceName(process.env.NEXT_PUBLIC_AGENCE_NOM || "Sofian Zeddam");
    setShowSignatureModal(true);
  };

  const handleSendSignature = async () => {
    if (!signatureDoc || !signatureEmail.trim() || !signatureAgenceEmail.trim()) return;
    setSignatureSending(true);
    try {
      const res = await fetch(`/api/documents/${signatureDoc.id}/envoyer-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signatureEmail.trim(),
          signerName: signatureSignerName.trim() || "Signataire",
          agenceEmail: signatureAgenceEmail.trim(),
          agenceName: signatureAgenceName.trim() || "Agence",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.templateId != null) {
        setShowSignatureModal(false);
        setSignatureDoc(null);
        const q = new URLSearchParams({
          templateId: String(data.templateId),
          email: signatureEmail.trim(),
          name: signatureSignerName.trim() || "Signataire",
          agenceEmail: signatureAgenceEmail.trim(),
          agenceName: signatureAgenceName.trim() || "Agence",
        });
        router.push(`/documents/${signatureDoc.id}/signature-builder?${q.toString()}`);
      } else {
        alert(data.error || "Erreur lors de la préparation de la signature");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la préparation de la signature");
    } finally {
      setSignatureSending(false);
    }
  };

  const handleCheckSignatureStatus = async (docId: string) => {
    setCheckingSignatureDocId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/check-signature-status`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await fetchCollab();
      } else {
        alert(data.error || "Erreur lors de la vérification");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la vérification");
    } finally {
      setCheckingSignatureDocId(null);
    }
  };

  const saveDocumentEdits = async () => {
    if (!editingDoc) {
      console.error("❌ No document being edited");
      return;
    }
    console.log("💾 Saving document edits:", editFormData);
    setSavingDoc(true);
    try {
      const res = await fetch(`/api/documents/${editingDoc.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: editFormData.titre,
          commentaires: editFormData.commentaires,
          typeTVA: editFormData.typeTVA,
          dateEmission: editFormData.dateEmission,
          dateEcheance: editFormData.dateEcheance,
          poClient: editFormData.poClient,
          modePaiement: editFormData.modePaiement,
          referencePaiement: editFormData.referencePaiement,
          lignes: editFormData.lignes,
        }),
      });
      console.log("📡 Update response status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("✅ Document updated:", data);
        alert("✅ Document modifié avec succès !");
        setShowEditDocModal(false);
        fetchCollab();
        // Régénérer le PDF avec timestamp pour éviter le cache navigateur
        const timestamp = Date.now();
        window.open(`/api/documents/${editingDoc.id}/pdf?t=${timestamp}`, "_blank");
      } else {
        const err = await res.json();
        console.error("❌ Update error:", err);
        alert(err.error || "Erreur lors de la modification");
      }
    } catch (error) {
      console.error("❌ Exception:", error);
      alert("Erreur lors de la modification");
    } finally {
      setSavingDoc(false);
    }
  };

  const getActiveDocument = (type: "DEVIS" | "FACTURE") => {
    return (collab?.documents || []).find(d => d.type === type && !["ANNULE"].includes(d.statut) && !d.avoirRef);
  };

  const handleFileSelectTalent = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFactureTalent(e.target.files[0]);
    }
  };

  const uploadFactureTalent = async () => {
    if (!selectedFactureTalent) return;
    
    setUploadingFactureTalent(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFactureTalent);
      
      const res = await fetch(`/api/collaborations/${collab?.id}/upload-facture-talent`, {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(data.message || "Facture envoyée avec succès !");
        fetchCollab();
        setSelectedFactureTalent(null);
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de l'upload");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de l'upload de la facture");
    } finally {
      setUploadingFactureTalent(false);
    }
  };

  const validerFactureTalent = async () => {
    if (!collab?.id) return;
    setValidatingFacture(true);
    try {
      const res = await fetch(`/api/collaborations/${collab.id}/valider-facture`, { method: "POST" });
      if (res.ok) {
        await fetchCollab();
        alert("Facture validée comme conforme.");
      } else {
        const d = await res.json();
        alert(d.error || "Erreur lors de la validation");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la validation");
    } finally {
      setValidatingFacture(false);
    }
  };

  const copyReference = () => { if (collab) { navigator.clipboard.writeText(collab.reference); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const formatMoney = (amount: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  const getStatutInfo = (statut: string) => STATUTS.find((s) => s.value === statut) || STATUTS[0];

  const formatRelative = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffJ = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffH < 24) return `il y a ${diffH} h`;
    if (diffJ < 7) return `il y a ${diffJ} j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const handleAddComment = async () => {
    if (!params.id || !commentContent.trim()) return;
    setCommentSubmitting(true);
    try {
      const r = await fetch(`/api/collaborations/${params.id}/comments`, {
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
      await fetchCollab();
    } finally {
      setCommentSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-b from-gray-50/80 to-white">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-white border border-gray-100 shadow-lg shadow-gray-200/50 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 animate-spin text-glowup-rose" />
          </div>
          <p className="text-sm font-medium text-gray-500">Chargement de la collaboration...</p>
        </div>
      </div>
    );
  }
  if (!collab) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-b from-gray-50/80 to-white px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Collaboration introuvable</h2>
          <p className="text-sm text-gray-500 mb-6">Cette collaboration n’existe pas ou a été supprimée.</p>
          <Link href="/collaborations" className="inline-flex items-center gap-2 px-5 py-2.5 bg-glowup-licorice text-white rounded-xl font-medium hover:bg-glowup-licorice/90 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Retour aux collaborations
          </Link>
        </div>
      </div>
    );
  }

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  // Pour les non-ADMIN, on affiche "Facturé" au lieu de "Payé" (ils ne voient pas la suite des paiements)
  const displayStatut = isAdmin ? collab.statut : (collab.statut === "PAYE" ? "FACTURE_RECUE" : collab.statut);
  const statutInfo = getStatutInfo(displayStatut);
  const nextStatutsRaw = WORKFLOW[collab.statut as keyof typeof WORKFLOW] || [];
  const nextStatuts = isAdmin ? nextStatutsRaw : nextStatutsRaw.filter((s) => s !== "PAYE");
  const activeDevis = getActiveDocument("DEVIS");
  const activeFacture = getActiveDocument("FACTURE");
  const canGenerateDevis = ["NEGO", "GAGNE", "EN_COURS"].includes(collab.statut) && !activeDevis;
  const canGenerateFacture = ["PUBLIE", "FACTURE_RECUE"].includes(collab.statut) && !activeFacture;
  const hasAnnuledFacture = (collab?.documents || []).some(
    (d: DocumentInfo) => d.type === "FACTURE" && (d.statut === "ANNULE" || d.avoirRef)
  );
  const existingDocs = collab.documents || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50/80 via-white to-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/collaborations" className="inline-flex items-center gap-2 text-gray-500 hover:text-glowup-licorice transition-colors group">
            <span className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center group-hover:border-glowup-rose/30 group-hover:bg-glowup-lace/30 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium">Collaborations</span>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={copyReference} className="p-2.5 text-gray-400 hover:text-glowup-licorice hover:bg-white hover:border hover:border-gray-100 rounded-xl transition-all shadow-sm" title="Copier la référence">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <Link href={`/collaborations/${collab.id}/edit`} className="p-2.5 text-gray-400 hover:text-glowup-licorice hover:bg-white hover:border hover:border-gray-100 rounded-xl transition-all shadow-sm" title="Modifier">
              <Pencil className="w-4 h-4" />
            </Link>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-2.5 text-gray-400 hover:text-glowup-licorice hover:bg-white hover:border hover:border-gray-100 rounded-xl transition-all shadow-sm">
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50">
                    <button onClick={() => { setShowMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-3 rounded-lg mx-1">
                      <Share2 className="w-4 h-4" /> Partager
                    </button>
                    <button onClick={() => { setShowMenu(false); handleDelete(); }} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 rounded-lg mx-1">
                      <Trash2 className="w-4 h-4" /> Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="relative mb-8 rounded-2xl bg-white border border-gray-100 p-6 sm:p-8 shadow-sm overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-glowup-lace/20 via-transparent to-glowup-rose/5 pointer-events-none" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-glowup-licorice tracking-tight">{collab.reference}</h1>
              <span className={`inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full font-semibold shadow-sm ${statutInfo.bgLight} ${statutInfo.textColor}`}>
                <span className={`w-2 h-2 rounded-full ${statutInfo.color}`} />
                {statutInfo.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                {new Date(collab.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
              <span className="w-1 h-1 rounded-full bg-gray-300 hidden sm:inline-block" />
              <span className={`font-medium ${collab.source === "INBOUND" ? "text-blue-600" : "text-amber-600"}`}>
                {collab.source === "INBOUND" ? "Inbound" : "Outbound"}
              </span>
              {collab.isLongTerme && (
                <>
                  <span className="w-1 h-1 rounded-full bg-gray-300 hidden sm:inline-block" />
                  <span className="text-violet-600 font-medium">Long terme</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Alertes */}
        {collab.statut === "PERDU" && collab.raisonPerdu && (
          <div className="bg-white border border-red-100 rounded-2xl p-5 flex items-start gap-4 mb-8 shadow-sm">
            <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-red-800">Collaboration perdue</p>
              <p className="text-sm text-red-600/90 mt-1">{collab.raisonPerdu}</p>
            </div>
          </div>
        )}

        {/* Paiements : visible uniquement par les ADMIN (marque nous a payé / nous avons payé le talent) */}
        {isAdmin && (collab.statut === "FACTURE_RECUE" || collab.statut === "PAYE") && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-8 shadow-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Euro className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Paiements</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-sm">
                    <span className={collab.marquePayeeAt ? "text-emerald-600" : "text-amber-600"}>
                      {collab.marquePayeeAt
                        ? `✓ Marque nous a payé le ${new Date(collab.marquePayeeAt).toLocaleDateString("fr-FR")}`
                        : "○ En attente paiement marque"}
                    </span>
                    <span className={collab.paidAt ? "text-emerald-600" : "text-amber-600"}>
                      {collab.paidAt
                        ? `✓ Talent payé le ${new Date(collab.paidAt).toLocaleDateString("fr-FR")}`
                        : "○ En attente paiement talent"}
                    </span>
                  </div>
                </div>
              </div>
              {collab.marquePayeeAt && collab.paidAt && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-800">Collaboration terminée</span>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Section Upload Facture Talent */}
      {session?.user?.role === "TALENT" && collab.statut === "PUBLIE" && !collab.factureTalentUrl && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Receipt className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 text-lg mb-2">
                📄 Uploadez votre facture
              </h3>
              <p className="text-sm text-blue-700 mb-4">
                La collaboration est publiée ! Vous pouvez maintenant uploader votre facture.
              </p>
              <div className="bg-blue-100 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Montant net à facturer (HT) :</span>{" "}
                  <span className="text-lg font-bold">{formatMoney(collab.montantNet)}</span>
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelectTalent}
                  className="hidden"
                  id="facture-upload"
                />
                <label
                  htmlFor="facture-upload"
                  className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 cursor-pointer transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Choisir ma facture
                </label>
                {selectedFactureTalent && (
                  <div className="flex items-center gap-3 bg-white rounded-lg px-4 py-2 border border-blue-200">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700 font-medium">{selectedFactureTalent.name}</span>
                    <button
                      onClick={uploadFactureTalent}
                      disabled={uploadingFactureTalent}
                      className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploadingFactureTalent ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Envoi...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Envoyer
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-blue-600 mt-3">
                Formats acceptés : PDF, JPG, PNG • Taille max : 10MB
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Si la facture est déjà uploadée */}
      {session?.user?.role === "TALENT" && collab.factureTalentUrl && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-900 text-lg">✅ Facture reçue</p>
                <p className="text-sm text-green-700">
                  Envoyée le {collab.factureTalentRecueAt && new Date(collab.factureTalentRecueAt).toLocaleDateString("fr-FR")}
                </p>
                
                {/* Statut de validation */}
                {collab.factureValidee ? (
                  <div className="mt-2">
                    <p className="text-sm text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      ✅ Conforme et enregistrée
                    </p>
                    {collab.factureValideeAt && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Validée le {new Date(collab.factureValideeAt).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                    ⏳ En cours de vérification
                  </p>
                )}

                {/* Statut de paiement */}
                {collab.paidAt && (
                  <p className="text-sm text-green-700 font-semibold mt-2">
                    💰 Payé le {new Date(collab.paidAt).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFacturePreviewUrl(collab.factureTalentUrl)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                title="Voir la facture"
              >
                <Eye className="w-4 h-4" />
                Voir
              </button>
              <a
                href={collab.factureTalentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Bloc Facture talent pour ADMIN : voir et valider */}
      {(session?.user as { role?: string })?.role === "ADMIN" && collab.factureTalentUrl && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-violet-900 text-lg">Facture talent</p>
                <p className="text-sm text-violet-700">
                  Reçue le {collab.factureTalentRecueAt && new Date(collab.factureTalentRecueAt).toLocaleDateString("fr-FR")}
                </p>
                {collab.factureValidee ? (
                  <p className="text-sm text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Conforme et enregistrée
                    {collab.factureValideeAt && (
                      <span className="text-xs font-normal text-violet-600">
                        — {new Date(collab.factureValideeAt).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-amber-600 mt-1">En attente de validation</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFacturePreviewUrl(collab.factureTalentUrl)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                title="Voir la facture"
              >
                <Eye className="w-4 h-4" />
                Voir
              </button>
              <a
                href={collab.factureTalentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </a>
              {!collab.factureValidee && (
                <button
                  type="button"
                  onClick={validerFactureTalent}
                  disabled={validatingFacture}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {validatingFacture ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Valider la facture
                </button>
              )}
            </div>
          </div>
        </div>
      )}

        <div className="grid grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="col-span-8 space-y-6">
            {/* Partenaires */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white">
                <h2 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider">Partenaires</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <Link href={`/talents/${collab.talent.id}`} className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-glowup-rose/30 hover:bg-glowup-lace/20 transition-all">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-white shadow-sm bg-gradient-to-br from-glowup-rose to-glowup-old">
                      {collab.talent.photo ? (
                        <img src={collab.talent.photo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-base font-bold text-white">{collab.talent.prenom.charAt(0)}{collab.talent.nom.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-glowup-licorice group-hover:text-glowup-rose transition-colors">
                        {collab.talent.prenom} {collab.talent.nom}
                      </p>
                      <p className="text-xs text-gray-500 font-medium">Talent</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-glowup-rose transition-colors flex-shrink-0" />
                  </Link>

                  <Link href={`/marques/${collab.marque.id}`} className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-100">
                      <Building2 className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-glowup-licorice group-hover:text-gray-700 transition-colors">
                        {collab.marque.nom}
                      </p>
                      <p className="text-xs text-gray-500 font-medium">{collab.marque.secteur || "Marque"}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Livrables */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-glowup-lace flex items-center justify-center">
                    <Package className="w-4 h-4 text-glowup-rose" />
                  </div>
                  <h2 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider">Livrables</h2>
                </div>
                <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2.5 py-1 rounded-lg">{collab.livrables.length} élément{collab.livrables.length > 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {collab.livrables.map((livrable) => (
                  <div key={livrable.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                        <span className="text-base font-bold text-glowup-licorice">{livrable.quantite}</span>
                      </div>
                      <div>
                        <p className="font-medium text-glowup-licorice">{TYPE_LABELS[livrable.typeContenu] || livrable.typeContenu}</p>
                        {livrable.description && <p className="text-sm text-gray-500 mt-0.5">{livrable.description}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-glowup-licorice">{formatMoney(livrable.prixUnitaire * livrable.quantite)}</p>
                      {livrable.quantite > 1 && <p className="text-xs text-gray-400 mt-0.5">{formatMoney(livrable.prixUnitaire)} / unité</p>}
                    </div>
                  </div>
                ))}
              </div>
            {(collab.description || collab.lienPublication) && (
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 space-y-2">
                {collab.description && <p className="text-sm text-gray-600">{collab.description}</p>}
                {collab.lienPublication && (
                  <a href={collab.lienPublication} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                    <ExternalLink className="w-4 h-4" /> Voir la publication
                  </a>
                )}
              </div>
            )}
          </div>

            {/* Documents */}
            {existingDocs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <h2 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider">Documents</h2>
                </div>
                <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-medium">Référence</th>
                    <th className="px-6 py-3 text-left font-medium">Type</th>
                    <th className="px-6 py-3 text-left font-medium">Statut</th>
                    <th className="px-6 py-3 text-right font-medium">Montant HT</th>
                    <th className="px-6 py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {existingDocs.map((doc) => {
                    const isAnnule = doc.statut === "ANNULE" || doc.avoirRef;
                    const isAvoir = doc.type === "AVOIR";
                    return (
                      <tr key={doc.id} className={`${isAnnule ? "opacity-40" : "hover:bg-gray-50/50"} transition-colors`}>
                        <td className="px-6 py-4">
                          <span className={`font-mono font-medium ${isAnnule ? "line-through text-gray-400" : "text-glowup-licorice"}`}>
                            {doc.reference}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${
                            isAvoir ? "bg-orange-50 text-orange-600" : doc.type === "FACTURE" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                          }`}>
                            {isAvoir ? "Avoir" : doc.type === "FACTURE" ? "Facture" : "Devis"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isAnnule ? (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-red-50 text-red-500">Annulé</span>
                            ) : doc.statut === "PAYE" ? (
                              isAdmin ? (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-green-50 text-green-600">Payé</span>
                              ) : (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600">Facturé</span>
                              )
                            ) : doc.statut === "FACTURE" || doc.statut === "ENVOYE" ? (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600">Facturé</span>
                            ) : doc.statut === "VALIDE" ? (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600">Enregistré</span>
                            ) : (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500">Brouillon</span>
                            )}
                            {doc.type === "DEVIS" && doc.signatureStatus === "PENDING" && (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">
                                {(doc.signaturesCount ?? 0) > 0 ? `${doc.signaturesCount ?? 0}/${doc.signaturesTotal ?? 2} signé` : "En attente de signature"}
                              </span>
                            )}
                            {doc.type === "DEVIS" && doc.signatureStatus === "SIGNED" && (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">Signé ✓</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-semibold ${isAvoir ? "text-orange-600" : "text-glowup-licorice"}`}>
                            {isAvoir ? "-" : ""}{formatMoney(doc.montantHT ?? doc.montantTTC)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(doc.statut === "BROUILLON" || doc.statut === "VALIDE" || doc.statut === "ENVOYE") && (doc.type === "DEVIS" || doc.type === "FACTURE") && (
                              <button
                                onClick={() => openEditModal(doc)}
                                className="inline-flex items-center justify-center w-9 h-9 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                title="Modifier"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {doc.type === "DEVIS" && (doc.statut === "VALIDE" || doc.statut === "ENVOYE") && !doc.signatureSubmissionId && doc.signatureStatus !== "PENDING" && doc.signatureStatus !== "SIGNED" && (
                              <button
                                type="button"
                                onClick={() => openSignatureModal(doc)}
                                className="inline-flex items-center justify-center w-9 h-9 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                title="Envoyer pour signature"
                              >
                                <FileSignature className="w-4 h-4" />
                              </button>
                            )}
                            {doc.type === "DEVIS" && doc.signatureStatus === "PENDING" && doc.signatureSubmissionId && (
                              <button
                                type="button"
                                onClick={() => handleCheckSignatureStatus(doc.id)}
                                disabled={checkingSignatureDocId === doc.id}
                                className="inline-flex items-center justify-center w-9 h-9 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                                title="Vérifier le statut de signature"
                              >
                                {checkingSignatureDocId === doc.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {doc.type === "DEVIS" && doc.signedDocumentUrl && (
                              <a
                                href={doc.signedDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-9 h-9 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                title="Voir signé"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                            )}
                            <a 
                              href={`/api/documents/${doc.id}/pdf`} 
                              target="_blank" 
                              className="inline-flex items-center justify-center w-9 h-9 text-gray-400 hover:text-glowup-rose hover:bg-glowup-lace rounded-xl transition-all"
                              title="Télécharger PDF"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Conversation */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white flex items-center justify-between">
              <h2 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
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
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-glowup-licorice to-glowup-old text-white text-sm font-medium disabled:opacity-50"
                  >
                    {commentSubmitting ? "Envoi..." : "Envoyer"}
                  </button>
                </div>
              </div>
            )}
            <div className="divide-y divide-gray-50">
              {(collab.comments && collab.comments.length > 0) ? (
                collab.comments.map((c) => (
                  <div key={c.id} className="px-6 py-4 flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-glowup-rose to-glowup-old flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {c.user.prenom?.[0]}{c.user.nom?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-glowup-licorice">
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
                            ...(collab.comments || []).map(
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

        {/* Sidebar */}
        <div className="col-span-4 space-y-6">
          {/* Actions */}
          {(nextStatuts.length > 0 || canGenerateDevis || canGenerateFacture || activeDevis || activeFacture) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden border-l-4 border-l-glowup-rose">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-glowup-lace/30 to-white">
                <h3 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider">Actions rapides</h3>
              </div>
              <div className="p-4 space-y-3">
                {canGenerateDevis && (
                  <button onClick={() => openNotesModal("DEVIS")} disabled={generatingDoc} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50">
                    {generatingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Générer devis
                  </button>
                )}
                {activeDevis && (
                  <a href={`/api/documents/${activeDevis.id}/pdf`} target="_blank" className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors">
                    <Download className="w-4 h-4" /> Devis {activeDevis.reference}
                  </a>
                )}
                {canGenerateFacture && (
                  <>
                    {hasAnnuledFacture && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                        Facture précédente annulée. La nouvelle facture aura un nouveau numéro.
                      </p>
                    )}
                    <Link href={`/collaborations/${collab.id}/facturer`} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors">
                      <Receipt className="w-4 h-4" /> Facturer la collaboration
                    </Link>
                  </>
                )}
                {activeFacture && (
                  <>
                    <a href={`/api/documents/${activeFacture.id}/pdf`} target="_blank" className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors">
                      <Download className="w-4 h-4" /> Facture {activeFacture.reference}
                    </a>
                    {activeFacture.statut !== "PAYE" && (
                      <button onClick={() => createAvoir(activeFacture.id)} disabled={generatingDoc} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 text-orange-600 rounded-xl text-sm font-semibold hover:bg-orange-100 transition-colors disabled:opacity-50">
                        <AlertTriangle className="w-4 h-4" /> Créer un avoir
                      </button>
                    )}
                  </>
                )}
                {nextStatuts.map((statut) => {
                  const info = getStatutInfo(statut);
                  const Icon = info.icon;
                  const isPerdu = statut === "PERDU";
                  if (statut === "PAYE" && !isAdmin) return null;
                  // PAYE : on affiche deux boutons séparés (Marque a payé / Talent payé)
                  if (statut === "PAYE" && isAdmin) return null;
                  return (
                    <button key={statut} onClick={() => handleStatutChange(statut)} disabled={updating}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                        isPerdu ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-glowup-licorice text-white hover:bg-glowup-licorice/90 shadow-lg shadow-glowup-licorice/20"
                      }`}
                    >
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                      {isPerdu ? "Marquer perdu" : `Passer en ${info.label}`}
                    </button>
                  );
                })}
                {nextStatuts.includes("PAYE") && isAdmin && (
                  <>
                    {!collab.marquePayeeAt && (
                      <button
                        type="button"
                        onClick={marquerMarquePayee}
                        disabled={updating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                      >
                        {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                        Marque nous a payé
                      </button>
                    )}
                    {!collab.paidAt && (
                      <button
                        type="button"
                        onClick={() => updateStatut("PAYE")}
                        disabled={updating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-900/20"
                      >
                        {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Euro className="w-4 h-4" />}
                        Nous avons payé le talent
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Montants — recalculés depuis la somme des livrables pour cohérence */}
          {(() => {
            const montantBrut = collab.livrables.reduce((sum, l) => sum + Number(l.prixUnitaire) * Number(l.quantite), 0);
            const commissionEuros = montantBrut * (Number(collab.commissionPercent) / 100);
            const montantNet = montantBrut - commissionEuros;
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden border-l-4 border-l-emerald-500/50">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/50 to-white">
                  <h3 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider">Répartition</h3>
                </div>
                <div className="p-5 space-y-5">
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-sm text-gray-500 font-medium">Total brut HT</span>
                      <span className="text-xl font-bold text-glowup-licorice">{formatMoney(montantBrut)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-glowup-licorice rounded-full" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-sm text-gray-500 font-medium">Commission ({collab.commissionPercent}%)</span>
                      <span className="text-lg font-bold text-glowup-rose">{formatMoney(commissionEuros)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-glowup-rose to-glowup-old rounded-full" style={{ width: `${collab.commissionPercent}%` }} />
                    </div>
                  </div>
                  <div className="pt-4 mt-2 border-t border-gray-100">
                    <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-5 text-center border border-emerald-100">
                      <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Net talent (HT)</p>
                      <p className="text-2xl font-bold text-emerald-700">{formatMoney(montantNet)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden border-l-4 border-l-blue-400/50">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white">
              <h3 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider">Progression</h3>
            </div>
            <div className="p-5">
              <div className="relative space-y-0">
                {(() => {
                  const statutsOrder = STATUTS.filter(s => s.value !== "PERDU");
                  const steps: Array<{ value: string; label: string; icon: typeof Clock; color: string; kind: "statut" | "signature" }> = [];
                  statutsOrder.forEach((s) => {
                    steps.push({ ...s, kind: "statut" });
                    if (s.value === "GAGNE") {
                      steps.push({ value: "__SIGNATURE__", label: "En cours de signature", icon: FileSignature, color: "bg-indigo-500", kind: "signature" });
                    }
                  });
                  const devisDoc = collab.documents?.find((d) => d.type === "DEVIS");
                  const signatureSent = !!devisDoc?.signatureSubmissionId;
                  const sigCount = devisDoc?.signaturesCount ?? 0;
                  const sigTotal = devisDoc?.signaturesTotal ?? 2;
                  const allSigned = sigTotal > 0 && sigCount >= sigTotal;
                  const currentStatutIdx = statutsOrder.findIndex((s) => s.value === collab.statut);

                  return steps.map((step, index, arr) => {
                    const isLast = index === arr.length - 1;
                    const isSignatureStep = step.kind === "signature";
                    const isPast = isSignatureStep
                      ? allSigned
                      : currentStatutIdx >= statutsOrder.findIndex((s) => s.value === step.value);
                    const isCurrent = isSignatureStep
                      ? signatureSent && !allSigned
                      : step.value === collab.statut;
                    const Icon = step.icon;
                    const signatureSubtitle =
                      isSignatureStep && signatureSent
                        ? allSigned
                          ? `${sigTotal}/${sigTotal} signé ✓`
                          : `${sigCount}/${sigTotal} signé`
                        : null;

                    return (
                      <div key={step.value} className="relative flex gap-4">
                        {!isLast && (
                          <div className={`absolute left-[17px] top-11 bottom-0 w-0.5 min-h-[28px] ${isPast ? "bg-emerald-200" : "bg-gray-100"}`} />
                        )}
                        <div
                          className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            isSignatureStep && !signatureSent
                              ? "bg-gray-100 text-gray-400"
                              : isCurrent
                                ? `${step.color} text-white shadow-md ring-2 ring-white`
                                : isPast
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {isPast && !isCurrent ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </div>
                        <div className={`pb-8 ${isLast ? "pb-0" : ""}`}>
                          <p
                            className={`text-sm font-medium ${
                              isSignatureStep && !signatureSent
                                ? "text-gray-400"
                                : isCurrent
                                  ? "text-glowup-licorice"
                                  : isPast
                                    ? "text-gray-700"
                                    : "text-gray-400"
                            }`}
                          >
                            {step.label}
                          </p>
                          {isCurrent && !isSignatureStep && <p className="text-xs text-gray-500 mt-0.5">Étape actuelle</p>}
                          {signatureSubtitle && (
                            <p className={`text-xs mt-0.5 ${allSigned ? "text-emerald-600 font-medium" : "text-gray-500"}`}>
                              {signatureSubtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Modals */}
      {showCompleteMarqueModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-glowup-licorice">Informations manquantes</h3>
                <p className="text-sm text-gray-500">Complétez les infos de {collab?.marque.nom}</p>
              </div>
            </div>

            {/* Recherche API Recherche d'entreprises — à la génération du devis */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-purple-100 rounded-xl">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-purple-900 text-sm">Auto-complétion via API Recherche d'entreprises</h4>
                  <p className="text-xs text-purple-700 mt-0.5">Recherchez par nom ou SIRET pour importer les données légales</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pappersSearchQuery}
                  onChange={(e) => setPappersSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handlePappersSearch())}
                  placeholder={collab?.marque.nom ? `Ex: ${collab.marque.nom} ou SIRET` : "Nom entreprise ou SIRET"}
                  className="flex-1 px-3 py-2.5 rounded-xl border-2 border-purple-200 focus:outline-none focus:border-purple-500 bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={handlePappersSearch}
                  disabled={pappersSearching || !pappersSearchQuery.trim()}
                  className="px-4 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-1.5 text-sm"
                >
                  {pappersSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {pappersSearching ? "..." : "Rechercher"}
                </button>
              </div>
              {pappersShowResults && (
                <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto">
                  {pappersSearchResults.length === 0 ? (
                    <div className="bg-white rounded-xl p-3 text-center text-gray-500 text-sm">Aucun résultat</div>
                  ) : (
                    pappersSearchResults.map((entreprise, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => fillMarqueFromPappers(entreprise)}
                        className="w-full bg-white rounded-xl p-3 border-2 border-gray-200 hover:border-purple-400 hover:shadow transition-all text-left text-sm"
                      >
                        <div className="font-semibold text-glowup-licorice">{entreprise.nom_entreprise}</div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {entreprise.forme_juridique} • SIRET: {entreprise.siret}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {entreprise.adresse}, {entreprise.code_postal} {entreprise.ville}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Raison sociale *</label>
                <input type="text" value={marqueFormData.raisonSociale} onChange={(e) => setMarqueFormData(prev => ({ ...prev, raisonSociale: e.target.value }))} placeholder="SOCIÉTÉ SAS" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pays *</label>
                <select
                  value={marqueFormData.pays}
                  onChange={(e) => setMarqueFormData(prev => ({ ...prev, pays: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all bg-white"
                >
                  {LISTE_PAYS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Régime TVA : France 20% • UE avec n° TVA 0% (autoliquidation) • Hors UE 0%
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Adresse *</label>
                <input type="text" value={marqueFormData.adresseRue} onChange={(e) => setMarqueFormData(prev => ({ ...prev, adresseRue: e.target.value }))} placeholder="123 Rue de la Paix" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Code postal *</label>
                  <input type="text" value={marqueFormData.codePostal} onChange={(e) => setMarqueFormData(prev => ({ ...prev, codePostal: e.target.value }))} placeholder="75001" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ville *</label>
                  <input type="text" value={marqueFormData.ville} onChange={(e) => setMarqueFormData(prev => ({ ...prev, ville: e.target.value }))} placeholder="Paris" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SIRET</label>
                  <input type="text" value={marqueFormData.siret} onChange={(e) => setMarqueFormData(prev => ({ ...prev, siret: e.target.value }))} placeholder="123 456 789 00012" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">N° TVA</label>
                  <input type="text" value={marqueFormData.numeroTVA} onChange={(e) => setMarqueFormData(prev => ({ ...prev, numeroTVA: e.target.value }))} placeholder="FR 12 345678901" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => { setShowCompleteMarqueModal(false); setPendingDocType(null); setPappersShowResults(false); setPappersSearchQuery(""); }} className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors">Annuler</button>
              <button onClick={saveMarqueAndGenerate} disabled={savingMarque || !marqueFormData.adresseRue || !marqueFormData.codePostal || !marqueFormData.ville} className="flex-1 px-6 py-3.5 bg-glowup-rose text-white rounded-xl font-semibold hover:bg-glowup-rose/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {savingMarque ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {showPerduModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-glowup-licorice text-center mb-2">Marquer comme perdu</h3>
            <p className="text-sm text-gray-500 text-center mb-6">Indiquez la raison de cette perte.</p>
            <textarea value={raisonPerdu} onChange={(e) => setRaisonPerdu(e.target.value)} placeholder="Ex: Budget insuffisant, timing..." rows={3} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 text-sm resize-none mb-6" autoFocus />
            <div className="flex gap-4">
              <button onClick={() => setShowPerduModal(false)} className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors">Annuler</button>
              <button onClick={confirmPerdu} disabled={updating} className="flex-1 px-6 py-3.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Notes pour Devis/Facture */}
      {showNotesModal && pendingGenerateType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                pendingGenerateType === "DEVIS" ? "bg-blue-100" : "bg-emerald-100"
              }`}>
                <FileText className={`w-7 h-7 ${
                  pendingGenerateType === "DEVIS" ? "text-blue-600" : "text-emerald-600"
                }`} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-glowup-licorice">
                  Générer {pendingGenerateType === "DEVIS" ? "un devis" : "une facture"}
                </h3>
                <p className="text-sm text-gray-500">
                  Ajoutez des notes ou conditions spécifiques (optionnel)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pays du client *
                </label>
                <select
                  value={paysDevis}
                  onChange={(e) => setPaysDevis(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose text-sm"
                >
                  {LISTE_PAYS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Détermine le régime TVA (France 20%, UE, hors UE)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  N° TVA intracommunautaire (optionnel)
                </label>
                <input
                  type="text"
                  value={numeroTVADevis}
                  onChange={(e) => setNumeroTVADevis(e.target.value)}
                  placeholder="FR12345678901"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose text-sm"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Notes / Commentaires
              </label>
              <textarea
                value={notesDevis}
                onChange={(e) => setNotesDevis(e.target.value)}
                placeholder={`Exemples :\n- Paiement à 30 jours fin du mois\n- Validation des contenus avant publication\n- Budget média non inclus\n- Délai de livraison : 2 semaines`}
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-glowup-rose/20 focus:border-glowup-rose text-sm resize-none font-mono"
              />
              <p className="text-xs text-gray-400 mt-2">
                Ces notes apparaîtront dans la section "Commentaires" du document PDF
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">
                    💡 Astuce
                  </p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Vous pouvez laisser ce champ vide. Les conditions générales de paiement seront automatiquement ajoutées.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowNotesModal(false);
                  setPendingGenerateType(null);
                  setNotesDevis("");
                  setNumeroTVADevis("");
                }}
                className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => generateDocument(pendingGenerateType, false, notesDevis || undefined, paysDevis, numeroTVADevis)}
                disabled={generatingDoc}
                className={`flex-1 px-6 py-3.5 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
                  pendingGenerateType === "DEVIS"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                } disabled:opacity-50`}
              >
                {generatingDoc ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Générer le {pendingGenerateType === "DEVIS" ? "devis" : "facture"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Édition Document */}
      {showEditDocModal && editingDoc && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center">
                <Pencil className="w-7 h-7 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-glowup-licorice">
                  Modifier {editingDoc.type === "DEVIS" ? "le devis" : "la facture"}
                </h3>
                <p className="text-sm text-gray-500">
                  {editingDoc.reference}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setEditModalTab("general")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  editModalTab === "general"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                📋 Général
              </button>
              <button
                type="button"
                onClick={() => setEditModalTab("lignes")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  editModalTab === "lignes"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                📦 Prestations ({editFormData.lignes.length})
              </button>
              <button
                type="button"
                onClick={() => setEditModalTab("facturation")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  editModalTab === "facturation"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                💰 Facturation
              </button>
            </div>

            <div className="space-y-5 mb-6">
              {/* Tab: Général */}
              {editModalTab === "general" && (
                <>
                  {/* Titre */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Titre de la campagne *
                    </label>
                    <input
                      type="text"
                      value={editFormData.titre}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, titre: e.target.value }))}
                      placeholder="Ex: Melissa x Nike - Janvier 2026"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                    />
                  </div>

                  {/* Dates */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        📅 Date d'émission
                      </label>
                      <input
                        type="date"
                        value={editFormData.dateEmission}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, dateEmission: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ⏰ Date d'échéance
                      </label>
                      <input
                        type="date"
                        value={editFormData.dateEcheance}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, dateEcheance: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                      />
                    </div>
                  </div>

                  {/* PO Client */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🔖 Bon de commande client (PO)
                    </label>
                    <input
                      type="text"
                      value={editFormData.poClient}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, poClient: e.target.value }))}
                      placeholder="Ex: PO-2026-001"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Référence du bon de commande fourni par le client (optionnel)
                    </p>
                  </div>

                  {/* Commentaires */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📝 Notes / Commentaires
                    </label>
                    <textarea
                      value={editFormData.commentaires}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, commentaires: e.target.value }))}
                      placeholder={`Exemples :\n- Paiement à 30 jours fin du mois\n- Validation des contenus avant publication\n- Budget média non inclus`}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm resize-none font-mono"
                    />
                  </div>
                </>
              )}

              {/* Tab: Prestations */}
              {editModalTab === "lignes" && (
                <>
                  <div className="space-y-4">
                    {editFormData.lignes.map((ligne, index) => (
                      <div key={index} className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                        <div className="flex items-start gap-4 mb-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-2">
                              Description de la prestation *
                            </label>
                            <textarea
                              value={ligne.description}
                              onChange={(e) => {
                                const newLignes = [...editFormData.lignes];
                                newLignes[index].description = e.target.value;
                                setEditFormData(prev => ({ ...prev, lignes: newLignes }));
                              }}
                              placeholder="Ex: 1x Post Instagram - Story + Reel"
                              rows={3}
                              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm resize-none"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 pl-14">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Quantité *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={ligne.quantite}
                              onChange={(e) => {
                                const newLignes = [...editFormData.lignes];
                                newLignes[index].quantite = parseInt(e.target.value) || 1;
                                setEditFormData(prev => ({ ...prev, lignes: newLignes }));
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Prix unitaire (€) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={ligne.prixUnitaire}
                              onChange={(e) => {
                                const newLignes = [...editFormData.lignes];
                                newLignes[index].prixUnitaire = parseFloat(e.target.value) || 0;
                                setEditFormData(prev => ({ ...prev, lignes: newLignes }));
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Total HT
                            </label>
                            <div className="w-full px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm font-bold text-blue-600">
                              {formatMoney(ligne.quantite * ligne.prixUnitaire)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Total */}
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total HT</span>
                      <span className="text-2xl font-bold">
                        {formatMoney(editFormData.lignes.reduce((sum, l) => sum + (l.quantite * l.prixUnitaire), 0))}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Tab: Facturation */}
              {editModalTab === "facturation" && (
                <>
                  {/* Pays / zone du client */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🌍 Pays / zone du client
                    </label>
                    <select
                      value={editFormData.clientZone || "FRANCE"}
                      onChange={(e) => {
                        const zone = e.target.value as "FRANCE" | "UE" | "HORS_EU";
                        setEditFormData((prev: any) => {
                          let nextTypeTVA = prev.typeTVA || "FRANCE";
                          if (zone === "FRANCE") {
                            nextTypeTVA = "FRANCE";
                          } else if (zone === "HORS_EU") {
                            nextTypeTVA = "HORS_EU";
                          } else {
                            // Zone UE : conserver le sous-type UE si déjà choisi, sinon par défaut EU_SANS_TVA
                            nextTypeTVA =
                              prev.typeTVA === "EU_INTRACOM" || prev.typeTVA === "EU_SANS_TVA"
                                ? prev.typeTVA
                                : "EU_SANS_TVA";
                          }
                          return {
                            ...prev,
                            clientZone: zone,
                            typeTVA: nextTypeTVA,
                          };
                        });
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                    >
                      <option value="FRANCE">🇫🇷 France</option>
                      <option value="UE">🇪🇺 Union européenne</option>
                      <option value="HORS_EU">🌍 Hors Union européenne</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1.5">
                      Ce choix ajuste automatiquement le régime de TVA ci‑dessous et les mentions légales du devis / de la facture.
                    </p>
                  </div>

                  {/* Type de TVA */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🌍 Régime de TVA *
                    </label>
                    <select
                      value={editFormData.typeTVA}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, typeTVA: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                    >
                      <option value="FRANCE">🇫🇷 France - TVA 20%</option>
                      <option value="EU_INTRACOM">🇪🇺 UE avec n° TVA - Autoliquidation (TVA 0%)</option>
                      <option value="EU_SANS_TVA">🇪🇺 UE sans n° TVA - TVA 20%</option>
                      <option value="HORS_EU">🌍 Hors UE - Exonération (TVA 0%)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1.5">
                      {editFormData.typeTVA === "FRANCE" && "TVA française normale (20 %)"}
                      {editFormData.typeTVA === "EU_INTRACOM" && "Autoliquidation – article 44 directive 2006/112/CE (n° TVA client)"}
                      {editFormData.typeTVA === "EU_SANS_TVA" && "Client UE sans n° TVA – TVA française normale"}
                      {editFormData.typeTVA === "HORS_EU" && "TVA non applicable – article 259-1 du CGI"}
                    </p>
                  </div>

                  {/* Mode de paiement */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      💳 Mode de paiement
                    </label>
                    <select
                      value={editFormData.modePaiement}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, modePaiement: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                    >
                      <option value="Virement">Virement bancaire</option>
                      <option value="Chèque">Chèque</option>
                      <option value="Carte bancaire">Carte bancaire</option>
                      <option value="Prélèvement">Prélèvement automatique</option>
                      <option value="Espèces">Espèces</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  {/* Référence de paiement */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🔢 Référence de paiement
                    </label>
                    <input
                      type="text"
                      value={editFormData.referencePaiement}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, referencePaiement: e.target.value }))}
                      placeholder="Ex: REF-2026-001 ou numéro de transaction"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Référence unique du paiement (optionnel)
                    </p>
                  </div>
                </>
              )}

              {/* Info */}
              <div className={`border rounded-xl p-4 ${
                editingDoc?.statut === "ENVOYE" 
                  ? "bg-amber-50 border-amber-100" 
                  : "bg-blue-50 border-blue-100"
              }`}>
                <div className="flex gap-3">
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                    editingDoc?.statut === "ENVOYE" ? "text-amber-600" : "text-blue-600"
                  }`} />
                  <div>
                    <p className={`text-sm font-medium mb-1 ${
                      editingDoc?.statut === "ENVOYE" ? "text-amber-900" : "text-blue-900"
                    }`}>
                      {editingDoc?.statut === "ENVOYE" ? "⚠️ Document déjà envoyé" : "💡 Bon à savoir"}
                    </p>
                    <p className={`text-xs leading-relaxed ${
                      editingDoc?.statut === "ENVOYE" ? "text-amber-700" : "text-blue-700"
                    }`}>
                      {editingDoc?.statut === "ENVOYE" 
                        ? "Ce document a déjà été envoyé au client. Les modifications seront prises en compte dans une nouvelle version du PDF."
                        : "Vous pouvez modifier les descriptions, le titre et les commentaires. Les montants et quantités restent fixes pour la cohérence comptable."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowEditDocModal(false);
                  setEditingDoc(null);
                }}
                className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveDocumentEdits}
                disabled={savingDoc}
                className="flex-1 px-6 py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {savingDoc ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Enregistrer et régénérer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Envoi signature électronique DocuSeal */}
      {showSignatureModal && signatureDoc && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center">
                <FileSignature className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-glowup-licorice">Envoyer pour signature électronique</h3>
                <p className="text-sm text-gray-500">{signatureDoc.reference}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              En 3 étapes : 1) Ici — Saisissez l’email client et l’email agence. 2) Builder — Placez les champs (signature, date, texte) sur le PDF. 3) Envoyer — DocuSeal envoie le document aux deux emails. Vous pouvez modifier l’email et le nom avant d’envoyer.
            </p>
            <div className="space-y-5 mb-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Signataire 1 (Client)</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={signatureEmail}
                    onChange={(e) => setSignatureEmail(e.target.value)}
                    placeholder="contact@marque.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom</label>
                  <input
                    type="text"
                    value={signatureSignerName}
                    onChange={(e) => setSignatureSignerName(e.target.value)}
                    placeholder="Jean Dupont"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                  />
                </div>
              </div>
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Signataire 2 (Agence)</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={signatureAgenceEmail}
                    onChange={(e) => setSignatureAgenceEmail(e.target.value)}
                    placeholder="patron@agence.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom</label>
                  <input
                    type="text"
                    value={signatureAgenceName}
                    onChange={(e) => setSignatureAgenceName(e.target.value)}
                    placeholder="Sofian Zeddam"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => { setShowSignatureModal(false); setSignatureDoc(null); }}
                className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSendSignature}
                disabled={!signatureEmail.trim() || !signatureAgenceEmail.trim() || signatureSending}
                className="flex-1 px-6 py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {signatureSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                {signatureSending ? "Ouverture..." : "Placer les champs et continuer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPublieModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Eye className="w-8 h-8 text-violet-600" />
            </div>
            <h3 className="text-xl font-bold text-glowup-licorice text-center mb-2">Marquer comme publié</h3>
            <p className="text-sm text-gray-500 text-center mb-6">Ajoutez le lien de publication (optionnel)</p>
            <input type="url" value={lienPublication} onChange={(e) => setLienPublication(e.target.value)} placeholder="https://instagram.com/p/..." className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 text-sm mb-6" />
            <div className="flex gap-4">
              <button onClick={() => setShowPublieModal(false)} className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors">Annuler</button>
              <button onClick={confirmPublie} disabled={updating} className="flex-1 px-6 py-3.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal prévisualisation facture talent */}
      {facturePreviewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
            <span className="text-sm font-medium text-slate-700">Aperçu de la facture talent</span>
            <div className="flex items-center gap-2">
              <a
                href={facturePreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </a>
              <button
                type="button"
                onClick={() => setFacturePreviewUrl(null)}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                aria-label="Fermer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 w-full">
            <iframe
              src={facturePreviewUrl}
              title="Aperçu facture talent"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}