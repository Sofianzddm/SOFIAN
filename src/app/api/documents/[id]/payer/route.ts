// src/app/api/documents/[id]/payer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatutDocument } from "@prisma/client";

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

    // Seul ADMIN peut marquer comme payé
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seul un administrateur peut marquer une facture comme payée" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { datePaiement, referencePaiement } = body;

    // Récupérer le document
    const document = await prisma.document.findUnique({
      where: { id: id },
      include: { collaboration: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    if (document.type !== "FACTURE") {
      return NextResponse.json(
        { error: "Seules les factures peuvent être marquées comme payées" },
        { status: 400 }
      );
    }

    if (document.statut === "PAYE") {
      return NextResponse.json(
        { error: "Cette facture est déjà marquée comme payée" },
        { status: 400 }
      );
    }

    // Mettre à jour le document
    const updatedDocument = await prisma.document.update({
      where: { id: id },
      data: {
        statut: "PAYE" as StatutDocument,
        datePaiement: datePaiement ? new Date(datePaiement) : new Date(),
        referencePaiement: referencePaiement || undefined,
      },
    });

    // Si lié à une collaboration, mettre à jour son statut
    if (document.collaborationId) {
      await prisma.collaboration.update({
        where: { id: document.collaborationId },
        data: { 
          statut: "PAYE",
          paidAt: new Date(),
        },
      });

      // Créer une notification pour le TM
      const collab = await prisma.collaboration.findUnique({
        where: { id: document.collaborationId },
        include: { talent: true },
      });

      if (collab?.talent.managerId) {
        await prisma.notification.create({
          data: {
            userId: collab.talent.managerId,
            type: "PAIEMENT_RECU",
            titre: "Paiement reçu",
            message: `Le paiement de la facture ${document.reference} a été reçu.`,
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
        datePaiement: updatedDocument.datePaiement,
      },
    });
  } catch (error) {
    console.error("Erreur marquage paiement:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage du paiement" },
      { status: 500 }
    );
  }
}
