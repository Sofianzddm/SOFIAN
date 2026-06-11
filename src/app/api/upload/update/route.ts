import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Met à jour l'URL de la photo après upload Cloudinary
export async function POST(request: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { talentId, photoUrl } = await request.json();

    if (!talentId || !photoUrl) {
      return NextResponse.json(
        { error: "talentId et photoUrl requis" },
        { status: 400 }
      );
    }

    // Vérifier que le talent existe
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true, prenom: true, nom: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Talent non trouvé" },
        { status: 404 }
      );
    }

    // Mettre à jour le talent avec la nouvelle URL
    await prisma.talent.update({
      where: { id: talentId },
      data: { photo: photoUrl },
    });

    return NextResponse.json({
      success: true,
      url: photoUrl,
      message: `Photo de ${talent.prenom} ${talent.nom} mise à jour`,
    });
  } catch (error) {
    console.error("Erreur update photo:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}
