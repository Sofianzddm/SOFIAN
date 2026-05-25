import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 🔓 POST /api/qonto/dissocier
 * Retire le rapprochement entre une transaction Qonto et une facture.
 *
 * Body :
 *   - { transactionId, documentId } : retire UN match
 *   - { transactionId }             : retire TOUS les matches de la transaction
 *
 * Si la facture n'a plus aucun paiement enregistré, son statut PAYE est reverti
 * vers ENVOYE (ou VALIDE si elle n'a jamais été envoyée).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const transactionId =
      typeof body.transactionId === "string" ? body.transactionId : null;
    const documentId =
      typeof body.documentId === "string" ? body.documentId : null;

    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId requis" },
        { status: 400 }
      );
    }

    const transaction = await prisma.transactionQonto.findUnique({
      where: { id: transactionId },
      include: { matches: true },
    });
    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction introuvable" },
        { status: 404 }
      );
    }

    const matchesToRemove = documentId
      ? transaction.matches.filter((m) => m.documentId === documentId)
      : transaction.matches;

    if (matchesToRemove.length === 0) {
      return NextResponse.json(
        { error: "Aucun rapprochement à retirer" },
        { status: 404 }
      );
    }

    const impactedDocIds = Array.from(
      new Set(matchesToRemove.map((m) => m.documentId))
    );

    await prisma.$transaction(async (tx) => {
      // Supprimer les matches concernés
      await tx.transactionDocumentMatch.deleteMany({
        where: {
          transactionId,
          ...(documentId ? { documentId } : {}),
        },
      });

      // Revertir les factures qui n'ont plus aucun match (statut PAYE → ENVOYE)
      for (const docId of impactedDocIds) {
        const doc = await tx.document.findUnique({
          where: { id: docId },
          include: { transactionMatches: true },
        });
        if (!doc) continue;

        const totalPayed = doc.transactionMatches.reduce(
          (sum, m) => sum + Number(m.montant),
          0
        );

        // Si plus aucun montant n'est rapproché, on retire le statut PAYE.
        if (totalPayed <= 0 && doc.statut === "PAYE") {
          await tx.document.update({
            where: { id: docId },
            data: {
              statut: "ENVOYE",
              datePaiement: null,
              referencePaiement: null,
            },
          });
          if (doc.collaborationId) {
            await tx.collaboration.update({
              where: { id: doc.collaborationId },
              data: { marquePayeeAt: null },
            });
          }
        }
      }

      // Recalc associe + miroir documentId
      const refreshed = await tx.transactionDocumentMatch.findMany({
        where: { transactionId },
        orderBy: { createdAt: "asc" },
      });
      const totalAlloue = refreshed.reduce(
        (sum, m) => sum + Number(m.montant),
        0
      );
      const fullyMatched = totalAlloue + 0.005 >= Number(transaction.montant);

      await tx.transactionQonto.update({
        where: { id: transactionId },
        data: {
          associe: fullyMatched,
          documentId: refreshed[0]?.documentId ?? null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: documentId
        ? "Rapprochement retiré"
        : "Tous les rapprochements ont été retirés",
    });
  } catch (error) {
    console.error("❌ Erreur POST /api/qonto/dissocier:", error);
    return NextResponse.json(
      { error: "Erreur lors du retrait du rapprochement" },
      { status: 500 }
    );
  }
}
