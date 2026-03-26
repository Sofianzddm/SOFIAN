"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Loader2,
  Trash2,
  ChevronDown,
  AlertCircle,
  Clock,
  Plus,
  MessageCircle,
  Trophy,
  Frown,
  Meh,
} from "lucide-react";
import {
  MentionTextarea,
  MentionableUser,
  renderCommentWithMentions,
} from "@/components/MentionTextarea";

type StatutProspectionContact =
  | "EN_ATTENTE"
  | "CONTACTE"
  | "EN_NEGOC"
  | "GAGNE"
  | "PERDU";

type StatutAction = "A_FAIRE" | "EN_ATTENTE" | "GAGNE" | "PERDU" | "ANNULE";

type Contact = {
  id: string;
  nomOpportunite: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  montantBrut?: number | string | null;
  statut: StatutProspectionContact;
  notes: string | null;
   talentId?: string | null;
  prochainStatut?: StatutAction | null;
  prochainDate?: string | null;
  actionPrevue?: string | null;
  derniereFait?: string | null;
  actionUpdatedAt?: string | null;
  commentCount?: number;
};

type Fichier = {
  id: string;
  titre: string;
  contacts: Contact[];
};

type ContactCommentaire = {
  id: string;
  contenu: string;
  createdAt: string;
  auteur: {
    id: string;
    name: string;
    image: string | null;
  };
};

type ContactHistorique = {
  id: string;
  type: string;
  detail: string;
  createdAt: string;
  auteur: {
    id: string;
    name: string;
    image: string | null;
  };
};

type ContactDetail = Contact & {
  createdAt: string;
  updatedAt: string;
  fichier: {
    id: string;
    titre: string;
  };
  commentaires: ContactCommentaire[];
  historique: ContactHistorique[];
};

