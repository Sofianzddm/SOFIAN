// src/app/api/documents/[id]/accepter/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatutDocument } from "@prisma/client";

/**
 * POST /api/documents/[id]/accepter
 * Marque un devis comme accepté (ENVOYE → VALIDE)
 */
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

    // Seuls ADMIN et HEAD_OF peuvent accepter des devis
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour accepter des devis" },
        { status: 403 }
      );
    }

    // Récupérer le document
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            talent: true,
            marque: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    if (document.type !== "DEVIS") {
      return NextResponse.json(
        { error: "Seul un devis peut être accepté" },
        { status: 400 }
      );
    }

    if (document.statut !== "ENVOYE") {
      return NextResponse.json(
        { error: `Ce devis ne peut pas être accepté (statut actuel: ${document.statut})` },
        { status: 400 }
      );
    }

    // Mettre à jour le document
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        statut: "VALIDE" as StatutDocument,
        dateValidation: new Date(),
      },
    });

    // Si lié à une collaboration, mettre à jour son statut
    if (document.collaborationId) {
      await prisma.collaboration.update({
        where: { id: document.collaborationId },
        data: { statut: "GAGNE" },
      });

      // Créer une notification pour le TM
      if (document.collaboration?.talent.managerId) {
        await prisma.notification.create({
          data: {
            userId: document.collaboration.talent.managerId,
            type: "COLLAB_GAGNEE",
            titre: "Devis accepté",
            message: `Le devis ${document.reference} a été accepté par ${document.collaboration.marque.nom}`,
            lien: `/collaborations/${document.collaborationId}`,
            collabId: document.collaborationId,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      document: {
        id: updatedDocument.id,
        reference: updatedDocument.reference,
        statut: updatedDocument.statut,
        dateValidation: updatedDocument.dateValidation,
      },
      message: "Devis accepté avec succès. Vous pouvez maintenant générer une facture.",
    });
  } catch (error) {
    console.error("Erreur acceptation devis:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'acceptation du devis" },
      { status: 500 }
    );
  }
}
