import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { applyMatches } from "@/lib/qonto/associate";
import {
  buildKey,
  isS3Configured,
  uploadBufferToS3,
} from "@/lib/s3";
import { v2 as cloudinary } from "cloudinary";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 Mo
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * POST /api/qonto/associate-externe
 * Rapproche une transaction Qonto à une facture hors app (ex. Evoliz).
 * multipart/form-data :
 *   - file (PDF/image, requis)
 *   - transactionId (requis)
 *   - clientNom? (défaut = émetteur Qonto)
 *   - referenceExterne? (n° Evoliz ou autre)
 *   - montant? (défaut = restant de la transaction)
 *   - modePaiement? (défaut = Virement)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const transactionId = String(form.get("transactionId") || "").trim();
    const clientNomRaw = String(form.get("clientNom") || "").trim();
    const referenceExterne = String(form.get("referenceExterne") || "").trim();
    const montantRaw = String(form.get("montant") || "").trim();
    const modePaiement =
      String(form.get("modePaiement") || "").trim() || "Virement";

    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId requis" },
        { status: 400 }
      );
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Glissez ou sélectionnez la facture externe (PDF)" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 15 Mo)" },
        { status: 400 }
      );
    }
    const contentType = file.type || "application/pdf";
    if (
      !ALLOWED_TYPES.has(contentType) &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        { error: "Format non supporté (PDF, JPG, PNG, WebP)" },
        { status: 400 }
      );
    }

    const transaction = await prisma.transactionQonto.findUnique({
      where: { id: transactionId },
      include: { matches: true },
    });
    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction introuvable" },
        { status: 404 }
      );
    }
    if (transaction.horsPlateforme) {
      return NextResponse.json(
        {
          error:
            "Cette transaction est marquée hors plateforme. Réintégrez-la avant de la rapprocher.",
        },
        { status: 400 }
      );
    }
    if (transaction.side === "debit") {
      return NextResponse.json(
        {
          error:
            "Cette transaction est une dépense : justifiez-la dans le module Dépenses.",
        },
        { status: 400 }
      );
    }

    const txMontant = Number(transaction.montant);
    const alreadyMatched = transaction.matches.reduce(
      (sum, m) => sum + Number(m.montant),
      0
    );
    const restantTx = Math.max(0, txMontant - alreadyMatched);
    if (restantTx <= 0.005) {
      return NextResponse.json(
        { error: "Cette transaction est déjà intégralement rapprochée" },
        { status: 400 }
      );
    }

    let montant = restantTx;
    if (montantRaw) {
      const parsed = Number(montantRaw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: "Montant invalide" },
          { status: 400 }
        );
      }
      if (parsed - restantTx > 0.005) {
        return NextResponse.json(
          {
            error: `Le montant (${parsed.toFixed(
              2
            )} €) dépasse le restant de la transaction (${restantTx.toFixed(2)} €)`,
          },
          { status: 400 }
        );
      }
      montant = parsed;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fichierUrl = await uploadFactureExterne(buffer, file);
    const pdfBase64 =
      contentType === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
        ? buffer.toString("base64")
        : null;

    const clientNom =
      clientNomRaw ||
      transaction.emetteur?.trim() ||
      "Client externe";
    const reference = await genererReferenceExterne();
    const userId = (session.user as { id?: string }).id ?? null;
    const now = new Date();
    const notesParts = [
      "[EXTERNE] Facture hors app.glowupagence.fr",
      referenceExterne ? `Réf. externe : ${referenceExterne}` : null,
      `Fichier : ${file.name}`,
    ].filter(Boolean);

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          reference,
          type: "FACTURE",
          statut: "ENVOYE",
          titre: referenceExterne
            ? `Facture externe ${referenceExterne}`
            : "Facture externe",
          montantHT: new Prisma.Decimal(montant.toFixed(2)),
          tauxTVA: new Prisma.Decimal(0),
          montantTVA: new Prisma.Decimal(0),
          montantTTC: new Prisma.Decimal(montant.toFixed(2)),
          devise: transaction.devise || "EUR",
          typeTVA: "FRANCE",
          clientNom,
          dateDocument: transaction.dateTransaction || now,
          dateEmission: transaction.dateTransaction || now,
          dateEcheance: transaction.dateTransaction || now,
          modePaiement,
          fichierUrl,
          pdfBase64,
          notes: notesParts.join("\n"),
          factureRef: referenceExterne || null,
          createdById: userId,
          lignes: [
            {
              description: referenceExterne
                ? `Facture externe ${referenceExterne}`
                : "Facture hors plateforme GlowUp (Evoliz / autre)",
              quantite: 1,
              prixUnitaire: montant,
              tauxTVA: 0,
              totalHT: montant,
              totalTVA: 0,
            },
          ],
        },
      });

      const matchResult = await applyMatches(
        tx,
        transactionId,
        [{ documentId: document.id, montant }],
        userId,
        modePaiement
      );

      if (!matchResult.ok) {
        throw new AssociateExterneError(matchResult.error, matchResult.status);
      }

      return { document, matchResult };
    });

    return NextResponse.json({
      success: true,
      message: result.matchResult.fullyMatched
        ? "Transaction rapprochée avec la facture externe"
        : "Rapprochement partiel enregistré avec la facture externe",
      documentId: result.document.id,
      reference: result.document.reference,
      transactionId,
      totalAlloue: Number(result.matchResult.totalAlloue.toFixed(2)),
      restant: Number(
        Math.max(
          0,
          result.matchResult.transactionMontant - result.matchResult.totalAlloue
        ).toFixed(2)
      ),
      fullyMatched: result.matchResult.fullyMatched,
    });
  } catch (error) {
    if (error instanceof AssociateExterneError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("❌ Erreur POST /api/qonto/associate-externe:", error);
    return NextResponse.json(
      { error: "Erreur lors du rapprochement externe" },
      { status: 500 }
    );
  }
}

class AssociateExterneError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function genererReferenceExterne(): Promise<string> {
  const annee = new Date().getFullYear();
  const prefix = `EXT-${annee}-`;
  const existing = await prisma.document.findMany({
    where: { reference: { startsWith: prefix } },
    select: { reference: true },
  });
  const max = existing.reduce((acc, d) => {
    const n = Number.parseInt(d.reference.slice(prefix.length), 10);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function uploadFactureExterne(
  buffer: Buffer,
  file: File
): Promise<string> {
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "pdf";
  const safeExt = ["pdf", "jpg", "jpeg", "png", "webp"].includes(ext)
    ? ext
    : "pdf";

  if (isS3Configured()) {
    const key = buildKey(
      "factures-externes",
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    );
    return uploadBufferToS3(buffer, {
      key,
      contentType: file.type || "application/pdf",
    });
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const base64 = `data:${file.type || "application/pdf"};base64,${buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(base64, {
    folder: "glowup-factures-externes",
    public_id: `ext-${Date.now()}`,
    resource_type: "auto",
  });
  return result.secure_url;
}
