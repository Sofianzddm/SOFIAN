import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST - Ajouter un commentaire
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const { contenu } = await request.json();

    if (!contenu?.trim()) {
      return NextResponse.json({ message: "Contenu obligatoire" }, { status: 400 });
    }

    // Créer le commentaire
    const commentaire = await prisma.negoCommentaire.create({
      data: {
        negociationId: params.id,
        userId: session.user.id,
        contenu: contenu.trim(),
      },
      include: {
        user: {
          select: { id: true, prenom: true, nom: true, role: true },
        },
      },
    });

    // Mettre à jour le statut si c'est le Head Of qui commente et que c'est en attente
    const nego = await prisma.negociation.findUnique({
      where: { id: params.id },
      select: { statut: true },
    });

    if (nego?.statut === "EN_ATTENTE" && (session.user.role === "HEAD_OF" || session.user.role === "ADMIN")) {
      await prisma.negociation.update({
        where: { id: params.id },
        data: { statut: "EN_DISCUSSION" },
      });
    }

    return NextResponse.json(commentaire, { status: 201 });
  } catch (error) {
    console.error("Erreur POST commentaire:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
