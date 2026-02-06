// src/app/api/documents/[id]/envoyer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatutDocument } from "@prisma/client";

/**
 * POST /api/documents/[id]/envoyer
 * Valide et envoie un document (BROUILLON → ENVOYE)
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

    // Seuls ADMIN et HEAD_OF peuvent envoyer des documents
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour envoyer des documents" },
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

    if (document.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: `Ce document est déjà au statut ${document.statut}` },
        { status: 400 }
      );
    }

    // Mettre à jour le document
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        statut: "ENVOYE" as StatutDocument,
        dateEmission: new Date(),
      },
    });

    // Si c'est une facture, notifier le TM
    if (document.type === "FACTURE" && document.collaboration) {
      const managerId = document.collaboration.talent.managerId;
      
      if (managerId) {
        await prisma.notification.create({
          data: {
            userId: managerId,
            type: "COLLAB_GAGNEE",
            titre: "Facture envoyée",
            message: `La facture ${document.reference} a été envoyée à ${document.collaboration.marque.nom}`,
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
        dateEmission: updatedDocument.dateEmission,
      },
    });
  } catch (error) {
    console.error("Erreur envoi document:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du document" },
      { status: 500 }
    );
  }
}
