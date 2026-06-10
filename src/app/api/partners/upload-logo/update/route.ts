import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFromS3 } from "@/lib/s3";

// Met à jour l'URL du logo après upload S3
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

    // Supprimer l'ancien logo S3 si besoin
    if (partner.logo && partner.logo !== logoUrl) {
      await deleteFromS3(partner.logo);
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
