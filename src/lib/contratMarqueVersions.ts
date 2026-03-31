import type { ContratMarqueAnnotation, ContratMarqueVersion } from "@prisma/client";
import { annotationsForClient, type AnnotationRow } from "@/lib/serializeContratMarqueReview";

export type ContratMarqueVersionClient = {
  id: string;
  collaborationId: string;
  numero: number;
  pdfUrl: string;
  statut: string;
  uploadedAt: string;
  approuveAt: string | null;
  modifDemandeAt: string | null;
  annotations: AnnotationRow[];
};

type CollabWithVersions = {
  contratMarqueVersionActuelle: number;
  contratMarqueAnnotations: ContratMarqueAnnotation[];
  contratMarqueVersions: (ContratMarqueVersion & { annotations: ContratMarqueAnnotation[] })[];
};

/** Fusionne les annotations sans versionId sur la V1 uniquement (même PDF qu’avant le versioning). */
export function buildContratMarqueVersionsForClient(collab: CollabWithVersions): ContratMarqueVersionClient[] {
  const legacy = collab.contratMarqueAnnotations.filter((a) => a.versionId == null);
  return collab.contratMarqueVersions.map((v) => {
    const rows = [...v.annotations];
    if (v.numero === 1) {
      rows.push(...legacy);
    }
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return {
      id: v.id,
      collaborationId: v.collaborationId,
      numero: v.numero,
      pdfUrl: v.pdfUrl,
      statut: v.statut,
      uploadedAt: v.uploadedAt.toISOString(),
      approuveAt: v.approuveAt?.toISOString() ?? null,
      modifDemandeAt: v.modifDemandeAt?.toISOString() ?? null,
      annotations: annotationsForClient(rows),
    };
  });
}
