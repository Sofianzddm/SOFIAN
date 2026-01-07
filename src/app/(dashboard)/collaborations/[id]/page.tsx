"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";

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
  montantTTC: number;
  dateEmission: string | null;
  avoirRef: string | null;
  factureRef: string | null;
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
  paidAt: string | null;
  isLongTerme: boolean;
  createdAt: string;
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
  };
  documents?: DocumentInfo[];
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
  const [savingMarque, setSavingMarque] = useState(false);

  useEffect(() => { if (params.id) fetchCollab(); }, [params.id]);

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
      if (res.ok) { setShowCompleteMarqueModal(false); await fetchCollab(); await generateDocument(pendingDocType, true); }
      else alert("Erreur lors de la mise à jour de la marque");
    } catch (error) { alert("Erreur lors de la mise à jour"); }
    finally { setSavingMarque(false); setPendingDocType(null); }
  };

  const generateDocument = async (type: "DEVIS" | "FACTURE", skipCheck = false) => {
    if (!collab) return;
    if (!skipCheck && !checkMarqueInfos(type)) { setPendingDocType(type); initMarqueForm(); setShowCompleteMarqueModal(true); return; }
    setGeneratingDoc(true);
    try {
      const lignes = collab.livrables.map((l) => ({
        description: `${l.quantite}x ${TYPE_LABELS[l.typeContenu] || l.typeContenu}${l.description ? ` - ${l.description}` : ""}`,
        quantite: l.quantite, prixUnitaire: l.prixUnitaire,
      }));
      const res = await fetch("/api/documents/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, collaborationId: collab.id, lignes, titre: `${collab.talent.prenom} x ${collab.marque.nom}` }),
      });
      if (res.ok) { const data = await res.json(); window.open(`/api/documents/${data.document.id}/pdf`, "_blank"); fetchCollab(); }
      else { const err = await res.json(); alert(err.error || "Erreur lors de la génération"); }
    } catch (error) { alert("Erreur lors de la génération"); }
    finally { setGeneratingDoc(false); }
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

  const getActiveDocument = (type: "DEVIS" | "FACTURE") => {
    return (collab?.documents || []).find(d => d.type === type && !["ANNULE"].includes(d.statut) && !d.avoirRef);
  };

  const copyReference = () => { if (collab) { navigator.clipboard.writeText(collab.reference); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const formatMoney = (amount: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  const getStatutInfo = (statut: string) => STATUTS.find((s) => s.value === statut) || STATUTS[0];

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-glowup-rose" /></div>;
  if (!collab) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-center"><XCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Collaboration non trouvée</p></div></div>;

  const statutInfo = getStatutInfo(collab.statut);
  const nextStatuts = WORKFLOW[collab.statut as keyof typeof WORKFLOW] || [];
  const activeDevis = getActiveDocument("DEVIS");
  const activeFacture = getActiveDocument("FACTURE");
  const canGenerateDevis = ["NEGO", "GAGNE"].includes(collab.statut) && !activeDevis;
  const canGenerateFacture = ["PUBLIE", "FACTURE_RECUE"].includes(collab.statut) && !activeFacture;
  const existingDocs = collab.documents || [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/collaborations" className="inline-flex items-center gap-2 text-gray-500 hover:text-glowup-licorice transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Collaborations</span>
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={copyReference} className="p-2.5 text-gray-400 hover:text-glowup-licorice hover:bg-gray-100 rounded-xl transition-all">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <Link href={`/collaborations/${collab.id}/edit`} className="p-2.5 text-gray-400 hover:text-glowup-licorice hover:bg-gray-100 rounded-xl transition-all">
            <Pencil className="w-4 h-4" />
          </Link>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-2.5 text-gray-400 hover:text-glowup-licorice hover:bg-gray-100 rounded-xl transition-all">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                  <button onClick={() => { setShowMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-3">
                    <Share2 className="w-4 h-4" /> Partager
                  </button>
                  <button onClick={() => { setShowMenu(false); handleDelete(); }} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3">
                    <Trash2 className="w-4 h-4" /> Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Title Section */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <h1 className="text-3xl font-bold text-glowup-licorice tracking-tight">{collab.reference}</h1>
          <span className={`inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full font-semibold ${statutInfo.bgLight} ${statutInfo.textColor}`}>
            <span className={`w-2 h-2 rounded-full ${statutInfo.color}`} />
            {statutInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {new Date(collab.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className={`font-medium ${collab.source === "INBOUND" ? "text-blue-600" : "text-amber-600"}`}>
            {collab.source === "INBOUND" ? "Inbound" : "Outbound"}
          </span>
          {collab.isLongTerme && (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span className="text-violet-600 font-medium">Long terme</span>
            </>
          )}
        </div>
      </div>

      {/* Alertes */}
      {collab.statut === "PERDU" && collab.raisonPerdu && (
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-100 rounded-2xl p-5 flex items-start gap-4 mb-8">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-800">Collaboration perdue</p>
            <p className="text-sm text-red-600 mt-1">{collab.raisonPerdu}</p>
          </div>
        </div>
      )}

      {collab.statut === "PAYE" && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 flex items-center gap-4 mb-8">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-800">Collaboration terminée</p>
            <p className="text-sm text-green-600">Paiement reçu le {collab.paidAt && new Date(collab.paidAt).toLocaleDateString("fr-FR")}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="col-span-8 space-y-6">
          {/* Partenaires */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-100/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="font-semibold text-glowup-licorice">Partenaires</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <Link href={`/talents/${collab.talent.id}`} className="group flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-all">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-glowup-rose/80 to-glowup-old/80 flex items-center justify-center">
                    <span className="text-base font-semibold text-white">{collab.talent.prenom.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-glowup-licorice group-hover:text-glowup-rose transition-colors">
                      {collab.talent.prenom} {collab.talent.nom}
                    </p>
                    <p className="text-sm text-gray-400">Talent</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                </Link>

                <Link href={`/marques/${collab.marque.id}`} className="group flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-all">
                  <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-glowup-licorice group-hover:text-gray-600 transition-colors">
                      {collab.marque.nom}
                    </p>
                    <p className="text-sm text-gray-400">{collab.marque.secteur || "Marque"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                </Link>
              </div>
            </div>
          </div>

          {/* Livrables */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-100/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-glowup-lace flex items-center justify-center">
                  <Package className="w-4 h-4 text-glowup-rose" />
                </div>
                <h2 className="font-semibold text-glowup-licorice">Livrables</h2>
              </div>
              <span className="text-sm text-gray-500 font-medium">{collab.livrables.length} élément{collab.livrables.length > 1 ? "s" : ""}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {collab.livrables.map((livrable) => (
                <div key={livrable.id} className="px-6 py-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border border-gray-100">
                      <span className="text-lg font-bold text-glowup-licorice">{livrable.quantite}</span>
                    </div>
                    <div>
                      <p className="font-medium text-glowup-licorice">{TYPE_LABELS[livrable.typeContenu] || livrable.typeContenu}</p>
                      {livrable.description && <p className="text-sm text-gray-500 mt-0.5">{livrable.description}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-glowup-licorice">{formatMoney(livrable.prixUnitaire * livrable.quantite)}</p>
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-100/50 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="font-semibold text-glowup-licorice">Documents</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-medium">Référence</th>
                    <th className="px-6 py-3 text-left font-medium">Type</th>
                    <th className="px-6 py-3 text-left font-medium">Statut</th>
                    <th className="px-6 py-3 text-right font-medium">Montant</th>
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
                          {isAnnule ? (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-red-50 text-red-500">Annulé</span>
                          ) : doc.statut === "PAYE" ? (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-green-50 text-green-600">Payé</span>
                          ) : doc.statut === "FACTURE" || doc.statut === "ENVOYE" ? (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600">Facturé</span>
                          ) : (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500">Brouillon</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-semibold ${isAvoir ? "text-orange-600" : "text-glowup-licorice"}`}>
                            {isAvoir ? "-" : ""}{formatMoney(doc.montantTTC)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a href={`/api/documents/${doc.id}/pdf`} target="_blank" className="inline-flex items-center justify-center w-9 h-9 text-gray-400 hover:text-glowup-rose hover:bg-glowup-lace rounded-xl transition-all">
                            <Download className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="col-span-4 space-y-6">
          {/* Actions */}
          {(nextStatuts.length > 0 || canGenerateDevis || canGenerateFacture || activeDevis || activeFacture) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-100/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-glowup-licorice text-sm">Actions rapides</h3>
              </div>
              <div className="p-4 space-y-3">
                {canGenerateDevis && (
                  <button onClick={() => generateDocument("DEVIS")} disabled={generatingDoc} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50">
                    {generatingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Générer devis
                  </button>
                )}
                {activeDevis && (
                  <a href={`/api/documents/${activeDevis.id}/pdf`} target="_blank" className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors">
                    <Download className="w-4 h-4" /> Devis {activeDevis.reference}
                  </a>
                )}
                {canGenerateFacture && (
                  <button onClick={() => generateDocument("FACTURE")} disabled={generatingDoc} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50">
                    {generatingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Générer facture
                  </button>
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
              </div>
            </div>
          )}

          {/* Montants */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-100/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-glowup-licorice text-sm">Répartition</h3>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm text-gray-500">Total brut HT</span>
                  <span className="text-2xl font-bold text-glowup-licorice">{formatMoney(collab.montantBrut)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-glowup-licorice rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm text-gray-500">Commission ({collab.commissionPercent}%)</span>
                  <span className="text-xl font-bold text-glowup-rose">{formatMoney(collab.commissionEuros)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-glowup-rose to-glowup-old rounded-full" style={{ width: `${collab.commissionPercent}%` }} />
                </div>
              </div>
              <div className="pt-4 mt-2 border-t border-gray-100">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 text-center">
                  <p className="text-sm text-green-600 font-medium mb-1">Net talent</p>
                  <p className="text-3xl font-bold text-green-700">{formatMoney(collab.montantNet)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-100/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-glowup-licorice text-sm">Progression</h3>
            </div>
            <div className="p-5">
              <div className="relative">
                {STATUTS.filter(s => !["PERDU"].includes(s.value)).map((statut, index, arr) => {
                  const currentIdx = STATUTS.findIndex(s => s.value === collab.statut);
                  const thisIdx = STATUTS.findIndex(s => s.value === statut.value);
                  const isPast = currentIdx >= thisIdx;
                  const isCurrent = statut.value === collab.statut;
                  const Icon = statut.icon;
                  const isLast = index === arr.length - 1;
                  
                  return (
                    <div key={statut.value} className="relative flex gap-4">
                      {!isLast && (
                        <div className={`absolute left-[15px] top-10 w-0.5 h-8 ${isPast ? "bg-green-200" : "bg-gray-100"}`} />
                      )}
                      <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isCurrent ? `${statut.color} text-white shadow-lg` : isPast ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        {isPast && !isCurrent ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <div className={`pb-8 ${isLast ? "pb-0" : ""}`}>
                        <p className={`text-sm font-medium ${isCurrent ? "text-glowup-licorice" : isPast ? "text-gray-600" : "text-gray-400"}`}>
                          {statut.label}
                        </p>
                        {isCurrent && <p className="text-xs text-gray-400 mt-0.5">Étape actuelle</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCompleteMarqueModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-glowup-licorice">Informations manquantes</h3>
                <p className="text-sm text-gray-500">Complétez les infos de {collab?.marque.nom}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Raison sociale *</label>
                <input type="text" value={marqueFormData.raisonSociale} onChange={(e) => setMarqueFormData(prev => ({ ...prev, raisonSociale: e.target.value }))} placeholder="SOCIÉTÉ SAS" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all" />
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
              <button onClick={() => { setShowCompleteMarqueModal(false); setPendingDocType(null); }} className="flex-1 px-6 py-3.5 text-gray-600 bg-gray-100 rounded-xl font-semibold hover:bg-gray-200 transition-colors">Annuler</button>
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
    </div>
  );
}