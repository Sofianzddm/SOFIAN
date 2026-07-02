/**
 * Logique métier du module Dépenses (achats / notes de frais), partagée entre :
 *  - les routes web `/api/depenses/*` (dashboard admin, glisser-déposer)
 *  - les routes mobile `/api/mobile/depenses/*` (photo de reçu depuis l'app)
 *
 * Une dépense = une sortie d'argent à justifier. Cas principal : une
 * transaction Qonto débit à laquelle on attache une facture fournisseur.
 * Cas secondaire : un reçu photographié avant que la transaction n'apparaisse
 * en banque (dépense « hors banque », rapprochable ensuite).
 */

import { v2 as cloudinary } from "cloudinary";
import type { AnalyseJustificatif } from "@/lib/depenses-analyse";
import { prisma } from "@/lib/prisma";
import {
  buildKey,
  deleteFromS3,
  isS3Configured,
  isS3Url,
  uploadBufferToS3,
} from "@/lib/s3";

export const DEPENSE_CATEGORIES = [
  "Logiciels & abonnements",
  "Déplacements",
  "Restauration",
  "Matériel",
  "Marketing & communication",
  "Prestataires & freelances",
  "Événements",
  "Salaires & charges",
  "Frais bancaires",
  "Impôts & taxes",
  "Loyer & bureaux",
  "Autres",
] as const;

export const JUSTIFICATIF_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

export const JUSTIFICATIF_MAX_SIZE = 15 * 1024 * 1024; // 15 Mo

export function validateJustificatifFile(file: File): string | null {
  if (!JUSTIFICATIF_ALLOWED_TYPES.includes(file.type)) {
    return "Format non accepté. Formats autorisés : PDF, JPG, PNG, WebP, HEIC";
  }
  if (file.size > JUSTIFICATIF_MAX_SIZE) {
    return "Fichier trop volumineux. Taille maximum : 15 Mo";
  }
  return null;
}

/**
 * Upload d'un justificatif : S3 si configuré, sinon Cloudinary (comme le
 * reste de la plateforme pendant la migration).
 */
export async function uploadJustificatif(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadJustificatifBuffer(buffer, file);
}

/**
 * Upload + analyse IA en parallèle (une seule lecture du fichier).
 * L'analyse est best-effort : null si échec, sans bloquer l'upload.
 */
export async function uploadEtAnalyseJustificatif(file: File): Promise<{
  url: string;
  analyse: AnalyseJustificatif | null;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  // Import dynamique : évite un cycle de modules et ne charge le SDK
  // Anthropic que lorsqu'un fichier est effectivement uploadé.
  const { analyzeJustificatif } = await import("@/lib/depenses-analyse");
  const [url, analyse] = await Promise.all([
    uploadJustificatifBuffer(buffer, file),
    analyzeJustificatif(buffer, file.type),
  ]);
  return { url, analyse };
}

