import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/presskit/[slug]
 * Récupère les données d'une marque et ses talents pour afficher le press kit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Récupérer la marque avec ses talents
    const brand = await prisma.brand.findUnique({
      where: { slug },
      include: {
        presskitTalents: {
          include: {
            talent: {
              include: {
                stats: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!brand) {
      return NextResponse.json(
        { message: "Press kit introuvable" },
        { status: 404 }
      );
    }

    // Formater les données pour le frontend
    const talents = brand.presskitTalents.map((pkt) => {
      const talent = pkt.talent;
      const stats = talent.stats;

      return {
        id: talent.id,
        name: `${talent.prenom} ${talent.nom}`.trim(),
        prenom: talent.prenom,
        nom: talent.nom,
        handle: talent.instagram?.replace('@', '') || talent.tiktok?.replace('@', '') || '',
        photo: talent.photo,
        presentation: talent.presentation,
        presentationEn: talent.presentationEn,
        niche: talent.niches || [],
        ville: talent.ville,
        platforms: [
          talent.instagram ? 'instagram' : null,
          talent.tiktok ? 'tiktok' : null,
          talent.youtube ? 'youtube' : null,
        ].filter(Boolean),
        followers: Number(stats?.igFollowers || 0),
        igFollowersEvol: stats?.igFollowersEvol ? Number(stats.igFollowersEvol) : null,
        ttFollowers: Number(stats?.ttFollowers || 0),
        ttFollowersEvol: stats?.ttFollowersEvol ? Number(stats.ttFollowersEvol) : null,
        ttEngagement: Number(stats?.ttEngagement || 0),
        ttEngagementEvol: stats?.ttEngagementEvol ? Number(stats.ttEngagementEvol) : null,
        engagementRate: Number(stats?.igEngagement || 0),
        igEngagementEvol: stats?.igEngagementEvol ? Number(stats.igEngagementEvol) : null,
        frAudience: Number(stats?.igLocFrance || 0),
        ytAbonnes: Number(stats?.ytAbonnes || 0),
        ytAbonnesEvol: stats?.ytAbonnesEvol ? Number(stats.ytAbonnesEvol) : null,
        pitch: pkt.pitch,
        instagram: talent.instagram,
        tiktok: talent.tiktok,
        youtube: talent.youtube,
      };
    });

    return NextResponse.json({
      name: brand.name,
      niche: brand.niche || '',
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      logo: brand.logo,
      description: brand.description,
      talents,
    });
  } catch (error) {
    console.error("Erreur GET presskit:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération du press kit" },
      { status: 500 }
    );
  }
}
