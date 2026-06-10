import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteFromS3 } from "@/lib/s3";

// Met à jour l'URL du logo de la marque après upload S3 (ou via URL manuelle)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { brandId, logoUrl } = await request.json();

    if (!brandId || !logoUrl) {
      return NextResponse.json(
        { error: "brandId et logoUrl requis" },
        { status: 400 }
      );
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, logo: true },
    });

    if (!brand) {
      return NextResponse.json(
        { error: "Marque non trouvée" },
        { status: 404 }
      );
    }

    // Supprimer l'ancien logo S3 si besoin (no-op si l'ancien était une URL externe)
    if (brand.logo && brand.logo !== logoUrl) {
      await deleteFromS3(brand.logo);
    }

    await prisma.brand.update({
      where: { id: brandId },
      data: { logo: logoUrl },
    });

    return NextResponse.json({
      success: true,
      url: logoUrl,
      message: `Logo de ${brand.name} mis à jour`,
    });
  } catch (error) {
    console.error("Erreur update logo presskit:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}

