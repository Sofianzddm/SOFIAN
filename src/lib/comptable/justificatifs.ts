/**
 * 📎 PIÈCES JUSTIFICATIVES — ZIP des PDF de factures/avoirs
 *
 * Regroupe dans une archive .zip tous les PDF des pièces comptabilisées
 * sur la période, nommés par référence (ex: F-2026-059.pdf). Source du PDF :
 *   1. pdfBase64 (stocké en base)
 *   2. fichierUrl (Vercel Blob / Cloudinary)
 *   3. signedDocumentUrl (PDF signé DocuSeal)
 */

import JSZip from "jszip";
import prisma from "@/lib/prisma";
import { Periode } from "./accounting";

const STATUTS = ["ENVOYE", "VALIDE", "PAYE"] as const;

function safeName(ref: string): string {
  return ref.replace(/[^A-Za-z0-9._-]/g, "_");
}

function base64ToBuffer(raw: string): Buffer | null {
  try {
    const clean = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    const buf = Buffer.from(clean, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

async function fetchPdf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

export interface JustificatifsResult {
  buffer: Buffer;
  nbInclus: number;
  nbManquants: number;
  manquants: string[];
}

export async function generateJustificatifsZip(
  periode: Periode
): Promise<JustificatifsResult> {
  const docs = await prisma.document.findMany({
    where: {
      type: { in: ["FACTURE", "AVOIR"] },
      statut: { in: [...STATUTS] },
      dateEmission: { gte: periode.dateDebut, lte: periode.dateFin },
    },
    select: {
      reference: true,
      type: true,
      pdfBase64: true,
      fichierUrl: true,
      signedDocumentUrl: true,
    },
    orderBy: { dateEmission: "asc" },
  });

  const zip = new JSZip();
  const factures = zip.folder("factures");
  const avoirs = zip.folder("avoirs");
  let nbInclus = 0;
  const manquants: string[] = [];

  for (const doc of docs) {
    let pdf: Buffer | null = null;

    if (doc.pdfBase64) pdf = base64ToBuffer(doc.pdfBase64);
    if (!pdf && doc.signedDocumentUrl) pdf = await fetchPdf(doc.signedDocumentUrl);
    if (!pdf && doc.fichierUrl) pdf = await fetchPdf(doc.fichierUrl);

    if (!pdf) {
      manquants.push(doc.reference);
      continue;
    }

    const folder = doc.type === "AVOIR" ? avoirs : factures;
    folder?.file(`${safeName(doc.reference)}.pdf`, pdf);
    nbInclus += 1;
  }

  // Bordereau récapitulatif des pièces manquantes
  if (manquants.length > 0) {
    zip.file(
      "_pieces_manquantes.txt",
      `Pièces sans PDF disponible (${manquants.length}) :\r\n` +
        manquants.join("\r\n")
    );
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return {
    buffer,
    nbInclus,
    nbManquants: manquants.length,
    manquants,
  };
}
