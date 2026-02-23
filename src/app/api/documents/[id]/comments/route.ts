import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const params = await Promise.resolve(context.params);
    const { id: documentId } = params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Le contenu du commentaire est requis" },
        { status: 400 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document non trouvé" },
        { status: 404 }
      );
    }

    const comment = await prisma.documentComment.create({
      data: {
        documentId,
        content: content.trim(),
        userId: (session.user as { id: string }).id,
      },
      include: {
        user: { select: { id: true, prenom: true, nom: true, email: true } },
      },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Erreur création commentaire:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du commentaire" },
      { status: 500 }
    );
  }
}
