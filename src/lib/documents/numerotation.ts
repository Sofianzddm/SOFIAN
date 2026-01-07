// src/lib/documents/numerotation.ts

import { prisma } from "@/lib/prisma";
import { AGENCE_CONFIG } from "./config";

type TypeDocumentNum = "DEVIS" | "FACTURE" | "AVOIR" | "BON_DE_COMMANDE";

/**
 * Génère le prochain numéro de document
 * Format: X-YYYY-NNNN (ex: F-2026-0001)
 */
export async function genererNumeroDocument(type: TypeDocumentNum): Promise<string> {
  const annee = new Date().getFullYear();
  const prefixe = AGENCE_CONFIG.prefixes[type];
  const code = `${type}_${annee}`;

  // Chercher le compteur existant
  const existingCompteur = await prisma.compteur.findFirst({
    where: { type, annee },
  });

  let compteur;

  if (!existingCompteur) {
    // Créer le compteur s'il n'existe pas
    compteur = await prisma.compteur.create({
      data: {
        code,
        type,
        annee,
        dernierNumero: 1,
      },
    });
  } else {
    // Incrémenter le compteur
    compteur = await prisma.compteur.update({
      where: { id: existingCompteur.id },
      data: { dernierNumero: { increment: 1 } },
    });
  }

  // Formater le numéro
  const numero = compteur.dernierNumero.toString().padStart(4, "0");
  return `${prefixe}-${annee}-${numero}`;
}

/**
 * Vérifie si un numéro de document existe déjà
 */
export async function numeroExiste(reference: string): Promise<boolean> {
  const document = await prisma.document.findUnique({
    where: { reference },
  });
  return !!document;
}

/**
 * Récupère le dernier numéro utilisé pour un type de document
 */
export async function getDernierNumero(type: TypeDocumentNum): Promise<string | null> {
  const annee = new Date().getFullYear();
  const prefixe = AGENCE_CONFIG.prefixes[type];

  const compteur = await prisma.compteur.findFirst({
    where: { type, annee },
  });

  if (!compteur || compteur.dernierNumero === 0) {
    return null;
  }

  const numero = compteur.dernierNumero.toString().padStart(4, "0");
  return `${prefixe}-${annee}-${numero}`;
}