async function uploadJustificatifBuffer(
  buffer: Buffer,
  file: File
): Promise<string> {
  if (isS3Configured()) {
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : "bin";
    const key = buildKey(
      "depenses",
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    );
    return uploadBufferToS3(buffer, { key, contentType: file.type });
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(base64, {
    folder: "glowup-depenses",
    public_id: `depense-${Date.now()}`,
    resource_type: "auto",
  });
  return result.secure_url;
}

/** Supprime un ancien justificatif (S3 ou Cloudinary). Ne bloque jamais. */
export async function deleteJustificatif(
  url: string | null | undefined
): Promise<void> {
  if (!url) return;
  try {
    if (isS3Url(url)) {
      await deleteFromS3(url);
      return;
    }
    if (url.includes("cloudinary.com")) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      const urlParts = url.split("/");
      const filenameWithExt = urlParts[urlParts.length - 1];
      const folder = urlParts[urlParts.length - 2];
      const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (e) {
    console.error("Suppression justificatif échouée:", e);
  }
}

/**
 * Factures talents (déjà uploadées sur les collabs) servant de justificatif
 * à une dépense — évite le re-upload pour les débits Defacto / Libeo.
 */
export const FACTURES_TALENT_INCLUDE = {
  facturesTalent: {
    select: {
      id: true,
      reference: true,
      montantNet: true,
      factureTalentUrl: true,
      talent: { select: { prenom: true, nom: true } },
      marque: { select: { nom: true } },
    },
  },
  facturesTalentCycles: {
    select: {
      id: true,
      numero: true,
      montantNet: true,
      factureTalentUrl: true,
      collaboration: {
        select: {
          reference: true,
          talent: { select: { prenom: true, nom: true } },
          marque: { select: { nom: true } },
        },
      },
    },
  },
} as const;

const DEPENSE_INCLUDE = {
  transaction: {
    select: {
      id: true,
      qontoId: true,
      montant: true,
      devise: true,
      libelle: true,
      emetteur: true,
      dateTransaction: true,
      statut: true,
    },
  },
  createdBy: { select: { id: true, prenom: true, nom: true } },
  ...FACTURES_TALENT_INCLUDE,
} as const;

export interface CreateDepenseInput {
  transactionId?: string | null;
  fournisseur?: string | null;
  libelle?: string | null;
  categorie?: string | null;
  notes?: string | null;
  montantTTC?: number | null; // Requis si pas de transaction
  montantTVA?: number | null;
  tauxTVA?: number | null;
  dateDepense?: Date | null; // Requis si pas de transaction
  justificatifUrl?: string | null;
  justificatifNom?: string | null;
  justificatifType?: string | null;
  /** Résultat de l'analyse IA : sert de fallback pour les champs non saisis */
  analyse?: AnalyseJustificatif | null;
  source: "WEB" | "MOBILE";
  createdById?: string | null;
}

export async function createDepense(input: CreateDepenseInput) {
  const analyse = input.analyse ?? null;

  let montantTTC = input.montantTTC ?? null;
  let dateDepense = input.dateDepense ?? null;
  // Fournisseur : saisie explicite > lecture IA du reçu > émetteur bancaire
  // (le libellé bancaire est souvent cryptique, ex "CB APPLE.COM/BILL").
  let fournisseur = input.fournisseur ?? analyse?.fournisseur ?? null;
  let libelle = input.libelle ?? null;

  if (input.transactionId) {
    const tx = await prisma.transactionQonto.findUnique({
      where: { id: input.transactionId },
      include: { depense: { select: { id: true } } },
    });
    if (!tx) {
      throw new DepenseError("Transaction introuvable", 404);
    }
    if (tx.side !== "debit") {
      throw new DepenseError(
        "Cette transaction est un encaissement : elle se rapproche dans la réconciliation, pas dans les dépenses",
        400
      );
    }
    if (tx.depense) {
      throw new DepenseError(
        "Un justificatif existe déjà pour cette transaction",
        409
      );
    }
    montantTTC = montantTTC ?? Math.abs(Number(tx.montant));
    dateDepense = dateDepense ?? tx.dateTransaction;
    fournisseur = fournisseur ?? tx.emetteur;
    libelle = libelle ?? tx.libelle;
  }

  // Reçu hors banque : le montant et la date peuvent venir de la lecture IA
  montantTTC = montantTTC ?? analyse?.montantTTC ?? null;
  if (!dateDepense && analyse?.date) {
    dateDepense = new Date(analyse.date);
  }

  if (montantTTC === null || !Number.isFinite(montantTTC) || montantTTC <= 0) {
    throw new DepenseError(
      "Montant TTC requis (illisible sur le justificatif : merci de le saisir)",
      400
    );
  }
  if (!dateDepense) {
    dateDepense = new Date();
  }

  return prisma.depense.create({
    data: {
      transactionId: input.transactionId ?? null,
      fournisseur,
      libelle,
      categorie: input.categorie ?? analyse?.categorie ?? null,
      notes: input.notes ?? null,
      montantTTC,
      montantTVA: input.montantTVA ?? analyse?.montantTVA ?? null,
      tauxTVA: input.tauxTVA ?? analyse?.tauxTVA ?? null,
      dateDepense,
      justificatifUrl: input.justificatifUrl ?? null,
      justificatifNom: input.justificatifNom ?? null,
      justificatifType: input.justificatifType ?? null,
      analyseIA: analyse ? JSON.parse(JSON.stringify(analyse)) : undefined,
      source: input.source,
      createdById: input.createdById ?? null,
    },
    include: DEPENSE_INCLUDE,
  });
}

/**
 * Liste unifiée pour l'écran Dépenses :
 *  - toutes les transactions Qonto débit de la période (avec leur dépense éventuelle)
 *  - les dépenses « hors banque » (sans transaction) de la période
 */
export async function listDepenses(periodDays: number) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);
  dateFrom.setHours(0, 0, 0, 0);

  const [transactions, horsBanque] = await Promise.all([
    prisma.transactionQonto.findMany({
      where: {
        side: "debit",
        dateTransaction: { gte: dateFrom },
        horsPlateforme: false,
      },
      include: {
        depense: {
          include: {
            createdBy: DEPENSE_INCLUDE.createdBy,
            ...FACTURES_TALENT_INCLUDE,
          },
        },
      },
      orderBy: { dateTransaction: "desc" },
    }),
    prisma.depense.findMany({
      where: {
        transactionId: null,
        dateDepense: { gte: dateFrom },
      },
      include: DEPENSE_INCLUDE,
      orderBy: { dateDepense: "desc" },
    }),
  ]);

  return { transactions, horsBanque };
}

