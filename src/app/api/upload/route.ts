import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToS3, deleteFromS3 } from "@/lib/s3";

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

    // Supprimer l'ancienne photo S3 si elle existe
    if (talent.photo) {
      await deleteFromS3(talent.photo);
    }

    // Upload vers S3 (image optimisée via sharp)
    const url = await uploadFileToS3(file, {
      folder: "glowup-talents",
      baseName: `${talentId}-${Date.now()}`,
      maxWidth: 1200,
    });

    // Mettre à jour le talent avec la nouvelle URL
    await prisma.talent.update({
      where: { id: talentId },
      data: { photo: url },
    });

    return NextResponse.json({
      success: true,
      url,
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