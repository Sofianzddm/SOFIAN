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
    // Par défaut, on masque les transactions marquées "hors plateforme"
    // (virement perso, autre activité, etc.) pour qu'elles ne polluent plus
    // la réconciliation. Passer ?includeHorsPlateforme=true pour les afficher.
    const includeHorsPlateforme =
      searchParams.get("includeHorsPlateforme") === "true";
    const horsPlateformeOnly =
      searchParams.get("horsPlateforme") === "true";

    // Build where clause
    const where: any = {};

    if (associeOnly) {
      where.associe = true;
    } else if (nonAssocieOnly) {
      where.associe = false;
    }

    if (horsPlateformeOnly) {
      where.horsPlateforme = true;
    } else if (!includeHorsPlateforme) {
      where.horsPlateforme = false;
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
            collaboration: {
              select: {
                id: true,
                reference: true,
                marque: { select: { nom: true } },
              },
            },
          },
        },
        matches: {
          orderBy: { createdAt: "asc" },
          include: {
            document: {
              select: {
                id: true,
                reference: true,
                type: true,
                montantTTC: true,
                statut: true,
                collaboration: {
                  select: {
                    id: true,
                    reference: true,
                    marque: { select: { nom: true } },
                  },
                },
              },
            },
          },
        },
      },
      take: 100, // Limit pour éviter de surcharger
    });

    // Enrichit chaque transaction d'un montantAlloue / restant pour faciliter l'UI.
    const enriched = transactions.map((t) => {
      const totalAlloue = t.matches.reduce(
        (sum, m) => sum + Number(m.montant),
        0
      );
      const montant = Number(t.montant);
      return {
        ...t,
        totalAlloue: Number(totalAlloue.toFixed(2)),
        restant: Number(Math.max(0, montant - totalAlloue).toFixed(2)),
      };
    });

    return NextResponse.json({
      success: true,
      transactions: enriched,
      count: enriched.length,
    });
  } catch (error) {
    console.error("Erreur GET /api/qonto/transactions:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des transactions" },
      { status: 500 }
    );
  }
}
