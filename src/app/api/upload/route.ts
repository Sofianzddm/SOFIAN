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

export async function POST(request: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const talentId = formData.get("talentId") as string;

    if (!file || !talentId) {
      return NextResponse.json(
        { error: "Fichier et talentId requis" },
        { status: 400 }
      );
    }

    // Vérifier que le talent existe
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true, photo: true, prenom: true, nom: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Talent non trouvé" },
        { status: 404 }
      );
    }

    // Supprimer l'ancienne photo si elle existe sur Cloudinary
    if (talent.photo && talent.photo.includes("cloudinary.com")) {
      try {
        // Extraire le public_id de l'URL Cloudinary
        const urlParts = talent.photo.split("/");
        const filenameWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log("Ancienne photo non supprimée:", e);
      }
    }

    // Convertir le fichier en base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    // Upload vers Cloudinary
    const result = await cloudinary.uploader.upload(base64, {
      folder: "glowup-talents",
      public_id: `${talentId}-${Date.now()}`,
      transformation: [
        { width: 1200, height: 1500, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    // Mettre à jour le talent avec la nouvelle URL
    await prisma.talent.update({
      where: { id: talentId },
      data: { photo: result.secure_url },
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      message: `Photo de ${talent.prenom} ${talent.nom} mise à jour`,
    });
  } catch (error) {
    console.error("Erreur upload:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}