const STATUTS: { value: StatutProspectionContact; label: string; color: string; bg: string }[] = [
  {
    value: "EN_ATTENTE",
    label: "En attente",
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  {
    value: "CONTACTE",
    label: "Contacté",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    value: "EN_NEGOC",
    label: "En négoc",
    color: "text-yellow-700",
    bg: "bg-yellow-50",
  },
  {
    value: "GAGNE",
    label: "Gagné",
    color: "text-[#1A1110]",
    bg: "bg-[#C8F285]/40",
  },
  {
    value: "PERDU",
    label: "Perdu",
    color: "text-red-600",
    bg: "bg-red-50",
  },
];

function getStatutConfig(value: StatutProspectionContact) {
  return STATUTS.find((s) => s.value === value) || STATUTS[0];
}

function formatRelativeDate(date: Date): string {
  const diff = Math.ceil(
    (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "1 jour";
  if (diff < 0) return `${Math.abs(diff)} jours de retard`;
  return `${diff} jours`;
}

function extractOpportunityAmount(contact: Contact): number {
  const raw = contact.montantBrut ?? 0;
  const parsed = typeof raw === "string" ? parseFloat(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function askWonAmount(initialValue?: number | string | null): number | null {
  const defaultValue =
    initialValue !== null && initialValue !== undefined ? String(initialValue) : "";
  const entered = window.prompt(
    "Montant HT gagné (€) :",
    defaultValue
  );
  if (entered === null) return null;
  const parsed = parseFloat(entered.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    window.alert("Merci de saisir un montant valide supérieur à 0.");
    return null;
  }
  return parsed;
}

function getActionIcon(contact: Contact) {
  const now = new Date();
  const date = contact.prochainDate ? new Date(contact.prochainDate) : null;

  if (!contact.prochainStatut) {
    return {
      icon: "Plus" as const,
      color: "bg-gray-300 text-white",
      label: "Ajouter une action",
    };
  }

  if (contact.prochainStatut === "A_FAIRE") {
    return {
      icon: "AlertCircle" as const,
      color: "bg-red-500 text-white",
      label: "À faire",
    };
  }

  if (contact.prochainStatut === "EN_ATTENTE") {
    if (!date || date <= now) {
      return {
        icon: "AlertCircle" as const,
        color: "bg-red-500 text-white",
        label: "Rappel expiré",
      };
    }
    return {
      icon: "Clock" as const,
      color: "bg-blue-500 text-white",
      label: `dans ${formatRelativeDate(date)}`,
    };
  }

   if (contact.prochainStatut === "GAGNE") {
     return {
       icon: "Trophy" as const,
       color: "bg-[#C8F285] text-[#1A1110]",
       label: "Gagné",
     };
   }

   if (contact.prochainStatut === "PERDU") {
     return {
       icon: "Frown" as const,
       color: "bg-red-500 text-white",
       label: "Perdu",
     };
   }

   if (contact.prochainStatut === "ANNULE") {
     return {
       icon: "Meh" as const,
       color: "bg-gray-300 text-white",
       label: "Annulé",
     };
   }

  return {
    icon: "Clock" as const,
    color: "bg-gray-300 text-white",
    label: "",
  };
}

export default function FichierProspectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [detailNameEditing, setDetailNameEditing] = useState(false);
  const [detailNameValue, setDetailNameValue] = useState("");

  const [convertModal, setConvertModal] = useState<{
    open: boolean;
    contactId: string | null;
    nomOpportunite: string;
  }>({
    open: false,
    contactId: null,
    nomOpportunite: "",
  });
  const [convertTalentId, setConvertTalentId] = useState<string>("");
  const [convertMontant, setConvertMontant] = useState<string>("");
  const [convertNotes, setConvertNotes] = useState<string>("");
  const [convertLoading, setConvertLoading] = useState(false);
  const [talents, setTalents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [prospectionRes, talentsRes] = await Promise.all([
          fetch(`/api/prospection/${params.id}`),
          fetch("/api/talents"),
        ]);

        if (!prospectionRes.ok) {
          throw new Error("Erreur de chargement");
        }

        const data = await prospectionRes.json();
        setFichier({
          id: data.id,
          titre: data.titre,
          contacts: (data.contacts || []) as Contact[],
        });
        setTitleValue(data.titre);

        // Déclenche un rappel email/notif si des actions sont à échéance.
        // Fire-and-forget: ne doit jamais bloquer le chargement de la page.
        fetch(`/api/prospection/${params.id}/rappels`, { method: "POST" }).catch(
          () => undefined
        );

        if (talentsRes.ok) {
          const talentsData = await talentsRes.json();
          const list = (Array.isArray(talentsData) ? talentsData : talentsData.talents || []).map(
            (t: any) => ({
              id: t.id,
              name: `${t.prenom ?? ""} ${t.nom ?? ""}`.trim(),
            })
          );
          setTalents(list);
          if (list.length > 0) {
            setConvertTalentId((prev) => prev || list[0].id);
          }
        }
      } catch (e) {
        setToast({
          message: "Impossible de charger le fichier.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params.id]);

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
    fetchMentionable();
  }, []);

  const stats = useMemo(() => {
    if (!fichier) return { total: 0, gagnes: 0, caGagne: 0, budgetEnCours: 0 };
    const total = fichier.contacts.length;
    const gagnes = fichier.contacts.filter((c) => c.statut === "GAGNE").length;
    const caGagne = fichier.contacts
      .filter((c) => c.statut === "GAGNE")
      .reduce((sum, c) => sum + extractOpportunityAmount(c), 0);
    const budgetEnCours = fichier.contacts
      .filter((c) => ["EN_NEGOC", "EN_ATTENTE"].includes(c.statut))
      .reduce((sum, c) => sum + extractOpportunityAmount(c), 0);
    return { total, gagnes, caGagne, budgetEnCours };
  }, [fichier]);

  const handleTitleBlur = async () => {
    const newTitle = titleValue.trim();
    if (!fichier || !newTitle || newTitle === fichier.titre) {
      setTitleEditing(false);
      return;
    }
    try {
      setSavingTitle(true);
      const res = await fetch(`/api/prospection/${fichier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: newTitle }),
      });
      if (!res.ok) {
        throw new Error();
      }
      setFichier((prev) => (prev ? { ...prev, titre: newTitle } : prev));
      setToast({ message: "Titre mis à jour.", type: "success" });
    } catch {
      setTitleValue(fichier.titre);
      setToast({ message: "Erreur lors de la mise à jour du titre.", type: "error" });
    } finally {
      setSavingTitle(false);
      setTitleEditing(false);
    }
  };

  const handleUpdateContact = async (
    contactId: string,
    field: keyof Contact,
    value: string
  ) => {
    if (!fichier) return;
    const previous = fichier.contacts.find((c) => c.id === contactId) || null;
    const payload: any = { [field]: value };
    if (field === ("montantBrut" as keyof Contact)) {
      const parsed = parseFloat(value.replace(",", "."));
      payload.montantBrut = Number.isFinite(parsed) ? parsed : 0;
    }

    // Si on passe le statut principal à GAGNÉ / PERDU, aligner aussi la prochaine action
    if (field === "statut") {
      if (value === "GAGNE") {
        // Exiger un montant au moment du passage en gagné
        const enteredAmount = askWonAmount(previous?.montantBrut);
        if (enteredAmount === null) {
          return;
        }
        payload.montantBrut = enteredAmount;
        payload.prochainStatut = "GAGNE";
        payload.prochainDate = null;
      } else if (value === "PERDU") {
        payload.prochainStatut = "PERDU";
        payload.prochainDate = null;
      }
    }
    setSavingCell(`${contactId}-${field}`);
    try {
      const res = await fetch(
        `/api/prospection/${fichier.id}/contacts/${contactId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        throw new Error();
      }
      const updated = await res.json();
      setFichier((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.map((c) =>
                c.id === contactId ? { ...c, ...updated } : c
              ),
            }
          : prev
      );
      if (contactDetail && contactDetail.id === contactId) {
        setContactDetail({ ...contactDetail, ...(updated as Contact) });
      }
      if (field === "statut" && value === "GAGNE" && previous && previous.statut !== "GAGNE") {
        setConvertModal({
          open: true,
          contactId,
          nomOpportunite: previous.nomOpportunite,
        });
      }
    } catch {
      setToast({
        message: "Erreur lors de la sauvegarde.",
        type: "error",
      });
    } finally {
      setSavingCell(null);
    }
  };

  const openContactModal = async (index: number) => {
    if (!fichier) return;
    const contact = fichier.contacts[index];
    if (!contact) return;
    setActiveIndex(index);
    setModalOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/prospection/${fichier.id}/contacts/${contact.id}`
      );
      if (!res.ok) {
        throw new Error();
      }
      const data = (await res.json()) as ContactDetail;
      setContactDetail(data);
      setDetailNameValue(data.nomOpportunite || "");
      setDetailNameEditing(false);
      // Mettre à jour le compteur de commentaires sur la ligne du tableau
      setFichier((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.map((c) =>
                c.id === data.id ? { ...c, commentCount: data.commentaires.length } : c
              ),
            }
          : prev
      );
    } catch {
      setToast({
        message: "Erreur lors du chargement de l'opportunité.",
        type: "error",
      });
      setModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const navigateContact = (direction: "prev" | "next") => {
    if (!fichier) return;
    const total = fichier.contacts.length;
    if (total === 0) return;
    let nextIndex = activeIndex;
    if (direction === "prev") {
      nextIndex = activeIndex > 0 ? activeIndex - 1 : activeIndex;
    } else {
      nextIndex = activeIndex < total - 1 ? activeIndex + 1 : activeIndex;
    }
    if (nextIndex !== activeIndex) {
      openContactModal(nextIndex);
    }
  };

  const handleAddComment = async () => {
    if (!fichier || !contactDetail) return;
    const content = commentContent.trim();
    if (!content) return;
    try {
      const res = await fetch(
        `/api/prospection/${fichier.id}/contacts/${contactDetail.id}/commentaires`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contenu: content }),
        }
      );
      if (!res.ok) {
        throw new Error();
      }
      const created = await res.json();
      setContactDetail({
        ...contactDetail,
        commentaires: [...contactDetail.commentaires, created],
      });
      setCommentContent("");
      setFichier((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.map((c) =>
                c.id === contactDetail.id
                  ? {
                      ...c,
                      commentCount: (c.commentCount || 0) + 1,
                    }
                  : c
              ),
            }
          : prev
      );
    } catch {
      setToast({
        message: "Erreur lors de l'ajout du commentaire.",
        type: "error",
      });
    }
  };

  const handleSaveDetailName = async () => {
    if (!fichier || !contactDetail) return;
    const value = detailNameValue.trim();
    if (!value || value === contactDetail.nomOpportunite) {
      setDetailNameEditing(false);
      setDetailNameValue(contactDetail.nomOpportunite);
      return;
    }
    await handleUpdateContact(contactDetail.id, "nomOpportunite", value);
    setContactDetail((prev) =>
      prev ? { ...prev, nomOpportunite: value } : prev
    );
    setDetailNameEditing(false);
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getHistoriqueBadge = (detail: string) => {
    const match = detail.match(
      /(EN_ATTENTE|CONTACTE|EN_NEGOC|GAGNE|PERDU)$/
    );
    if (!match) return null;
    const statut = match[1] as StatutProspectionContact;
    const cfg = getStatutConfig(statut);
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.color}`}
      >
        {cfg.label}
      </span>
    );
  };

  const ensureTalentsLoaded = async () => {
    if (talents.length > 0) return;
    try {
      const res = await fetch("/api/talents");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = (Array.isArray(data) ? data : data.talents || []).map(
        (t: any) => ({
          id: t.id,
          name: `${t.prenom ?? ""} ${t.nom ?? ""}`.trim(),
        })
      );
      setTalents(list);
      if (list.length > 0) {
        setConvertTalentId(list[0].id);
      }
    } catch {
      setToast({
        message: "Impossible de charger la liste des talents.",
        type: "error",
      });
    }
  };

  const extractMarqueNom = (nomOpportunite: string) => {
    const parts = nomOpportunite.split(/\s+x\s+/i);
    const marqueNom = parts[1]?.trim() || "";
    return marqueNom;
  };

  const handleConfirmConvert = async () => {
    if (!fichier || !convertModal.contactId) return;
    if (!convertTalentId) {
      setToast({
        message: "Merci de sélectionner un talent.",
        type: "error",
      });
      return;
    }
    const montant = parseFloat(convertMontant.replace(",", "."));
    if (!montant || Number.isNaN(montant) || montant <= 0) {
      setToast({
        message: "Montant brut invalide.",
        type: "error",
      });
      return;
    }
    try {
      setConvertLoading(true);
      await ensureTalentsLoaded();
      const res = await fetch(
        `/api/prospection/${fichier.id}/contacts/${convertModal.contactId}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            talentId: convertTalentId,
            montant,
            notes: convertNotes.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la conversion");
      }
      const data = await res.json();
      setToast({
        message: "Négociation créée à partir de l'opportunité.",
        type: "success",
      });
      setConvertModal({ open: false, contactId: null, nomOpportunite: "" });
      setFichier((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.map((c) =>
                c.id === convertModal.contactId
                  ? { ...c, montantBrut: montant }
                  : c
              ),
            }
          : prev
      );
      setContactDetail((prev) =>
        prev && prev.id === convertModal.contactId
          ? { ...prev, montantBrut: montant }
          : prev
      );
      setConvertMontant("");
      setConvertNotes("");
      if (data.negociationId) {
        // On pourrait rediriger vers la négo si besoin
      }
    } catch (e: any) {
      setToast({
        message: e.message || "Erreur lors de la conversion.",
        type: "error",
      });
    } finally {
      setConvertLoading(false);
    }
  };

  const handleAddRow = async () => {
    if (!fichier) return;
    try {
      setSavingCell("new-row");
      const res = await fetch(`/api/prospection/${fichier.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomOpportunite: "Nouvelle opportunité" }),
      });
      if (!res.ok) {
        throw new Error();
      }
      const created = await res.json();
      setFichier((prev) =>
        prev ? { ...prev, contacts: [...prev.contacts, created] } : prev
      );
      setToast({ message: "Ligne ajoutée.", type: "success" });
    } catch {
      setToast({
        message: "Erreur lors de l'ajout de la ligne.",
        type: "error",
      });
    } finally {
      setSavingCell(null);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!fichier) return;
    try {
      setSavingCell(`delete-${contactId}`);
      const res = await fetch(
        `/api/prospection/${fichier.id}/contacts/${contactId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error();
      }
      setFichier((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.filter((c) => c.id !== contactId),
            }
          : prev
      );
      setToast({ message: "Ligne supprimée.", type: "success" });
    } catch {
      setToast({
        message: "Erreur lors de la suppression.",
        type: "error",
      });
    } finally {
      setSavingCell(null);
    }
  };

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Chargement du fichier...
      </div>
    );
  }

  if (!fichier) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/prospection")}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#1A1110]"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux fichiers de prospection
        </button>
        <p className="text-sm text-red-500">
          Ce fichier de prospection est introuvable ou inaccessible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/prospection")}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#1A1110]"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div>
            {titleEditing ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                className="text-2xl font-semibold text-[#1A1110] bg-transparent border-b border-[#C8F285] outline-none min-w-[200px]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setTitleEditing(true)}
                className="text-2xl font-semibold text-[#1A1110] font-['Spectral',serif] text-left"
              >
                {fichier.titre}
              </button>
            )}
            {savingTitle && (
              <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Sauvegarde du titre...
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#F5EBE0] text-xs text-[#1A1110]">
            {stats.total} contacts · {stats.gagnes} gagnés
          </span>
        </div>
      </div>

      {/* Tableau */}
      <div className="w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F5EBE0] text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-center w-10"></th>
              <th className="px-3 py-2 text-center w-10">
                <MessageCircle className="w-4 h-4 inline-block" />
              </th>
              <th className="px-3 py-2 text-left w-10">#</th>
              <th className="px-3 py-2 text-left min-w-[160px]">
                Talent
              </th>
              <th className="px-3 py-2 text-left min-w-[200px]">
                Nom d&apos;opportunité
              </th>
              <th className="px-3 py-2 text-left min-w-[120px]">Prénom</th>
              <th className="px-3 py-2 text-left min-w-[120px]">Nom</th>
              <th className="px-3 py-2 text-left min-w-[200px]">E-mail</th>
              <th className="px-3 py-2 text-left min-w-[140px]">Statut</th>
              <th className="px-3 py-2 text-left min-w-[130px]">Montant HT</th>
              <th className="px-3 py-2 text-center w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fichier.contacts.map((contact, index) => {
              const statutConfig = getStatutConfig(contact.statut);
              return (
                <tr
                  key={contact.id}
                  className="border-t border-gray-50 hover:bg-[#F5EBE0]/40"
                >
                  <td className="px-3 py-2 text-center align-middle">
                    <ActionButton
                      contact={contact}
                      fichierId={fichier.id}
                      onContactUpdated={(updated) => {
                        setFichier((prev) =>
                          prev
                            ? {
                                ...prev,
                                contacts: prev.contacts.map((c) =>
                                  c.id === updated.id ? { ...c, ...updated } : c
                                ),
                              }
                            : prev
                        );
                        if (contactDetail?.id === updated.id) {
                          setContactDetail((prev) =>
                            prev ? { ...prev, ...updated } : prev
                          );
                        }
                      }}
                      onTriggerConvert={(id, nomOpp) =>
                        setConvertModal({
                          open: true,
                          contactId: id,
                          nomOpportunite: nomOpp,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center align-middle">
                    <button
                      type="button"
                      onClick={() => openContactModal(index)}
                      className="relative inline-flex items-center justify-center rounded-full p-1.5"
                    >
                      <MessageCircle
                        className={`w-4 h-4 ${
                          contact.commentCount && contact.commentCount > 0
                            ? "text-[#C08B8B]"
                            : "text-gray-300"
                        }`}
                      />
                      {contact.commentCount && contact.commentCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                          {contact.commentCount > 9 ? "9+" : contact.commentCount}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 align-middle">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <select
                      value={contact.talentId || ""}
                      onChange={(e) =>
                        handleUpdateContact(
                          contact.id,
                          "talentId" as keyof Contact,
                          e.target.value
                        )
                      }
                      onFocus={ensureTalentsLoaded}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8F285]"
                    >
                      <option value="">Sélectionner un talent</option>
                      {talents.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => openContactModal(index)}
                      className="text-sm font-medium text-[#1A1110] hover:underline hover:underline-offset-2 cursor-pointer"
                    >
                      {contact.nomOpportunite}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <EditableInput
                      value={contact.prenom || ""}
                      placeholder="Prénom"
                      saving={savingCell === `${contact.id}-prenom`}
                      onSave={(value) =>
                        handleUpdateContact(contact.id, "prenom", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <EditableInput
                      value={contact.nom || ""}
                      placeholder="Nom"
                      saving={savingCell === `${contact.id}-nom`}
                      onSave={(value) =>
                        handleUpdateContact(contact.id, "nom", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <EditableInput
                      value={contact.email || ""}
                      placeholder="email@marque.com"
                      saving={savingCell === `${contact.id}-email`}
                      onSave={(value) =>
                        handleUpdateContact(contact.id, "email", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <StatutDropdown
                      value={contact.statut}
                      saving={savingCell === `${contact.id}-statut`}
                      onChange={(value) =>
                        handleUpdateContact(contact.id, "statut", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <EditableInput
                      value={
                        contact.montantBrut !== null && contact.montantBrut !== undefined
                          ? String(contact.montantBrut)
                          : ""
                      }
                      placeholder="0"
                      saving={savingCell === `${contact.id}-montantBrut`}
                      onSave={(value) =>
                        handleUpdateContact(
                          contact.id,
                          "montantBrut" as keyof Contact,
                          value
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center align-middle">
                    <button
                      type="button"
                      onClick={() => handleDeleteContact(contact.id)}
                      disabled={savingCell === `delete-${contact.id}`}
                      className="inline-flex items-center justify-center rounded-full p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {savingCell === `delete-${contact.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3 flex items-center justify-between text-sm rounded-t-xl">
        <span className="text-gray-500">
          {stats.total} contacts · {stats.gagnes} gagnés
        </span>
        <div className="flex items-center gap-6">
          <span>
            CA gagné :
            <span className="font-semibold text-green-600 ml-1">
              {stats.caGagne.toLocaleString("fr-FR")} €
            </span>
          </span>
          <span>
            Budget en cours :
            <span className="font-semibold text-amber-600 ml-1">
              {stats.budgetEnCours.toLocaleString("fr-FR")} €
            </span>
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">
          Les modifications sont enregistrées automatiquement.
        </p>
        <button
          type="button"
          onClick={handleAddRow}
          disabled={savingCell === "new-row"}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5EBE0] text-xs font-medium text-[#1A1110] hover:bg-[#F5EBE0]/80 disabled:opacity-60"
        >
          {savingCell === "new-row" && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
          Ajouter une ligne
        </button>
      </div>

      {/* Modale opportunité */}
      {modalOpen && contactDetail && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 flex items-center gap-3 text-xs text-gray-500">
              <span>
                {activeIndex + 1}/{fichier.contacts.length}
              </span>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-5 md:p-6 overflow-y-auto border-r border-gray-100">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                {detailNameEditing ? (
                  <input
                    autoFocus
                    value={detailNameValue}
                    onChange={(e) => setDetailNameValue(e.target.value)}
                    onBlur={handleSaveDetailName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                      if (e.key === "Escape") {
                        setDetailNameEditing(false);
                        setDetailNameValue(contactDetail.nomOpportunite);
                      }
                    }}
                    className="w-full md:max-w-xl text-lg md:text-xl font-semibold text-[#1A1110] font-['Spectral',serif] bg-transparent border-b border-[#C8F285] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetailNameEditing(true)}
                    className="text-left text-lg md:text-xl font-semibold text-[#1A1110] font-['Spectral',serif] hover:underline hover:underline-offset-4"
                  >
                    {contactDetail.nomOpportunite}
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <ActionButton
                    contact={contactDetail}
                    fichierId={fichier.id}
                    compact
                    onContactUpdated={(updated) => {
                      setContactDetail((prev) =>
                        prev ? { ...prev, ...updated } : prev
                      );
                      setFichier((prev) =>
                        prev
                          ? {
                              ...prev,
                              contacts: prev.contacts.map((c) =>
                                c.id === updated.id ? { ...c, ...updated } : c
                              ),
                            }
                          : prev
                      );
                    }}
                    onTriggerConvert={(id, nomOpp) =>
                      setConvertModal({
                        open: true,
                        contactId: id,
                        nomOpportunite: nomOpp,
                      })
                    }
                  />
                  <StatutDropdown
                    value={contactDetail.statut}
                    saving={savingCell === `${contactDetail.id}-statut`}
                    onChange={(value) =>
                      handleUpdateContact(contactDetail.id, "statut", value)
                    }
                  />
                </div>
              </div>

              {/* Infos contact */}
              <div className="mb-4 rounded-xl border border-gray-100 bg-[#F5EBE0]/40 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Infos contact
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Prénom</p>
                    <p className="rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-[#1A1110]">
                      {contactDetail.prenom || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Nom</p>
                    <p className="rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-[#1A1110]">
                      {contactDetail.nom || "—"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">E-mail</p>
                    <p className="rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-[#1A1110] break-all">
                      {contactDetail.email || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Commentaires */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Activité
                </p>
                <div className="space-y-3 mb-3">
                  {contactDetail.commentaires.map((c) => (
                    <div key={c.id} className="flex gap-3 text-sm">
                      <div className="mt-1 h-7 w-7 rounded-full bg-[#F5EBE0] flex items-center justify-center text-[11px] text-[#1A1110]">
                        {(c.auteur.name || "?").charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">
                          <span className="font-medium text-[#1A1110]">
                            {c.auteur.name}
                          </span>{" "}
                          · {formatDateTime(c.createdAt)}
                        </p>
                        <p className="text-[13px] text-[#1A1110] whitespace-pre-line">
                          {renderCommentWithMentions(
                            c.contenu,
                            new Map<
                              string,
                              { firstName: string; lastName: string }
                            >([
                              ...mentionableUsers.map(
                                (
                                  u
                                ): [
                                  string,
                                  { firstName: string; lastName: string }
                                ] => [
                                  u.id,
                                  {
                                    firstName: u.firstName,
                                    lastName: u.lastName,
                                  },
                                ]
                              ),
                            ]),
                            (session?.user as { id?: string })?.id,
                            { accentColor: "#C08B8B" }
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  {contactDetail.commentaires.length === 0 && (
                    <p className="text-xs text-gray-400">
                      Aucun commentaire pour le moment.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <MentionTextarea
                    value={commentContent}
                    onChange={setCommentContent}
                    placeholder="Renseignez une activité, commentez... (tapez @ pour mentionner)"
                    rows={3}
                    mentionableUsers={mentionableUsers}
                    className="rounded-xl border-gray-200 focus:ring-2 focus:ring-[#C8F285]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddComment}
                      className="inline-flex items-center gap-2 rounded-full bg-[#C8F285] px-4 py-1.5 text-xs font-medium text-[#1A1110] shadow-sm hover:shadow-md"
                    >
                      Commenter
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Colonne droite */}
            <div className="w-full md:w-[40%] p-5 md:p-6 bg-white overflow-y-auto">
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Propriétaire
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-[#F5EBE0]/40 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-[#1A1110] text-white flex items-center justify-center text-[11px]">
                    {/* Pas de vraie image pour l'instant */}
                    {contactDetail.fichier.titre.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#1A1110]">
                      Fichier: {contactDetail.fichier.titre}
                    </p>
                    <p className="text-[11px] text-gray-500">TM responsable du fichier</p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Historique
                </p>
                <div className="space-y-2 text-xs">
                  <p className="text-gray-500">
                    Opportunité créée le{" "}
                    {formatDateTime(contactDetail.createdAt)}
                  </p>
                  {contactDetail.historique.map((h) => (
                    <div key={h.id} className="flex gap-2">
                      <span className="text-[11px] text-gray-400 mt-0.5 min-w-[70px]">
                        {formatDateTime(h.createdAt)}
                      </span>
                      <div className="flex-1">
                        <p className="text-[11px] text-gray-500 mb-0.5">
                          {h.auteur.name}
                        </p>
                        <p className="text-[12px] text-[#1A1110] flex items-center gap-2">
                          {h.detail}
                          {h.type === "STATUT_CHANGE" &&
                            getHistoriqueBadge(h.detail)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {contactDetail.historique.length === 0 && (
                    <p className="text-xs text-gray-400">
                      Aucun événement enregistré.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-[#1A1110]"
                  onClick={() => navigateContact("prev")}
                >
                  ‹ Précédent
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-[#1A1110]"
                  onClick={() => navigateContact("next")}
                >
                  Suivant ›
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale conversion GAGNÉ → négo */}
      {convertModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() =>
            !convertLoading &&
            setConvertModal({ open: false, contactId: null, nomOpportunite: "" })
          }
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#1A1110] mb-1 font-['Spectral',serif]">
              🎉 Opportunité gagnée !
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Créer une négociation à partir de cette opportunité ?
            </p>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Talent *</p>
                <select
                  value={convertTalentId}
                  onChange={(e) => setConvertTalentId(e.target.value)}
                  onFocus={ensureTalentsLoaded}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285]"
                >
                  <option value="">Sélectionner un talent</option>
                  {talents.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Marque</p>
                <input
                  type="text"
                  value={extractMarqueNom(convertModal.nomOpportunite)}
                  readOnly
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Montant brut (€)</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={convertMontant}
                  onChange={(e) => setConvertMontant(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285]"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <textarea
                  value={convertNotes}
                  onChange={(e) => setConvertNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285]"
                  placeholder="Infos supplémentaires pour la négo (optionnel)"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-between gap-3">
              <button
                type="button"
                disabled={convertLoading}
                onClick={() =>
                  setConvertModal({
                    open: false,
                    contactId: null,
                    nomOpportunite: "",
                  })
                }
                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
              >
                Ignorer
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={convertLoading}
                  onClick={handleConfirmConvert}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {convertLoading && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  Créer la négociation →
                </button>
                <button
                  type="button"
                  disabled={convertLoading || !convertTalentId}
                  onClick={() => {
                    const talentId = convertTalentId;
                    const marque = encodeURIComponent(
                      extractMarqueNom(convertModal.nomOpportunite) || ""
                    );
                    const montant = encodeURIComponent(convertMontant || "");
                    setConvertModal({
                      open: false,
                      contactId: null,
                      nomOpportunite: "",
                    });
                    router.push(
                      `/collaborations/new?talent=${talentId}${
                        marque ? `&marque=${marque}` : ""
                      }${montant ? `&montantBrut=${montant}` : ""}`
                    );
                  }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-[#1A1110] disabled:opacity-60"
                  style={{ background: "#C8F285" }}
                >
                  Créer une collaboration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`rounded-lg px-4 py-2 text-xs shadow-lg ${
              toast.type === "success"
                ? "bg-[#1A1110] text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

function EditableInput({
  value,
  placeholder,
  saving,
  onSave,
}: {
  value: string;
  placeholder?: string;
  saving?: boolean;
  onSave: (value: string) => void;
}) {
  const [internal, setInternal] = useState(value);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  const handleBlur = () => {
    if (internal !== value) {
      onSave(internal);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-full bg-transparent border-b border-transparent focus:border-[#C8F285] outline-none text-sm py-0.5"
        placeholder={placeholder}
      />
      {saving && (
        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
      )}
    </div>
  );
}

function StatutDropdown({
  value,
  saving,
  onChange,
}: {
  value: StatutProspectionContact;
  saving?: boolean;
  onChange: (value: StatutProspectionContact) => void;
}) {
  const config = getStatutConfig(value);

  return (
    <div className="inline-flex items-center gap-1">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as StatutProspectionContact)}
        className={`rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#C8F285] ${config.color}`}
      >
        {STATUTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {saving && (
        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
      )}
    </div>
  );
}

interface ActionButtonProps {
  contact: Contact;
  fichierId: string;
  onContactUpdated: (contact: Contact) => void;
  onTriggerConvert: (contactId: string, nomOpportunite: string) => void;
  compact?: boolean;
}

function ActionButton({
  contact,
  fichierId,
  onContactUpdated,
  onTriggerConvert,
  compact,
}: ActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [statut, setStatut] = useState<StatutAction | null>(
    contact.prochainStatut ?? null
  );
  const [date, setDate] = useState<string>(
    contact.prochainDate
      ? contact.prochainDate.slice(0, 10)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        })()
  );
  const [actionPrevue, setActionPrevue] = useState<string>(
    contact.actionPrevue || ""
  );
  const [derniereFait, setDerniereFait] = useState<string>(
    contact.derniereFait || ""
  );
  const [saving, setSaving] = useState(false);

  const info = getActionIcon(contact);
  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 640;

  // Garder le popover synchronisé avec les dernières données du contact
  useEffect(() => {
    setStatut(contact.prochainStatut ?? null);
    if (contact.prochainDate) {
      setDate(contact.prochainDate.slice(0, 10));
    }
    setActionPrevue(contact.actionPrevue || "");
    setDerniereFait(contact.derniereFait || "");
  }, [
    contact.prochainStatut,
    contact.prochainDate,
    contact.actionPrevue,
    contact.derniereFait,
  ]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const body: any = {
        prochainStatut: statut,
        actionPrevue: actionPrevue.trim() || null,
        derniereFait: derniereFait.trim() || null,
      };
      if (statut === "EN_ATTENTE") {
        body.prochainDate = date ? new Date(date).toISOString() : null;
      } else if (statut === null) {
        body.prochainDate = null;
      }

      // Si on marque l'action comme Gagné / Perdu depuis le popover,
      // on aligne aussi le statut principal de l'opportunité
      if (statut === "GAGNE") {
        const enteredAmount = askWonAmount(contact.montantBrut);
        if (enteredAmount === null) {
          setSaving(false);
          return;
        }
        body.statut = "GAGNE";
        body.montantBrut = enteredAmount;
      } else if (statut === "PERDU") {
        body.statut = "PERDU";
      }

      const res = await fetch(
        `/api/prospection/${fichierId}/contacts/${contact.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        throw new Error("Erreur lors de la sauvegarde de l'action");
      }
      const updated = (await res.json()) as Contact;
      // Forcer la synchro locale du statut si on l'a changé via le popover
      const merged: Contact = {
        ...contact,
        ...updated,
        statut:
          statut === "GAGNE"
            ? "GAGNE"
            : statut === "PERDU"
            ? "PERDU"
            : updated.statut,
      };
      onContactUpdated(merged);
      setOpen(false);
      if (statut === "GAGNE") {
        onTriggerConvert(updated.id, updated.nomOpportunite);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const IconComponent =
    info.icon === "AlertCircle"
      ? AlertCircle
      : info.icon === "Clock"
      ? Clock
      : info.icon === "Trophy"
      ? Trophy
      : info.icon === "Frown"
      ? Frown
      : info.icon === "Meh"
      ? Meh
      : Plus;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center rounded-full ${
          compact ? "px-3 py-1 text-xs" : "p-1.5"
        } ${info.color}`}
        title={info.label}
      >
        <IconComponent className={compact ? "w-3 h-3" : "w-4 h-4"} />
        {compact && info.label && (
          <span className="ml-2 text-[11px] text-white">
            {info.label}
          </span>
        )}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end md:items-start md:justify-center bg-black/30"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className={`bg-white w-full md:w-[420px] md:rounded-2xl md:shadow-xl ${
              isMobile ? "rounded-t-2xl" : "rounded-2xl mt-24"
            } p-4 md:p-5`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-600">
                Prochaine action
              </p>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(
                [
                  ["A_FAIRE", "❗ A faire"],
                  ["EN_ATTENTE", "🕐 En attente"],
                  ["GAGNE", "🏆 Gagné"],
                  ["PERDU", "😞 Perdu"],
                  ["ANNULE", "😐 Annulé"],
                ] as [StatutAction, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatut(value)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    statut === value
                      ? "bg-[#C8F285] border-[#C8F285] text-[#1A1110]"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {statut === "EN_ATTENTE" && (
              <div className="mb-3 space-y-2">
                <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                  💙 N&apos;oubliez jamais une opportunité ! En attente = rappel.
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">
                    Date du rappel
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8F285]"
                  />
                </div>
              </div>
            )}
            <div className="mb-3 space-y-2">
              <label className="text-xs text-gray-600">
                Ce que vous allez faire (facultatif)
              </label>
              <textarea
                value={actionPrevue}
                onChange={(e) => setActionPrevue(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8F285]"
              />
            </div>
            <div className="mb-4 space-y-2">
              <label className="text-xs text-gray-600">
                Ce que vous avez fait (facultatif)
              </label>
              <textarea
                value={derniereFait}
                onChange={(e) => setDerniereFait(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8F285]"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C8F285] text-xs font-medium text-[#1A1110] shadow-sm hover:shadow-md disabled:opacity-60"
              >
                {saving && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

