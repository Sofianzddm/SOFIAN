import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Récupérer la marque avec tous les press kit talents
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
            order: 'asc',
          },
        },
      },
    });

    if (!brand) {
      return NextResponse.json(
        { error: "Press kit not found" },
        { status: 404 }
      );
    }

    // Récupérer les case studies de la même niche
    const caseStudies = await prisma.caseStudy.findMany({
      where: {
        niche: brand.niche,
      },
      take: 2,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Formater les données pour le frontend
    const talents = brand.presskitTalents.map(pt => {
      const talent = pt.talent;
      const stats = talent.stats;
      
      // Déterminer la plateforme principale et le nombre de followers
      let platform = 'Instagram';
      let followers = stats?.igFollowers || 0;
      
      if ((stats?.ttFollowers || 0) > followers) {
        platform = 'TikTok';
        followers = stats?.ttFollowers || 0;
      }
      if ((stats?.ytAbonnes || 0) > followers) {
        platform = 'YouTube';
        followers = stats?.ytAbonnes || 0;
      }

      // Déterminer l'engagement rate
      let engagementRate = 0;
      if (platform === 'Instagram') {
        engagementRate = stats?.igEngagement ? Number(stats.igEngagement) : 0;
      } else if (platform === 'TikTok') {
        engagementRate = stats?.ttEngagement ? Number(stats.ttEngagement) : 0;
      }

      return {
        id: talent.id,
        name: `${talent.prenom} ${talent.nom}`,
        handle: talent.instagram?.replace('@', '') || talent.tiktok?.replace('@', '') || talent.nom.toLowerCase(),
        photo: talent.photo,
        niche: talent.niches,
        platforms: [
          talent.instagram ? 'Instagram' : null,
          talent.tiktok ? 'TikTok' : null,
          talent.youtube ? 'YouTube' : null,
        ].filter(Boolean),
        followers,
        engagementRate: Math.round(engagementRate * 10) / 10,
        frAudience: 85, // TODO: Ajouter ce champ au modèle Talent
        ageRange: '18-34', // TODO: Ajouter ce champ au modèle Talent
        pitch: pt.pitch,
        bestCollab: '🔥 Campagne premium avec résultats exceptionnels', // TODO: À améliorer
      };
    });

    const response = {
      name: brand.name,
      logo: brand.logo,
      primaryColor: brand.primaryColor || '#ff6b9d',
      secondaryColor: brand.secondaryColor || '#c2185b',
      niche: brand.niche,
      talents,
      caseStudies: caseStudies.map(cs => ({
        title: cs.title,
        brandName: cs.brandName,
        description: cs.description,
        impressions: cs.impressions || '—',
        engagement: cs.engagement || '—',
        imageUrl: cs.imageUrl,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching press kit:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
