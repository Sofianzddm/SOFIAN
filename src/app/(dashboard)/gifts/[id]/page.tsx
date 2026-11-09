"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  User,
  Building2,
  Package,
  MessageSquare,
  Send,
  Clock,
  CheckCircle,
  Truck,
  TrendingUp,
  Edit,
  Save,
  X,
  AlertTriangle,
  Mail,
  FileText,
  Plus,
  Ban,
  ScanSearch,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  MentionTextarea,
  type MentionableUser,
  renderCommentWithMentions,
} from "@/components/MentionTextarea";
import { GiftContactWizard } from "@/components/gifts/GiftContactWizard";
import { businessDaysAfter } from "@/lib/business-days";
import { GIFT_RELANCE_BUSINESS_DAYS } from "@/lib/gifts/gift-relance-config";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const TYPE_LABELS: Record<string, string> = {
  PRODUIT: "Produit",
  EXPERIENCE: "Expérience",
  SERVICE: "Service",
  HOTEL: "Hôtel",
  AUTRE: "Autre",
};

const PRIORITE_LABEL: Record<string, string> = {
  BASSE: "Basse",
  NORMALE: "Normale",
  HAUTE: "Haute",
  URGENTE: "Urgente",
};

const PRIORITE_CLASS: Record<string, string> = {
  BASSE: "text-zinc-600 bg-zinc-50 border-zinc-200",
  NORMALE: "text-blue-700 bg-blue-50 border-blue-200",
  HAUTE: "text-orange-700 bg-orange-50 border-orange-200",
  URGENTE: "text-red-700 bg-red-50 border-red-200",
};

const STATUT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  BROUILLON: { label: "Brouillon", color: "#52525b", bg: "#f4f4f5" },
  EN_ATTENTE: { label: "En attente", color: "#a16207", bg: "#fef9c3" },
  EN_COURS: { label: "En cours", color: "#1d4ed8", bg: "#dbeafe" },
  ATTENTE_MARQUE: { label: "Attente marque", color: "#6d28d9", bg: "#f5f3ff" },
  ACCEPTE: { label: "Accepté", color: "#047857", bg: "#d1fae5" },
  REFUSE: { label: "Refusé", color: "#b91c1c", bg: "#fee2e2" },
  ENVOYE: { label: "Envoyé", color: "#4338ca", bg: "#e0e7ff" },
  RECU: { label: "Reçu", color: "#15803d", bg: "#dcfce7" },
  ANNULE: { label: "Annulé", color: "#52525b", bg: "#f4f4f5" },
};

const CONTREPARTIE_LABELS: Record<string, string> = {
  STORY: "Story",
  POST_FEED: "Post feed",
  REEL_TIKTOK: "Reel / TikTok",
  MENTION_STORY: "Mention story",
  CHOIX_TALENT: "Au choix du talent",
};

const inputClass =
  "w-full h-[38px] rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15";
const textareaClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15 resize-none";
const cardClass =
  "rounded-xl border border-zinc-200 bg-white shadow-sm";

