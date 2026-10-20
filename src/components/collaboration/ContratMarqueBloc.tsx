"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Upload } from "lucide-react";
import { canReadContratMarqueReview, canUploadContratMarque } from "@/lib/contratMarqueAccess";
import {
  hasStoredContratMarqueClientContact,
  resolveContratMarqueClientContact,
  type ContratMarqueClientContact,
} from "@/lib/contratMarqueClientContact";
import ContratMarqueUploadModal from "@/components/contrat-marque/ContratMarqueUploadModal";

type CurrentUser = {
  id: string;
  nom: string;
  role: string;
};

type CollaborationContratMarque = {
  id: string;
  isPrivate?: boolean;
  marque: {
    nom: string;
    contacts?: Array<{
      prenom?: string | null;
      nom: string;
      email?: string | null;
      telephone?: string | null;
      poste?: string | null;
      principal?: boolean;
    }>;
  };
  talent: {
    prenom: string;
    nom: string;
    managerId?: string | null;
    delegations?: { tmRelaiId?: string; actif?: boolean }[];
  };
  accountManagerId?: string | null;
  accountManager?: { role?: string | null } | null;
  negociation?: {
    contactMarque?: string | null;
    emailContact?: string | null;
  } | null;
  contratMarquePdfUrl?: string | null;
  contratMarqueStatut?: string | null;
  contratMarqueMode?: string | null;
  contratSubmissionId?: string | null;
  contratMarqueVersionActuelle?: number;
  contratMarqueContactNom?: string | null;
  contratMarqueContactEmail?: string | null;
  contratMarqueContactTelephone?: string | null;
  contratMarqueCommentaires?: { id: string }[];
  contratMarqueAnnotations?: { id: string }[];
  contratMarquePdfOfficielSigneDeposeAt?: string | Date | null;
};

type Props = {
  collaboration: CollaborationContratMarque;
  currentUser: CurrentUser;
  onRefresh: () => Promise<void>;
};

function statusBadge(statut: string): { className: string; label: string } | null {
  switch (statut) {
    case "EN_ATTENTE_JURISTE":
      return {
        className: "bg-amber-100 text-amber-900 border border-amber-200/80",
        label: "En attente du juriste",
      };
    case "A_MODIFIER":
      return {
        className: "bg-red-100 text-red-900 border border-red-200/80",
        label: "Modifications demandées",
      };
    case "APPROUVE":
      return {
        className: "bg-blue-100 text-blue-900 border border-blue-200/80",
        label: "Approuvé par le juriste",
      };
    case "EN_SIGNATURE":
      return {
        className: "bg-amber-100 text-amber-900 border border-amber-200/80",
        label: "Envoyé en signature",
      };
    case "SIGNE":
      return {
        className: "bg-emerald-100 text-emerald-900 border border-emerald-200/80",
        label: "Contrat signé ✓",
      };
    default:
      return null;
  }
}

