import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// PATCH - Modifier un commentaire
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentaireId: string }> }
) {
  try {
    const { id, commentaireId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const { contenu } = await request.json();
    if (!contenu?.trim()) {
      return NextResponse.json({ message: "Contenu obligatoire" }, { status: 400 });
    }

    const currentUserId = (session.user as { id: string }).id;
    const currentUserRole = (session.user as { role?: string }).role ?? "";

    const commentaire = await prisma.negoCommentaire.findUnique({
      where: { id: commentaireId },
      select: {
        id: true,
        userId: true,
        negociationId: true,
      },
    });

    if (!commentaire || commentaire.negociationId !== id) {
      return NextResponse.json({ message: "Commentaire introuvable" }, { status: 404 });
    }

    const isAuthor = commentaire.userId === currentUserId;
    const isAdminOrHead =
      currentUserRole === "ADMIN" ||
      currentUserRole === "HEAD_OF" ||
      currentUserRole === "HEAD_OF_INFLUENCE";

    if (!isAuthor && !isAdminOrHead) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 403 });
    }

    const updated = await prisma.negoCommentaire.update({
      where: { id: commentaireId },
      data: { contenu: contenu.trim() },
      include: {
        user: {
          select: { id: true, prenom: true, nom: true, role: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erreur PATCH commentaire:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
