import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/qonto/hors-plateforme
 * Marquer / démarquer une transaction Qonto comme "Paiement hors plateforme"
 * (virement perso, autre activité, remboursement, etc.).
 * Une fois marquée, la transaction n'apparaît plus dans la liste à réconcilier.
 *
 * Body: { transactionId: string, horsPlateforme?: boolean, note?: string }
 *   - horsPlateforme défaut: true (marquer). Passer false pour annuler le marquage.
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
    const { transactionId } = body as { transactionId?: string };
    const horsPlateforme = body.horsPlateforme !== false; // par défaut on marque
    const note: string | null =
      typeof body.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId requis" },
        { status: 400 }
      );
    }

    const transaction = await prisma.transactionQonto.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction introuvable" },
        { status: 404 }
      );
    }

    if (horsPlateforme && transaction.associe) {
      return NextResponse.json(
        {
          error:
            "Cette transaction est déjà associée à une facture. Désassociez-la avant de la marquer comme hors plateforme.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.transactionQonto.update({
      where: { id: transactionId },
      data: {
        horsPlateforme,
        horsPlateformeAt: horsPlateforme ? new Date() : null,
        horsPlateformeNote: horsPlateforme ? note : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: horsPlateforme
        ? "Transaction marquée comme paiement hors plateforme"
        : "Transaction réintégrée dans la réconciliation",
      transaction: {
        id: updated.id,
        horsPlateforme: updated.horsPlateforme,
        horsPlateformeAt: updated.horsPlateformeAt,
        horsPlateformeNote: updated.horsPlateformeNote,
      },
    });
  } catch (error) {
    console.error("Erreur POST /api/qonto/hors-plateforme:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage hors plateforme" },
      { status: 500 }
    );
  }
}
