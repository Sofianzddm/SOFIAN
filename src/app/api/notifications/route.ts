import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Récupérer toutes les notifications de l'utilisateur connecté
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const nonLuesOnly = searchParams.get("nonLues") === "true";

    const whereClause: any = {
      userId: session.user.id,
    };

    if (nonLuesOnly) {
      whereClause.lu = false;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 50, // Limiter à 50 dernières notifications
    });

    // Compter les non-lues
    const countNonLues = await prisma.notification.count({
      where: {
        userId: session.user.id,
        lu: false,
      },
    });

    return NextResponse.json({
      notifications,
      countNonLues,
    });
  } catch (error) {
    console.error("Erreur GET notifications:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des notifications" },
      { status: 500 }
    );
  }
}
