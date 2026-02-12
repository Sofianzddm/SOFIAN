import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/presskit/analytics
 * Récupère les statistiques de tracking pour tous les batches
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    // Récupérer tous les batches récents
    const batches = await prisma.batch.findMany({
      where: {
        status: "completed",
      },
      include: {
        brands: {
          include: {
            brand: {
              include: {
                pageViews: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10, // Les 10 derniers batches
    });

    // Formater les données pour le dashboard
    const analyticsData = batches.map((batch) => {
      const brands = batch.brands.map((batchBrand) => {
        const brand = batchBrand.brand;
        const pageViews = brand.pageViews;

        // Calculer les stats
        const totalViews = pageViews.length;
        const uniqueVisitors = new Set(
          pageViews.map((pv) => pv.hubspotContactId).filter(Boolean)
        ).size;

        const totalDuration = pageViews.reduce(
          (sum, pv) => sum + pv.durationSeconds,
          0
        );
        const avgDuration = totalViews > 0 ? Math.round(totalDuration / totalViews) : 0;

        const maxScrollDepth = Math.max(
          ...pageViews.map((pv) => pv.scrollDepthPercent),
          0
        );

        const talentsViewed = new Set(
          pageViews.flatMap((pv) => pv.talentsViewed)
        );

        const ctaClicked = pageViews.some((pv) => pv.ctaClicked);
        const returnVisits = pageViews.filter((pv) => pv.visitNumber > 1).length;

        // Déterminer le statut
        let status = "🔴"; // Pas ouvert
        if (totalViews > 0) {
          if (ctaClicked || returnVisits >= 2) {
            status = "🔥"; // CTA cliqué ou 2+ visites
          } else if (avgDuration > 30 || maxScrollDepth > 50) {
            status = "🟢"; // Engagé
          } else {
            status = "🟡"; // Ouvert < 30s
          }
        }

        return {
          brandName: brand.name,
          totalViews,
          uniqueVisitors,
          avgDuration,
          maxScrollDepth,
          talentsViewed: Array.from(talentsViewed),
          ctaClicked,
          returnVisits,
          status,
        };
      });

      return {
        batchId: batch.id,
        batchName: batch.name,
        createdAt: batch.createdAt,
        totalBrands: batch.totalBrands,
        brands,
      };
    });

    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error("Erreur GET analytics:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des analytics" },
      { status: 500 }
    );
  }
}
