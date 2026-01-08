import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    // Supprimer l'ancienne photo si elle existe sur Vercel Blob
    if (talent.photo && talent.photo.includes("blob.vercel-storage.com")) {
      try {
        await del(talent.photo);
      } catch (e) {
        console.log("Ancienne photo non supprimée:", e);
      }
    }

    // Générer un nom de fichier unique
    const extension = file.name.split(".").pop();
    const filename = `talents/${talentId}/${Date.now()}.${extension}`;

    // Upload vers Vercel Blob
    const blob = await put(filename, file, {
      access: "public",
      addRandomSuffix: false,
    });

    // Mettre à jour le talent avec la nouvelle URL
    await prisma.talent.update({
      where: { id: talentId },
      data: { photo: blob.url },
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
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
