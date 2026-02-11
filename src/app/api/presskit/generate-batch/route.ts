import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchBrandAssets } from "@/lib/brandfetch";
import { selectTalentsWithClaude } from "@/lib/claude";
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

    // Récupérer TOUS les talents avec leurs stats
    const allTalents = await prisma.talent.findMany({
      include: {
        stats: true,
      },
    });

    console.log(`\n📊 Total talents disponibles: ${allTalents.length}`);

    // Supprimer les anciens press kit talents
    await prisma.pressKitTalent.deleteMany({
      where: { brandId: brand.id },
    });

    let selectedTalents: Array<{ id: string; pitch: string }> = [];

    try {
      // Utiliser Claude pour sélectionner les meilleurs talents
      console.log(`🤖 Demande à Claude de sélectionner les talents pour ${brandData.name}...`);
      
      const claudeResult = await selectTalentsWithClaude(
        {
          name: brandData.name,
          domain: brandData.domain,
          niche: brandData.niche,
          description: brandData.description,
        },
        allTalents.map(t => ({
          id: t.id,
          name: `${t.prenom} ${t.nom}`,
          instagram: t.instagram,
          tiktok: t.tiktok,
          niches: t.niches,
          selectedClients: t.selectedClients || [],
          stats: t.stats ? {
            igFollowers: t.stats.igFollowers,
            igEngagement: t.stats.igEngagement ? Number(t.stats.igEngagement) : null,
            igGenreFemme: t.stats.igGenreFemme ? Number(t.stats.igGenreFemme) : null,
            igAge18_24: t.stats.igAge18_24 ? Number(t.stats.igAge18_24) : null,
            igAge25_34: t.stats.igAge25_34 ? Number(t.stats.igAge25_34) : null,
            igLocFrance: t.stats.igLocFrance ? Number(t.stats.igLocFrance) : null,
            ttFollowers: t.stats.ttFollowers,
            ttEngagement: t.stats.ttEngagement ? Number(t.stats.ttEngagement) : null,
            ttGenreFemme: t.stats.ttGenreFemme ? Number(t.stats.ttGenreFemme) : null,
            ttLocFrance: t.stats.ttLocFrance ? Number(t.stats.ttLocFrance) : null,
          } : null,
        }))
      );

      selectedTalents = claudeResult.talents;
      console.log(`✅ Claude a sélectionné ${selectedTalents.length} talents`);

    } catch (claudeError) {
      console.error('❌ Erreur Claude, fallback sur matching par niche:', claudeError);
      
      // Fallback : matching par niche
      const talentsByNiche = await prisma.talent.findMany({
        where: {
          niches: {
            has: brandData.niche,
          },
        },
        include: {
          stats: true,
        },
        orderBy: {
          stats: {
            igEngagement: 'desc',
          },
        },
        take: 5,
      });

      selectedTalents = talentsByNiche.map(t => ({
        id: t.id,
        pitch: `${t.prenom} ${t.nom}, créateur·rice ${t.niches.join('/')} avec ${(t.stats?.igFollowers || 0).toLocaleString('fr-FR')} followers et ${Number(t.stats?.igEngagement || 0).toFixed(1)}% d'engagement. Audience française à ${Math.round(Number(t.stats?.igLocFrance || 0))}%.`,
      }));
    }

    // Créer les PressKitTalent avec les pitchs de Claude
    const createPromises = selectedTalents.map(async (selected, index) => {
      await prisma.pressKitTalent.create({
        data: {
          brandId: brand.id,
          talentId: selected.id,
          pitch: selected.pitch,
          order: index,
        },
      });
    });

    await Promise.all(createPromises);

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
