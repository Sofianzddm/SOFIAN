// POST /api/documents/[id]/envoyer-signature — Créer un template DocuSeal (éditeur embarqué) puis redirection vers le builder
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDocumentPDF, documentToPDFData } from "@/lib/documents/generatePDF";
import { StatutDocument } from "@prisma/client";

const DOCUSEAL_TEMPLATES_PDF = "https://api.docuseal.com/templates/pdf";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer un document en signature" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const signerEmail = (body.email as string)?.trim();
    const signerName = (body.signerName as string)?.trim() || "Signataire";

    if (!signerEmail) {
      return NextResponse.json(
        { error: "L'email du signataire est requis" },
        { status: 400 }
      );
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré (DOCUSEAL_API_KEY manquant)" },
        { status: 503 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            marque: { include: { contacts: true } },
            talent: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    if (document.type !== "DEVIS") {
      return NextResponse.json(
        { error: "Seuls les devis peuvent être envoyés pour signature" },
        { status: 400 }
      );
    }

    const allowedStatuts: StatutDocument[] = ["BROUILLON", "VALIDE", "ENVOYE"];
    if (!allowedStatuts.includes(document.statut)) {
      return NextResponse.json(
        { error: `Ce devis ne peut pas être envoyé en signature (statut: ${document.statut})` },
        { status: 400 }
      );
    }

    if (document.signatureStatus === "PENDING" || document.signatureStatus === "SIGNED") {
      return NextResponse.json(
        { error: "Ce devis a déjà été envoyé ou signé via DocuSeal" },
        { status: 400 }
      );
    }

    // PDF : existant en base ou génération à la volée
    let pdfBase64: string;
    if (document.pdfBase64) {
      pdfBase64 = document.pdfBase64.replace(/^data:application\/pdf;base64,/, "");
    } else {
      if (!document.collaboration) {
        return NextResponse.json(
          { error: "Document sans collaboration, impossible de générer le PDF" },
          { status: 400 }
        );
      }
      const pdfData = documentToPDFData(document);
      const pdfBuffer = await generateDocumentPDF(pdfData, document.type);
      pdfBase64 = pdfBuffer.toString("base64");
    }

    // Créer un template DocuSeal (champs vides, l'utilisateur les placera dans le builder)
    // POST /templates/pdf — pas de send_email ni submitters (ils sont dans envoyer-signature-avec-fields → /submissions)
    const templatePayload = {
      name: `Devis ${document.reference}`,
      documents: [
        {
          name: "devis",
          file: pdfBase64,
          fields: [],
        },
      ],
    };
    console.log("DocuSeal body (templates/pdf):", JSON.stringify({ ...templatePayload, documents: [{ ...templatePayload.documents[0], file: "[base64…]" }] }, null, 2));

    const templateRes = await fetch(DOCUSEAL_TEMPLATES_PDF, {
      method: "POST",
      headers: {
        "X-Auth-Token": docusealKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(templatePayload),
    });

    if (!templateRes.ok) {
      const errText = await templateRes.text();
      console.error("DocuSeal templates/pdf error:", templateRes.status, errText);
      return NextResponse.json(
        { error: "Erreur DocuSeal (création template): " + (errText || templateRes.statusText) },
        { status: 502 }
      );
    }

    const templateData = (await templateRes.json()) as { id?: number; slug?: string };
    console.log("DocuSeal response (templates/pdf):", JSON.stringify(templateData, null, 2));
    const templateId = templateData.id;
    const templateSlug = templateData.slug ?? "";

    if (templateId == null) {
      console.error("DocuSeal template response missing id:", templateData);
      return NextResponse.json(
        { error: "Réponse DocuSeal invalide (template id manquant)" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      templateId: Number(templateId),
      templateSlug: String(templateSlug),
    });
  } catch (error) {
    console.error("Erreur création template signature:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation de la signature" },
      { status: 500 }
    );
  }
}
