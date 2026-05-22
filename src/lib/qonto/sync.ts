/**
 * Logique métier de synchronisation Qonto, partagée entre :
 *  - la route manuelle `/api/qonto/sync` (déclenchée par un admin)
 *  - la route cron `/api/cron/qonto-sync` (déclenchée automatiquement par Vercel)
 */

import { prisma } from "@/lib/prisma";
import { getQontoClient } from "@/lib/qonto/client";

export interface QontoSyncStats {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
}

/**
 * Récupère les transactions Qonto récentes et les enregistre / met à jour en base.
 * - Idempotent : utilise `qontoId` comme clé unique
 * - Promeut `PENDING → SETTLED` quand une transaction passe `completed`
 */
export async function syncQontoTransactions(
  daysBack: number = 30
): Promise<QontoSyncStats> {
  const qonto = getQontoClient();
  const transactions = await qonto.syncRecentTransactions(daysBack);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const transaction of transactions) {
    const existing = await prisma.transactionQonto.findUnique({
      where: { qontoId: transaction.id },
    });

    if (!existing) {
      await prisma.transactionQonto.create({
        data: {
          qontoId: transaction.id,
          montant: transaction.amount_cents / 100,
          devise: transaction.currency,
          libelle: transaction.label || "",
          reference: transaction.reference || null,
          dateTransaction: new Date(
            transaction.settled_at || transaction.emitted_at
          ),
          emetteur: transaction.counterparty?.name || "Inconnu",
          emetteurIban: transaction.counterparty?.iban || null,
          statut: transaction.status === "completed" ? "SETTLED" : "PENDING",
          metadata: transaction as unknown as object,
        },
      });
      imported++;
    } else if (
      existing.statut !== "SETTLED" &&
      transaction.status === "completed"
    ) {
      await prisma.transactionQonto.update({
        where: { qontoId: transaction.id },
        data: {
          statut: "SETTLED",
          metadata: transaction as unknown as object,
        },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  return {
    total: transactions.length,
    imported,
    updated,
    skipped,
  };
}
