import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Liste publique des talents pour le talent book
export async function GET() {
  try {
    const talents = await prisma.talent.findMany({
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
        { stats: { igFollowers: "desc" } },
      ],
    });

    // Transformer les Decimal en number pour le JSON
    const talentsFormatted = talents.map((talent) => ({
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
          }
        : null,
    }));

    return NextResponse.json(talentsFormatted);
  } catch (error) {
    console.error("Erreur GET public talents:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des talents" },
      { status: 500 }
    );
  }
}
