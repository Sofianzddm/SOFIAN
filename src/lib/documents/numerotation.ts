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
  // Compat historique FACTURE:
  // - anciens compteurs stockés sous type "FAC"
  // - anciennes références au format "FAC-YYYY-NNNN"
  if (type === "FACTURE") {
    const [compteurFacture, compteurLegacyFac, documentsFactures] = await Promise.all([
      prisma.compteur.findFirst({
        where: { type: "FACTURE", annee },
      }),
      prisma.compteur.findFirst({
        where: { type: "FAC", annee },
      }),
      prisma.document.findMany({
        where: {
          type: "FACTURE",
          OR: [
            { reference: { startsWith: `F-${annee}-` } },
            { reference: { startsWith: `FAC-${annee}-` } },
          ],
        },
        select: { reference: true },
      }),
    ]);

    const maxDepuisReferences = documentsFactures.reduce((max, doc) => {
      const numero = extraireNumeroSuffixe(doc.reference);
      return Math.max(max, numero);
    }, 0);

    const maxExistant = Math.max(
      compteurFacture?.dernierNumero ?? 0,
      compteurLegacyFac?.dernierNumero ?? 0,
      maxDepuisReferences
    );

    const prochainNumero = maxExistant + 1;

    await prisma.compteur.upsert({
      where: {
        type_annee: { type: "FACTURE", annee },
      },
      update: {
        dernierNumero: prochainNumero,
      },
      create: {
        code,
        type: "FACTURE",
        annee,
        dernierNumero: prochainNumero,
      },
    });

    return `${prefixe}-${annee}-${String(prochainNumero).padStart(4, "0")}`;
  }

  // Cas standard (hors FACTURE)
  const compteur = await prisma.compteur.upsert({
    where: {
      type_annee: { type, annee },
    },
    update: {
      dernierNumero: { increment: 1 },
    },
    create: {
      code,
      type,
      annee,
      dernierNumero: 1,
    },
  });

  return `${prefixe}-${annee}-${String(compteur.dernierNumero).padStart(4, "0")}`;
}

function extraireNumeroSuffixe(reference: string): number {
  const match = reference.match(/-(\d+)$/);
  if (!match) return 0;
  const numero = Number.parseInt(match[1], 10);
  return Number.isFinite(numero) ? numero : 0;
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