function formatDate(
  date: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("fr-FR", opts || {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLong(date: string | Date | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDayShort(date: string | Date | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

function giftRelanceDueAt(contactedAt: string | Date) {
  return businessDaysAfter(
    new Date(contactedAt),
    GIFT_RELANCE_BUSINESS_DAYS
  );
}

function initials(prenom?: string, nom?: string) {
  return `${prenom?.[0] || ""}${nom?.[0] || ""}`.toUpperCase() || "?";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 overflow-hidden">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="min-w-0 break-words text-sm leading-relaxed text-zinc-800 [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

function EmptyVal() {
  return <span className="text-zinc-400">Non renseigné</span>;
}

export default function GiftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const [demande, setDemande] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "brands">("chat");
  const [enriching, setEnriching] = useState(false);
  const [enrichFlash, setEnrichFlash] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [marqueQuery, setMarqueQuery] = useState("");
  const [marqueSuggestions, setMarqueSuggestions] = useState<
    Array<{
      id: string;
      nom: string;
      exactMatch?: boolean;
      matchedAlias?: string | null;
    }>
  >([]);
  const [searchingMarques, setSearchingMarques] = useState(false);
  const [showMarqueSuggestions, setShowMarqueSuggestions] = useState(false);
  const [addingMarque, setAddingMarque] = useState(false);
  const [contactWizardOpen, setContactWizardOpen] = useState(false);
  const [marqueActionBusy, setMarqueActionBusy] = useState<string | null>(null);

  const user = session?.user as { id?: string; role?: string };
  const isAM =
    user?.role === "CM" ||
    user?.role === "ASSISTANTE_TM" ||
    user?.role === "ADMIN";
  const isTM = user?.role === "TM";
  const isTmSurDemande =
    !!user?.id &&
    (demande?.tmId === user.id ||
      demande?.talent?.managerId === user.id ||
      (demande?.talent?.delegations ?? []).some(
        (d: { tmRelaiId?: string; actif?: boolean }) =>
          d.tmRelaiId === user.id && d.actif !== false
      ));
  const canCancel =
    demande &&
    demande.statut !== "ANNULE" &&
    !demande.archivedAt &&
    (user?.role === "ADMIN" || (isTM && isTmSurDemande));
  const canArchive = !!demande && isAM;
  const canEdit =
    !!demande &&
    demande.statut !== "ANNULE" &&
    !demande.archivedAt &&
    (isAM || (isTM && isTmSurDemande));
  const isHotelAcceptedOrBeyond =
    !!demande &&
    demande.typeGift === "HOTEL" &&
    (demande.statut === "ACCEPTE" ||
      demande.statut === "ENVOYE" ||
      demande.statut === "RECU");

  useEffect(() => {
    fetchDemande();
  }, [params.id]);

  useEffect(() => {
    const fetchMentionable = async () => {
      try {
        const res = await fetch("/api/users/mentionable");
        if (res.ok) {
          setMentionableUsers(await res.json());
        }
      } catch {
        // silencieux
      }
    };
    fetchMentionable();
  }, []);

  useEffect(() => {
    const q = marqueQuery.trim();
    if (q.length < 2) {
      setMarqueSuggestions([]);
      setSearchingMarques(false);
      return;
    }
    let cancelled = false;
    setSearchingMarques(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/marques/search?q=${encodeURIComponent(q)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMarqueSuggestions(Array.isArray(data.marques) ? data.marques : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setSearchingMarques(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [marqueQuery]);

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
        contreparties: Array.isArray(data.contreparties) ? data.contreparties : [],
        contactMarqueNom: data.contactMarqueNom || "",
        contactMarqueEmail: data.contactMarqueEmail || "",
        dateExpeditionPrevue: data.dateExpeditionPrevue || "",
        numeroReservation: data.numeroReservation || "",
        nomReservation: data.nomReservation || "",
        adresseHotel: data.adresseHotel || "",
        contactSurPlace: data.contactSurPlace || "",
        horaireCheckIn: data.horaireCheckIn || "",
        horaireCheckOut: data.horaireCheckOut || "",
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
    } catch {
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
    } catch {
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
    } catch {
      alert("Erreur lors de la mise à jour du statut");
    }
  };

  const handleMarqueStatut = async (
    marqueId: string,
    statutContact: string,
    updateGiftStatut = false
  ) => {
    try {
      setMarqueActionBusy(`${marqueId}:${statutContact}`);
      const res = await fetch(`/api/gifts/${params.id}/marques/${marqueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statutContact, updateGiftStatut }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur");
      }
      await fetchDemande();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur mise à jour marque");
    } finally {
      setMarqueActionBusy(null);
    }
  };

  const handleMarqueCancelRelance = async (
    marqueId: string,
    cancelRelance: boolean
  ) => {
    try {
      setMarqueActionBusy(`${marqueId}:cancel-relance`);
      const res = await fetch(`/api/gifts/${params.id}/marques/${marqueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelRelance }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur");
      }
      await fetchDemande();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur relance auto");
    } finally {
      setMarqueActionBusy(null);
    }
  };

  const handleMarqueRelance = async (marqueId: string) => {
    try {
      setMarqueActionBusy(`${marqueId}:relance`);
      const res = await fetch(
        `/api/gifts/${params.id}/contact-marques/relance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marqueId }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur relance");
      }
      await fetchDemande();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur relance");
    } finally {
      setMarqueActionBusy(null);
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
    } catch {
      alert("Erreur lors de la sauvegarde");
    }
  };

  const handleCancelDemande = async () => {
    const confirmed = window.confirm(
      "Confirmer l'annulation de cette demande de gift ?"
    );
    if (!confirmed) return;
    try {
      setCancelling(true);
      const res = await fetch(`/api/gifts/${params.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur");
      router.push("/gifts");
      router.refresh();
    } catch {
      alert("Erreur lors de l'annulation de la demande");
    } finally {
      setCancelling(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!demande) return;
    const willArchive = !demande.archivedAt;
    const confirmed = window.confirm(
      willArchive
        ? "Archiver cette demande ? Elle sortira du pipeline actif."
        : "Désarchiver cette demande ? Elle reviendra dans le pipeline actif."
    );
    if (!confirmed) return;
    try {
      setArchiving(true);
      const res = await fetch(`/api/gifts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: willArchive }),
      });
      if (!res.ok) throw new Error("Erreur");
      await fetchDemande();
    } catch {
      alert(
        willArchive
          ? "Erreur lors de l'archivage"
          : "Erreur lors du désarchivage"
      );
    } finally {
      setArchiving(false);
    }
  };

  const handleAddExistingMarque = async (marque: {
    id: string;
    nom: string;
  }) => {
    try {
      setAddingMarque(true);
      setEnrichFlash(null);
      const res = await fetch(`/api/gifts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marqueIds: [marque.id] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Impossible d'ajouter la marque");
      }
      setMarqueQuery("");
      setMarqueSuggestions([]);
      setShowMarqueSuggestions(false);
      setEnrichFlash(`${marque.nom} ajoutée à la demande.`);
      setActiveTab("brands");
      await fetchDemande();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur ajout marque");
    } finally {
      setAddingMarque(false);
    }
  };

  const handleEnrichirMarque = async (nomOverride?: string) => {
    const nom = (nomOverride ?? marqueQuery).trim();
    if (!nom) return;
    const exact = marqueSuggestions.find(
      (m) =>
        m.exactMatch ||
        normalize(m.nom) === normalize(nom)
    );
    if (exact) {
      await handleAddExistingMarque(exact);
      return;
    }
    try {
      setEnriching(true);
      setEnrichFlash(null);
      const res = await fetch("/api/gifts/enrich-marque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          giftId: params.id,
          talentId: demande?.talentId || demande?.talent?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'envoyer en enrichissement");
      }
      setEnrichFlash(
        data.message ||
          `${data.marque?.nom || nom} ajoutée et envoyée en enrichissement.`
      );
      setMarqueQuery("");
      setMarqueSuggestions([]);
      setShowMarqueSuggestions(false);
      setActiveTab("brands");
      await fetchDemande();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur enrichissement");
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-violet-700" />
      </div>
    );
  }

  if (error || !demande) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">{error}</h2>
        <Link
          href="/gifts"
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
        >
          Retour aux demandes
        </Link>
      </div>
    );
  }

  const statut = STATUT_STYLE[demande.statut] || STATUT_STYLE.EN_ATTENTE;
  const progressSteps = buildProgressSteps(demande);
  const marquesList =
    demande.marques && demande.marques.length > 0
      ? demande.marques.map(
          (row: {
            statutContact?: string;
            contactNom?: string | null;
            contactEmail?: string | null;
            contactedAt?: string | null;
            lastRelanceAt?: string | null;
            relanceCount?: number;
            relanceCancelledAt?: string | null;
            contactLanguage?: string | null;
            reponseNote?: string | null;
            marque: {
              id: string;
              nom: string;
              contacts?: any[];
              awaitingEnrichissement?: boolean;
              contactsReady?: boolean;
              emailableCount?: number;
            };
          }) => ({
            ...row.marque,
            statutContact: row.statutContact || "A_CONTACTER",
            contactNom: row.contactNom,
            contactEmail: row.contactEmail,
            contactedAt: row.contactedAt,
            lastRelanceAt: row.lastRelanceAt,
            relanceCount: row.relanceCount || 0,
            relanceCancelledAt: row.relanceCancelledAt || null,
            contactLanguage: row.contactLanguage || null,
            reponseNote: row.reponseNote,
          })
        )
      : demande.marque
        ? [
            {
              ...demande.marque,
              statutContact: "A_CONTACTER",
              contactNom: null,
              contactEmail: null,
              contactedAt: null,
              lastRelanceAt: null,
              relanceCount: 0,
              relanceCancelledAt: null,
              contactLanguage: null,
              reponseNote: null,
            },
          ]
        : [];
  const canContactMarques =
    isAM &&
    !demande.archivedAt &&
    demande.statut !== "ANNULE" &&
    marquesList.length > 0;
  const partnersList = (demande.partners || []).map(
    (row: { partner: { id: string; name: string; slug?: string } }) =>
      row.partner
  );
  const brandsCount = marquesList.length + partnersList.length;
  const commentsCount = demande.commentaires?.length || 0;
  const marquesLabel =
    [
      ...marquesList.map((m: { nom: string }) => m.nom),
      ...partnersList.map((p: { name: string }) => p.name),
    ].join(", ") || null;

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 pb-16 pt-1">
      {/* Header + progress */}
      <section className={`${cardClass} flex flex-col gap-6 px-7 py-6`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/gifts"
              className="text-sm text-zinc-500 transition hover:text-zinc-800"
            >
              ← Gifts
            </Link>
            <h1 className="m-0 text-2xl font-semibold tracking-tight text-zinc-900">
              {demande.reference}
            </h1>
            <span className="rounded-md bg-violet-50 px-2 py-[3px] text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              {TYPE_LABELS[demande.typeGift] || demande.typeGift}
            </span>
            <span
              className="rounded-full px-2.5 py-[3px] text-xs font-medium"
              style={{ color: statut.color, background: statut.bg }}
            >
              {statut.label}
            </span>
            <span
              className={`rounded-full border px-2.5 py-[3px] text-xs font-medium ${
                PRIORITE_CLASS[demande.priorite] || PRIORITE_CLASS.NORMALE
              }`}
            >
              {PRIORITE_LABEL[demande.priorite] || demande.priorite}
            </span>
            <span className="text-[13px] text-zinc-500">
              · créée le {formatDateLong(demande.createdAt)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {canContactMarques && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("brands");
                  setContactWizardOpen(true);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 text-sm font-medium text-white transition hover:bg-violet-800"
              >
                <Mail className="h-4 w-4" />
                Contacter les marques
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setEditing(false);
                    fetchDemande();
                  } else {
                    setEditing(true);
                  }
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
              >
                {editing ? (
                  <>
                    <X className="h-4 w-4" />
                    Fermer
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4" />
                    Modifier
                  </>
                )}
              </button>
            )}
            {editing && (
              <button
                type="button"
                onClick={handleSaveEdit}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 text-sm font-medium text-white transition hover:bg-violet-800"
              >
                <Save className="h-4 w-4" />
                Enregistrer
              </button>
            )}
            {canArchive && (
              <button
                type="button"
                onClick={() => void handleToggleArchive()}
                disabled={archiving}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-60"
              >
                {archiving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : demande.archivedAt ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {demande.archivedAt ? "Désarchiver" : "Archiver"}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={handleCancelDemande}
                disabled={cancelling}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 bg-white px-3.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                {cancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                Annuler la demande
              </button>
            )}
          </div>
        </div>

        {demande.archivedAt && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600">
            Archivée le {formatDateLong(demande.archivedAt)}
            {" — "}visible dans le filtre « Archivés ».
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {progressSteps.map((s) => (
            <div key={s.label} className="flex flex-col gap-2.5">
              <div
                className="h-1 rounded-full"
                style={{ background: s.done ? s.bar : "#e4e4e7" }}
              />
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-zinc-900">
                  {s.label}
                </span>
                <span className="text-xs text-zinc-400">{s.at || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow AM */}
      {isAM &&
        !demande.archivedAt &&
        demande.statut !== "ANNULE" &&
        demande.statut !== "REFUSE" &&
        demande.statut !== "RECU" && (
          <WorkflowPanel
            demande={demande}
            onUpdate={handleUpdateStatut}
            onPrendreEnCharge={handlePrendreEnCharge}
          />
        )}

      {/* Suivi TM lecture seule */}
      {!isAM && isTM && (
        <section className={`${cardClass} px-7 py-6`}>
          <h2 className="mb-4 text-[15px] font-semibold text-zinc-900">
            Suivi de la demande
          </h2>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-zinc-500">Statut actuel</span>
            <span
              className="rounded-full px-2.5 py-[3px] text-xs font-medium"
              style={{ color: statut.color, background: statut.bg }}
            >
              {statut.label}
            </span>
          </div>
          <div className="space-y-2 text-sm text-zinc-700">
            {demande.datePriseEnCharge && (
              <p className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                Prise en charge le {formatDateLong(demande.datePriseEnCharge)}
              </p>
            )}
            {demande.dateContactMarque && (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-500" />
                Marque contactée le {formatDateLong(demande.dateContactMarque)}
              </p>
            )}
            {demande.dateReponseMarque && (
              <p className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-500" />
                Réponse de la marque le{" "}
                {formatDateLong(demande.dateReponseMarque)}
              </p>
            )}
            {demande.dateEnvoi && (
              <p className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-indigo-500" />
                Gift envoyé le {formatDateLong(demande.dateEnvoi)}
              </p>
            )}
            {demande.dateReception && (
              <p className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                Gift reçu le {formatDateLong(demande.dateReception)}
              </p>
            )}
            {!demande.datePriseEnCharge &&
              !demande.dateContactMarque &&
              !demande.dateReponseMarque &&
              !demande.dateEnvoi &&
              !demande.dateReception && (
                <p className="text-zinc-500">
                  Aucune étape de suivi enregistrée pour le moment.
                </p>
              )}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {/* Colonne principale */}
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-5">
          {/* Demande */}
          <section className={`${cardClass} flex min-w-0 flex-col gap-6 overflow-hidden p-7`}>
            <h2 className="m-0 text-[15px] font-semibold text-zinc-900">
              Demande
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field label="Description">
                <p className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {demande.description}
                </p>
              </Field>
              {demande.justification && (
                <Field label="Justification">
                  <p className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {demande.justification}
                  </p>
                </Field>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 border-t border-zinc-100 pt-5 md:grid-cols-2">
              <div className="md:col-span-2 min-w-0">
                <span className="mb-1.5 block text-xs text-zinc-500">
                  Marques / partenaires
                </span>
                {marquesLabel && (
                  <p className="mb-3 break-words text-sm font-medium text-zinc-900 [overflow-wrap:anywhere]">
                    {marquesLabel}
                  </p>
                )}
                {canEdit && (
                  <div className="relative max-w-xl">
                    <div className="flex flex-wrap gap-2">
                      <div className="relative min-w-[200px] flex-1">
                        <input
                          type="text"
                          value={marqueQuery}
                          onChange={(e) => {
                            setMarqueQuery(e.target.value);
                            setShowMarqueSuggestions(true);
                          }}
                          onFocus={() => setShowMarqueSuggestions(true)}
                          onBlur={() =>
                            setTimeout(
                              () => setShowMarqueSuggestions(false),
                              150
                            )
                          }
                          placeholder="Rechercher une marque CRM…"
                          className={inputClass}
                        />
                        {showMarqueSuggestions &&
                          marqueQuery.trim().length >= 2 && (
                            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                              {searchingMarques && (
                                <div className="flex items-center gap-2 px-3 py-3 text-sm text-zinc-500">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Recherche…
                                </div>
                              )}
                              {!searchingMarques &&
                                marqueSuggestions.length === 0 && (
                                  <p className="px-3 py-3 text-sm text-zinc-500">
                                    Aucune marque CRM pour « {marqueQuery.trim()} ».
                                  </p>
                                )}
                              {marqueSuggestions
                                .filter(
                                  (m) =>
                                    !marquesList.some(
                                      (existing: { id: string }) =>
                                        existing.id === m.id
                                    )
                                )
                                .map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    disabled={addingMarque}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() =>
                                      void handleAddExistingMarque(m)
                                    }
                                    className="w-full border-b border-zinc-100 px-3 py-2.5 text-left last:border-0 hover:bg-zinc-50 disabled:opacity-50"
                                  >
                                    <p className="text-sm font-medium text-zinc-900">
                                      {m.nom}
                                    </p>
                                    {m.matchedAlias &&
                                      normalize(m.matchedAlias) !==
                                        normalize(m.nom) && (
                                        <p className="text-xs text-violet-600">
                                          Alias : {m.matchedAlias}
                                        </p>
                                      )}
                                  </button>
                                ))}
                            </div>
                          )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleEnrichirMarque()}
                        disabled={
                          enriching ||
                          addingMarque ||
                          marqueQuery.trim().length < 2 ||
                          marqueSuggestions.some(
                            (m) =>
                              m.exactMatch ||
                              normalize(m.nom) ===
                                normalize(marqueQuery.trim())
                          )
                        }
                        className="inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-3.5 text-[13px] font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Si absente du CRM : crée la fiche et envoie en enrichissement"
                      >
                        {enriching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ScanSearch className="h-3.5 w-3.5" />
                        )}
                        Enrichir
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Sélectionnez une fiche CRM, ou Enrichir si elle
                      n&apos;existe pas encore.
                    </p>
                    {enrichFlash && (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        {enrichFlash}{" "}
                        <Link
                          href="/enrichissement?tab=attente"
                          className="underline"
                        >
                          Voir la file
                        </Link>
                      </p>
                    )}
                  </div>
                )}
              </div>
              {demande.adresseLivraison && (
                <Field label="Adresse de livraison">
                  <span className="whitespace-pre-wrap break-words font-medium [overflow-wrap:anywhere]">
                    {demande.adresseLivraison}
                  </span>
                </Field>
              )}
              {demande.valeurEstimee != null && demande.valeurEstimee !== "" && (
                <Field label="Valeur estimée">
                  <span className="font-medium text-emerald-700">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(Number(demande.valeurEstimee))}
                  </span>
                </Field>
              )}
              {demande.datesouhaitee && (
                <Field label="Date souhaitée">
                  <span className="font-medium">
                    {formatDateLong(demande.datesouhaitee)}
                  </span>
                </Field>
              )}
            </div>

            {/* Détails hôtel */}
            {demande.typeGift === "HOTEL" && (
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/70 p-5">
                <h3 className="mb-4 text-[13px] font-semibold text-zinc-900">
                  Détails hébergement
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {demande.destination && (
                    <Field label="Destination">
                      <span className="font-medium">{demande.destination}</span>
                    </Field>
                  )}
                  {demande.nombrePersonnes && (
                    <Field label="Nombre de personnes">
                      <span className="font-medium">
                        {demande.nombrePersonnes}
                      </span>
                    </Field>
                  )}
                  {demande.dateArrivee && (
                    <Field label="Date d'arrivée">
                      <span className="font-medium">
                        {formatDateLong(demande.dateArrivee)}
                      </span>
                    </Field>
                  )}
                  {demande.dateDepart && (
                    <Field label="Date de départ">
                      <span className="font-medium">
                        {formatDateLong(demande.dateDepart)}
                      </span>
                    </Field>
                  )}
                  {demande.typeHebergement && (
                    <Field label="Type d'hébergement">
                      <span className="font-medium">
                        {demande.typeHebergement === "HOTEL"
                          ? "Hôtel"
                          : demande.typeHebergement === "APPARTEMENT"
                            ? "Appartement"
                            : demande.typeHebergement === "VILLA"
                              ? "Villa"
                              : demande.typeHebergement}
                      </span>
                    </Field>
                  )}
                  {demande.categorie && (
                    <Field label="Catégorie">
                      <span className="font-medium">
                        {demande.categorie === "LUXE"
                          ? "Luxe"
                          : demande.categorie}
                      </span>
                    </Field>
                  )}
                </div>
                {demande.demandesSpeciales && (
                  <div className="mt-4">
                    <Field label="Demandes spéciales">
                      <span className="whitespace-pre-wrap">
                        {demande.demandesSpeciales}
                      </span>
                    </Field>
                  </div>
                )}
              </div>
            )}

            {/* Édition AM : notes + suivi */}
            {isAM && editing && (
              <div className="space-y-4 border-t border-zinc-100 pt-5">
                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Numéro de suivi
                  </label>
                  <input
                    type="text"
                    value={editData.numeroSuivi}
                    onChange={(e) =>
                      setEditData({ ...editData, numeroSuivi: e.target.value })
                    }
                    placeholder="Ex: FR123456789"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Notes internes (visibles uniquement par l&apos;équipe)
                  </label>
                  <textarea
                    value={editData.notesInternes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        notesInternes: e.target.value,
                      })
                    }
                    rows={4}
                    placeholder="Notes privées pour le suivi..."
                    className={textareaClass}
                  />
                </div>
                {!isHotelAcceptedOrBeyond && (
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
                  >
                    <Save className="h-4 w-4" />
                    Enregistrer les modifications
                  </button>
                )}
              </div>
            )}

            {isAM && !editing && demande.notesInternes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <FileText className="h-3.5 w-3.5" />
                  Notes internes
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-zinc-700 [overflow-wrap:anywhere]">
                  {demande.notesInternes}
                </p>
              </div>
            )}

            {demande.numeroSuivi && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <Truck className="h-3.5 w-3.5" />
                  Numéro de suivi
                </p>
                <p className="text-base font-semibold text-zinc-900">
                  {demande.numeroSuivi}
                </p>
              </div>
            )}
          </section>

          {/* Réservation hôtel AM */}
          {isAM && isHotelAcceptedOrBeyond && (
            <ReservationPanel
              demande={demande}
              editing={editing}
              editData={editData}
              setEditData={setEditData}
              setEditing={setEditing}
              onSave={handleSaveEdit}
            />
          )}

          {/* Réservation hôtel TM lecture seule */}
          {isTM &&
            isHotelAcceptedOrBeyond &&
            (demande.numeroReservation ||
              demande.nomReservation ||
              demande.adresseHotel ||
              demande.contactSurPlace ||
              demande.horaireCheckIn ||
              demande.horaireCheckOut ||
              (Array.isArray(demande.contreparties) &&
                demande.contreparties.length > 0)) && (
              <ReservationReadOnly demande={demande} />
            )}

          {/* Tabs Discussion / Marques */}
          <section className={`${cardClass} flex flex-col overflow-visible`}>
            <div className="flex gap-6 border-b border-zinc-200 px-7">
              {(
                [
                  { key: "chat" as const, label: "Discussion", n: commentsCount },
                  {
                    key: "brands" as const,
                    label: "Marques contactées",
                    n: brandsCount,
                  },
                ] as const
              ).map((t) => {
                const on = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`-mb-px flex items-center gap-2 border-b-2 py-4 text-sm font-medium transition ${
                      on
                        ? "border-zinc-900 text-zinc-900"
                        : "border-transparent text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {t.label}
                    <span className="rounded-full bg-zinc-100 px-2 py-px text-xs text-zinc-400">
                      {t.n}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeTab === "brands" ? (
              <div className="px-7 pb-5 pt-2">
                {canContactMarques && (
                  <div className="mb-2 flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setContactWizardOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-800 hover:bg-violet-100"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Contacter / Relancer
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.1fr)] gap-3 border-b border-zinc-100 py-3.5 text-xs font-medium text-zinc-500">
                  <span>Marque</span>
                  <span>Contacts</span>
                  <span>Contact / Relance</span>
                  <span>Réponse</span>
                </div>
                {brandsCount === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    Aucune marque associée. Utilisez la recherche dans la
                    section Demande ci-dessus.
                  </p>
                ) : (
                  <>
                    {marquesList.map(
                      (marque: {
                        id: string;
                        nom: string;
                        contacts?: any[];
                        awaitingEnrichissement?: boolean;
                        contactsReady?: boolean;
                        emailableCount?: number;
                        statutContact?: string;
                        contactNom?: string | null;
                        contactEmail?: string | null;
                        contactedAt?: string | null;
                        lastRelanceAt?: string | null;
                        relanceCount?: number;
                        relanceCancelledAt?: string | null;
                        contactLanguage?: string | null;
                      }) => {
                        const outreachContact =
                          marque.contactNom ||
                          marque.contactEmail ||
                          null;
                        const crmContact = marque.contacts?.[0];
                        const contactLabel =
                          outreachContact ||
                          (crmContact
                            ? [crmContact.prenom, crmContact.nom]
                                .filter(Boolean)
                                .join(" ") ||
                              crmContact.email ||
                              crmContact.emailSuggested ||
                              "Contact"
                            : null);
                        const awaiting = Boolean(marque.awaitingEnrichissement);
                        const contactsReady =
                          Boolean(marque.contactsReady) ||
                          (marque.emailableCount ?? 0) > 0;
                        const response = brandResponseFromStatutContact(
                          marque.statutContact,
                          demande.statut
                        );
                        const contactedAt =
                          marque.contactedAt || demande.dateContactMarque;
                        const contactedLabel = formatDayShort(contactedAt);
                        const relanceDueLabel =
                          contactedAt &&
                          marque.statutContact === "CONTACTEE" &&
                          !(marque.relanceCount || 0) &&
                          !marque.relanceCancelledAt
                            ? formatDayShort(giftRelanceDueAt(contactedAt))
                            : null;
                        const lastRelanceLabel = formatDayShort(
                          marque.lastRelanceAt
                        );
                        const canQuickActions =
                          isAM &&
                          !demande.archivedAt &&
                          (marque.statutContact === "CONTACTEE" ||
                            marque.statutContact === "RELANCEE" ||
                            marque.statutContact === "SANS_REPONSE");
                        const busy = marqueActionBusy?.startsWith(marque.id);
                        return (
                          <div
                            key={marque.id}
                            className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.1fr)] items-center gap-3 border-b border-zinc-100 py-4 text-sm"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-600">
                                {marque.nom.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex min-w-0 flex-col">
                                <Link
                                  href={`/marques/${marque.id}`}
                                  className="truncate font-semibold text-zinc-900 hover:text-violet-700"
                                >
                                  {marque.nom}
                                </Link>
                                {contactLabel && (
                                  <span className="truncate text-xs text-zinc-500">
                                    {contactLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="min-w-0">
                              {awaiting ? (
                                <Link
                                  href="/enrichissement?tab=attente"
                                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-[3px] text-xs font-medium text-amber-800 hover:bg-amber-100"
                                  title="Voir la file d'enrichissement"
                                >
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Enrichissement en cours
                                </Link>
                              ) : contactsReady ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-[3px] text-xs font-medium text-emerald-800">
                                  <CheckCircle className="h-3 w-3" />
                                  Contacts dispos
                                  {(marque.emailableCount ?? 0) > 1
                                    ? ` · ${marque.emailableCount}`
                                    : ""}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-[3px] text-xs font-medium text-zinc-600">
                                  Aucun contact
                                </span>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-col items-start gap-1">
                              {contactedLabel ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-[3px] text-[11px] font-medium text-violet-800"
                                  title={
                                    formatDate(contactedAt) || undefined
                                  }
                                >
                                  Contactée · {contactedLabel}
                                  {marque.contactLanguage === "en"
                                    ? " · EN"
                                    : ""}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                              {(marque.relanceCount || 0) > 0 ||
                              lastRelanceLabel ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-[3px] text-[11px] font-medium text-blue-800"
                                  title={
                                    formatDate(marque.lastRelanceAt) ||
                                    undefined
                                  }
                                >
                                  Relancée
                                  {lastRelanceLabel
                                    ? ` · ${lastRelanceLabel}`
                                    : ` · ${marque.relanceCount}×`}
                                </span>
                              ) : relanceDueLabel ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-[3px] text-[11px] font-medium text-amber-900"
                                  title={`Relance auto J+${GIFT_RELANCE_BUSINESS_DAYS} jours ouvrés`}
                                >
                                  Relance · {relanceDueLabel}
                                </span>
                              ) : marque.statutContact === "CONTACTEE" &&
                                marque.relanceCancelledAt ? (
                                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-[3px] text-[11px] font-medium text-zinc-600">
                                  Auto stoppée
                                </span>
                              ) : null}
                            </div>
                            <div className="flex min-w-0 flex-col items-start gap-1.5">
                              <span
                                className="rounded-full px-2.5 py-[3px] text-xs font-medium"
                                style={{
                                  color: response.color,
                                  background: response.bg,
                                }}
                              >
                                {response.label}
                              </span>
                              {canQuickActions && (
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() =>
                                      handleMarqueRelance(marque.id)
                                    }
                                    className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                                  >
                                    Relancer
                                  </button>
                                  {marque.statutContact === "CONTACTEE" &&
                                    !(marque.relanceCount || 0) && (
                                      <button
                                        type="button"
                                        disabled={!!busy}
                                        onClick={() =>
                                          handleMarqueCancelRelance(
                                            marque.id,
                                            !marque.relanceCancelledAt
                                          )
                                        }
                                        className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                                        title={
                                          marque.relanceCancelledAt
                                            ? "Réactiver la relance auto J+2"
                                            : "Stopper la relance auto J+2"
                                        }
                                      >
                                        {marque.relanceCancelledAt
                                          ? "Réactiver auto"
                                          : "Stop auto"}
                                      </button>
                                    )}
                                  <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() =>
                                      handleMarqueStatut(marque.id, "ACCEPTEE", true)
                                    }
                                    className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    OK
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() =>
                                      handleMarqueStatut(marque.id, "REFUSEE")
                                    }
                                    className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                                  >
                                    Refus
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                    {partnersList.map(
                      (partner: {
                        id: string;
                        name: string;
                        slug?: string;
                      }) => (
                        <div
                          key={partner.id}
                          className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,1.2fr)] items-center gap-3 border-b border-zinc-100 py-4 text-sm last:border-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-amber-50 text-xs font-semibold text-amber-800">
                              {partner.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex min-w-0 flex-col">
                              {partner.slug ? (
                                <Link
                                  href={`/partners/manage/${partner.id}`}
                                  className="truncate font-semibold text-zinc-900 hover:text-amber-700"
                                >
                                  {partner.name}
                                </Link>
                              ) : (
                                <span className="truncate font-semibold text-zinc-900">
                                  {partner.name}
                                </span>
                              )}
                              <span className="text-xs text-amber-700">
                                Partenaire
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-zinc-400">—</span>
                          <span className="text-zinc-600">—</span>
                          <span className="justify-self-start rounded-full bg-zinc-100 px-2.5 py-[3px] text-xs font-medium text-zinc-600">
                            Partenaire
                          </span>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col px-7">
                  {demande.commentaires && demande.commentaires.length > 0 ? (
                    demande.commentaires.map((comment: any) => (
                      <CommentRow
                        key={comment.id}
                        comment={comment}
                        mentionableUsers={mentionableUsers}
                      />
                    ))
                  ) : (
                    <p className="py-10 text-center text-sm text-zinc-500">
                      Aucun commentaire pour le moment
                    </p>
                  )}
                </div>

                {demande.statut !== "ANNULE" && (
                  <form
                    onSubmit={handleSendComment}
                    className="relative z-20 flex gap-2 overflow-visible rounded-b-xl border-t border-zinc-100 bg-zinc-50 px-7 py-4"
                  >
                    <div className="relative z-20 min-w-0 flex-1 overflow-visible">
                      <MentionTextarea
                        value={commentaire}
                        onChange={setCommentaire}
                        placeholder="Écrire un message… (tapez @ pour mentionner)"
                        rows={2}
                        mentionableUsers={mentionableUsers}
                        dropdownPlacement="top"
                        className="min-h-[38px] w-full border-zinc-300 bg-white focus:border-violet-600 focus:ring-violet-600/15"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending || !commentaire.trim()}
                      className="inline-flex h-[38px] flex-none items-center gap-1.5 self-end rounded-lg bg-violet-700 px-4 text-sm font-medium text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Envoyer
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        </div>

        {/* Sidebar people */}
        <aside
          className={`${cardClass} sticky top-6 w-full flex-[0_0_300px] px-5 py-2`}
        >
          <PersonBlock
            role="Talent"
            prenom={demande.talent.prenom}
            nom={demande.talent.nom}
            email={demande.talent.email}
            telephone={demande.talent.telephone}
            photo={demande.talent.photo}
            subtitle={
              demande.talent.instagram
                ? `@${demande.talent.instagram}`
                : undefined
            }
            href={`/talents/${demande.talent.id}`}
          />
          <PersonBlock
            role="Talent Manager"
            prenom={demande.tm.prenom}
            nom={demande.tm.nom}
            email={demande.tm.email}
            telephone={demande.tm.telephone}
          />
          {demande.accountManager ? (
            <PersonBlock
              role="Account Manager"
              prenom={demande.accountManager.prenom}
              nom={demande.accountManager.nom}
              email={demande.accountManager.email}
              telephone={demande.accountManager.telephone}
              last
            />
          ) : (
            <div className="border-t border-zinc-100 py-4 last:border-0">
              <div className="mb-2.5 text-xs font-medium text-zinc-500">
                Account Manager
              </div>
              <p className="text-sm text-zinc-400">Non assigné</p>
            </div>
          )}
        </aside>
      </div>

      <GiftContactWizard
        open={contactWizardOpen}
        onClose={() => setContactWizardOpen(false)}
        onDone={() => {
          fetchDemande();
        }}
        giftId={demande.id}
        reference={demande.reference}
        talentName={`${demande.talent?.prenom || ""} ${demande.talent?.nom || ""}`.trim()}
        talentPhoto={demande.talent?.photo}
        marques={marquesList}
      />
    </div>
  );
}

function PersonBlock({
  role,
  prenom,
  nom,
  email,
  telephone,
  photo,
  subtitle,
  href,
  last,
}: {
  role: string;
  prenom: string;
  nom: string;
  email?: string | null;
  telephone?: string | null;
  photo?: string | null;
  subtitle?: string;
  href?: string;
  last?: boolean;
}) {
  const name = (
    <span className="truncate text-sm font-semibold text-zinc-900">
      {prenom} {nom}
    </span>
  );

  return (
    <div
      className={`flex flex-col gap-2.5 py-4 ${
        last ? "" : "border-b border-zinc-100"
      }`}
    >
      <div className="text-xs font-medium text-zinc-500">{role}</div>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 flex-none overflow-hidden rounded-full bg-zinc-100">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={`${prenom} ${nom}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs font-semibold text-zinc-600">
              {initials(prenom, nom)}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          {href ? (
            <Link href={href} className="hover:text-violet-700">
              {name}
            </Link>
          ) : (
            name
          )}
          {subtitle && (
            <span className="truncate text-xs text-zinc-500">{subtitle}</span>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="truncate text-xs text-zinc-500 hover:text-violet-700"
            >
              {email}
            </a>
          )}
          {telephone && (
            <a
              href={`tel:${telephone}`}
              className="truncate text-xs text-zinc-500 hover:text-violet-700"
            >
              {telephone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ReservationPanel({
  demande,
  editing,
  editData,
  setEditData,
  setEditing,
  onSave,
}: any) {
  return (
    <section className={`${cardClass} p-7`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold text-zinc-900">
          Informations de réservation
        </h2>
        {demande.statut !== "ANNULE" && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-700 px-3 text-[13px] font-medium text-white hover:bg-violet-800"
                >
                  <Save className="h-3.5 w-3.5" />
                  Sauvegarder
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Edit className="h-3.5 w-3.5" />
                Modifier
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Numéro de réservation">
            {editing ? (
              <input
                type="text"
                value={editData.numeroReservation}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    numeroReservation: e.target.value,
                  })
                }
                className={inputClass}
                placeholder="Ex : ABC123456"
              />
            ) : (
              demande.numeroReservation || <EmptyVal />
            )}
          </Field>
          <Field label="Nom de la réservation">
            {editing ? (
              <input
                type="text"
                value={editData.nomReservation}
                onChange={(e) =>
                  setEditData({ ...editData, nomReservation: e.target.value })
                }
                className={inputClass}
                placeholder="Nom sous lequel la réservation est faite"
              />
            ) : (
              demande.nomReservation || <EmptyVal />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Adresse de l'hôtel">
            {editing ? (
              <textarea
                value={editData.adresseHotel}
                onChange={(e) =>
                  setEditData({ ...editData, adresseHotel: e.target.value })
                }
                rows={4}
                className={textareaClass}
                placeholder="Adresse complète de l'hôtel..."
              />
            ) : (
              <span className="whitespace-pre-wrap">
                {demande.adresseHotel || <EmptyVal />}
              </span>
            )}
          </Field>
          <div className="space-y-4">
            <Field label="Contact sur place / accueil">
              {editing ? (
                <input
                  type="text"
                  value={editData.contactSurPlace}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      contactSurPlace: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Nom / service à demander à l'accueil"
                />
              ) : (
                demande.contactSurPlace || <EmptyVal />
              )}
            </Field>
            <Field label="Horaire check-in">
              {editing ? (
                <input
                  type="text"
                  value={editData.horaireCheckIn}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      horaireCheckIn: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Ex : À partir de 15h"
                />
              ) : (
                demande.horaireCheckIn || <EmptyVal />
              )}
            </Field>
            <Field label="Horaire check-out">
              {editing ? (
                <input
                  type="text"
                  value={editData.horaireCheckOut}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      horaireCheckOut: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Ex : Avant 12h"
                />
              ) : (
                demande.horaireCheckOut || <EmptyVal />
              )}
            </Field>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-5">
          <h3 className="mb-3 text-[13px] font-semibold text-zinc-900">
            Contreparties attendues
          </h3>
          {editing ? (
            <div className="space-y-3">
              {(editData.contreparties || []).map((c: any, index: number) => (
                <div
                  key={index}
                  className="flex flex-col items-stretch gap-2 md:flex-row md:items-center"
                >
                  <select
                    value={c.type || "STORY"}
                    onChange={(e) => {
                      const next = [...(editData.contreparties || [])];
                      next[index] = { ...next[index], type: e.target.value };
                      setEditData({ ...editData, contreparties: next });
                    }}
                    className={`${inputClass} md:w-1/2`}
                  >
                    <option value="STORY">Story</option>
                    <option value="POST_FEED">Post feed</option>
                    <option value="REEL_TIKTOK">Reel / TikTok</option>
                    <option value="MENTION_STORY">Mention story</option>
                    <option value="CHOIX_TALENT">Au choix du talent</option>
                  </select>
                  <div className="flex items-center gap-2 md:w-1/3">
                    <input
                      type="number"
                      min={0}
                      value={
                        c.delai === undefined || c.delai === null ? "" : c.delai
                      }
                      onChange={(e) => {
                        const value =
                          e.target.value === "" ? null : Number(e.target.value);
                        const next = [...(editData.contreparties || [])];
                        next[index] = { ...next[index], delai: value };
                        setEditData({ ...editData, contreparties: next });
                      }}
                      className={inputClass}
                      placeholder="Jours"
                    />
                    <span className="text-sm text-zinc-500">j</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(editData.contreparties || [])];
                      next.splice(index, 1);
                      setEditData({ ...editData, contreparties: next });
                    }}
                    className="inline-flex h-[38px] items-center justify-center rounded-lg border border-zinc-200 px-3 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = Array.isArray(editData.contreparties)
                    ? [...editData.contreparties]
                    : [];
                  next.push({ type: "STORY", delai: 7 });
                  setEditData({ ...editData, contreparties: next });
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-violet-700 hover:text-violet-800"
              >
                <Plus className="h-4 w-4" />
                Ajouter une contrepartie
              </button>
            </div>
          ) : (
            <ContrepartieChips list={demande.contreparties} />
          )}
        </div>
      </div>
    </section>
  );
}

function ReservationReadOnly({ demande }: { demande: any }) {
  return (
    <section className={`${cardClass} p-7`}>
      <h2 className="mb-4 text-[15px] font-semibold text-zinc-900">
        Informations de réservation
      </h2>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {demande.numeroReservation && (
            <Field label="Numéro de réservation">
              <span className="font-medium">{demande.numeroReservation}</span>
            </Field>
          )}
          {demande.nomReservation && (
            <Field label="Nom de la réservation">
              <span className="font-medium">{demande.nomReservation}</span>
            </Field>
          )}
        </div>
        {demande.adresseHotel && (
          <Field label="Adresse de l'hôtel">
            <span className="whitespace-pre-wrap font-medium">
              {demande.adresseHotel}
            </span>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {demande.contactSurPlace && (
            <Field label="Contact sur place / accueil">
              <span className="font-medium">{demande.contactSurPlace}</span>
            </Field>
          )}
          {(demande.horaireCheckIn || demande.horaireCheckOut) && (
            <div className="space-y-3">
              {demande.horaireCheckIn && (
                <Field label="Horaire check-in">
                  <span className="font-medium">{demande.horaireCheckIn}</span>
                </Field>
              )}
              {demande.horaireCheckOut && (
                <Field label="Horaire check-out">
                  <span className="font-medium">{demande.horaireCheckOut}</span>
                </Field>
              )}
            </div>
          )}
        </div>
        {Array.isArray(demande.contreparties) &&
          demande.contreparties.length > 0 && (
            <div className="border-t border-zinc-100 pt-4">
              <Field label="Contreparties attendues">
                <ContrepartieChips list={demande.contreparties} />
              </Field>
            </div>
          )}
      </div>
    </section>
  );
}

function ContrepartieChips({ list }: { list: any }) {
  if (!Array.isArray(list) || list.length === 0) {
    return <span className="text-sm text-zinc-400">Aucune contrepartie renseignée</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((c: any, index: number) => {
        const label = CONTREPARTIE_LABELS[c.type] || c.type || "Contrepartie";
        const suffix =
          c.delai != null && c.delai !== "" ? ` dans ${c.delai}j` : "";
        return (
          <span
            key={index}
            className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
          >
            {label}
            {suffix}
          </span>
        );
      })}
    </div>
  );
}

function WorkflowPanel({ demande, onUpdate, onPrendreEnCharge }: any) {
  const workflow = getWorkflowSteps(demande.statut, demande.typeGift);

  return (
    <section className={`${cardClass} p-7`}>
      <h2 className="mb-5 flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
        <TrendingUp className="h-4 w-4 text-violet-700" />
        Workflow de suivi
      </h2>

      {!demande.accountManagerId && demande.statut === "EN_ATTENTE" && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
            <div className="flex-1">
              <h3 className="mb-1 text-sm font-semibold text-amber-900">
                Demande en attente de prise en charge
              </h3>
              <p className="mb-3 text-sm text-amber-800">
                Cette demande n&apos;a pas encore été attribuée à un Account
                Manager. Prenez-la en charge pour commencer le traitement.
              </p>
              <button
                type="button"
                onClick={onPrendreEnCharge}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600"
              >
                <User className="h-4 w-4" />
                Prendre en charge cette demande
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {workflow.steps.map((step: any) => {
          const isActive = step.statut === demande.statut;
          const isCompleted = workflow.completedSteps.includes(step.statut);
          const canSelect = demande.accountManagerId !== null;
          const Icon = step.icon;
          return (
            <button
              key={step.statut}
              type="button"
              disabled={!canSelect}
              onClick={() => canSelect && onUpdate(step.statut)}
              className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition ${
                isActive
                  ? "border-violet-500 bg-violet-50"
                  : isCompleted
                    ? "border-emerald-200 bg-emerald-50"
                    : canSelect
                      ? "border-zinc-200 hover:border-violet-300"
                      : "cursor-not-allowed border-zinc-200 opacity-50"
              }`}
            >
              <div
                className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg ${
                  isActive
                    ? "bg-violet-700 text-white"
                    : isCompleted
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    isActive
                      ? "text-violet-800"
                      : isCompleted
                        ? "text-emerald-800"
                        : "text-zinc-800"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{step.description}</p>
              </div>
              {isCompleted && !isActive && (
                <CheckCircle className="h-4 w-4 flex-none text-emerald-500" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function getWorkflowSteps(currentStatut: string, typeGift: string) {
  const isHotel = typeGift === "HOTEL";
  const allSteps = isHotel
    ? [
        {
          statut: "EN_ATTENTE",
          label: "En attente",
          description: "Demande soumise",
          icon: Clock,
        },
        {
          statut: "EN_COURS",
          label: "En cours de traitement",
          description: "Account Manager traite la demande",
          icon: TrendingUp,
        },
        {
          statut: "ATTENTE_MARQUE",
          label: "Marque contactée",
          description: "En attente de la réponse de l'hôtel",
          icon: Building2,
        },
        {
          statut: "ACCEPTE",
          label: "Accepté par l'hôtel",
          description: "L'hôtel confirme la réservation",
          icon: CheckCircle,
        },
        {
          statut: "ENVOYE",
          label: "Réservation confirmée",
          description: "Infos transmises au talent",
          icon: Truck,
        },
        {
          statut: "RECU",
          label: "Séjour effectué",
          description: "Le talent a effectué son séjour",
          icon: Package,
        },
      ]
    : [
        {
          statut: "EN_ATTENTE",
          label: "En attente",
          description: "Demande soumise",
          icon: Clock,
        },
        {
          statut: "EN_COURS",
          label: "En cours de traitement",
          description: "Account Manager traite la demande",
          icon: TrendingUp,
        },
        {
          statut: "ATTENTE_MARQUE",
          label: "Marque contactée",
          description: "En attente de la réponse de la marque",
          icon: Building2,
        },
        {
          statut: "ACCEPTE",
          label: "Accepté par la marque",
          description: "La marque accepte d'envoyer le gift",
          icon: CheckCircle,
        },
        {
          statut: "ENVOYE",
          label: "Gift envoyé",
          description: "Le gift a été expédié au talent",
          icon: Truck,
        },
        {
          statut: "RECU",
          label: "Gift reçu",
          description: "Le talent a reçu le gift",
          icon: Package,
        },
      ];

  const currentIndex = allSteps.findIndex((s) => s.statut === currentStatut);
  const completedSteps = allSteps.slice(0, currentIndex).map((s) => s.statut);

  return { steps: allSteps, completedSteps };
}

function buildProgressSteps(demande: any) {
  const steps = [
    {
      label: "Créée",
      at: formatDate(demande.createdAt),
      done: true,
      bar: "#6d28d9",
    },
    {
      label: "Prise en charge",
      at: formatDate(demande.datePriseEnCharge),
      done: !!demande.datePriseEnCharge,
      bar: "#6d28d9",
    },
    {
      label: "Marque contactée",
      at: formatDate(demande.dateContactMarque),
      done: !!demande.dateContactMarque,
      bar: "#6d28d9",
    },
    {
      label: "Réponse marque",
      at: formatDate(demande.dateReponseMarque),
      done: !!demande.dateReponseMarque,
      bar: "#6d28d9",
    },
    {
      label: demande.dateReception ? "Reçu" : "Envoyé",
      at: formatDate(demande.dateReception || demande.dateEnvoi),
      done: !!(demande.dateReception || demande.dateEnvoi),
      bar: demande.dateReception ? "#16a34a" : "#6d28d9",
    },
  ];
  return steps;
}

function brandResponseFromStatutContact(
  statutContact: string | undefined,
  giftStatut: string
) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    A_CONTACTER: { label: "À contacter", color: "#a16207", bg: "#fef9c3" },
    CONTACTEE: { label: "Contactée", color: "#6d28d9", bg: "#f5f3ff" },
    RELANCEE: { label: "Relancée", color: "#1d4ed8", bg: "#dbeafe" },
    ACCEPTEE: { label: "Acceptée", color: "#15803d", bg: "#f0fdf4" },
    REFUSEE: { label: "Refusée", color: "#b91c1c", bg: "#fef2f2" },
    SANS_REPONSE: { label: "Sans réponse", color: "#52525b", bg: "#f4f4f5" },
  };
  if (statutContact && map[statutContact]) return map[statutContact];
  // Fallback legacy si jamais contacté via le wizard
  if (giftStatut === "ACCEPTE" || giftStatut === "ENVOYE" || giftStatut === "RECU") {
    return { label: "Partante", color: "#15803d", bg: "#f0fdf4" };
  }
  if (giftStatut === "REFUSE") {
    return { label: "Refusée", color: "#b91c1c", bg: "#fef2f2" };
  }
  if (giftStatut === "ATTENTE_MARQUE" || giftStatut === "EN_COURS") {
    return { label: "Sans réponse", color: "#52525b", bg: "#f4f4f5" };
  }
  return { label: "À contacter", color: "#a16207", bg: "#fef9c3" };
}

function CommentRow({
  comment,
  mentionableUsers,
}: {
  comment: any;
  mentionableUsers: MentionableUser[];
}) {
  const isSystem =
    comment.auteur.role === "CM" || comment.auteur.role === "ADMIN";
  const usersById = new Map<string, { firstName: string; lastName: string }>();
  for (const u of mentionableUsers || []) {
    usersById.set(u.id, { firstName: u.firstName, lastName: u.lastName });
  }

  return (
    <div className="flex gap-3.5 border-b border-zinc-100 py-[18px] last:border-0">
      <div
        className={`grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-semibold text-white ${
          isSystem ? "bg-indigo-600" : "bg-zinc-500"
        }`}
      >
        {initials(comment.auteur.prenom, comment.auteur.nom)}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold text-zinc-900">
            {comment.auteur.prenom} {comment.auteur.nom}
          </span>
          {isSystem && (
            <span className="rounded bg-indigo-50 px-1.5 py-px text-[11px] font-medium text-indigo-700">
              Account Manager
            </span>
          )}
          <span className="text-xs text-zinc-400">
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <div className="min-w-0 break-words whitespace-pre-line text-sm leading-relaxed text-zinc-800 [overflow-wrap:anywhere]">
          {renderCommentWithMentions(comment.contenu, usersById, undefined, {
            accentColor: "#7c3aed",
          })}
        </div>
      </div>
    </div>
  );
}
