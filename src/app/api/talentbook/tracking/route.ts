import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Enregistrer un événement
export async function POST(request: NextRequest) {
  try {
    const { type, talentId, visitorId, metadata } = await request.json();

    if (!type || !visitorId) {
      return NextResponse.json(
        { error: "Type et visitorId requis" },
        { status: 400 }
      );
    }

    // Valider le type d'événement
    const validTypes = ["page_view", "talent_click", "pdf_download", "favorite_add"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Type d'événement invalide" },
        { status: 400 }
      );
    }

    // Créer l'événement
    const event = await prisma.talentbookEvent.create({
      data: {
        type,
        talentId: talentId || null,
        visitorId,
        metadata: metadata || null,
      },
    });

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("Erreur tracking:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement" },
      { status: 500 }
    );
  }
}

// GET - Récupérer les stats (pour l'admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d"; // 7d, 30d, all

    // Calculer la date de début selon la période
    let startDate: Date;
    const now = new Date();
    
    switch (period) {
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // Tout
    }

    // Stats globales
    const [
      totalPageViews,
      uniqueVisitors,
      totalTalentClicks,
      totalPdfDownloads,
      topTalents,
      recentActivity,
      dailyStats,
    ] = await Promise.all([
      // Total des vues de page
      prisma.talentbookEvent.count({
        where: {
          type: "page_view",
          createdAt: { gte: startDate },
        },
      }),

      // Visiteurs uniques
      prisma.talentbookEvent.groupBy({
        by: ["visitorId"],
        where: {
          type: "page_view",
          createdAt: { gte: startDate },
        },
      }).then(result => result.length),

      // Total clics sur talents
      prisma.talentbookEvent.count({
        where: {
          type: "talent_click",
          createdAt: { gte: startDate },
        },
      }),

      // Total téléchargements PDF
      prisma.talentbookEvent.count({
        where: {
          type: "pdf_download",
          createdAt: { gte: startDate },
        },
      }),

      // Top 10 talents les plus cliqués
      prisma.talentbookEvent.groupBy({
        by: ["talentId"],
        where: {
          type: "talent_click",
          talentId: { not: null },
          createdAt: { gte: startDate },
        },
        _count: { talentId: true },
        orderBy: { _count: { talentId: "desc" } },
        take: 10,
      }).then(async (results) => {
        // Récupérer les infos des talents
        const talentIds = results.map(r => r.talentId).filter(Boolean) as string[];
        const talents = await prisma.talent.findMany({
          where: { id: { in: talentIds } },
          select: { id: true, prenom: true, nom: true, photo: true },
        });
        
        return results.map(r => {
          const talent = talents.find(t => t.id === r.talentId);
          return {
            talentId: r.talentId,
            clicks: r._count.talentId,
            prenom: talent?.prenom || "Inconnu",
            nom: talent?.nom || "",
            photo: talent?.photo || null,
          };
        });
      }),

      // Activité récente (20 derniers événements)
      prisma.talentbookEvent.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          talent: {
            select: { prenom: true, nom: true },
          },
        },
      }),

      // Stats par jour (pour le graphique)
      prisma.$queryRaw<Array<{ date: string; views: bigint; clicks: bigint }>>`
        SELECT 
          DATE(createdAt) as date,
          SUM(CASE WHEN type = 'page_view' THEN 1 ELSE 0 END) as views,
          SUM(CASE WHEN type = 'talent_click' THEN 1 ELSE 0 END) as clicks
        FROM TalentbookEvent
        WHERE createdAt >= ${startDate}
        GROUP BY DATE(createdAt)
        ORDER BY date DESC
        LIMIT 30
      `.then(results => 
        results.map(r => ({
          date: r.date,
          views: Number(r.views),
          clicks: Number(r.clicks),
        }))
      ),
    ]);

    return NextResponse.json({
      period,
      stats: {
        totalPageViews,
        uniqueVisitors,
        totalTalentClicks,
        totalPdfDownloads,
      },
      topTalents,
      recentActivity: recentActivity.map(event => ({
        id: event.id,
        type: event.type,
        talentName: event.talent ? `${event.talent.prenom} ${event.talent.nom}` : null,
        createdAt: event.createdAt,
      })),
      dailyStats,
    });
  } catch (error) {
    console.error("Erreur récupération stats:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des stats" },
      { status: 500 }
    );
  }
}
