// GET /api/talents/[id]/contrats/[contratId]/builder — Token JWT pour le builder DocuSeal embarqué
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { CONTRAT_TALENT_ROLES } from "@/lib/talent-contrats";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contratId: string }> }
) {
  try {
    const { id, contratId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { role: string };
    if (!CONTRAT_TALENT_ROLES.includes(user.role)) {
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

    const contrat = await prisma.talentContrat.findUnique({
      where: { id: contratId },
      include: {
        talent: { select: { prenom: true, nom: true, email: true } },
      },
    });
    if (!contrat || contrat.talentId !== id) {
      return NextResponse.json({ error: "Contrat non trouvé" }, { status: 404 });
    }
    if (contrat.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Ce contrat a déjà été envoyé ou signé" },
        { status: 400 }
      );
    }

    const talentEmail = contrat.talent.email?.trim();
    if (!talentEmail) {
      return NextResponse.json(
        { error: "Ce talent n'a pas d'email renseigné" },
        { status: 400 }
      );
    }

    // user_email = compte DocuSeal admin (authentification uniquement).
    // Les signataires sont passés via la prop submitters du DocusealBuilder.
    const jwtPayload = {
      user_email: accountEmail,
      integration_email: talentEmail,
      name: `Contrat ${contrat.talent.prenom} ${contrat.talent.nom} — ${contrat.titre}`,
      template_id: contrat.docusealTemplateId,
    };
    const builderToken = jwt.sign(jwtPayload, docusealKey, { algorithm: "HS256" });

    const agenceEmail =
      process.env.AGENCE_SIGNATURE_EMAIL?.trim() ||
      process.env.NEXT_PUBLIC_AGENCE_EMAIL?.trim() ||
      "contrat@glowupagence.fr";
    const agenceName = process.env.NEXT_PUBLIC_AGENCE_NOM?.trim() || "Glow Up Agence";

    return NextResponse.json({
      builderToken,
      titre: contrat.titre,
      avecSignatureAgence: contrat.avecSignatureAgence,
      talent: {
        email: talentEmail,
        name: `${contrat.talent.prenom} ${contrat.talent.nom}`.trim(),
      },
      agence: { email: agenceEmail, name: agenceName },
    });
  } catch (error) {
    console.error("Erreur builder contrat talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation du builder" },
      { status: 500 }
    );
  }
}
