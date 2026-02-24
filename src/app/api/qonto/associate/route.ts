import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 🔗 POST /api/qonto/associate
 * Associer une transaction Qonto à une facture
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent associer
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { transactionId, documentId } = body;

    if (!transactionId || !documentId) {
      return NextResponse.json(
        { error: "transactionId et documentId requis" },
        { status: 400 }
      );
    }

    // Vérifier que la transaction existe et n'est pas déjà associée
    const transaction = await prisma.transactionQonto.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction introuvable" },
        { status: 404 }
      );
    }

    if (transaction.associe) {
      return NextResponse.json(
        { error: "Transaction déjà associée" },
        { status: 400 }
      );
    }

    // Vérifier que le document (facture) existe
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        collaboration: {
          select: {
            id: true,
            reference: true,
            talent: {
              select: {
                userId: true,
                prenom: true,
                nom: true,
              },
            },
            marque: {
              select: {
                nom: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document introuvable" },
        { status: 404 }
      );
    }

    if (document.type !== "FACTURE") {
      return NextResponse.json(
        { error: "Seules les factures peuvent être associées" },
        { status: 400 }
      );
    }

    console.log(`🔗 Association transaction ${transaction.qontoId} → facture ${document.reference}`);

    // Associer la transaction au document
    await prisma.transactionQonto.update({
      where: { id: transactionId },
      data: {
        associe: true,
        documentId: documentId,
      },
    });

    // Marquer la facture comme PAYÉE
    await prisma.document.update({
      where: { id: documentId },
      data: {
        statut: "PAYE",
        datePaiement: transaction.dateTransaction,
        referencePaiement: transaction.reference || transaction.qontoId,
      },
    });

    // Rapprochement = la marque nous a payés (marquePayeeAt) ; talent payé reste à faire à part
    let collaborationUpdated: { id: string; reference: string } | null = null;
    if (document.collaborationId && document.collaboration) {
      await prisma.collaboration.update({
        where: { id: document.collaborationId },
        data: {
          marquePayeeAt: transaction.dateTransaction,
        },
      });
      collaborationUpdated = {
        id: document.collaboration.id,
        reference: document.collaboration.reference,
      };
      // Pas de notification talent ici : on a seulement enregistré que la marque nous a payés
    }

    console.log(`✅ Association réussie : facture payée par la marque (marquePayeeAt)`);

    return NextResponse.json({
      success: true,
      message: "Paiement associé avec succès",
      transaction: {
        id: transaction.id,
        montant: transaction.montant,
      },
      document: {
        id: document.id,
        reference: document.reference,
        statut: "PAYE",
      },
      collaboration: collaborationUpdated,
    });
  } catch (error) {
    console.error("❌ Erreur POST /api/qonto/associate:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'association" },
      { status: 500 }
    );
  }
}
