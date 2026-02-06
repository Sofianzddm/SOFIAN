"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Send,
  Mail,
  Package,
  ExternalLink,
  ArrowRight,
} from "lucide-react";

interface NegoDetail {
  id: string;
  reference: string;
  source: string;
  brief: string | null;
  budgetMarque: number | null;
  budgetSouhaite: number | null;
  budgetFinal: number | null;
  contactMarque: string | null;
  emailContact: string | null;
  dateDeadline: string | null;
  statut: string;
  raisonRefus: string | null;
  dateValidation: string | null;
  createdAt: string;
  tm: { id: string; prenom: string; nom: string; email: string };
  talent: { id: string; prenom: string; nom: string; photo: string | null };
  marque: { id: string; nom: string; secteur: string | null };
  livrables: { id: string; typeContenu: string; quantite: number; prixDemande: number | null; prixSouhaite: number | null; prixFinal: number | null }[];
  validateur: { id: string; prenom: string; nom: string } | null;
  commentaires: { id: string; contenu: string; createdAt: string; user: { id: string; prenom: string; nom: string; role: string } }[];
  collaboration: { id: string; reference: string } | null;
  modifiedSinceReview: boolean;
  lastModifiedAt: string;
  reviewedAt: string | null;
  dateSubmitted: string | null;
}

