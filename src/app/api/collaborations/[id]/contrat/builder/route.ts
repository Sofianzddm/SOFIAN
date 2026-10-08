// GET /api/collaborations/[id]/contrat/builder — JWT DocuSeal builder (upload libre)
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { parseContratSignataires } from "@/lib/collab-contrat-upload";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role ?? "";
    if (!["ADMIN", "TM"].includes(role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour accéder au builder" },
        { status: 403 }
      );
    }

    const { id } = await params;
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

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (collaboration.contratStatut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Ce contrat a déjà été envoyé ou n'est pas un brouillon uploadé" },
        { status: 400 }
      );
    }
    if (!collaboration.contratDocusealTemplateId) {
      return NextResponse.json(
        { error: "Aucun template DocuSeal associé à ce brouillon" },
        { status: 400 }
      );
    }

    const signataires = parseContratSignataires(collaboration.contratSignataires);
    if (signataires.length === 0) {
      return NextResponse.json(
        { error: "Aucun signataire configuré" },
        { status: 400 }
      );
    }

    const titre =
      collaboration.contratTitre?.trim() ||
      `Contrat ${collaboration.talent.prenom} ${collaboration.talent.nom} x ${collaboration.marque.nom}`;

    const jwtPayload = {
      user_email: accountEmail,
      integration_email: signataires[0].email,
      name: `${collaboration.reference} — ${titre}`,
      template_id: collaboration.contratDocusealTemplateId,
    };
    const builderToken = jwt.sign(jwtPayload, docusealKey, { algorithm: "HS256" });

    return NextResponse.json({
      builderToken,
      titre,
      signataires,
      talentName: `${collaboration.talent.prenom} ${collaboration.talent.nom}`.trim(),
      marqueName: collaboration.marque.nom,
    });
  } catch (error) {
    console.error("GET /api/collaborations/[id]/contrat/builder:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation du builder" },
      { status: 500 }
    );
  }
}