/**
 * Factures talents liables à une dépense : facture uploadée sur la collab
 * (ou un cycle) et pas encore rattachée à une autre dépense.
 *
 * @param depenseId Si fourni, inclut aussi les factures déjà liées à CETTE
 *                  dépense (pour pré-cocher dans la modale de liaison).
 */
export async function listFacturesTalentLiables(depenseId?: string | null) {
  const lienFilter = depenseId
    ? { OR: [{ depenseId: null }, { depenseId }] }
    : { depenseId: null };

  const [collabs, cycles] = await Promise.all([
    prisma.collaboration.findMany({
      where: { factureTalentUrl: { not: null }, ...lienFilter },
      select: {
        id: true,
        reference: true,
        montantNet: true,
        factureTalentUrl: true,
        factureTalentRecueAt: true,
        paidAt: true,
        depenseId: true,
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
      orderBy: { factureTalentRecueAt: "desc" },
      take: 300,
    }),
    prisma.collabCycle.findMany({
      where: { factureTalentUrl: { not: null }, ...lienFilter },
      select: {
        id: true,
        numero: true,
        montantNet: true,
        factureTalentUrl: true,
        factureTalentRecueAt: true,
        paidAt: true,
        depenseId: true,
        collaboration: {
          select: {
            reference: true,
            talent: { select: { prenom: true, nom: true } },
            marque: { select: { nom: true } },
          },
        },
      },
      orderBy: { factureTalentRecueAt: "desc" },
      take: 300,
    }),
  ]);

  return { collabs, cycles };
}

/**
 * Remplace l'ensemble des factures talents liées à une dépense (débit
 * Defacto / Libeo / virement talent). Effets de bord assumés :
 *  - les collabs liées passent « payées » (paidAt = date du débit) si elles
 *    ne l'étaient pas déjà — c'est la preuve bancaire du paiement ;
 *  - la dépense est catégorisée « Prestataires & freelances » si sans catégorie.
 */
export async function setFacturesTalentDepense(
  depenseId: string,
  collabIds: string[],
  cycleIds: string[]
) {
  const depense = await prisma.depense.findUnique({
    where: { id: depenseId },
    include: { transaction: { select: { dateTransaction: true } } },
  });
  if (!depense) {
    throw new DepenseError("Dépense introuvable", 404);
  }

  const paidDate = depense.transaction?.dateTransaction ?? depense.dateDepense;

  await prisma.$transaction([
    // Délier les factures désélectionnées
    prisma.collaboration.updateMany({
      where: { depenseId, id: { notIn: collabIds } },
      data: { depenseId: null },
    }),
    prisma.collabCycle.updateMany({
      where: { depenseId, id: { notIn: cycleIds } },
      data: { depenseId: null },
    }),
    // Lier les sélectionnées (jamais celles déjà liées à une AUTRE dépense)
    prisma.collaboration.updateMany({
      where: {
        id: { in: collabIds },
        factureTalentUrl: { not: null },
        OR: [{ depenseId: null }, { depenseId }],
      },
      data: { depenseId },
    }),
    prisma.collabCycle.updateMany({
      where: {
        id: { in: cycleIds },
        factureTalentUrl: { not: null },
        OR: [{ depenseId: null }, { depenseId }],
      },
      data: { depenseId },
    }),
    // Preuve bancaire du paiement talent → marquer payé si pas déjà fait
    prisma.collaboration.updateMany({
      where: { id: { in: collabIds }, paidAt: null },
      data: { paidAt: paidDate },
    }),
    prisma.collaboration.updateMany({
      where: { id: { in: collabIds }, statut: "FACTURE_RECUE" },
      data: { statut: "PAYE" },
    }),
    prisma.collabCycle.updateMany({
      where: { id: { in: cycleIds }, paidAt: null },
      data: { paidAt: paidDate },
    }),
  ]);

  const hasLiens = collabIds.length > 0 || cycleIds.length > 0;
  return prisma.depense.update({
    where: { id: depenseId },
    data:
      hasLiens && !depense.categorie
        ? { categorie: "Prestataires & freelances" }
        : {},
    include: DEPENSE_INCLUDE,
  });
}

export class DepenseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
