// src/lib/documents/generatePDF.ts

import { renderToBuffer } from "@react-pdf/renderer";
import { FactureTemplate, FactureData } from "@/lib/documents/templates/FactureTemplate";
import { DevisTemplate, DevisData } from "@/lib/documents/templates/DevisTemplate";
import { createElement } from "react";
import { AGENCE_CONFIG } from "./config";
import { conditionsPaiementLabel, normalizeLocale, type DocLocale } from "./i18n";
import { resolveDocumentClient } from "./clientSnapshot";

/**
 * Détermine le nombre de jours de paiement à partir des notes stockées.
 * Renvoie 0 pour un paiement comptant, sinon le nombre de jours (défaut 30).
 */
function extractDelaiPaiementJours(notes?: string | null): number {
  const text = notes || "";
  if (/Paiement\s+comptant/i.test(text)) {
    return 0;
  }
  const match = text.match(/Paiement\s+sous\s+(\d+)\s+jours/i);
  if (match?.[1]) {
    return Number(match[1]);
  }
  return 30;
}

/**
 * Génère un PDF de document (facture, devis, avoir) côté serveur
 * @param data Données du document
 * @param type Type de document
 * @returns Buffer du PDF
 */
export async function generateDocumentPDF(data: FactureData | DevisData, type: string): Promise<Buffer> {
  try {
    // Utiliser le template approprié selon le type
    const component = type === "DEVIS"
      ? createElement(DevisTemplate, { data: data as DevisData })
      : createElement(FactureTemplate, { data: data as FactureData });
    
    // Générer le PDF en Buffer
    const pdfBuffer = await renderToBuffer(component as any);
    
    return pdfBuffer;
  } catch (error) {
    console.error("Erreur génération PDF:", error);
    throw new Error("Impossible de générer le PDF");
  }
}

/**
 * Convertit un document Prisma en données pour le template PDF
 * @param document Document Prisma
 * @param locale Langue du PDF ("fr" par défaut, "en" pour une version anglaise)
 */
export function documentToPDFData(
  document: any,
  locale: DocLocale | string = "fr"
): FactureData | DevisData {
  const docLocale = normalizeLocale(locale);
  const marque = document.collaboration?.marque;
  const talent = document.collaboration?.talent;
  const lignes = (document.lignes as any[]) || [];

  // Données communes
  const commonData = {
    reference: document.reference || "",
    titre: document.titre || "",
    dateDocument: document.dateDocument?.toISOString() || new Date().toISOString(),
    dateEcheance: document.dateEcheance?.toISOString() || new Date().toISOString(),
    devise: document.devise || "EUR",
    
    emetteur: {
      nom: AGENCE_CONFIG.raisonSociale,
      adresse: AGENCE_CONFIG.adresse,
      codePostal: AGENCE_CONFIG.codePostal,
      ville: AGENCE_CONFIG.ville,
      pays: AGENCE_CONFIG.pays,
      capital: AGENCE_CONFIG.capital,
      siret: AGENCE_CONFIG.siret,
      siren: AGENCE_CONFIG.siren,
      telephone: AGENCE_CONFIG.telephone,
      email: AGENCE_CONFIG.email,
      tva: AGENCE_CONFIG.tva,
      rcs: AGENCE_CONFIG.rcs,
      ape: AGENCE_CONFIG.ape,
      iban: AGENCE_CONFIG.rib?.iban,
      bic: AGENCE_CONFIG.rib?.bic,
    },
    
    client: {
      ...resolveDocumentClient(document, marque),
    },
    
    lignes: lignes.map((l: any) => ({
      description: l.description || "",
      quantite: l.quantite || 1,
      prixUnitaire: l.prixUnitaire || 0,
      tauxTVA: l.tauxTVA || Number(document.tauxTVA) || 0,
      totalHT: l.totalHT || (l.quantite || 1) * (l.prixUnitaire || 0),
    })),
    
    montantHT: Number(document.montantHT) || 0,
    tauxTVA: Number(document.tauxTVA) || 0,
    montantTVA: Number(document.montantTVA) || 0,
    montantTTC: Number(document.montantTTC) || 0,
    modePaiement: document.modePaiement || "Virement",
  };

  // Si c'est un devis, retourner le format DevisData
  if (document.type === "DEVIS") {
    return {
      ...commonData,
      locale: docLocale,
      mentionTVA: document.mentionTVA || null,
      typeTVA: document.typeTVA || "FRANCE",
      commentaires: document.notes || undefined,
      inclureCgv: document.inclureCgv !== false,
    } as DevisData;
  }

  // Sinon, retourner le format FactureData (avec RIB, mentions, etc.)
  return {
    ...commonData,
    locale: docLocale,
    type: document.type as "DEVIS" | "FACTURE" | "AVOIR" | "BON_DE_COMMANDE",
    poClient: document.poClient || undefined,
    mentionTVA: document.mentionTVA || "",
    rib: {
      banque: `${AGENCE_CONFIG.rib.titulaire} - ${AGENCE_CONFIG.rib.adresse}, ${AGENCE_CONFIG.rib.ville}`,
      iban: AGENCE_CONFIG.rib.iban,
      bic: AGENCE_CONFIG.rib.bic,
    },
    notes: document.notes || undefined,
    conditionsPaiementLabel: conditionsPaiementLabel(
      extractDelaiPaiementJours(document.notes),
      docLocale
    ),
  } as FactureData;
}
