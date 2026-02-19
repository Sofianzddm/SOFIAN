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
  ChevronRight,
  X,
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
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    tarifs?: Record<string, number | null> | null;
  };
  marque: { id: string; nom: string; secteur: string | null } | null;
  nomMarqueSaisi?: string | null;
  livrables: { id: string; typeContenu: string; quantite: number; prixDemande: number | null; prixSouhaite: number | null; prixFinal: number | null }[];
  validateur: { id: string; prenom: string; nom: string } | null;
  commentaires: { id: string; contenu: string; createdAt: string; user: { id: string; prenom: string; nom: string; role: string } }[];
  collaboration: { id: string; reference: string } | null;
  modifiedSinceReview: boolean;
  lastModifiedAt: string;
  reviewedAt: string | null;
  dateSubmitted: string | null;
}

const STATUTS: Record<string, { label: string; className: string }> = {
  BROUILLON: { label: "Brouillon", className: "bg-slate-100 text-slate-600" },
  EN_ATTENTE: { label: "En attente", className: "bg-amber-500/10 text-amber-600" },
  EN_DISCUSSION: { label: "En discussion", className: "bg-blue-500/10 text-blue-600" },
  VALIDEE: { label: "Validée", className: "bg-emerald-500/10 text-emerald-600" },
  REFUSEE: { label: "Refusée", className: "bg-red-500/10 text-red-600" },
  ANNULEE: { label: "Annulée", className: "bg-slate-100 text-slate-500" },
};

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story", POST: "Post", REEL: "Reel", TIKTOK_VIDEO: "TikTok",
  YOUTUBE_VIDEO: "YouTube", YOUTUBE_SHORT: "Short", EVENT: "Event",
  SHOOTING: "Shooting", AMBASSADEUR: "Ambassadeur", STORY_CONCOURS: "Story Concours",
  POST_CONCOURS: "Post Concours", POST_COMMUN: "Post Commun",
};

const TYPE_TO_TARIF_KEY: Record<string, string> = {
  STORY: "tarifStory", STORY_CONCOURS: "tarifStoryConcours", POST: "tarifPost",
  POST_CONCOURS: "tarifPostConcours", POST_COMMUN: "tarifPostCommun", REEL: "tarifReel",
  TIKTOK_VIDEO: "tarifTiktokVideo", YOUTUBE_VIDEO: "tarifYoutubeVideo", YOUTUBE_SHORT: "tarifYoutubeShort",
  EVENT: "tarifEvent", SHOOTING: "tarifShooting", AMBASSADEUR: "tarifAmbassadeur",
};

