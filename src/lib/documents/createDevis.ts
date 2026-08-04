/**
 * Création d'un devis collab (partagé API generate + create collab TM).
 */
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import {
  getTypeTVA,
  getMentionTVA,
  MENTIONS_TVA,
  AGENCE_CONFIG,
} from "@/lib/documents/config";
import { computeDateEcheance } from "@/lib/documents/echeance";
import { normalizeLocale } from "@/lib/documents/i18n";
import { getDeviseInfo } from "@/lib/devises";

export type DevisLigneInput = {
  description: string;
  quantite: number;
  prixUnitaire: number;
};

export async function createDevisForCollaboration(opts: {
  collaborationId: string;
  userId: string;
  lignes: DevisLigneInput[];
  titre?: string;
  dateDocument?: Date;
  delaiPaiementJours?: number;
  langueDocument?: string;
  devise?: string;
}) {
  const collaboration = await prisma.collaboration.findUnique({
    where: { id: opts.collaborationId },
    include: {
      talent: true,
      marque: true,
      livrables: true,
    },
  });
  if (!collaboration) {
    throw new Error("Collaboration non trouvée");
  }

  const marque = collaboration.marque;
  const talent = collaboration.talent;
  if (!marque.adresseRue || !marque.codePostal || !marque.ville) {
    throw new Error(
      "Adresse de facturation marque incomplète (rue, CP, ville) — obligatoire pour le devis."
    );
  }

  let lignes = opts.lignes;
  if (!lignes.length && collaboration.livrables.length) {
    lignes = collaboration.livrables.map((l) => ({
      description: l.description || `${l.quantite}x ${l.typeContenu}`,
      quantite: Number(l.quantite) || 1,
      prixUnitaire: Number(l.prixUnitaire) || 0,
    }));
  }
  if (!lignes.length) {
    throw new Error("Aucune ligne de devis (livrables manquants)");
  }

  const deviseCode = getDeviseInfo(opts.devise || marque.devise).code;
  const reference = await genererNumeroDocument("DEVIS");
  const paysPourTVA = marque.pays ?? "France";
  const typeTVA = getTypeTVA(paysPourTVA, marque.numeroTVA ?? null);
  const configTVA = MENTIONS_TVA[typeTVA];
  const tauxTVA = configTVA.tauxTVA;
  const mentionTVA = getMentionTVA(typeTVA, marque.numeroTVA ?? null);

  const lignesCalculees = lignes.map((ligne) => ({
    description: ligne.description,
    quantite: ligne.quantite,
    prixUnitaire: ligne.prixUnitaire,
    tauxTVA,
    totalHT: ligne.quantite * ligne.prixUnitaire,
  }));
  const montantHT = lignesCalculees.reduce((s, l) => s + l.totalHT, 0);
  const montantTVA = montantHT * (tauxTVA / 100);
  const montantTTC = montantHT + montantTVA;

  const now = new Date();
  const dateDoc = opts.dateDocument ?? now;
  const delai = opts.delaiPaiementJours ?? 30;
  const dateEcheance = computeDateEcheance(dateDoc, delai);
  const langue = normalizeLocale(opts.langueDocument);
  const titreAuto =
    opts.titre ||
    `${talent.prenom} x ${marque.nom} - ${dateDoc.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    })}`;

  const document = await prisma.document.create({
    data: {
      reference,
      type: "DEVIS",
      statut: "VALIDE",
      collaborationId: opts.collaborationId,
      titre: titreAuto,
      montantHT: montantHT as any,
      tauxTVA: tauxTVA as any,
      montantTVA: montantTVA as any,
      montantTTC: montantTTC as any,
      typeTVA,
      mentionTVA,
      lignes: lignesCalculees as any,
      dateDocument: dateDoc,
      dateEmission: now,
      dateEcheance,
      dateValidation: now,
      modePaiement: "Virement bancaire",
      notes: AGENCE_CONFIG.conditionsPaiement,
      inclureCgv: true,
      langueDocument: langue,
      devise: deviseCode,
      createdById: opts.userId,
    },
  });

  await prisma.documentEvent.create({
    data: {
      documentId: document.id,
      type: "REGISTERED",
      description: "Enregistrement (création devis)",
      userId: opts.userId,
    },
  });

  return document;
}