const STATUTS = [
  { value: "BROUILLON", label: "Brouillon", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock },
  { value: "EN_ATTENTE", label: "En attente", color: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertCircle },
  { value: "EN_DISCUSSION", label: "En discussion", color: "bg-blue-50 text-blue-700 border-blue-200", icon: MessageSquare },
  { value: "VALIDEE", label: "Validée", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  { value: "REFUSEE", label: "Refusée", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  { value: "ANNULEE", label: "Annulée", color: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
];

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story", POST: "Post", REEL: "Reel", TIKTOK_VIDEO: "TikTok",
  YOUTUBE_VIDEO: "YouTube", YOUTUBE_SHORT: "Short", EVENT: "Event",
  SHOOTING: "Shooting", AMBASSADEUR: "Ambassadeur", STORY_CONCOURS: "Story Concours",
  POST_CONCOURS: "Post Concours", POST_COMMUN: "Post Commun",
};

export default function NegociationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [nego, setNego] = useState<NegoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commenting, setCommenting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showRefusModal, setShowRefusModal] = useState(false);
  const [raisonRefus, setRaisonRefus] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = session?.user?.role === "ADMIN";
  const isHeadOf = session?.user?.role === "HEAD_OF";
  const canValidate = isAdmin || isHeadOf;
  const canEdit = nego?.statut !== "VALIDEE" && nego?.statut !== "REFUSEE";
  const isOwner = session?.user?.id === nego?.tm.id;

  useEffect(() => {
    if (params.id) {
      fetchNego();
    }
  }, [params.id]);

  // Marquer comme vu si HEAD_OF et modifiée
  useEffect(() => {
    if (nego && canValidate && nego.modifiedSinceReview) {
      marquerVu();
    }
  }, [nego?.id, nego?.modifiedSinceReview]);

  const marquerVu = async () => {
    try {
      await fetch(`/api/negociations/${params.id}/marquer-vu`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Erreur marquer-vu:", error);
    }
  };

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [nego?.commentaires]);

  const fetchNego = async () => {
    try {
      const res = await fetch(`/api/negociations/${params.id}`);
      if (res.ok) setNego(await res.json());
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmMessage = `⚠️ ATTENTION : Êtes-vous sûr de vouloir supprimer cette négociation ?\n\nCette action est irréversible et supprimera :\n- La négociation\n- Tous les livrables associés\n- Tous les commentaires\n\nVoulez-vous continuer ?`;
    
    if (!confirm(confirmMessage)) return;

    try {
      const res = await fetch(`/api/negociations/${params.id}`, { method: "DELETE" });
      
      if (!res.ok) {
        const data = await res.json();
        alert(`❌ Erreur : ${data.error || "Impossible de supprimer cette négociation"}`);
        return;
      }

      alert("✅ Négociation supprimée avec succès");
      router.push("/negociations");
    } catch (error) {
      console.error("Erreur suppression:", error);
      alert("❌ Erreur lors de la suppression. Veuillez réessayer.");
    }
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    setCommenting(true);
    try {
      const res = await fetch(`/api/negociations/${params.id}/commentaires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: newComment }),
      });
      if (res.ok) {
        setNewComment("");
        fetchNego();
      }
    } finally {
      setCommenting(false);
    }
  };

  const handleValidation = async (action: "valider" | "refuser") => {
    setValidating(true);
    try {
      const res = await fetch(`/api/negociations/${params.id}/valider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, raisonRefus: action === "refuser" ? raisonRefus : null }),
      });
      if (res.ok) {
        setShowRefusModal(false);
        fetchNego();
      }
    } finally {
      setValidating(false);
    }
  };

  const handleSoumettre = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/negociations/${params.id}/soumettre`, {
        method: "POST",
      });
      if (res.ok) {
        fetchNego();
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la soumission");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  };

  const getStatutInfo = (statut: string) => STATUTS.find((s) => s.value === statut) || STATUTS[0];

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!nego) return <div className="text-center py-12"><p className="text-gray-500">Non trouvée</p></div>;

  const statutInfo = getStatutInfo(nego.statut);
  const isDeadlinePassed = nego.dateDeadline && new Date(nego.dateDeadline) < new Date();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/negociations" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-glowup-licorice font-mono">{nego.reference}</h1>
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${statutInfo.color}`}>
                <statutInfo.icon className="w-3 h-3" />
                {statutInfo.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Par {nego.tm.prenom} {nego.tm.nom} • {new Date(nego.createdAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href={`/negociations/${nego.id}/edit`} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
              <Pencil className="w-4 h-4" />
            </Link>
          )}
          {canEdit && (
            <button onClick={handleDelete} className="px-3 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Badge Modification Récente */}
      {nego.modifiedSinceReview && canValidate && (
        <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">
                Modifications récentes
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Cette négociation a été modifiée depuis votre dernière consultation
                <span className="text-amber-600 font-medium ml-1">
                  (le {new Date(nego.lastModifiedAt).toLocaleDateString("fr-FR")} à {new Date(nego.lastModifiedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Alerte Validée avec lien collab */}
      {nego.statut === "VALIDEE" && nego.collaboration && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-700">Négociation validée !</p>
              <p className="text-sm text-green-600">Convertie en collaboration {nego.collaboration.reference}</p>
            </div>
          </div>
          <Link href={`/collaborations/${nego.collaboration.id}`} className="flex items-center gap-1 text-sm text-green-700 hover:underline">
            Voir la collab <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Alerte Refusée */}
      {nego.statut === "REFUSEE" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500" />
          <div>
            <p className="font-medium text-red-700">Négociation refusée</p>
            {nego.raisonRefus && <p className="text-sm text-red-600 mt-1">{nego.raisonRefus}</p>}
          </div>
        </div>
      )}

      {/* Deadline warning */}
      {nego.dateDeadline && isDeadlinePassed && nego.statut !== "VALIDEE" && nego.statut !== "REFUSEE" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-600" />
          <p className="text-sm text-amber-700 font-medium">
            ⚠️ Deadline dépassée ({new Date(nego.dateDeadline).toLocaleDateString("fr-FR")})
          </p>
        </div>
      )}

      {/* Actions soumission (TM propriétaire) */}
      {isOwner && nego.statut === "BROUILLON" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs font-medium text-blue-700 uppercase mb-3">Cette négociation est en brouillon</p>
          <button
            onClick={handleSoumettre}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white rounded-lg text-sm font-medium hover:bg-glowup-licorice/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Soumettre pour validation
          </button>
        </div>
      )}

      {/* Actions validation (Head Of / Admin) */}
      {canValidate && ["EN_ATTENTE", "EN_DISCUSSION"].includes(nego.statut) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">Actions Head Of</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleValidation("valider")}
              disabled={validating}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Valider → Créer collab
            </button>
            <button
              onClick={() => setShowRefusModal(true)}
              disabled={validating}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Refuser
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Main */}
        <div className="col-span-2 space-y-6">
          {/* Partenaires */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4">Partenaires</h3>
            <div className="grid grid-cols-2 gap-4">
              <Link href={`/talents/${nego.talent.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div className="w-10 h-10 rounded-full bg-glowup-lace flex items-center justify-center">
                  <span className="text-sm font-semibold text-glowup-rose">{nego.talent.prenom.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-glowup-licorice">{nego.talent.prenom} {nego.talent.nom}</p>
                  <p className="text-xs text-gray-500">Talent</p>
                </div>
              </Link>
              <Link href={`/marques/${nego.marque.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-glowup-licorice">{nego.marque.nom}</p>
                  <p className="text-xs text-gray-500">{nego.marque.secteur || "Marque"}</p>
                </div>
              </Link>
            </div>
            {(nego.contactMarque || nego.emailContact) && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Contact marque</p>
                <p className="text-sm text-glowup-licorice">{nego.contactMarque}</p>
                {nego.emailContact && (
                  <a href={`mailto:${nego.emailContact}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                    <Mail className="w-3 h-3" /> {nego.emailContact}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Livrables */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" /> Livrables ({nego.livrables.length})
            </h3>
            <div className="space-y-2">
              {nego.livrables.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-glowup-lace rounded text-xs font-semibold text-glowup-licorice flex items-center justify-center">
                      {l.quantite}
                    </span>
                    <span className="text-sm font-medium text-glowup-licorice">
                      {TYPE_LABELS[l.typeContenu] || l.typeContenu}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <p className="text-gray-500">{formatMoney(l.prixDemande)}</p>
                      <p className="text-xs text-gray-400">Marque</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{formatMoney(l.prixSouhaite)}</p>
                      <p className="text-xs text-gray-400">Souhaité</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brief */}
          {nego.brief && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Brief / Contexte</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{nego.brief}</p>
            </div>
          )}

          {/* Commentaires */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Discussion ({nego.commentaires.length})
              </h3>
            </div>
            
            <div className="max-h-80 overflow-y-auto p-4 space-y-3">
              {nego.commentaires.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucun commentaire</p>
              ) : (
                nego.commentaires.map((c) => (
                  <div key={c.id} className={`flex gap-3 ${c.user.id === session?.user?.id ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                      c.user.role === "HEAD_OF" || c.user.role === "ADMIN" 
                        ? "bg-purple-100 text-purple-700" 
                        : "bg-gray-200 text-gray-600"
                    }`}>
                      {c.user.prenom.charAt(0)}
                    </div>
                    <div className={`max-w-[70%] ${c.user.id === session?.user?.id ? "text-right" : ""}`}>
                      <div className={`inline-block px-3 py-2 rounded-lg ${
                        c.user.id === session?.user?.id 
                          ? "bg-glowup-licorice text-white" 
                          : c.user.role === "HEAD_OF" || c.user.role === "ADMIN"
                            ? "bg-purple-50 text-gray-800"
                            : "bg-gray-100 text-gray-800"
                      }`}>
                        <p className="text-sm">{c.contenu}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {c.user.prenom} • {new Date(c.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Input commentaire */}
            {nego.statut !== "VALIDEE" && nego.statut !== "REFUSEE" && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleComment()}
                    placeholder="Votre message..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-licorice"
                  />
                  <button
                    onClick={handleComment}
                    disabled={commenting || !newComment.trim()}
                    className="px-3 py-2 bg-glowup-licorice text-white rounded-lg disabled:opacity-50"
                  >
                    {commenting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Budgets */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Budgets</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500">Budget marque</p>
                <p className="text-lg font-semibold text-gray-600">{formatMoney(nego.budgetMarque)}</p>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">Budget souhaité</p>
                <p className="text-xl font-bold text-green-600">{formatMoney(nego.budgetSouhaite)}</p>
              </div>
              {nego.budgetFinal && (
                <div className="pt-3 border-t border-gray-100 bg-green-50 -mx-4 -mb-4 p-4">
                  <p className="text-xs text-gray-500">Budget final</p>
                  <p className="text-xl font-bold text-green-700">{formatMoney(nego.budgetFinal)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Infos */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-500">Source</p>
              <span className={`inline-flex text-sm font-medium ${nego.source === "INBOUND" ? "text-blue-600" : "text-green-600"}`}>
                {nego.source === "INBOUND" ? "📥 Inbound" : "📤 Outbound"}
              </span>
            </div>
            {nego.dateDeadline && (
              <div>
                <p className="text-xs text-gray-500">Deadline</p>
                <p className={`text-sm font-medium ${isDeadlinePassed ? "text-red-600" : "text-glowup-licorice"}`}>
                  {new Date(nego.dateDeadline).toLocaleDateString("fr-FR")}
                </p>
              </div>
            )}
            {nego.validateur && (
              <div>
                <p className="text-xs text-gray-500">Validé par</p>
                <p className="text-sm font-medium text-glowup-licorice">{nego.validateur.prenom} {nego.validateur.nom}</p>
                <p className="text-xs text-gray-400">{nego.dateValidation && new Date(nego.dateValidation).toLocaleDateString("fr-FR")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Refus */}
      {showRefusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-glowup-licorice mb-2">Refuser la négociation</h3>
            <p className="text-sm text-gray-500 mb-4">Indiquez la raison du refus (optionnel)</p>
            <textarea
              value={raisonRefus}
              onChange={(e) => setRaisonRefus(e.target.value)}
              placeholder="Ex: Budget trop bas, délais incompatibles..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRefusModal(false)} className="px-4 py-2 text-gray-600 text-sm">Annuler</button>
              <button
                onClick={() => handleValidation("refuser")}
                disabled={validating}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 disabled:opacity-50"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
