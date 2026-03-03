import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Met à jour l'URL du logo de la marque après upload Cloudinary (ou via URL manuelle)
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

    // Supprimer l'ancien logo Cloudinary si besoin
    if (brand.logo && brand.logo.includes("cloudinary.com")) {
      try {
        const urlParts = brand.logo.split("/");
        const filenameWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log("Ancien logo presskit non supprimé:", e);
      }
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

