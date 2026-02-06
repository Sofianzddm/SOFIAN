import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 📄 GET /api/qonto/transactions
 * Récupérer toutes les transactions Qonto depuis la DB
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent accéder
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const associeOnly = searchParams.get("associe") === "true";
    const nonAssocieOnly = searchParams.get("nonAssociees") === "true";

    // Build where clause
    const where: any = {};

    if (associeOnly) {
      where.associe = true;
    } else if (nonAssocieOnly) {
      where.associe = false;
    }

    // Récupérer les transactions
    const transactions = await prisma.transactionQonto.findMany({
      where,
      orderBy: { dateTransaction: "desc" },
      include: {
        document: {
          select: {
            id: true,
            reference: true,
            type: true,
            montantTTC: true,
          },
        },
      },
      take: 100, // Limit pour éviter de surcharger
    });

    return NextResponse.json({
      success: true,
      transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error("Erreur GET /api/qonto/transactions:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des transactions" },
      { status: 500 }
    );
  }
}
