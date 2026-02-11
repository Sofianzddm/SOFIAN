import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchBrandAssets } from "@/lib/brandfetch";
import { generateTalentPitch } from "@/lib/claude";
import { Client } from "@hubspot/api-client";

// Helpers
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function processBrand(
  brandData: {
    hubspotId: string;
    name: string;
    domain: string;
    niche: string;
    description?: string;
  },
  batchId: string,
  hubspotClient: Client | null
) {
  try {
    const slug = slugify(brandData.name);
    
    // Vérifier si la marque existe déjà
    let brand = await prisma.brand.findFirst({
      where: {
        OR: [
          { hubspotId: brandData.hubspotId },
          { slug },
        ],
      },
    });

    // Récupérer logo et couleurs via Brandfetch
    const brandAssets = await fetchBrandAssets(brandData.domain);

    if (brand) {
      // Mettre à jour
      brand = await prisma.brand.update({
        where: { id: brand.id },
        data: {
          name: brandData.name,
          domain: brandData.domain,
          niche: brandData.niche,
          description: brandData.description,
          logo: brandAssets.logo || brand.logo,
          primaryColor: brandAssets.primaryColor || brand.primaryColor,
          secondaryColor: brandAssets.secondaryColor || brand.secondaryColor,
          hubspotId: brandData.hubspotId,
        },
      });
    } else {
      // Créer
      brand = await prisma.brand.create({
        data: {
          name: brandData.name,
          slug,
          domain: brandData.domain,
          niche: brandData.niche,
          description: brandData.description,
          logo: brandAssets.logo,
          primaryColor: brandAssets.primaryColor,
          secondaryColor: brandAssets.secondaryColor,
          hubspotId: brandData.hubspotId,
        },
      });
    }

    // Créer l'association batch-brand
    const batchBrand = await prisma.batchBrand.upsert({
      where: {
        batchId_brandId: {
          batchId,
          brandId: brand.id,
        },
      },
      create: {
        batchId,
        brandId: brand.id,
        status: 'generating',
      },
      update: {
        status: 'generating',
      },
    });

    // Sélectionner les talents pertinents (par niche, dispo, top engagement)
    const talents = await prisma.talent.findMany({
      where: {
        niches: {
          hasSome: [brandData.niche],
        },
      },
      include: {
        stats: true,
      },
      take: 5,
    });

    if (talents.length === 0) {
      // Fallback : prendre les 5 meilleurs talents tous niches confondus
      const fallbackTalents = await prisma.talent.findMany({
        include: {
          stats: true,
        },
        take: 5,
      });
      talents.push(...fallbackTalents);
    }

    // Supprimer les anciens press kit talents
    await prisma.pressKitTalent.deleteMany({
      where: { brandId: brand.id },
    });

    // Générer les pitchs pour chaque talent
    const pitchPromises = talents.map(async (talent, index) => {
      const stats = talent.stats;
      
      // Déterminer la plateforme principale
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

      let engagementRate = 0;
      if (platform === 'Instagram') {
        engagementRate = stats?.igEngagement ? Number(stats.igEngagement) : 0;
      } else if (platform === 'TikTok') {
        engagementRate = stats?.ttEngagement ? Number(stats.ttEngagement) : 0;
      }

      try {
        const pitch = await generateTalentPitch(
          {
            name: brandData.name,
            niche: brandData.niche,
            description: brandData.description,
          },
          {
            name: `${talent.prenom} ${talent.nom}`,
            followers,
            platform,
            engagementRate: Math.round(engagementRate * 10) / 10,
            frAudience: 85, // TODO: À améliorer avec vraies données
            ageRange: '18-34', // TODO: À améliorer
            niches: talent.niches,
            pastCollabs: talent.selectedClients || [],
            bestFormats: ['Reels', 'Stories', 'Posts'], // TODO: À améliorer
          }
        );

        await prisma.pressKitTalent.create({
          data: {
            brandId: brand.id,
            talentId: talent.id,
            pitch,
            order: index,
          },
        });
      } catch (error) {
        console.error(`Error generating pitch for talent ${talent.id}:`, error);
        // Créer avec un pitch par défaut
        await prisma.pressKitTalent.create({
          data: {
            brandId: brand.id,
            talentId: talent.id,
            pitch: `${talent.prenom} ${talent.nom} est un créateur de contenu ${talent.niches.join(', ')} avec une communauté engagée de ${followers.toLocaleString('fr-FR')} followers. Parfait pour votre marque ${brandData.name}.`,
            order: index,
          },
        });
      }
    });

    await Promise.allSettled(pitchPromises);

    // Générer l'URL du press kit
    const presskitUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.glowupagence.fr'}/book/${slug}`;

    // Mettre à jour HubSpot avec l'URL du press kit
    if (hubspotClient) {
      try {
        await hubspotClient.crm.companies.basicApi.update(brandData.hubspotId, {
          properties: {
            presskit_url: presskitUrl,
          },
        });
      } catch (error) {
        console.error('Error updating HubSpot:', error);
      }
    }

    // Marquer le batch brand comme completed
    await prisma.batchBrand.update({
      where: { id: batchBrand.id },
      data: {
        status: 'completed',
      },
    });

    return { success: true, slug, url: presskitUrl };
  } catch (error) {
    console.error(`Error processing brand ${brandData.name}:`, error);
    
    // Marquer comme failed
    const brand = await prisma.brand.findFirst({
      where: {
        OR: [
          { hubspotId: brandData.hubspotId },
          { slug: slugify(brandData.name) },
        ],
      },
    });

    if (brand) {
      await prisma.batchBrand.updateMany({
        where: {
          batchId,
          brandId: brand.id,
        },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }

    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brands, batchName } = body;

    if (!brands || !Array.isArray(brands) || brands.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'brands' array" },
        { status: 400 }
      );
    }

    // Initialiser le client HubSpot si la clé API est disponible
    let hubspotClient: Client | null = null;
    if (process.env.HUBSPOT_API_KEY) {
      hubspotClient = new Client({
        accessToken: process.env.HUBSPOT_API_KEY,
      });
    }

    // Créer le batch
    const batch = await prisma.batch.create({
      data: {
        name: batchName || `Batch ${new Date().toISOString()}`,
        totalBrands: brands.length,
        status: 'processing',
      },
    });

    // Traiter les marques par paquets de 20 pour éviter les rate limits
    const BATCH_SIZE = 20;
    const results = [];

    for (let i = 0; i < brands.length; i += BATCH_SIZE) {
      const chunk = brands.slice(i, i + BATCH_SIZE);
      
      const chunkResults = await Promise.allSettled(
        chunk.map(brand => processBrand(brand, batch.id, hubspotClient))
      );

      results.push(...chunkResults);

      // Mettre à jour le batch
      const completed = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

      await prisma.batch.update({
        where: { id: batch.id },
        data: {
          completed,
          failed,
        },
      });
    }

    // Finaliser le batch
    const completed = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        status: 'completed',
        completed,
        failed,
      },
    });

    return NextResponse.json({
      batchId: batch.id,
      totalBrands: brands.length,
      completed,
      failed,
      results: results.map((r, i) => ({
        brand: brands[i].name,
        success: r.status === 'fulfilled' && r.value.success,
        url: r.status === 'fulfilled' && r.value.success ? r.value.url : null,
        error: r.status === 'rejected' 
          ? r.reason?.message 
          : (r.status === 'fulfilled' && !r.value.success ? r.value.error : null),
      })),
    });
  } catch (error) {
    console.error("Error generating batch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
