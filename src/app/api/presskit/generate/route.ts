import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchBrandData } from "@/lib/brandfetch";
import { updateContactPresskitUrl } from "@/lib/hubspot";

/**
 * POST /api/presskit/generate
 * Génère les press kits pour un batch de marques
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { batchName, brands } = body;

    if (!batchName || !brands || !Array.isArray(brands)) {
      return NextResponse.json(
        { message: "Paramètres invalides" },
        { status: 400 }
      );
    }

    console.log(`\n🚀 Démarrage génération batch: ${batchName} (${brands.length} marques)\n`);

    // Créer le batch
    const batch = await prisma.batch.create({
      data: {
        name: batchName,
        status: "processing",
        totalBrands: brands.length,
      },
    });

    console.log(`✅ Batch créé: ${batch.id}\n`);

    // Traiter les marques par paquets de 5 en parallèle (rate limits)
    const batchSize = 5;
    let completed = 0;
    let failed = 0;

    for (let i = 0; i < brands.length; i += batchSize) {
      const chunk = brands.slice(i, i + batchSize);

      await Promise.all(
        chunk.map(async (brandData: any) => {
          try {
            console.log(`\n🏢 Traitement: ${brandData.companyName}`);

            // 1. Créer/update Brand dans la DB
            // Normaliser le slug : supprimer les accents PUIS les caractères spéciaux
            const slug = brandData.companyName
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents (è → e)
              .replace(/[^a-z0-9]+/g, "-")     // Remplacer espaces et caractères spéciaux par -
              .replace(/^-+|-+$/g, "");         // Supprimer les tirets en début/fin

            // 2. Brandfetch API → récupérer logo, couleurs, description (si domaine disponible)
            let brandfetchData = {
              logo: null,
              primaryColor: null,
              secondaryColor: null,
              description: null,
            };
            
            if (brandData.domain && brandData.domain.trim() !== '') {
              brandfetchData = await fetchBrandData(brandData.domain);
            } else {
              console.log(`  ⚠️  Pas de domaine, Brandfetch ignoré`);
            }

            // 3. Créer ou mettre à jour la marque
            const brand = await prisma.brand.upsert({
              where: { slug },
              update: {
                name: brandData.companyName,
                domain: brandData.domain || null,
                logo: brandfetchData.logo,
                primaryColor: brandfetchData.primaryColor,
                secondaryColor: brandfetchData.secondaryColor,
                description: brandfetchData.description || "Marque",
              },
              create: {
                name: brandData.companyName,
                slug,
                domain: brandData.domain || null,
                niche: "Press Kit", // Valeur par défaut pour les press kits
                logo: brandfetchData.logo,
                primaryColor: brandfetchData.primaryColor,
                secondaryColor: brandfetchData.secondaryColor,
                description: brandfetchData.description || "Marque",
              },
            });

            console.log(`  ✅ Marque créée/mise à jour: ${brand.id}`);

            // 4. Pour chaque talent sélectionné
            const talentIds = brandData.talentIds || [];
            
            if (talentIds.length === 0) {
              console.log(`  ⚠️  Aucun talent sélectionné pour ${brandData.companyName}`);
              failed++;
              return;
            }

            const talents = await prisma.talent.findMany({
              where: { id: { in: talentIds } },
              include: { stats: true },
            });

            console.log(`  🎭 ${talents.length} talents à associer`);

            // Associer les talents à la marque (sans pitch)
            for (let order = 0; order < talents.length; order++) {
              const talent = talents[order];

              // Stocker dans PressKitTalent (sans pitch)
              await prisma.pressKitTalent.upsert({
                where: {
                  brandId_talentId: {
                    brandId: brand.id,
                    talentId: talent.id,
                  },
                },
                update: {
                  pitch: "", // Pas de pitch
                  order,
                },
                create: {
                  brandId: brand.id,
                  talentId: talent.id,
                  pitch: "", // Pas de pitch
                  order,
                },
              });
            }

            console.log(`  ✅ ${talents.length} talents associés`);

            // 5. HubSpot API → mettre à jour press_kit_url pour TOUS les contacts de cette marque
            const contactIds: string[] = [];
            if (brandData.contacts && Array.isArray(brandData.contacts)) {
              for (const contact of brandData.contacts) {
                const presskitUrl = `https://app.glowupagence.fr/book/${slug}?cid=${contact.hubspotContactId}`;
                await updateContactPresskitUrl(contact.hubspotContactId, presskitUrl);
                contactIds.push(contact.hubspotContactId);
              }
              console.log(`  ✅ ${contactIds.length} contacts mis à jour`);
            }

            // 6. Créer BatchBrand
            await prisma.batchBrand.create({
              data: {
                batchId: batch.id,
                brandId: brand.id,
                status: "completed",
                hubspotContactIds: contactIds,
                talentIds,
              },
            });

            completed++;
            console.log(`  ✅ ${brandData.companyName} terminé (${completed}/${brands.length})\n`);
          } catch (error) {
            failed++;
            console.error(`  ❌ Erreur pour ${brandData.companyName}:`, error);

            // Créer BatchBrand avec erreur
            try {
              const slug = brandData.companyName
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");

              const brand = await prisma.brand.findUnique({
                where: { slug },
              });

              if (brand) {
                const contactIds = brandData.contacts?.map((c: any) => c.hubspotContactId) || [];
                await prisma.batchBrand.create({
                  data: {
                    batchId: batch.id,
                    brandId: brand.id,
                    status: "failed",
                    error: error instanceof Error ? error.message : "Erreur inconnue",
                    hubspotContactIds: contactIds,
                    talentIds: brandData.talentIds || [],
                  },
                });
              }
            } catch (e) {
              console.error(`  ❌ Impossible de créer BatchBrand pour l'erreur:`, e);
            }
          }
        })
      );
    }

    // Mettre à jour le batch final
    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        status: "completed",
        completed,
        failed,
      },
    });

    console.log(`\n✅ Batch terminé: ${completed} réussies, ${failed} échouées\n`);

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      total: brands.length,
      completed,
      failed,
    });
  } catch (error) {
    console.error("❌ Erreur génération batch:", error);
    return NextResponse.json(
      { message: "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}
