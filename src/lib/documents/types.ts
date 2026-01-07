// src/lib/documents/types.ts

export type TypeDocument = "DEVIS" | "FACTURE" | "AVOIR" | "BDC";
export type StatutDocument = "BROUILLON" | "ENVOYE" | "VALIDE" | "PAYE" | "ANNULE";
export type TypeTVA = "FRANCE" | "EU_INTRACOM" | "EU_SANS_TVA" | "HORS_EU";

export interface LigneDocument {
  description: string;
  quantite: number;
  prixUnitaireHT: number;
  tauxTVA: number;
  totalHT: number;
}

export interface ClientDocument {
  raisonSociale: string;
  contactNom?: string;
  contactPrenom?: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  tvaIntracom?: string;
  siret?: string;
}

export interface DocumentData {
  // Identifiants
  id: string;
  numero: string; // Ex: F-2026-0001
  type: TypeDocument;
  statut: StatutDocument;

  // Dates
  dateDocument: Date;
  dateEmission: Date;
  dateEcheance: Date;

  // Références
  collaborationId?: string;
  devisRef?: string; // Pour les factures, référence au devis
  factureRef?: string; // Pour les avoirs, référence à la facture
  poClient?: string; // Numéro de PO client

  // Talent
  talent: {
    prenom: string;
    nom: string;
    instagram?: string;
    tiktok?: string;
  };

  // Marque
  marque: {
    nom: string;
  };

  // Client (peut être différent de la marque)
  client: ClientDocument;

  // Titre
  titre: string; // Ex: "Kelly x Huggies - Décembre 2025 - PO-189803"

  // Lignes
  lignes: LigneDocument[];

  // Totaux
  totalHT: number;
  totalTVA: number;
  totalTTC: number;

  // TVA
  typeTVA: TypeTVA;
  tauxTVA: number;
  mentionTVA?: string;

  // Paiement
  modePaiement: string;
  commentaires?: string;

  // Métadonnées
  createdAt: Date;
  createdBy: string;
  pdfUrl?: string;
}

export interface GenerateDocumentInput {
  type: TypeDocument;
  collaborationId: string;
  lignes: {
    description: string;
    quantite: number;
    prixUnitaireHT: number;
  }[];
  titre?: string;
  poClient?: string;
  commentaires?: string;
  dateDocument?: Date;
  delaiPaiementJours?: number;
}

export interface AvoirInput {
  factureId: string;
  motif: string;
  lignes: {
    description: string;
    quantite: number;
    prixUnitaireHT: number;
  }[];
}
