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

export interface QontoTransactionUpsertInput {
  qontoId: string;
  montant: number;
  devise: string;
  libelle: string;
  reference: string | null;
  dateTransaction: Date;
  emetteur: string;
  emetteurIban: string | null;
  statut: "PENDING" | "SETTLED";
  metadata: object;
}

export type QontoUpsertResult = "imported" | "updated" | "skipped";

/**
 * Crée ou met à jour une transaction Qonto en base (idempotent sur qontoId).
 */
export async function upsertQontoTransaction(
  input: QontoTransactionUpsertInput
): Promise<QontoUpsertResult> {
  const existing = await prisma.transactionQonto.findUnique({
    where: { qontoId: input.qontoId },
  });

  if (!existing) {
    await prisma.transactionQonto.create({ data: input });
    return "imported";
  }

  if (existing.statut !== "SETTLED" && input.statut === "SETTLED") {
    await prisma.transactionQonto.update({
      where: { qontoId: input.qontoId },
      data: {
        statut: "SETTLED",
        montant: input.montant,
        libelle: input.libelle,
        reference: input.reference,
        dateTransaction: input.dateTransaction,
        emetteur: input.emetteur,
        emetteurIban: input.emetteurIban,
        metadata: input.metadata,
      },
    });
    return "updated";
  }

  await prisma.transactionQonto.update({
    where: { qontoId: input.qontoId },
    data: {
      montant: input.montant,
      libelle: input.libelle,
      reference: input.reference,
      metadata: input.metadata,
    },
  });
  return "skipped";
}

/** Notifie les admins qu'un nouvel encaissement est à rapprocher */
export async function notifyAdminsNewQontoPayment(
  montant: number,
  libelle: string
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", actif: true },
    select: { id: true },
  });

  const montantFormate = montant.toFixed(2);

  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: "PAIEMENT_RECU",
        titre: "Nouveau paiement Qonto",
        message: `Encaissement de ${montantFormate} € — ${libelle || "Sans libellé"}`,
        lien: "/reconciliation",
      },
    });
  }
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
    const result = await upsertQontoTransaction({
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
    });
    if (result === "imported") imported++;
    else if (result === "updated") updated++;
    else skipped++;
  }

  return {
    total: transactions.length,
    imported,
    updated,
    skipped,
  };
}
