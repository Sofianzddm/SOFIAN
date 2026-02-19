import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Met à jour l'URL du logo après upload Cloudinary
export async function POST(request: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { partnerId, logoUrl } = await request.json();

    if (!partnerId || !logoUrl) {
      return NextResponse.json(
        { error: "partnerId et logoUrl requis" },
        { status: 400 }
      );
    }

    // Vérifier que le partenaire existe
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, logo: true },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Partenaire non trouvé" },
        { status: 404 }
      );
    }

    // Supprimer l'ancien logo si il existe sur Cloudinary
    if (partner.logo && partner.logo.includes("cloudinary.com")) {
      try {
        // Extraire le public_id de l'URL Cloudinary
        const urlParts = partner.logo.split("/");
        const filenameWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log("Ancien logo non supprimé:", e);
      }
    }

    // Mettre à jour le partenaire avec la nouvelle URL
    await prisma.partner.update({
      where: { id: partnerId },
      data: { logo: logoUrl },
    });

    return NextResponse.json({
      success: true,
      url: logoUrl,
      message: `Logo de ${partner.name} mis à jour`,
    });
  } catch (error) {
    console.error("Erreur update logo partenaire:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}
