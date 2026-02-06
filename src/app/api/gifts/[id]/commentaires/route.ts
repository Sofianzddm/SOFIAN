import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/gifts/[id]/commentaires - Ajouter un commentaire
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const body = await req.json();
    const { contenu, interne } = body;

    if (!contenu || contenu.trim() === "") {
      return NextResponse.json(
        { error: "Le contenu du commentaire est obligatoire" },
        { status: 400 }
      );
    }

    // Vérifier que la demande existe
    const demande = await prisma.demandeGift.findUnique({
      where: { id },
    });

    if (!demande) {
      return NextResponse.json(
        { error: "Demande non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier les droits d'accès
    const hasAccess =
      user.role === "ADMIN" ||
      user.role === "HEAD_OF" ||
      user.role === "HEAD_OF_INFLUENCE" ||
      user.role === "CM" ||
      demande.tmId === user.id ||
      demande.accountManagerId === user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const commentaire = await prisma.commentaireGift.create({
      data: {
        demandeGiftId: id,
        auteurId: user.id,
        contenu,
        interne: interne || false,
      },
      include: {
        auteur: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            role: true,
          },
        },
      },
    });

    // TODO: Créer une notification pour l'autre partie (TM ou AM)

    return NextResponse.json(commentaire, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/gifts/[id]/commentaires:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du commentaire" },
      { status: 500 }
    );
  }
}
