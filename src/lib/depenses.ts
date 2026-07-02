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
  source: "WEB" | "MOBILE";
  createdById?: string | null;
}

export async function createDepense(input: CreateDepenseInput) {
  let montantTTC = input.montantTTC ?? null;
  let dateDepense = input.dateDepense ?? null;
  let fournisseur = input.fournisseur ?? null;
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

  if (montantTTC === null || !Number.isFinite(montantTTC) || montantTTC <= 0) {
    throw new DepenseError("Montant TTC requis (positif)", 400);
  }
  if (!dateDepense) {
    throw new DepenseError("Date de la dépense requise", 400);
  }

  return prisma.depense.create({
    data: {
      transactionId: input.transactionId ?? null,
      fournisseur,
      libelle,
      categorie: input.categorie ?? null,
      notes: input.notes ?? null,
      montantTTC,
      montantTVA: input.montantTVA ?? null,
      tauxTVA: input.tauxTVA ?? null,
      dateDepense,
      justificatifUrl: input.justificatifUrl ?? null,
      justificatifNom: input.justificatifNom ?? null,
      justificatifType: input.justificatifType ?? null,
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
        depense: { include: { createdBy: DEPENSE_INCLUDE.createdBy } },
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

export class DepenseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
