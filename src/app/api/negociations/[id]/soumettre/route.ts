import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST - Soumettre une négociation (BROUILLON → EN_ATTENTE)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    // Récupérer la négociation
    const nego = await prisma.negociation.findUnique({
      where: { id },
      include: {
        tm: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });

    if (!nego) {
      return NextResponse.json({ error: "Négociation non trouvée" }, { status: 404 });
    }

    // Vérifier que c'est bien le TM propriétaire
    if (nego.tmId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // Vérifier que la négociation est bien en brouillon
    if (nego.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: `Impossible de soumettre une négociation au statut ${nego.statut}` },
        { status: 400 }
      );
    }

    // Valider que la négociation est complète
    const livrables = await prisma.negoLivrable.count({
      where: { negociationId: id },
    });

    if (livrables === 0) {
      return NextResponse.json(
        { error: "Ajoutez au moins un livrable avant de soumettre" },
        { status: 400 }
      );
    }

    // Mettre à jour la négociation
    await prisma.$transaction(async (tx) => {
      // Passer EN_ATTENTE
      await tx.negociation.update({
        where: { id },
        data: {
          statut: "EN_ATTENTE",
          dateSubmitted: new Date(),
          modifiedSinceReview: false,
        },
      });

      // Notifier tous les HEAD_OF et ADMIN
      const validateurs = await tx.user.findMany({
        where: {
          role: { in: ["HEAD_OF", "ADMIN"] },
          actif: true,
        },
      });

      for (const validateur of validateurs) {
        await tx.notification.create({
          data: {
            userId: validateur.id,
            type: "GENERAL",
            titre: "Nouvelle négociation à valider",
            message: `${nego.tm.prenom} ${nego.tm.nom} a soumis la négociation ${nego.reference} pour validation`,
            lien: `/negociations/${id}`,
          },
        });
      }
    });

    return NextResponse.json({ 
      success: true,
      message: "Négociation soumise pour validation" 
    });
  } catch (error) {
    console.error("Erreur POST soumettre:", error);
    return NextResponse.json(
      { error: "Erreur lors de la soumission" },
      { status: 500 }
    );
  }
}
