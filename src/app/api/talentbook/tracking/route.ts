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
    const validTypes = ["page_view", "talent_click", "pdf_download", "favorite_add", "favorite_remove"];
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
    const period = searchParams.get("period") || "7d";

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
        startDate = new Date(0);
    }

    // Stats globales
    const [
      totalPageViews,
      uniqueVisitorsData,
      totalTalentClicks,
      totalPdfDownloads,
      topTalentsRaw,
      recentActivity,
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
      }),

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
    ]);

    // Récupérer les infos des top talents
    const talentIds = topTalentsRaw
      .map(r => r.talentId)
      .filter((id): id is string => id !== null);
    
    const talents = await prisma.talent.findMany({
      where: { id: { in: talentIds } },
      select: { id: true, prenom: true, nom: true, photo: true },
    });

    const topTalents = topTalentsRaw.map(r => {
      const talent = talents.find(t => t.id === r.talentId);
      return {
        talentId: r.talentId,
        clicks: r._count.talentId,
        prenom: talent?.prenom || "Inconnu",
        nom: talent?.nom || "",
        photo: talent?.photo || null,
      };
    });

    // Calculer les stats par jour (sans queryRaw)
    const allEvents = await prisma.talentbookEvent.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        type: true,
        createdAt: true,
      },
    });

    // Grouper par jour manuellement
    const dailyStatsMap = new Map<string, { views: number; clicks: number }>();
    
    allEvents.forEach(event => {
      const dateKey = event.createdAt.toISOString().split('T')[0];
      const existing = dailyStatsMap.get(dateKey) || { views: 0, clicks: 0 };
      
      if (event.type === "page_view") {
        existing.views++;
      } else if (event.type === "talent_click") {
        existing.clicks++;
      }
      
      dailyStatsMap.set(dateKey, existing);
    });

    const dailyStats = Array.from(dailyStatsMap.entries())
      .map(([date, stats]) => ({
        date,
        views: stats.views,
        clicks: stats.clicks,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    return NextResponse.json({
      period,
      stats: {
        totalPageViews,
        uniqueVisitors: uniqueVisitorsData.length,
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