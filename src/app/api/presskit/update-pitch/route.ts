import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * PATCH /api/presskit/update-pitch
 * Met à jour le pitch d'un PressKitTalent (édition manuelle)
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
    const { pressKitTalentId, pitch } = body;

    if (!pressKitTalentId || typeof pitch !== "string") {
      return NextResponse.json(
        { message: "pressKitTalentId et pitch requis" },
        { status: 400 }
      );
    }

    await prisma.pressKitTalent.update({
      where: { id: pressKitTalentId },
      data: { pitch: pitch.trim() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Erreur update-pitch:", error);
    return NextResponse.json(
      { message: "Erreur lors de la mise à jour du pitch" },
      { status: 500 }
    );
  }
}
