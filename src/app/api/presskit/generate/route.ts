import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchBrandData } from "@/lib/brandfetch";
import { updateContactPresskitUrl } from "@/lib/hubspot";
import { formatBlocTalents } from "@/lib/presskit-bloc";

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
    const failedBrands: string[] = [];

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

            // 2. Brandfetch API → récupérer nom commercial, logo, couleurs, description
            let brandfetchData: {
              name: string | null;
              logo: string | null;
              primaryColor: string | null;
              secondaryColor: string | null;
              description: string | null;
            } = {
              name: null,
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

            // 3. Déterminer le nom de la marque (priorité)
            // 1. HubSpot "company" (TOUJOURS prioritaire)
            // 2. Domaine nettoyé en dernier recours (si company vide)
            const brandName = brandData.companyName 
              || brandData.domain
                ?.replace(/^www\./, '')
                ?.replace(/\.(com|fr|net|org)$/, '')
                ?.replace(/-/g, ' ')
                ?.split(' ')
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')
              || 'Marque';

            console.log(`  📛 Nom final: "${brandName}" (source: ${brandData.companyName ? 'HubSpot company' : 'domaine'})`);

            // 4. Créer ou mettre à jour la marque
            const brand = await prisma.brand.upsert({
              where: { slug },
              update: {
                name: brandName,
                domain: brandData.domain || null,
                logo: brandfetchData.logo,
                primaryColor: brandfetchData.primaryColor,
                secondaryColor: brandfetchData.secondaryColor,
                description: brandfetchData.description || "Marque",
              },
              create: {
                name: brandName,
                slug,
                domain: brandData.domain || null,
                niche: "Press Kit",
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

            // 5. Mettre à jour les PressKitTalent en conservant les pitches existants
            const existingPresskits = await prisma.pressKitTalent.findMany({
              where: { brandId: brand.id },
            });
            const existingByTalentId = new Map(
              existingPresskits.map((pkt) => [pkt.talentId, pkt])
            );
            const keptIds: string[] = [];

            for (let order = 0; order < talents.length; order++) {
              const talent = talents[order];
              const existing = existingByTalentId.get(talent.id);

              if (existing) {
                const updated = await prisma.pressKitTalent.update({
                  where: { id: existing.id },
                  data: { order },
                });
                keptIds.push(updated.id);
              } else {
                const created = await prisma.pressKitTalent.create({
                  data: {
                    brandId: brand.id,
                    talentId: talent.id,
                    pitch: "", // Nouveau talent : pas encore de pitch
                    order,
                  },
                });
                keptIds.push(created.id);
              }
            }

            // Supprimer les PressKitTalent qui ne font plus partie de la sélection
            await prisma.pressKitTalent.deleteMany({
              where: {
                brandId: brand.id,
                id: { notIn: keptIds },
              },
            });

            console.log(`  ✅ ${talents.length} talents associés (pitches conservés si existants)`);

            // 5. Construire bloc_talents (HTML, noms cliquables Instagram) à partir des PressKitTalents
            const brandWithTalents = await prisma.brand.findUnique({
              where: { id: brand.id },
              include: {
                presskitTalents: {
                  orderBy: { order: "asc" },
                  include: {
                    talent: { include: { stats: true } },
                  },
                },
              },
            });
            const blocTalents =
              brandWithTalents?.presskitTalents?.length ?
              formatBlocTalents(
                brandWithTalents.presskitTalents.map((pkt) => {
                  const t = pkt.talent;
                  const s = t.stats;
                  return {
                    prenom: t.prenom,
                    pitch: pkt.pitch || "",
                    instagramHandle: t.instagram?.replace(/^@/, "").trim() || null,
                    igFollowers: s?.igFollowers ?? 0,
                    ttFollowers: s?.ttFollowers ?? 0,
                    ytAbonnes: s?.ytAbonnes ?? 0,
                  };
                }),
                "html"
              ) : undefined;

            // 6. HubSpot API → mettre à jour press_kit_url ET bloc_talents pour TOUS les contacts
            const contactIds: string[] = [];
            if (brandData.contacts && Array.isArray(brandData.contacts)) {
              for (const contact of brandData.contacts) {
                const presskitUrl = `https://app.glowupagence.fr/book/${slug}?cid=${contact.hubspotContactId}`;
                await updateContactPresskitUrl(
                  contact.hubspotContactId,
                  presskitUrl,
                  blocTalents ?? undefined
                );
                contactIds.push(contact.hubspotContactId);
              }
              console.log(`  ✅ ${contactIds.length} contacts mis à jour (URL + bloc_talents)`);
            }

            // 7. Créer BatchBrand
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
            if (brandData.companyName) {
              failedBrands.push(String(brandData.companyName));
            }

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
      failedBrands,
    });
  } catch (error) {
    console.error("❌ Erreur génération batch:", error);
    return NextResponse.json(
      { message: "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}
