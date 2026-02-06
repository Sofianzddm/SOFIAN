import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST - Valider la facture talent comme conforme
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent valider les factures
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les ADMIN peuvent valider les factures talents" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Vérifier que la collaboration existe et a une facture
    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            userId: true,
          },
        },
      },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    if (!collaboration.factureTalentUrl) {
      return NextResponse.json(
        { error: "Aucune facture n'a été uploadée pour cette collaboration" },
        { status: 400 }
      );
    }

    // Mettre à jour la collaboration avec factureValidee = true
    const updated = await prisma.collaboration.update({
      where: { id },
      data: {
        factureValidee: true,
        factureValideeAt: new Date(),
      },
    });

    // Créer une notification pour le talent
    if (collaboration.talent.userId) {
      await prisma.notification.create({
        data: {
          userId: collaboration.talent.userId,
          type: "FACTURE_VALIDEE",
          titre: "✅ Facture validée",
          message: `Votre facture pour ${collaboration.reference} a été vérifiée et enregistrée. Elle est conforme !`,
          lien: `/collaborations/${id}`,
          collabId: id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Facture validée comme conforme",
      collaboration: updated,
    });
  } catch (error) {
    console.error("Erreur validation facture:", error);
    return NextResponse.json(
      { error: "Erreur lors de la validation de la facture" },
      { status: 500 }
    );
  }
}