export default function ContratMarqueBloc({ collaboration, currentUser, onRefresh }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const collabAccess = {
    isPrivate: collaboration.isPrivate ?? false,
    accountManagerId: collaboration.accountManagerId ?? null,
    accountManager: collaboration.accountManager ?? null,
    talent: {
      managerId: collaboration.talent.managerId,
      delegations: collaboration.talent.delegations,
    },
  };
  const canUploadContract = canUploadContratMarque(
    currentUser.id,
    currentUser.role,
    collabAccess
  );
  const canRead = canReadContratMarqueReview(
    currentUser.id,
    currentUser.role,
    collabAccess
  );

  const statut = collaboration.contratMarqueStatut ?? "AUCUN";

  const suggestedContact: ContratMarqueClientContact | null = useMemo(
    () =>
      resolveContratMarqueClientContact({
        collaboration,
        negociation: collaboration.negociation,
        marqueContacts: collaboration.marque.contacts,
      }),
    [collaboration]
  );

  const storedContactLabel = hasStoredContratMarqueClientContact(collaboration)
    ? [collaboration.contratMarqueContactNom, collaboration.contratMarqueContactEmail]
        .filter(Boolean)
        .join(" · ")
    : null;

  const docusealUrl = useMemo(() => {
    if (!collaboration.contratSubmissionId) return "";
    const base = (process.env.NEXT_PUBLIC_DOCUSEAL_URL || "https://docuseal.com").replace(/\/$/, "");
    return `${base}/submissions/${collaboration.contratSubmissionId}`;
  }, [collaboration.contratSubmissionId]);

  if (!canRead) return null;

  const uploadWithContact = async (payload: {
    file: File;
    contact: { nom: string; email: string; telephone: string };
  }) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("contactNom", payload.contact.nom);
      formData.append("contactEmail", payload.contact.email);
      if (payload.contact.telephone.trim()) {
        formData.append("contactTelephone", payload.contact.telephone.trim());
      }
      const res = await fetch(`/api/collaborations/${collaboration.id}/contrat-marque/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((data as { error?: string }).error || "Erreur upload contrat");
        return;
      }
      setUploadModalOpen(false);
      await onRefresh();
    } finally {
      setUploading(false);
    }
  };

  const badge = statut !== "AUCUN" ? statusBadge(statut) : null;
  const versionNum = Math.max(1, collaboration.contratMarqueVersionActuelle ?? 0);
  const nbAnnot = collaboration.contratMarqueAnnotations?.length ?? 0;
  const nbComments = collaboration.contratMarqueCommentaires?.length ?? 0;
  const infoLine = `V${versionNum} • ${nbAnnot} annotation${nbAnnot !== 1 ? "s" : ""} • ${nbComments} commentaire${nbComments !== 1 ? "s" : ""}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white">
        <h2 className="font-semibold text-glowup-licorice text-sm uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Contrat Marque
        </h2>
      </div>
      <div className="p-5">
        {statut === "AUCUN" && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-400">
              Aucun contrat reçu. Contact client obligatoire à l’upload.
            </p>
            {canUploadContract && (
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                disabled={uploading}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
              >
                <Upload className="w-4 h-4" />
                Uploader le contrat reçu
              </button>
            )}
          </div>
        )}

        {statut !== "AUCUN" && (
          <div className="space-y-3">
            {badge && (
              <span className={`inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-0.5 ${badge.className}`}>
                {badge.label}
              </span>
            )}
            <p className="text-sm text-gray-500">{infoLine}</p>
            {storedContactLabel ? (
              <p className="text-xs text-gray-600">
                <span className="text-gray-400">Contact client :</span> {storedContactLabel}
              </p>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Contact client manquant — rouvrez la review pour uploader une version avec contact.
              </p>
            )}
            {statut === "SIGNE" && !collaboration.contratMarquePdfOfficielSigneDeposeAt ? (
              <p
                className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300/80 rounded-lg px-3 py-2"
                role="status"
              >
                PDF officiel signé non déposé — ouvrez la review et déposez le fichier (glisser-déposer ou
                upload).
              </p>
            ) : null}
            {statut === "SIGNE" && collaboration.contratMarquePdfOfficielSigneDeposeAt ? (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-lg px-3 py-2">
                PDF officiel signé déposé le{" "}
                {new Date(collaboration.contratMarquePdfOfficielSigneDeposeAt as string | Date).toLocaleDateString(
                  "fr-FR",
                  { day: "2-digit", month: "long", year: "numeric" }
                )}
                .
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/collaborations/${collaboration.id}/contrat-marque`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Ouvrir la review
                <ArrowRight className="w-4 h-4" />
              </Link>
              {statut === "SIGNE" && collaboration.contratMarqueMode === "DOCUSEAL" && docusealUrl && (
                <a
                  href={docusealUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-glowup-licorice hover:bg-gray-50"
                >
                  Voir le contrat signé
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <ContratMarqueUploadModal
        open={uploadModalOpen}
        uploading={uploading}
        initialContact={suggestedContact}
        onClose={() => {
          if (!uploading) setUploadModalOpen(false);
        }}
        onConfirm={uploadWithContact}
      />
    </div>
  );
}
