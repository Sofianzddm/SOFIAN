import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generatePitchesForBrand, enrichBrandDescription } from "@/lib/claude";
import { fetchBrandAssets } from "@/lib/brandfetch";
import { Client } from "@hubspot/api-client";

/**
 * POST /api/presskit/generate-batch
 * Génération batch de press kits avec sélection manuelle des talents
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { role: string };

    if (!["ADMIN", "HEAD_OF", "HEAD_OF_SALES"].includes(user.role)) {
      return NextResponse.json(
        { message: "Accès réservé aux HEAD OF SALES et ADMIN" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { batchName, defaultTalentIds, brands } = body;

    if (!batchName || !Array.isArray(brands) || brands.length === 0) {
      return NextResponse.json(
        { message: "batchName et brands[] sont requis" },
        { status: 400 }
      );
    }

    console.log(`\n🚀 GÉNÉRATION BATCH "${batchName}" — ${brands.length} marques\n`);

    // 1. Créer le Batch
    const batch = await prisma.batch.create({
      data: {
        name: batchName,
        totalBrands: brands.length,
        defaultTalentIds: defaultTalentIds || [],
        status: "processing",
      },
    });

    console.log(`✅ Batch créé: ${batch.id}`);

    // 2. Traiter chaque marque
    let completed = 0;
    let failed = 0;

    const processBrand = async (brandData: any) => {
      try {
        console.log(`\n📦 Traitement: ${brandData.companyName} (${brandData.domain})`);

        // Les talents pour cette marque : talentIds si fourni, sinon defaultTalentIds
        const talentIds = brandData.talentIds && brandData.talentIds.length > 0
          ? brandData.talentIds
          : defaultTalentIds || [];

        if (talentIds.length === 0) {
          throw new Error("Aucun talent sélectionné pour cette marque");
        }

        // Créer un slug unique
        const slug = brandData.companyName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        // Vérifier si la marque existe déjà
        let brand = await prisma.brand.findUnique({
          where: { slug },
        });

        // 🔥 BRANDFETCH : Récupérer logo + couleurs + description
        let logo: string | null = null;
        let primaryColor: string | null = null;
        let secondaryColor: string | null = null;
        let brandfetchDescription: string | null = null;

        if (brandData.domain) {
          try {
            const assets = await fetchBrandAssets(brandData.domain);
            logo = assets.logo;
            primaryColor = assets.primaryColor;
            secondaryColor = assets.secondaryColor;
            brandfetchDescription = assets.description;
            console.log(`  ✅ Brandfetch: logo ${logo ? '✓' : '✗'}, couleurs ${primaryColor ? '✓' : '✗'}`);
          } catch (error) {
            console.log(`  ⚠️  Brandfetch échoué, on continue sans assets`);
          }
        }

        // 🔥 ENRICHIR LA DESCRIPTION avec Claude
        const enrichedDescription = await enrichBrandDescription(
          brandData.companyName,
          brandData.domain || "",
          brandData.niche || "Autre",
          brandfetchDescription
        );

        // Créer ou mettre à jour la marque
        if (brand) {
          brand = await prisma.brand.update({
            where: { id: brand.id },
            data: {
              name: brandData.companyName,
              domain: brandData.domain || null,
              niche: brandData.niche || "Autre",
              description: enrichedDescription,
              logo,
              primaryColor,
              secondaryColor,
            },
          });
          console.log(`  ✅ Marque mise à jour`);
        } else {
          brand = await prisma.brand.create({
            data: {
              name: brandData.companyName,
              slug,
              domain: brandData.domain || null,
              niche: brandData.niche || "Autre",
              description: enrichedDescription,
              logo,
              primaryColor,
              secondaryColor,
            },
          });
          console.log(`  ✅ Marque créée`);
        }

        // 🔥 RÉCUPÉRER LES TALENTS avec leurs stats
        const talents = await prisma.talent.findMany({
          where: {
            id: { in: talentIds },
          },
          include: {
            stats: true,
          },
        });

        if (talents.length === 0) {
          throw new Error("Aucun talent trouvé avec les IDs fournis");
        }

        console.log(`  📊 ${talents.length} talents récupérés`);

        // 🔥 GÉNÉRER LES PITCHS avec Claude
        const pitchInputs = talents.map((t) => ({
          talentName: `${t.prenom} ${t.nom}`,
          instagram: t.instagram,
          tiktok: t.tiktok,
          niches: t.niches,
          selectedClients: t.selectedClients,
          igFollowers: t.stats?.igFollowers || null,
          igEngagement: t.stats?.igEngagement || null,
          igGenreFemme: t.stats?.igGenreFemme || null,
          igAge18_24: t.stats?.igAge18_24 || null,
          igAge25_34: t.stats?.igAge25_34 || null,
          igLocFrance: t.stats?.igLocFrance || null,
          ttFollowers: t.stats?.ttFollowers || null,
          ttEngagement: t.stats?.ttEngagement || null,
        }));

        const pitchMap = await generatePitchesForBrand(
          {
            name: brand.name,
            description: brand.description,
          },
          pitchInputs
        );

        // 🔥 SUPPRIMER les anciens talents de ce press kit
        await prisma.pressKitTalent.deleteMany({
          where: { brandId: brand.id },
        });

        // 🔥 CRÉER les nouveaux PressKitTalent
        const presskitTalents = talents.map((talent, index) => {
          const talentName = `${talent.prenom} ${talent.nom}`;
          const pitch = pitchMap.get(talentName) || `Talent ${talentName}`;

          return prisma.pressKitTalent.create({
            data: {
              brandId: brand!.id,
              talentId: talent.id,
              pitch,
              order: index,
            },
          });
        });

        await Promise.all(presskitTalents);

        console.log(`  ✅ ${talents.length} PressKitTalent créés`);

        // 🔥 MISE À JOUR HUBSPOT : Écrire l'URL du press kit
        if (brandData.hubspotContactId) {
          try {
            const hubspotApiKey = process.env.HUBSPOT_API_KEY;
            if (hubspotApiKey) {
              const presskitUrl = `https://app.glowupagence.fr/book/${brand.slug}?cid=${brandData.hubspotContactId}`;

              // Mise à jour via l'API REST
              await fetch(
                `https://api.hubapi.com/contacts/v1/contact/vid/${brandData.hubspotContactId}/profile`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${hubspotApiKey}`,
                    "Content-Type": "application/json",
                  },
                        body: JSON.stringify({
                          properties: [
                            {
                              property: "press_kit_url",
                              value: presskitUrl,
                            },
                          ],
                        }),
                }
              );

              console.log(`  ✅ HubSpot mis à jour: ${presskitUrl}`);
            }
          } catch (hubspotError) {
            console.error(`  ⚠️  Erreur HubSpot:`, hubspotError);
            // On continue même si HubSpot échoue
          }
        }

        // Créer le BatchBrand
        await prisma.batchBrand.create({
          data: {
            batchId: batch.id,
            brandId: brand.id,
            status: "completed",
            talentIds,
            hubspotContactId: brandData.hubspotContactId || null,
          },
        });

        completed++;
        console.log(`  ✅ ${brandData.companyName} terminé (${completed}/${brands.length})`);
      } catch (error: any) {
        failed++;
        console.error(`  ❌ Erreur pour ${brandData.companyName}:`, error);

        // Créer un BatchBrand en erreur
        try {
          // Essayer de récupérer la marque
          const slug = brandData.companyName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

          let brand = await prisma.brand.findUnique({ where: { slug } });
          
          if (brand) {
            await prisma.batchBrand.create({
              data: {
                batchId: batch.id,
                brandId: brand.id,
                status: "failed",
                error: error.message,
                talentIds: brandData.talentIds || [],
                hubspotContactId: brandData.hubspotContactId || null,
              },
            });
          }
        } catch (e) {
          console.error(`  ❌ Impossible de créer BatchBrand en erreur`);
        }
      }
    };

    // Traiter par paquets de 10 marques en parallèle
    const batchSize = 10;
    for (let i = 0; i < brands.length; i += batchSize) {
      const batch = brands.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(processBrand));
    }

    // Mettre à jour le statut du batch
    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        status: failed === 0 ? "completed" : "partial",
        completed,
        failed,
      },
    });

    console.log(`\n🎉 BATCH TERMINÉ : ${completed} succès, ${failed} échecs\n`);

    return NextResponse.json({
      batchId: batch.id,
      total: brands.length,
      completed,
      failed,
      status: failed === 0 ? "completed" : "partial",
    });
  } catch (error: any) {
    console.error("❌ Erreur POST /api/presskit/generate-batch:", error);
    return NextResponse.json(
      {
        message: "Erreur lors de la génération batch",
        error: error?.message || "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
