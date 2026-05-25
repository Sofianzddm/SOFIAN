import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * 🔗 POST /api/qonto/associate
 * Associe une transaction Qonto à UNE ou PLUSIEURS factures.
 *
 * Body (multi factures, recommandé) :
 *   {
 *     transactionId: string,
 *     matches: Array<{ documentId: string, montant?: number }>,  // si montant absent → full TTC de la facture
 *     modePaiement?: string
 *   }
 *
 * Body (legacy, 1 seule facture) :
 *   { transactionId: string, documentId: string }
 *
 * Comportement :
 *   - Additif : chaque facture est ajoutée aux matches existants (upsert sur (transactionId, documentId)).
 *   - `associe = true` UNIQUEMENT si la somme des montants alloués ≥ montant de la transaction (à 1 centime près).
 *   - Une facture passe PAYE seulement si la somme des allocations qu'elle a reçues ≥ montantTTC.
 */

const EPSILON = 0.005; // tolérance arrondi 1 centime

type IncomingMatch = { documentId: string; montant?: number };

async function applyMatches(
  tx: Prisma.TransactionClient,
  transactionId: string,
  rawMatches: IncomingMatch[],
  userId: string | null,
  modePaiement: string | null
) {
  // Charger la transaction
  const transaction = await tx.transactionQonto.findUnique({
    where: { id: transactionId },
    include: { matches: true },
  });
  if (!transaction) {
    return { ok: false as const, status: 404, error: "Transaction introuvable" };
  }
  if (transaction.horsPlateforme) {
    return {
      ok: false as const,
      status: 400,
      error:
        "Cette transaction est marquée hors plateforme. Réintégrez-la avant de la rapprocher.",
    };
  }

  // Charger les factures concernées
  const docIds = Array.from(new Set(rawMatches.map((m) => m.documentId)));
  if (docIds.length === 0) {
    return {
      ok: false as const,
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
      return { ok: false as const, status: 404, error: `Facture ${id} introuvable` };
    }
    if (d.type !== "FACTURE") {
      return {
        ok: false as const,
        status: 400,
        error: `Le document ${d.reference} n'est pas une facture`,
      };
    }
    if (d.statut === "ANNULE") {
      return {
        ok: false as const,
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

  // Upsert chaque match
  let runningSum = alreadyMatched;
  for (const incoming of rawMatches) {
    const doc = docsById.get(incoming.documentId)!;
    const docTTC = Number(doc.montantTTC);

    // Déjà alloué sur CETTE facture (toutes transactions confondues)
    const docAlreadyPaid = doc.transactionMatches.reduce(
      (sum, m) =>
        sum + (m.transactionId === transactionId ? 0 : Number(m.montant)),
      0
    );
    const docRemaining = Math.max(0, docTTC - docAlreadyPaid);

    // Allocation à appliquer sur la facture pour cette transaction
    // Par défaut : le restant dû de la facture, plafonné au restant de la transaction
    const txRemaining = Math.max(0, transactionMontant - runningSum);
    const defaultAlloc = Math.min(docRemaining, txRemaining);

    let montantAlloue =
      typeof incoming.montant === "number" && !Number.isNaN(incoming.montant)
        ? incoming.montant
        : defaultAlloc;

    if (montantAlloue <= 0) {
      return {
        ok: false as const,
        status: 400,
        error: `Montant invalide pour la facture ${doc.reference}`,
      };
    }

    // Garde-fous : ne pas dépasser la facture ni la transaction
    if (montantAlloue - docRemaining > EPSILON) {
      return {
        ok: false as const,
        status: 400,
        error: `Le montant alloué à ${doc.reference} (${montantAlloue.toFixed(
          2
        )} €) dépasse son restant dû (${docRemaining.toFixed(2)} €)`,
      };
    }
    if (montantAlloue - txRemaining > EPSILON) {
      return {
        ok: false as const,
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

    // Recalcul du statut PAYE de la facture
    const totalPaidOnDoc = docAlreadyPaid + montantAlloue;
    if (totalPaidOnDoc + EPSILON >= docTTC) {
      await tx.document.update({
        where: { id: doc.id },
        data: {
          statut: "PAYE",
          datePaiement: transaction.dateTransaction,
          referencePaiement:
            transaction.reference || transaction.qontoId,
        },
      });
      // Marquer la collab comme "marque payée"
      if (doc.collaborationId) {
        await tx.collaboration.update({
          where: { id: doc.collaborationId },
          data: { marquePayeeAt: transaction.dateTransaction },
        });
      }
    }
  }

  // Recalcul de l'état de la transaction
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
      // Miroir legacy : on pointe vers la 1ère facture rapprochée
      documentId: refreshedMatches[0]?.documentId ?? null,
    },
  });

  return {
    ok: true as const,
    transactionMontant,
    totalAlloue,
    fullyMatched,
    matchesCount: refreshedMatches.length,
  };
}

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

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const transactionId =
      typeof body.transactionId === "string" ? body.transactionId : null;
    const modePaiement =
      typeof body.modePaiement === "string" && body.modePaiement.trim()
        ? body.modePaiement.trim()
        : null;

    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId requis" },
        { status: 400 }
      );
    }

    // Compat : si on reçoit `documentId` seul → on le transforme en matches[]
    let matches: IncomingMatch[] = [];
    if (Array.isArray(body.matches)) {
      matches = (body.matches as unknown[]).reduce<IncomingMatch[]>((acc, raw) => {
        if (raw && typeof raw === "object") {
          const m = raw as { documentId?: unknown; montant?: unknown };
          if (typeof m.documentId === "string") {
            acc.push({
              documentId: m.documentId,
              montant:
                typeof m.montant === "number" && !Number.isNaN(m.montant)
                  ? m.montant
                  : undefined,
            });
          }
        }
        return acc;
      }, []);
    } else if (typeof body.documentId === "string") {
      matches = [{ documentId: body.documentId }];
    }

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Au moins une facture (matches[]) est requise" },
        { status: 400 }
      );
    }

    const userId = (session.user as { id?: string }).id ?? null;

    const result = await prisma.$transaction((tx) =>
      applyMatches(tx, transactionId, matches, userId, modePaiement)
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.fullyMatched
        ? "Transaction intégralement rapprochée"
        : "Rapprochement partiel enregistré",
      transactionId,
      totalAlloue: Number(result.totalAlloue.toFixed(2)),
      restant: Number(
        Math.max(0, result.transactionMontant - result.totalAlloue).toFixed(2)
      ),
      fullyMatched: result.fullyMatched,
      matchesCount: result.matchesCount,
    });
  } catch (error) {
    console.error("❌ Erreur POST /api/qonto/associate:", error);
    return NextResponse.json(
      { error: "Erreur lors du rapprochement" },
      { status: 500 }
    );
  }
}
