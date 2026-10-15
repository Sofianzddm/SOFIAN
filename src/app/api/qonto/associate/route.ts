import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  applyMatches,
  type IncomingMatch,
} from "@/lib/qonto/associate";

/**
 * 🔗 POST /api/qonto/associate
 * Associe une transaction Qonto à UNE ou PLUSIEURS factures.
 *
 * Body (multi factures, recommandé) :
 *   {
 *     transactionId: string,
 *     matches: Array<{ documentId: string, montant?: number }>,
 *     modePaiement?: string
 *   }
 *
 * Body (legacy, 1 seule facture) :
 *   { transactionId: string, documentId: string }
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
