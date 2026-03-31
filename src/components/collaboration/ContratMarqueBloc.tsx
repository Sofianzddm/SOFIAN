"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Loader2, Upload } from "lucide-react";

type CurrentUser = {
  id: string;
  nom: string;
  role: string;
};

type CollaborationContratMarque = {
  id: string;
  marque: { nom: string };
  talent: { prenom: string; nom: string; managerId?: string | null };
  contratMarquePdfUrl?: string | null;
  contratMarqueStatut?: string | null;
  contratMarqueMode?: string | null;
  contratSubmissionId?: string | null;
  contratMarqueVersionActuelle?: number;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = currentUser.role;
  const canManage = role === "ADMIN" || role === "HEAD_OF_INFLUENCE";
  const isTmAssigne = collaboration.talent.managerId === currentUser.id;
  const canComment = canManage || isTmAssigne;
  const canRead = canComment;

  const statut = collaboration.contratMarqueStatut ?? "AUCUN";

  const docusealUrl = useMemo(() => {
    if (!collaboration.contratSubmissionId) return "";
    const base = (process.env.NEXT_PUBLIC_DOCUSEAL_URL || "https://docuseal.com").replace(/\/$/, "");
    return `${base}/submissions/${collaboration.contratSubmissionId}`;
  }, [collaboration.contratSubmissionId]);

  if (!canRead) return null;

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/collaborations/${collaboration.id}/contrat-marque/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Erreur upload contrat");
        return;
      }
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
            <p className="text-sm text-gray-400">Aucun contrat reçu.</p>
            {canManage && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Uploader le contrat reçu
                </button>
              </>
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
    </div>
  );
}
