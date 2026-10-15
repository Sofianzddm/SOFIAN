import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDocumentPDF, documentToPDFData } from "@/lib/documents/generatePDF";
import { buildZipFromBuffers, zipResponseHeaders } from "@/lib/zip-download";

export const dynamic = "force-dynamic";

const MAX_IDS = 100;

/**
 * GET /api/documents/download-all?ids=a,b,c&locale=fr|en
 * Télécharge en une archive ZIP les PDF des documents sélectionnés
 * (factures, avoirs, devis…).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || !role || role === "TALENT") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const idsParam = params.get("ids");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const localeParam = params.get("locale");
    const forceLocale = localeParam
      ? localeParam.toLowerCase().startsWith("en")
        ? "en"
        : "fr"
      : null;

    if (ids.length === 0) {
      return NextResponse.json({ error: "Aucun document sélectionné" }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IDS} documents par téléchargement` },
        { status: 400 }
      );
    }

    const documents = await prisma.document.findMany({
      where: { id: { in: ids } },
      include: {
        collaboration: {
          include: {
            marque: true,
            talent: true,
          },
        },
      },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: "Aucun document trouvé" }, { status: 404 });
    }

    // Conserve l'ordre de sélection tant que possible.
    const byId = new Map(documents.map((d) => [d.id, d]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof documents;

    const zipEntries: { name: string; data: Buffer }[] = [];
    const failed: string[] = [];

    for (const document of ordered) {
      try {
        const storedLocale = ((document as { langueDocument?: string | null }).langueDocument || "")
          .toLowerCase()
          .startsWith("en")
          ? "en"
          : "fr";
        const locale = forceLocale ?? storedLocale;
        const isEnglish = locale === "en";
        const isOverride = locale !== storedLocale;

        const deviseDoc = (document as { devise?: string | null }).devise;
        const shouldForceRegenerate =
          (document.type === "FACTURE" && !document.collaborationId) ||
          (!!deviseDoc && deviseDoc !== "EUR") ||
          isOverride;

        let pdfBuffer: Buffer;
        if (document.pdfBase64 && !shouldForceRegenerate) {
          pdfBuffer = Buffer.from(document.pdfBase64, "base64");
        } else {
          const pdfData = documentToPDFData(document, locale);
          pdfBuffer = await generateDocumentPDF(pdfData, document.type);
          if (!isOverride) {
            await prisma.document.update({
              where: { id: document.id },
              data: { pdfBase64: pdfBuffer.toString("base64") },
            });
          }
        }

        const filename = isEnglish
          ? `${document.reference || document.id}-EN.pdf`
          : `${document.reference || document.id}.pdf`;
        zipEntries.push({ name: filename, data: pdfBuffer });
      } catch (err) {
        console.error(`❌ PDF zip échoué pour ${document.id}:`, err);
        failed.push(document.reference || document.id);
      }
    }

    if (zipEntries.length === 0) {
      return NextResponse.json(
        { error: "Impossible de générer les PDF" },
        { status: 502 }
      );
    }

    const buffer = await buildZipFromBuffers(zipEntries);
    const zipName =
      forceLocale === "en"
        ? "documents-selection-EN.zip"
        : "documents-selection.zip";

    const headers = zipResponseHeaders(zipName, buffer.length);
    if (failed.length > 0) headers.set("X-Zip-Failed", String(failed.length));

    return new NextResponse(buffer as BodyInit, { status: 200, headers });
  } catch (error) {
    console.error("❌ Erreur download-all documents:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'archive" },
      { status: 500 }
    );
  }
}
