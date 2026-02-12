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

    // 2. Brandfetch API → récupérer logo, couleurs, description
    let brandfetchData = {
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

    // 3. Créer ou mettre à jour la marque
    const brand = await prisma.brand.upsert({
      where: { slug },
      update: {
        name: companyName,
        domain: domain || null,
        logo: brandfetchData.logo,
        primaryColor: brandfetchData.primaryColor,
        secondaryColor: brandfetchData.secondaryColor,
        description: brandfetchData.description || "Marque",
      },
      create: {
        name: companyName,
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

    // 5. SUPPRIMER les anciens PressKitTalent de cette marque
    await prisma.pressKitTalent.deleteMany({
      where: {
        brandId: brand.id,
      },
    });
    console.log(`  🗑️  Anciens talents supprimés`);

    // 6. Créer les nouveaux PressKitTalent avec la sélection actuelle
    for (let order = 0; order < talents.length; order++) {
      const talent = talents[order];

      await prisma.pressKitTalent.create({
        data: {
          brandId: brand.id,
          talentId: talent.id,
          pitch: "", // Pas de pitch
          order,
        },
      });
    }

    console.log(`  ✅ ${talents.length} nouveaux talents associés`);
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
