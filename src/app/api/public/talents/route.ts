import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Liste publique des talents pour le talent book
export async function GET() {
  try {
    const talents = await prisma.talent.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        prenom: true,
        nom: true,
        photo: true,
        presentation: true,
        presentationEn: true,
        instagram: true,
        tiktok: true,
        youtube: true,
        niches: true,
        ville: true,
        stats: {
          select: {
            igFollowers: true,
            igFollowersEvol: true,
            igEngagement: true,
            igEngagementEvol: true,
            igLocFrance: true,
            igAge13_17: true,
            igAge18_24: true,
            igAge25_34: true,
            igAge35_44: true,
            igAge45Plus: true,
            ttFollowers: true,
            ttFollowersEvol: true,
            ttEngagement: true,
            ttEngagementEvol: true,
            ytAbonnes: true,
            ytAbonnesEvol: true,
          },
        },
      },
      orderBy: [
        { orderBook: "asc" },
        { prenom: "asc" },
      ],
    });

    // Transformer les Decimal en number pour le JSON
    const talentsFormatted = talents.map((talent) => {
      // Calculer la tranche d'âge dominante
      let mainAgeRange: string | null = null;
      let agePercentage: number | null = null;
      
      if (talent.stats) {
        const ageRanges = [
          { range: '13-17', value: Number(talent.stats.igAge13_17 || 0) },
          { range: '18-24', value: Number(talent.stats.igAge18_24 || 0) },
          { range: '25-34', value: Number(talent.stats.igAge25_34 || 0) },
          { range: '35-44', value: Number(talent.stats.igAge35_44 || 0) },
          { range: '45+', value: Number(talent.stats.igAge45Plus || 0) },
        ];
        
        const dominant = ageRanges.reduce((max, current) => 
          current.value > max.value ? current : max
        );
        
        if (dominant.value > 0) {
          mainAgeRange = dominant.range;
          agePercentage = Math.round(dominant.value);
        }
      }

      return {
        ...talent,
        stats: talent.stats
          ? {
              igFollowers: talent.stats.igFollowers,
              igFollowersEvol: talent.stats.igFollowersEvol
                ? Number(talent.stats.igFollowersEvol)
                : null,
              igEngagement: talent.stats.igEngagement
                ? Number(talent.stats.igEngagement)
                : null,
              igEngagementEvol: talent.stats.igEngagementEvol
                ? Number(talent.stats.igEngagementEvol)
                : null,
              igLocFrance: talent.stats.igLocFrance
                ? Number(talent.stats.igLocFrance)
                : null,
              ttFollowers: talent.stats.ttFollowers,
              ttFollowersEvol: talent.stats.ttFollowersEvol
                ? Number(talent.stats.ttFollowersEvol)
                : null,
              ttEngagement: talent.stats.ttEngagement
                ? Number(talent.stats.ttEngagement)
                : null,
              ttEngagementEvol: talent.stats.ttEngagementEvol
                ? Number(talent.stats.ttEngagementEvol)
                : null,
              ytAbonnes: talent.stats.ytAbonnes,
              ytAbonnesEvol: talent.stats.ytAbonnesEvol
                ? Number(talent.stats.ytAbonnesEvol)
                : null,
              // Données démographiques calculées
              mainAgeRange,
              agePercentage,
            }
          : null,
      };
    });

    return NextResponse.json(talentsFormatted);
  } catch (error) {
    console.error("Erreur GET public talents:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des talents" },
      { status: 500 }
    );
  }
}
