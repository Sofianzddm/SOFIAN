import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT - Enregistrer l'ordre d'affichage du talent book (tri manuel)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { role: string };
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier l'ordre du book" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { talentIds } = body as { talentIds?: string[] };

    if (!Array.isArray(talentIds) || talentIds.length === 0) {
      return NextResponse.json(
        { error: "talentIds doit être un tableau non vide" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      talentIds.map((id, index) =>
        prisma.talent.update({
          where: { id },
          data: { orderBook: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur PUT /api/talents/book-order:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de l'ordre du book" },
      { status: 500 }
    );
  }
}
