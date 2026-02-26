import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * PATCH /api/presskit/reorder-talents
 * Met à jour l'ordre des PressKitTalent pour une marque donnée
 *
 * Body: { brandId: string, talentIds: string[] } // talentIds = IDs des talents dans le nouvel ordre
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { role?: string };
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"].includes(user.role || "")) {
      return NextResponse.json(
        { message: "Accès réservé" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { brandId, talentIds } = body as {
      brandId?: string;
      talentIds?: string[];
    };

    if (!brandId || !Array.isArray(talentIds) || talentIds.length === 0) {
      return NextResponse.json(
        { message: "brandId et talentIds requis" },
        { status: 400 }
      );
    }

    // Vérifier que tous les PressKitTalent existent bien pour cette marque
    const presskits = await prisma.pressKitTalent.findMany({
      where: {
        brandId,
        talentId: { in: talentIds },
      },
    });

    if (presskits.length !== talentIds.length) {
      return NextResponse.json(
        { message: "Certains talents ne font pas partie du press kit" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      talentIds.map((talentId, index) =>
        prisma.pressKitTalent.update({
          where: {
            brandId_talentId: {
              brandId,
              talentId,
            },
          },
          data: { order: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Erreur reorder-talents:", error);
    return NextResponse.json(
      { message: "Erreur lors de la mise à jour de l'ordre des talents" },
      { status: 500 }
    );
  }
}