function getNotrePrix(typeContenu: string, tarifs: Record<string, number | null> | null | undefined): number | null {
  if (!tarifs) return null;
  const key = TYPE_TO_TARIF_KEY[typeContenu];
  if (key && tarifs[key] != null) return Number(tarifs[key]);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const typeNorm = norm(typeContenu);
  for (const [type, tarifKey] of Object.entries(TYPE_TO_TARIF_KEY)) {
    if (norm(TYPE_LABELS[type] || type) === typeNorm && tarifs[tarifKey] != null) return Number(tarifs[tarifKey]);
  }
  return null;
}

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
  const canEdit = nego?.statut !== "VALIDEE";
  const isOwner = session?.user?.id === nego?.tm.id;

  useEffect(() => {
    if (params.id) fetchNego();
  }, [params.id]);

  useEffect(() => {
    if (nego && canValidate && nego.modifiedSinceReview) marquerVu();
  }, [nego?.id, nego?.modifiedSinceReview]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [nego?.commentaires]);

  const marquerVu = async () => {
    try {
      await fetch(`/api/negociations/${params.id}/marquer-vu`, { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNego = async () => {
    try {
      const res = await fetch(`/api/negociations/${params.id}`);
      if (res.ok) setNego(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer cette négociation ? Cette action est irréversible.")) return;
    try {
      const res = await fetch(`/api/negociations/${params.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/negociations");
      } else {
        const data = await res.json();
        alert(data.error || "Erreur");
      }
    } catch (e) {
      alert("Erreur");
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
      const res = await fetch(`/api/negociations/${params.id}/soumettre`, { method: "POST" });
      if (res.ok) fetchNego();
      else {
        const err = await res.json();
        alert(err.error || "Erreur");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (amount: number | null) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  };

  const statutConfig = nego ? (STATUTS[nego.statut] || { label: nego.statut, className: "bg-slate-100 text-slate-600" }) : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-glowup-rose" />
        <p className="text-sm text-slate-500">Chargement...</p>
      </div>
    );
  }

  if (!nego) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-24 text-center">
        <p className="text-slate-600 font-medium">Négociation non trouvée</p>
        <Link href="/negociations" className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Retour aux négociations
        </Link>
      </div>
    );
  }

  const isDeadlinePassed = nego.dateDeadline && new Date(nego.dateDeadline) < new Date();

  return (
    <div className="space-y-6">
      {/* Header hero */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4 min-w-0">
              <Link href="/negociations" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-sm text-slate-500">{nego.reference}</span>
                  <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${statutConfig?.className}`}>
                    {statutConfig?.label}
                  </span>
                  {nego.source === "INBOUND" && (
                    <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">Inbound</span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {nego.talent.prenom} {nego.talent.nom} × {nego.nomMarqueSaisi || nego.marque?.nom || "—"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Par {nego.tm.prenom} {nego.tm.nom} · {new Date(nego.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <Link
                  href={`/negociations/${nego.id}/edit`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" /> Modifier
                </Link>
              )}
              {canEdit && !nego.collaboration && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alertes */}
      {nego.modifiedSinceReview && canValidate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 ring-1 ring-amber-200/60">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Modifications récentes</p>
              <p className="text-sm text-amber-800 mt-0.5">
                Modifiée le {new Date(nego.lastModifiedAt).toLocaleDateString("fr-FR")} à {new Date(nego.lastModifiedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {nego.statut === "VALIDEE" && nego.collaboration && (
        <Link
          href={`/collaborations/${nego.collaboration.id}`}
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 ring-1 ring-emerald-200/60 hover:bg-emerald-100/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900">Validée</p>
              <p className="text-sm text-emerald-700">Collaboration {nego.collaboration.reference}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-emerald-600" />
        </Link>
      )}

      {nego.statut === "REFUSEE" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 ring-1 ring-red-200/60">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-900">Refusée</p>
              {nego.raisonRefus && <p className="text-sm text-red-700 mt-1">{nego.raisonRefus}</p>}
              {isOwner && (
                <Link
                  href={`/negociations/${nego.id}/edit`}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                >
                  <Pencil className="h-4 w-4" /> Modifier et re-soumettre
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {nego.dateDeadline && isDeadlinePassed && !["VALIDEE", "REFUSEE"].includes(nego.statut) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600" />
          <p className="text-sm font-medium text-amber-800">Deadline dépassée ({new Date(nego.dateDeadline).toLocaleDateString("fr-FR")})</p>
        </div>
      )}

      {/* Actions */}
      {isOwner && nego.statut === "BROUILLON" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-5 ring-1 ring-blue-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="font-medium text-blue-900">En brouillon</p>
              <p className="text-sm text-blue-700 mt-0.5">Soumets cette négociation pour validation</p>
            </div>
            <button
              onClick={handleSoumettre}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Soumettre pour validation
            </button>
          </div>
        </div>
      )}

      {canValidate && ["EN_ATTENTE", "EN_DISCUSSION"].includes(nego.statut) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-4">Actions</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleValidation("valider")}
              disabled={validating}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Valider → Créer collab
            </button>
            <button
              onClick={() => setShowRefusModal(true)}
              disabled={validating}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" /> Refuser
            </button>
          </div>
        </div>
      )}

      {/* Layout 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Partenaires */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Partenaires</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                  href={`/talents/${nego.talent.id}`}
                  className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-glowup-rose/20 to-pink-100 flex items-center justify-center">
                    {nego.talent.photo ? (
                      <img src={nego.talent.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-glowup-rose">
                        {nego.talent.prenom.charAt(0)}{nego.talent.nom.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{nego.talent.prenom} {nego.talent.nom}</p>
                    <p className="text-sm text-slate-500">Talent</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 ml-auto" />
                </Link>
                {nego.marque ? (
                  <Link
                    href={`/marques/${nego.marque.id}`}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                      <Building2 className="h-6 w-6 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{nego.marque.nom}</p>
                      <p className="text-sm text-slate-500">{nego.marque.secteur || "Marque"}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400 ml-auto" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-200">
                      <Building2 className="h-6 w-6 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{nego.nomMarqueSaisi || "—"}</p>
                      <p className="text-sm text-slate-500">Fiche marque à créer après validation</p>
                    </div>
                  </div>
                )}
              </div>
              {(nego.contactMarque || nego.emailContact) && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2">Contact marque</p>
                  <p className="text-sm text-slate-900">{nego.contactMarque || "—"}</p>
                  {nego.emailContact && (
                    <a href={`mailto:${nego.emailContact}`} className="inline-flex items-center gap-2 mt-1 text-sm text-blue-600 hover:underline">
                      <Mail className="h-4 w-4" /> {nego.emailContact}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Livrables */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Livrables</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {nego.livrables.map((l) => {
                const notrePrix = getNotrePrix(l.typeContenu, nego.talent.tarifs);
                return (
                  <div key={l.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="flex items-center gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                        {l.quantite}
                      </span>
                      <span className="font-medium text-slate-900">{TYPE_LABELS[l.typeContenu] || l.typeContenu}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      {notrePrix != null && (
                        <span className="text-slate-500">{formatMoney(notrePrix)}</span>
                      )}
                      <span className="font-medium text-slate-700">{formatMoney(l.prixDemande ?? 0)}</span>
                      {(l.prixSouhaite != null || l.prixFinal != null) && (
                        <span className="font-semibold text-emerald-600">
                          {formatMoney(Number(l.prixFinal ?? l.prixSouhaite ?? 0))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Brief */}
          {nego.brief && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Brief</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{nego.brief}</p>
              </div>
            </div>
          )}

          {/* Discussion */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Discussion</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{nego.commentaires.length}</span>
            </div>
            <div className="max-h-80 overflow-y-auto p-4 space-y-4">
              {nego.commentaires.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Aucun commentaire</p>
              ) : (
                nego.commentaires.map((c) => {
                  const isMe = c.user.id === session?.user?.id;
                  const isHead = c.user.role === "HEAD_OF" || c.user.role === "ADMIN";
                  return (
                    <div key={c.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isHead ? "bg-slate-900 text-white" : isMe ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-600"
                      }`}>
                        {c.user.prenom.charAt(0)}
                      </div>
                      <div className={`max-w-[75%] ${isMe ? "text-right" : ""}`}>
                        <div className={`inline-block rounded-xl px-4 py-2.5 ${
                          isMe ? "bg-slate-900 text-white" : isHead ? "bg-slate-100 text-slate-900" : "bg-slate-50 text-slate-900"
                        }`}>
                          <p className="text-sm">{c.contenu}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{c.user.prenom} · {new Date(c.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={commentsEndRef} />
            </div>
            {!["VALIDEE", "REFUSEE"].includes(nego.statut) && (
              <div className="border-t border-slate-100 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleComment()}
                    placeholder="Écrire un message..."
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <button
                    onClick={handleComment}
                    disabled={commenting || !newComment.trim()}
                    className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {commenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden ring-1 ring-slate-200/60">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Budgets</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Budget marque</p>
                <p className="text-xl font-semibold text-slate-900 tabular-nums">{formatMoney(nego.budgetMarque)}</p>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500">Budget souhaité</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{formatMoney(nego.budgetSouhaite)}</p>
              </div>
              {nego.budgetFinal != null && (
                <div className="pt-4 border-t border-slate-100 rounded-lg bg-emerald-50 p-4 -mx-2 -mb-2">
                  <p className="text-xs font-medium text-emerald-700">Budget final</p>
                  <p className="text-xl font-bold text-emerald-700 tabular-nums">{formatMoney(nego.budgetFinal)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 ring-1 ring-slate-200/60">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-4">Infos</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500">Source</p>
                <p className={`text-sm font-medium ${nego.source === "INBOUND" ? "text-blue-600" : "text-emerald-600"}`}>
                  {nego.source === "INBOUND" ? "Inbound" : "Outbound"}
                </p>
              </div>
              {nego.dateDeadline && (
                <div>
                  <p className="text-xs text-slate-500">Deadline</p>
                  <p className={`text-sm font-medium ${isDeadlinePassed ? "text-red-600" : "text-slate-900"}`}>
                    {new Date(nego.dateDeadline).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              )}
              {nego.validateur && (
                <div>
                  <p className="text-xs text-slate-500">Validé par</p>
                  <p className="text-sm font-medium text-slate-900">{nego.validateur.prenom} {nego.validateur.nom}</p>
                  {nego.dateValidation && (
                    <p className="text-xs text-slate-500">{new Date(nego.dateValidation).toLocaleDateString("fr-FR")}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Refus */}
      {showRefusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Refuser la négociation</h3>
              <button onClick={() => setShowRefusModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">Raison du refus (optionnel)</p>
              <textarea
                value={raisonRefus}
                onChange={(e) => setRaisonRefus(e.target.value)}
                placeholder="Ex: Budget trop bas, délais incompatibles..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button
                onClick={() => setShowRefusModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={() => handleValidation("refuser")}
                disabled={validating}
                className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
