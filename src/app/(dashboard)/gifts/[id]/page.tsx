"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Gift, ArrowLeft, Loader2, AlertCircle, User, Building2,
  Package, Calendar, MapPin, DollarSign, MessageSquare, Send,
  Clock, CheckCircle, XCircle, Truck, TrendingUp, Edit, Save,
  X, AlertTriangle, Phone, Mail, FileText, ArrowRight,
} from "lucide-react";

export default function GiftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const [demande, setDemande] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});

  const user = session?.user as { id?: string; role?: string };
  const isAM = user?.role === "CM" || user?.role === "ADMIN";
  const isTM = user?.role === "TM";

  useEffect(() => {
    fetchDemande();
  }, [params.id]);

  const fetchDemande = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/gifts/${params.id}`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setDemande(data);
      setEditData({
        statut: data.statut,
        priorite: data.priorite,
        numeroSuivi: data.numeroSuivi || "",
        notesInternes: data.notesInternes || "",
      });
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement de la demande");
    } finally {
      setLoading(false);
    }
  };

  const handlePrendreEnCharge = async () => {
    try {
      const res = await fetch(`/api/gifts/${params.id}/prendre-en-charge`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erreur");
      await fetchDemande();
    } catch (err) {
      alert("Erreur lors de la prise en charge");
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentaire.trim()) return;

    try {
      setSending(true);
      const res = await fetch(`/api/gifts/${params.id}/commentaires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: commentaire, interne: false }),
      });

      if (!res.ok) throw new Error("Erreur");
      setCommentaire("");
      await fetchDemande();
    } catch (err) {
      alert("Erreur lors de l'envoi du commentaire");
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatut = async (newStatut: string) => {
    try {
      const res = await fetch(`/api/gifts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: newStatut }),
      });

      if (!res.ok) throw new Error("Erreur");
      await fetchDemande();
    } catch (err) {
      alert("Erreur lors de la mise à jour du statut");
    }
  };

  const handleSaveEdit = async () => {
    try {
      const res = await fetch(`/api/gifts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });

      if (!res.ok) throw new Error("Erreur");
      await fetchDemande();
      setEditing(false);
    } catch (err) {
      alert("Erreur lors de la sauvegarde");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error || !demande) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-glowup-licorice mb-2">{error}</h2>
        <Link
          href="/gifts"
          className="inline-flex items-center gap-2 px-6 py-3 bg-glowup-rose text-white rounded-xl font-semibold hover:bg-glowup-rose-dark transition-colors mt-4"
        >
          Retour aux demandes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-pink-600 rounded-2xl p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative">
          <Link
            href="/gifts"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux demandes
          </Link>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                <Gift className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-extrabold">{demande.reference}</h1>
                  <StatutBadge statut={demande.statut} large />
                </div>
                <p className="text-white/80">
                  Créée le {new Date(demande.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
            <PrioriteBadge priorite={demande.priorite} large />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workflow - Account Manager uniquement */}
          {isAM && demande.statut !== "ANNULE" && demande.statut !== "REFUSE" && demande.statut !== "RECU" && (
            <WorkflowPanel demande={demande} onUpdate={handleUpdateStatut} onPrendreEnCharge={handlePrendreEnCharge} />
          )}

          {/* Détails de la demande */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-glowup-licorice flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                Détails de la demande
              </h2>
              {(isAM || (isTM && demande.tmId === user?.id)) && demande.statut !== "ANNULE" && (
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors font-semibold"
                >
                  {editing ? (
                    <>
                      <X className="w-4 h-4" />
                      Annuler
                    </>
                  ) : (
                    <>
                      <Edit className="w-4 h-4" />
                      Modifier
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-6">
              {/* Type */}
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-2">Type de Gift</p>
                <span className="inline-flex px-4 py-2 bg-purple-100 text-purple-700 rounded-xl font-bold">
                  {demande.typeGift}
                </span>
              </div>

              {/* Description */}
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-2">Description</p>
                <p className="text-gray-700 whitespace-pre-wrap">{demande.description}</p>
              </div>

              {/* Justification */}
              {demande.justification && (
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-2">Justification</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{demande.justification}</p>
                </div>
              )}

              {/* Valeur estimée */}
              {demande.valeurEstimee && (
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-2">Valeur estimée</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(demande.valeurEstimee)}
                  </p>
                </div>
              )}

              {/* Date souhaitée */}
              {demande.datesouhaitee && (
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-2">Date souhaitée</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <p className="text-gray-700 font-semibold">
                      {new Date(demande.datesouhaitee).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
              )}

              {/* Adresse */}
              {demande.adresseLivraison && (
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-2">Adresse de livraison</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                    <p className="text-gray-700 whitespace-pre-wrap">{demande.adresseLivraison}</p>
                  </div>
                </div>
              )}

              {/* Édition - Notes internes et numéro de suivi (AM uniquement) */}
              {isAM && editing && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Numéro de suivi
                    </label>
                    <input
                      type="text"
                      value={editData.numeroSuivi}
                      onChange={(e) => setEditData({ ...editData, numeroSuivi: e.target.value })}
                      placeholder="Ex: FR123456789"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Notes internes (visibles uniquement par l'équipe)
                    </label>
                    <textarea
                      value={editData.notesInternes}
                      onChange={(e) => setEditData({ ...editData, notesInternes: e.target.value })}
                      rows={4}
                      placeholder="Notes privées pour le suivi..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                    />
                  </div>

                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                  >
                    <Save className="w-5 h-5" />
                    Enregistrer les modifications
                  </button>
                </>
              )}

              {/* Notes internes (lecture seule si pas en édition) */}
              {isAM && !editing && demande.notesInternes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Notes internes
                  </p>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">{demande.notesInternes}</p>
                </div>
              )}

              {/* Numéro de suivi */}
              {demande.numeroSuivi && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Numéro de suivi
                  </p>
                  <p className="text-lg font-bold text-gray-900">{demande.numeroSuivi}</p>
                </div>
              )}
            </div>
          </div>

          {/* Commentaires */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-xl font-bold text-glowup-licorice mb-6 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              Discussion ({demande.commentaires?.length || 0})
            </h2>

            {/* Liste des commentaires */}
            <div className="space-y-4 mb-6">
              {demande.commentaires && demande.commentaires.length > 0 ? (
                demande.commentaires.map((comment: any) => (
                  <CommentCard key={comment.id} comment={comment} />
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">Aucun commentaire pour le moment</p>
              )}
            </div>

            {/* Formulaire de commentaire */}
            {demande.statut !== "ANNULE" && (
              <form onSubmit={handleSendComment} className="border-t border-gray-100 pt-6">
                <div className="flex gap-3">
                  <textarea
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder="Ajouter un commentaire..."
                    rows={3}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !commentaire.trim()}
                    className="self-end px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Talent */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-purple-600" />
              Talent
            </h3>
            <div className="flex items-center gap-3 mb-4">
              {demande.talent.photo ? (
                <img
                  src={demande.talent.photo}
                  alt={`${demande.talent.prenom} ${demande.talent.nom}`}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                  {demande.talent.prenom[0]}{demande.talent.nom[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/talents/${demande.talent.id}`}
                  className="font-bold text-glowup-licorice hover:text-purple-600 transition-colors truncate block"
                >
                  {demande.talent.prenom} {demande.talent.nom}
                </Link>
                {demande.talent.instagram && (
                  <p className="text-sm text-gray-500">@{demande.talent.instagram}</p>
                )}
              </div>
            </div>
            {demande.talent.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Mail className="w-4 h-4" />
                <a href={`mailto:${demande.talent.email}`} className="hover:text-purple-600">
                  {demande.talent.email}
                </a>
              </div>
            )}
            {demande.talent.telephone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <a href={`tel:${demande.talent.telephone}`} className="hover:text-purple-600">
                  {demande.talent.telephone}
                </a>
              </div>
            )}
          </div>

          {/* TM */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Talent Manager
            </h3>
            <p className="font-bold text-glowup-licorice mb-1">
              {demande.tm.prenom} {demande.tm.nom}
            </p>
            <div className="space-y-2 mt-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <a href={`mailto:${demande.tm.email}`} className="hover:text-blue-600">
                  {demande.tm.email}
                </a>
              </div>
              {demande.tm.telephone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <a href={`tel:${demande.tm.telephone}`} className="hover:text-blue-600">
                    {demande.tm.telephone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Account Manager */}
          {demande.accountManager && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                Account Manager
              </h3>
              <p className="font-bold text-glowup-licorice mb-1">
                {demande.accountManager.prenom} {demande.accountManager.nom}
              </p>
              <div className="space-y-2 mt-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${demande.accountManager.email}`} className="hover:text-emerald-600">
                    {demande.accountManager.email}
                  </a>
                </div>
                {demande.accountManager.telephone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${demande.accountManager.telephone}`} className="hover:text-emerald-600">
                      {demande.accountManager.telephone}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Marque */}
          {demande.marque && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-600" />
                Marque
              </h3>
              <Link
                href={`/marques/${demande.marque.id}`}
                className="font-bold text-glowup-licorice hover:text-orange-600 transition-colors block mb-3"
              >
                {demande.marque.nom}
              </Link>
              {demande.marque.contacts && demande.marque.contacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Contacts</p>
                  {demande.marque.contacts.slice(0, 2).map((contact: any) => (
                    <div key={contact.id} className="text-sm">
                      <p className="font-medium text-gray-700">
                        {contact.prenom} {contact.nom}
                      </p>
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="text-gray-500 hover:text-orange-600 text-xs">
                          {contact.email}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              Timeline
            </h3>
            <div className="space-y-3">
              <TimelineItem
                label="Créée"
                date={demande.createdAt}
                icon={<Package className="w-4 h-4" />}
                active
              />
              {demande.datePriseEnCharge && (
                <TimelineItem
                  label="Prise en charge"
                  date={demande.datePriseEnCharge}
                  icon={<User className="w-4 h-4" />}
                  active
                />
              )}
              {demande.dateContactMarque && (
                <TimelineItem
                  label="Marque contactée"
                  date={demande.dateContactMarque}
                  icon={<Building2 className="w-4 h-4" />}
                  active
                />
              )}
              {demande.dateReponseMarque && (
                <TimelineItem
                  label="Réponse marque"
                  date={demande.dateReponseMarque}
                  icon={<MessageSquare className="w-4 h-4" />}
                  active
                />
              )}
              {demande.dateEnvoi && (
                <TimelineItem
                  label="Envoyé"
                  date={demande.dateEnvoi}
                  icon={<Truck className="w-4 h-4" />}
                  active
                />
              )}
              {demande.dateReception && (
                <TimelineItem
                  label="Reçu"
                  date={demande.dateReception}
                  icon={<CheckCircle className="w-4 h-4" />}
                  active
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Composants utilitaires
function WorkflowPanel({ demande, onUpdate, onPrendreEnCharge }: any) {
  const workflow = getWorkflowSteps(demande.statut);
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-purple-200 p-8">
      <h2 className="text-xl font-bold text-glowup-licorice mb-6 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-purple-600" />
        Workflow de suivi
      </h2>

      {/* Si pas encore pris en charge */}
      {!demande.accountManagerId && demande.statut === "EN_ATTENTE" && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-bold text-yellow-800 mb-2">Demande en attente de prise en charge</h3>
              <p className="text-yellow-700 text-sm mb-4">
                Cette demande n'a pas encore été attribuée à un Account Manager. Prenez-la en charge pour commencer le traitement.
              </p>
              <button
                onClick={onPrendreEnCharge}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
              >
                <User className="w-5 h-5" />
                Prendre en charge cette demande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Étapes du workflow */}
      <div className="space-y-4">
        {workflow.steps.map((step: any, index: number) => (
          <WorkflowStep
            key={step.statut}
            step={step}
            isActive={step.statut === demande.statut}
            isCompleted={workflow.completedSteps.includes(step.statut)}
            onSelect={() => onUpdate(step.statut)}
            canSelect={demande.accountManagerId !== null}
          />
        ))}
      </div>
    </div>
  );
}

function WorkflowStep({ step, isActive, isCompleted, onSelect, canSelect }: any) {
  const Icon = step.icon;
  
  return (
    <div
      onClick={canSelect ? onSelect : undefined}
      className={`group flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
        isActive
          ? "bg-purple-50 border-purple-500 shadow-md"
          : isCompleted
          ? "bg-emerald-50 border-emerald-300"
          : canSelect
          ? "border-gray-200 hover:border-purple-300 hover:shadow-md cursor-pointer"
          : "border-gray-200 opacity-50 cursor-not-allowed"
      }`}
    >
      <div
        className={`p-3 rounded-xl ${
          isActive
            ? "bg-purple-500 text-white"
            : isCompleted
            ? "bg-emerald-500 text-white"
            : "bg-gray-100 text-gray-400 group-hover:bg-purple-100 group-hover:text-purple-600"
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className={`font-bold ${isActive ? "text-purple-700" : isCompleted ? "text-emerald-700" : "text-gray-700"}`}>
          {step.label}
        </p>
        <p className="text-sm text-gray-500">{step.description}</p>
      </div>
      {isActive && (
        <div className="px-3 py-1 bg-purple-500 text-white rounded-lg text-xs font-bold">
          EN COURS
        </div>
      )}
      {isCompleted && !isActive && (
        <CheckCircle className="w-6 h-6 text-emerald-500" />
      )}
      {!isActive && !isCompleted && canSelect && (
        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
      )}
    </div>
  );
}

function getWorkflowSteps(currentStatut: string) {
  const allSteps = [
    { statut: "EN_ATTENTE", label: "En attente", description: "Demande soumise, en attente de prise en charge", icon: Clock },
    { statut: "EN_COURS", label: "En cours de traitement", description: "Account Manager traite la demande", icon: TrendingUp },
    { statut: "ATTENTE_MARQUE", label: "Marque contactée", description: "En attente de la réponse de la marque", icon: Building2 },
    { statut: "ACCEPTE", label: "Accepté par la marque", description: "La marque accepte d'envoyer le gift", icon: CheckCircle },
    { statut: "ENVOYE", label: "Gift envoyé", description: "Le gift a été expédié au talent", icon: Truck },
    { statut: "RECU", label: "Gift reçu", description: "Le talent a reçu le gift", icon: Package },
  ];

  const currentIndex = allSteps.findIndex((s) => s.statut === currentStatut);
  const completedSteps = allSteps.slice(0, currentIndex).map((s) => s.statut);

  return {
    steps: allSteps,
    completedSteps,
  };
}

function CommentCard({ comment }: any) {
  const isSystem = comment.auteur.role === "CM" || comment.auteur.role === "ADMIN";
  
  return (
    <div className={`p-4 rounded-xl ${isSystem ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${
          isSystem ? "bg-gradient-to-br from-blue-500 to-indigo-600" : "bg-gradient-to-br from-gray-400 to-gray-600"
        }`}>
          {comment.auteur.prenom[0]}{comment.auteur.nom[0]}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-glowup-licorice">
              {comment.auteur.prenom} {comment.auteur.nom}
            </p>
            {isSystem && (
              <span className="px-2 py-0.5 bg-blue-200 text-blue-700 rounded text-xs font-bold">
                Account Manager
              </span>
            )}
            <span className="text-xs text-gray-500">
              {new Date(comment.createdAt).toLocaleDateString("fr-FR", { 
                day: "numeric", 
                month: "short", 
                hour: "2-digit", 
                minute: "2-digit" 
              })}
            </span>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap">{comment.contenu}</p>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ label, date, icon, active }: any) {
  return (
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-lg ${active ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-400"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${active ? "text-glowup-licorice" : "text-gray-500"}`}>
          {label}
        </p>
        <p className="text-xs text-gray-500">
          {new Date(date).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function StatutBadge({ statut, large }: { statut: string; large?: boolean }) {
  const config: Record<string, { label: string; color: string }> = {
    BROUILLON: { label: "Brouillon", color: "bg-gray-100 text-gray-600" },
    EN_ATTENTE: { label: "En attente", color: "bg-yellow-100 text-yellow-700" },
    EN_COURS: { label: "En cours", color: "bg-blue-100 text-blue-700" },
    ATTENTE_MARQUE: { label: "Attente marque", color: "bg-purple-100 text-purple-700" },
    ACCEPTE: { label: "Accepté", color: "bg-emerald-100 text-emerald-700" },
    REFUSE: { label: "Refusé", color: "bg-red-100 text-red-700" },
    ENVOYE: { label: "Envoyé", color: "bg-indigo-100 text-indigo-700" },
    RECU: { label: "Reçu", color: "bg-green-100 text-green-700" },
    ANNULE: { label: "Annulé", color: "bg-gray-100 text-gray-600" },
  };
  const c = config[statut] || config.EN_ATTENTE;
  return (
    <span className={`inline-flex items-center gap-1.5 ${large ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"} rounded-xl font-bold ${c.color}`}>
      {c.label}
    </span>
  );
}

function PrioriteBadge({ priorite, large }: { priorite: string; large?: boolean }) {
  const config: Record<string, { label: string; color: string }> = {
    BASSE: { label: "Basse", color: "bg-gray-100 text-gray-600" },
    NORMALE: { label: "Normale", color: "bg-blue-100 text-blue-600" },
    HAUTE: { label: "Haute", color: "bg-orange-100 text-orange-600" },
    URGENTE: { label: "Urgente", color: "bg-red-100 text-red-600" },
  };
  const c = config[priorite] || config.NORMALE;
  return (
    <span className={`inline-flex items-center ${large ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} rounded-xl font-bold ${c.color}`}>
      {c.label}
    </span>
  );
}
