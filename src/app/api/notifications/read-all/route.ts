import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PATCH - Marquer toutes les notifications comme lues
export async function PATCH() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    await prisma.notification.updateMany({
      where: { userId: session.user.id, lu: false },
      data: { lu: true, luAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/notifications/read-all:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}
