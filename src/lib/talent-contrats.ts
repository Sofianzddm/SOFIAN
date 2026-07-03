// Constantes partagées du flux "Contrats talent en signature électronique"
// (fiche talent → builder DocuSeal → email Resend "Votre contrat Glow Up").

/** Rôles autorisés à voir et gérer les contrats talent (fiche talent + API). */
export const CONTRAT_TALENT_ROLES = ["ADMIN", "HEAD_OF_INFLUENCE"];

/** Statuts d'un TalentContrat. */
export type TalentContratStatut =
  | "BROUILLON"
  | "EN_ATTENTE_TALENT"
  | "EN_ATTENTE_AGENCE"
  | "SIGNE";
