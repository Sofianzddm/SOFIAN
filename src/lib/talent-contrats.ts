// Constantes partagées du flux "Contrats talent en signature électronique"
// (fiche talent → builder DocuSeal → email Resend "Votre contrat Glow Up").

/** Rôles autorisés à gérer les contrats talent (mêmes rôles que le flux devis). */
export const CONTRAT_TALENT_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "TM",
];

/** Statuts d'un TalentContrat. */
export type TalentContratStatut =
  | "BROUILLON"
  | "EN_ATTENTE_TALENT"
  | "EN_ATTENTE_AGENCE"
  | "SIGNE";
