import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // Récupérer toutes les marques avec leurs statistiques
    const brands = await prisma.brand.findMany({
      include: {
        pageViews: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const analytics = brands.map(brand => {
      const views = brand.pageViews;
      const totalViews = views.length;
      const uniqueVisitors = new Set(views.map(v => v.hubspotContactId || v.sessionId)).size;
      
      // Calculer la durée moyenne
      const avgDuration = totalViews > 0
        ? Math.round(views.reduce((sum, v) => sum + v.durationSeconds, 0) / totalViews)
        : 0;

      // Profondeur de scroll max
      const maxScrollDepth = totalViews > 0
        ? Math.max(...views.map(v => v.scrollDepthPercent))
        : 0;

      // CTA cliqué ?
      const ctaClicked = views.some(v => v.ctaClicked);

      // Dernière visite
      const lastVisit = views.length > 0 ? views[0].createdAt : null;

      // Déterminer le statut
      let status: 'not_opened' | 'quick_view' | 'engaged' | 'hot' = 'not_opened';
      
      if (totalViews === 0) {
        status = 'not_opened';
      } else if (ctaClicked || totalViews >= 2) {
        status = 'hot';
      } else if (avgDuration >= 30 || maxScrollDepth >= 50) {
        status = 'engaged';
      } else {
        status = 'quick_view';
      }

      return {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        niche: brand.niche,
        presskitUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.glowupagence.fr'}/book/${brand.slug}`,
        totalViews,
        uniqueVisitors,
        lastVisit: lastVisit ? lastVisit.toISOString() : null,
        avgDuration,
        maxScrollDepth,
        ctaClicked,
        status,
      };
    });

    // Trier par statut (hot > engaged > quick_view > not_opened)
    const statusOrder = { hot: 0, engaged: 1, quick_view: 2, not_opened: 3 };
    analytics.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
