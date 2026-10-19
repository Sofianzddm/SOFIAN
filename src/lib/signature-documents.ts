// Outil signature documents entreprise (DocuSeal) — rôles + helpers

export const SIGNATURE_DOCUMENT_ROLES = ["ADMIN"] as const;

export type SignatureDocumentStatut = "BROUILLON" | "EN_ATTENTE" | "SIGNE";

export {
  type ContratSignataire as SignatureSignataire,
  parseContratSignataires as parseSignatureSignataires,
  dedupeSignatairesByEmail,
  validateSignatairesInput,
} from "@/lib/collab-contrat-upload";
