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

    // Langue du PDF : un paramètre ?locale=… force la langue ; sinon on utilise
    // la langue mémorisée sur le document (champ langueDocument, "fr" par défaut).
    const localeParam = request.nextUrl.searchParams.get("locale");

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

    // Langue mémorisée sur le document ("fr" par défaut). Le cache pdfBase64
    // correspond à cette langue.
    const storedLocale = ((document as any).langueDocument || "").toLowerCase().startsWith("en")
      ? "en"
      : "fr";
    // Langue effective : le paramètre ?locale=… force la langue, sinon on prend
    // la langue mémorisée du document.
    const locale = localeParam
      ? localeParam.toLowerCase().startsWith("en")
        ? "en"
        : "fr"
      : storedLocale;
    const isEnglish = locale === "en";
    // Une langue demandée différente de la langue mémorisée = version « override »
    // à ne pas mettre en cache (le cache reste dans la langue du document).
    const isOverride = locale !== storedLocale;

    // Pour les factures libres (sans collaboration), on force la régénération
    // pour garantir un rendu aligné (dont bloc RIB).
    // On force aussi la régénération si la devise n'est pas EUR car les anciens
    // PDF en cache ont pu être générés avant le support multi-devises.
    const deviseDoc = (document as any).devise as string | null | undefined;
    const shouldForceRegenerate =
      (document.type === "FACTURE" && !document.collaborationId) ||
      (!!deviseDoc && deviseDoc !== "EUR") ||
      isOverride;

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

    // Sinon, générer le PDF à la volée (dans la langue demandée)
    const pdfData = documentToPDFData(document, locale);
    const pdfBuffer = await generateDocumentPDF(pdfData, document.type);

    // On ne met en cache que la version dans la langue du document (pas les
    // versions « override » demandées ponctuellement via ?locale=…).
    if (!isOverride) {
      await prisma.document.update({
        where: { id },
        data: { pdfBase64: pdfBuffer.toString("base64") },
      });
    }

    const filename = isEnglish
      ? `${document.reference}-EN.pdf`
      : `${document.reference}.pdf`;

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
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