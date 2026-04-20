// src/app/api/documents/[id]/pdf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDocumentPDF, documentToPDFData } from "@/lib/documents/generatePDF";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer le document avec les relations
    const document = await prisma.document.findUnique({
      where: { id: id },
      include: {
        collaboration: {
          include: {
            marque: true,
            talent: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    // Pour les factures libres (sans collaboration), on force la régénération
    // pour garantir un rendu aligné (dont bloc RIB).
    const shouldForceRegenerate =
      document.type === "FACTURE" && !document.collaborationId;

    // Si le PDF existe déjà en base64, on le retourne (sauf cas forcé)
    if (document.pdfBase64 && !shouldForceRegenerate) {
      const pdfBuffer = Buffer.from(document.pdfBase64, "base64");
      return new NextResponse(pdfBuffer as any, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${document.reference}.pdf"`,
          "Content-Length": pdfBuffer.length.toString(),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Sinon, générer le PDF à la volée
    const pdfData = documentToPDFData(document);
    const pdfBuffer = await generateDocumentPDF(pdfData, document.type);

    // Sauvegarder en base pour accélérer les prochains accès
    await prisma.document.update({
      where: { id },
      data: { pdfBase64: pdfBuffer.toString("base64") },
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.reference}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate", // Pas de cache pour toujours avoir les dernières données
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Erreur génération PDF:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}