// GET /api/signatures/[id]/builder — JWT DocuSeal builder embarqué
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import {
  SIGNATURE_DOCUMENT_ROLES,
  parseSignatureSignataires,
} from "@/lib/signature-documents";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { role: string };
    if (!SIGNATURE_DOCUMENT_ROLES.includes(user.role as (typeof SIGNATURE_DOCUMENT_ROLES)[number])) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour accéder au builder de signature" },
        { status: 403 }
      );
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré" },
        { status: 503 }
      );
    }
    const accountEmail = process.env.DOCUSEAL_ACCOUNT_EMAIL?.trim();
    if (!accountEmail) {
      return NextResponse.json(
        { error: "DOCUSEAL_ACCOUNT_EMAIL manquant dans la configuration" },
        { status: 503 }
      );
    }

    const document = await prisma.signatureDocument.findUnique({
      where: { id },
    });
    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }
    if (document.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Ce document a déjà été envoyé ou signé" },
        { status: 400 }
      );
    }

    const signataires = parseSignatureSignataires(document.signataires);
    if (signataires.length === 0) {
      return NextResponse.json(
        { error: "Aucun signataire configuré" },
        { status: 400 }
      );
    }

    const jwtPayload = {
      user_email: accountEmail,
      integration_email: signataires[0].email,
      name: `Signature — ${document.titre}`,
      template_id: document.docusealTemplateId,
    };
    const builderToken = jwt.sign(jwtPayload, docusealKey, { algorithm: "HS256" });

    return NextResponse.json({
      builderToken,
      titre: document.titre,
      signataires,
    });
  } catch (error) {
    console.error("GET /api/signatures/[id]/builder:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation du builder" },
      { status: 500 }
    );
  }
}
