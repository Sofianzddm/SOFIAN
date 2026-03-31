import type { ContratMarqueAnnotation, ContratMarqueCommentaire } from "@prisma/client";

export type AnnotationRow = {
  id: string;
  auteurId: string;
  auteurNom: string;
  auteurRole: string;
  content: { text?: string; comment?: string };
  position: object;
  color: string;
  type: string;
  resolved: boolean;
  createdAt: string;
};

export type CommentRow = {
  id: string;
  auteur: string;
  auteurRole: string;
  contenu: string;
  createdAt: string;
};

export function annotationsForClient(rows: ContratMarqueAnnotation[]): AnnotationRow[] {
  return rows.map((a) => ({
    id: a.id,
    auteurId: a.auteurId,
    auteurNom: a.auteurNom,
    auteurRole: a.auteurRole,
    content: a.content as AnnotationRow["content"],
    position: a.position as object,
    color: a.color,
    type: a.type,
    resolved: a.resolved,
    createdAt: a.createdAt.toISOString(),
  }));
}

export function commentairesForClient(rows: ContratMarqueCommentaire[]): CommentRow[] {
  return rows.map((c) => ({
    id: c.id,
    auteur: c.auteur,
    auteurRole: c.auteurRole,
    contenu: c.contenu,
    createdAt: c.createdAt.toISOString(),
  }));
}

/** Messages du fil « général » : version actuelle uniquement + legacy `versionId` null (avant le champ). */
export function commentairesForCurrentVersionOnly(collab: {
  contratMarqueVersionActuelle: number;
  contratMarqueVersions: { id: string; numero: number }[];
  contratMarqueCommentaires: ContratMarqueCommentaire[];
}): CommentRow[] {
  if (collab.contratMarqueVersions.length === 0) {
    return commentairesForClient(collab.contratMarqueCommentaires);
  }
  const latest =
    collab.contratMarqueVersions.find((v) => v.numero === collab.contratMarqueVersionActuelle) ??
    collab.contratMarqueVersions[collab.contratMarqueVersions.length - 1];
  if (!latest) {
    return commentairesForClient(collab.contratMarqueCommentaires);
  }
  const filtered = collab.contratMarqueCommentaires.filter(
    (c) => c.versionId == null || c.versionId === latest.id
  );
  return commentairesForClient(filtered);
}
