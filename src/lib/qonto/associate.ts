import { Prisma } from "@prisma/client";

const EPSILON = 0.005; // tolérance arrondi 1 centime

export type IncomingMatch = { documentId: string; montant?: number };

export type ApplyMatchesResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      transactionMontant: number;
      totalAlloue: number;
      fullyMatched: boolean;
      matchesCount: number;
    };

/**
 * Applique un ou plusieurs rapprochements transaction ↔ facture(s).
 * Additif : upsert sur (transactionId, documentId).
 */
export async function applyMatches(
  tx: Prisma.TransactionClient,
  transactionId: string,
  rawMatches: IncomingMatch[],
  userId: string | null,
  modePaiement: string | null
): Promise<ApplyMatchesResult> {
  const transaction = await tx.transactionQonto.findUnique({
    where: { id: transactionId },
    include: { matches: true },
  });
  if (!transaction) {
    return { ok: false, status: 404, error: "Transaction introuvable" };
  }
  if (transaction.horsPlateforme) {
    return {
      ok: false,
      status: 400,
      error:
        "Cette transaction est marquée hors plateforme. Réintégrez-la avant de la rapprocher.",
    };
  }
  if (transaction.side === "debit") {
    return {
      ok: false,
      status: 400,
      error:
        "Cette transaction est une dépense (débit) : elle se justifie dans le module Dépenses, pas en réconciliation.",
    };
  }

  const docIds = Array.from(new Set(rawMatches.map((m) => m.documentId)));
  if (docIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Au moins une facture est requise",
    };
  }

  const documents = await tx.document.findMany({
    where: { id: { in: docIds } },
    include: {
      collaboration: {
        select: {
          id: true,
          reference: true,
          marque: { select: { nom: true } },
        },
      },
      transactionMatches: true,
    },
  });

  const docsById = new Map(documents.map((d) => [d.id, d] as const));
  for (const id of docIds) {
    const d = docsById.get(id);
    if (!d) {
      return { ok: false, status: 404, error: `Facture ${id} introuvable` };
    }
    if (d.type !== "FACTURE") {
      return {
        ok: false,
        status: 400,
        error: `Le document ${d.reference} n'est pas une facture`,
      };
    }
    if (d.statut === "ANNULE") {
      return {
        ok: false,
        status: 400,
        error: `La facture ${d.reference} est annulée`,
      };
    }
  }

  const transactionMontant = Number(transaction.montant);
  const alreadyMatched = transaction.matches.reduce(
    (sum, m) => sum + Number(m.montant),
    0
  );

  let runningSum = alreadyMatched;
  for (const incoming of rawMatches) {
    const doc = docsById.get(incoming.documentId)!;
    const docTTC = Number(doc.montantTTC);

    const docAlreadyPaid = doc.transactionMatches.reduce(
      (sum, m) =>
        sum + (m.transactionId === transactionId ? 0 : Number(m.montant)),
      0
    );
    const docRemaining = Math.max(0, docTTC - docAlreadyPaid);

    const txRemaining = Math.max(0, transactionMontant - runningSum);
    const defaultAlloc = Math.min(docRemaining, txRemaining);

    let montantAlloue =
      typeof incoming.montant === "number" && !Number.isNaN(incoming.montant)
        ? incoming.montant
        : defaultAlloc;

    if (montantAlloue <= 0) {
      return {
        ok: false,
        status: 400,
        error: `Montant invalide pour la facture ${doc.reference}`,
      };
    }

    if (montantAlloue - docRemaining > EPSILON) {
      return {
        ok: false,
        status: 400,
        error: `Le montant alloué à ${doc.reference} (${montantAlloue.toFixed(
          2
        )} €) dépasse son restant dû (${docRemaining.toFixed(2)} €)`,
      };
    }
    if (montantAlloue - txRemaining > EPSILON) {
      return {
        ok: false,
        status: 400,
        error: `Le montant alloué dépasse le restant à rapprocher sur cette transaction (${txRemaining.toFixed(
          2
        )} €)`,
      };
    }

    await tx.transactionDocumentMatch.upsert({
      where: {
        transactionId_documentId: {
          transactionId,
          documentId: doc.id,
        },
      },
      create: {
        transactionId,
        documentId: doc.id,
        montant: new Prisma.Decimal(montantAlloue.toFixed(2)),
        modePaiement: modePaiement,
        createdById: userId,
      },
      update: {
        montant: new Prisma.Decimal(montantAlloue.toFixed(2)),
        modePaiement: modePaiement ?? undefined,
      },
    });

    runningSum += montantAlloue;

    const totalPaidOnDoc = docAlreadyPaid + montantAlloue;
    if (totalPaidOnDoc + EPSILON >= docTTC) {
      await tx.document.update({
        where: { id: doc.id },
        data: {
          statut: "PAYE",
          datePaiement: transaction.dateTransaction,
          referencePaiement: transaction.reference || transaction.qontoId,
        },
      });
      if (doc.collaborationId) {
        await tx.collaboration.update({
          where: { id: doc.collaborationId },
          data: { marquePayeeAt: transaction.dateTransaction },
        });
      }
    }
  }

  const refreshedMatches = await tx.transactionDocumentMatch.findMany({
    where: { transactionId },
    orderBy: { createdAt: "asc" },
  });
  const totalAlloue = refreshedMatches.reduce(
    (sum, m) => sum + Number(m.montant),
    0
  );
  const fullyMatched = totalAlloue + EPSILON >= transactionMontant;

  await tx.transactionQonto.update({
    where: { id: transactionId },
    data: {
      associe: fullyMatched,
      documentId: refreshedMatches[0]?.documentId ?? null,
    },
  });

  return {
    ok: true,
    transactionMontant,
    totalAlloue,
    fullyMatched,
    matchesCount: refreshedMatches.length,
  };
}

/** True si le document est une facture externe (hors app GlowUp). */
export function isFactureExterne(doc: {
  reference?: string | null;
  notes?: string | null;
}): boolean {
  return (
    !!doc.reference?.startsWith("EXT-") ||
    !!doc.notes?.includes("[EXTERNE]")
  );
}
