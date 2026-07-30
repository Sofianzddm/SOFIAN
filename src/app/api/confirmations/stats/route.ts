import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/confirmations/stats?talentId=xxx
 *
 * Fiabilité d'un talent (F5) + garde-fou surbooking (F4) :
 * taux de confirmation, délai moyen de réponse, nombre d'offres
 * actuellement confirmées mais non encore publiées.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const talentId = request.nextUrl.searchParams.get("talentId")?.trim();
    if (!talentId) {
      return NextResponse.json({ error: "talentId requis" }, { status: 400 });
    }

    const confs = await prisma.talentConfirmation.findMany({
      where: { talentId },
      select: {
        statut: true,
        createdAt: true,
        decidedAt: true,
        datePublication: true,
      },
    });

    const total = confs.length;
    const decided = confs.filter((c) => c.statut !== "EN_ATTENTE" && c.decidedAt);
    const confirmed = confs.filter((c) => c.statut === "CONFIRME").length;
    const refused = confs.filter((c) => c.statut === "REFUSE").length;

    const responseHours = decided
      .map((c) => (c.decidedAt!.getTime() - c.createdAt.getTime()) / 36e5)
      .filter((h) => h >= 0);
    const avgResponseHours =
      responseHours.length > 0
        ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length
        : null;

    // Surbooking : offres confirmées dont la publication n'est pas encore passée.
    const now = Date.now();
    const activeConfirmed = confs.filter(
      (c) =>
        c.statut === "CONFIRME" &&
        (!c.datePublication || c.datePublication.getTime() >= now)
    ).length;

    return NextResponse.json({
      total,
      decided: decided.length,
      confirmed,
      refused,
      confirmationRate: total > 0 ? Math.round((confirmed / total) * 100) : null,
      avgResponseHours: avgResponseHours != null ? Math.round(avgResponseHours * 10) / 10 : null,
      activeConfirmed,
    });
  } catch (error) {
    console.error("Erreur GET confirmations/stats:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
