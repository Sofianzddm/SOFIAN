import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchBrandData } from "@/lib/brandfetch";

/**
 * POST /api/presskit/preview
 * Génère un press kit pour UNE seule marque (pour preview avant génération batch)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { companyName, domain, talentIds, contacts } = body;

    if (!companyName || !talentIds || !Array.isArray(talentIds) || talentIds.length === 0) {
      return NextResponse.json(
        { message: "Paramètres invalides" },
        { status: 400 }
      );
    }

    console.log(`\n🔍 Génération preview pour: ${companyName}\n`);

    // 1. Créer le slug
    const slug = companyName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

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
    
    if (domain && domain.trim() !== '') {
      brandfetchData = await fetchBrandData(domain);
    } else {
      console.log(`  ⚠️  Pas de domaine, Brandfetch ignoré`);
    }

    // 3. Déterminer le nom de la marque (priorité)
    // 1. HubSpot "company" (TOUJOURS prioritaire)
    // 2. Domaine nettoyé en dernier recours (si company vide)
    const brandName = companyName 
      || domain
        ?.replace(/^www\./, '')
        ?.replace(/\.(com|fr|net|org)$/, '')
        ?.replace(/-/g, ' ')
        ?.split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
      || 'Marque';

    console.log(`  📛 Nom final: "${brandName}" (source: ${companyName ? 'HubSpot company' : 'domaine'})`);

    // 4. Créer ou mettre à jour la marque
    const brand = await prisma.brand.upsert({
      where: { slug },
      update: {
        name: brandName,
        domain: domain || null,
        logo: brandfetchData.logo,
        primaryColor: brandfetchData.primaryColor,
        secondaryColor: brandfetchData.secondaryColor,
        description: brandfetchData.description || "Marque",
      },
      create: {
        name: brandName,
        slug,
        domain: domain || null,
        niche: "Press Kit",
        logo: brandfetchData.logo,
        primaryColor: brandfetchData.primaryColor,
        secondaryColor: brandfetchData.secondaryColor,
        description: brandfetchData.description || "Marque",
      },
    });

    console.log(`  ✅ Marque créée/mise à jour: ${brand.id}`);

    // 4. Récupérer les talents
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

    console.log(`  ✅ ${talents.length} talents associés (preview, pitches conservés si existants)`);
    console.log(`  ✅ Preview disponible sur /book/${slug}\n`);

    return NextResponse.json({
      success: true,
      slug,
      url: `/book/${slug}`,
    });
  } catch (error) {
    console.error("❌ Erreur génération preview:", error);
    return NextResponse.json(
      { message: "Erreur lors de la génération du preview" },
      { status: 500 }
    );
  }
}
