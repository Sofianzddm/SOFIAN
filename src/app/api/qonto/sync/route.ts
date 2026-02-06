import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQontoClient } from "@/lib/qonto/client";

/**
 * 🔄 POST /api/qonto/sync
 * Synchroniser manuellement les transactions Qonto
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent sync
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const daysBack = body.daysBack || 30;

    console.log(`🔄 Début sync Qonto (${daysBack} derniers jours)...`);

    // Récupérer les transactions depuis Qonto
    const qontoClient = getQontoClient();
    const transactions = await qontoClient.syncRecentTransactions(daysBack);

    console.log(`📥 ${transactions.length} transactions récupérées de Qonto`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    // Importer/Mettre à jour chaque transaction
    for (const transaction of transactions) {
      // Vérifier si la transaction existe déjà
      const existing = await prisma.transactionQonto.findUnique({
        where: { qontoId: transaction.id },
      });

      if (!existing) {
        // Créer nouvelle transaction
        await prisma.transactionQonto.create({
          data: {
            qontoId: transaction.id,
            montant: transaction.amount_cents / 100,
            devise: transaction.currency,
            libelle: transaction.label || "",
            reference: transaction.reference || null,
            dateTransaction: new Date(transaction.settled_at || transaction.emitted_at),
            emetteur: transaction.counterparty?.name || "Inconnu",
            emetteurIban: transaction.counterparty?.iban || null,
            statut: transaction.status === "completed" ? "SETTLED" : "PENDING",
            metadata: transaction as any,
          },
        });
        imported++;
      } else {
        // Mettre à jour si changement de statut
        if (existing.statut !== "SETTLED" && transaction.status === "completed") {
          await prisma.transactionQonto.update({
            where: { qontoId: transaction.id },
            data: {
              statut: "SETTLED",
              metadata: transaction as any,
            },
          });
          updated++;
        } else {
          skipped++;
        }
      }
    }

    console.log(`✅ Sync terminée: ${imported} importées, ${updated} mises à jour, ${skipped} ignorées`);

    return NextResponse.json({
      success: true,
      message: "Synchronisation réussie",
      stats: {
        total: transactions.length,
        imported,
        updated,
        skipped,
      },
    });
  } catch (error: any) {
    console.error("❌ Erreur POST /api/qonto/sync:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de la synchronisation",
        details: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
