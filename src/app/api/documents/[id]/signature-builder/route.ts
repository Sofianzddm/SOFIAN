// GET /api/documents/[id]/signature-builder — Token JWT pour l'éditeur DocuSeal embarqué
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

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

    const user = session.user as { id: string; role: string; email?: string | null; name?: string | null };
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour accéder au builder de signature" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId");
    const email = searchParams.get("email")?.trim();
    const name = searchParams.get("name")?.trim() || "Signataire";

    if (!templateId || !email) {
      return NextResponse.json(
        { error: "Paramètres templateId et email requis" },
        { status: 400 }
      );
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY;
    if (!docusealKey) {
      return NextResponse.json(
        { error: "DocuSeal n'est pas configuré" },
        { status: 503 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, reference: true, type: true, signatureStatus: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    if (document.type !== "DEVIS") {
      return NextResponse.json(
        { error: "Seuls les devis peuvent utiliser le builder de signature" },
        { status: 400 }
      );
    }

    if (document.signatureStatus === "PENDING" || document.signatureStatus === "SIGNED") {
      return NextResponse.json(
        { error: "Ce devis a déjà été envoyé ou signé" },
        { status: 400 }
      );
    }

    const templateIdNum = parseInt(templateId, 10);
    if (Number.isNaN(templateIdNum)) {
      return NextResponse.json({ error: "templateId invalide" }, { status: 400 });
    }

    // user_email = compte DocuSeal admin (authentification uniquement). Les signataires sont passés via la prop submitters du DocusealBuilder.
    const accountEmail = process.env.DOCUSEAL_ACCOUNT_EMAIL?.trim();
    if (!accountEmail) {
      return NextResponse.json(
        { error: "DOCUSEAL_ACCOUNT_EMAIL manquant dans la configuration" },
        { status: 503 }
      );
    }
    const jwtPayload = {
      user_email: accountEmail,
      integration_email: email,
      name: `Devis ${document.reference}`,
      template_id: templateIdNum,
    };

    const builderToken = jwt.sign(jwtPayload, docusealKey, { algorithm: "HS256" });

    return NextResponse.json({
      templateId: templateIdNum,
      signerEmail: email,
      signerName: name,
      builderToken,
    });
  } catch (error) {
    console.error("Erreur signature-builder:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation du builder" },
      { status: 500 }
    );
  }
}
