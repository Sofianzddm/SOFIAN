import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/presskit/talents
 * Liste tous les talents avec photo, nom, stats pour la sélection dans le wizard
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { role: string };

    // Seuls ADMIN, HEAD_OF, HEAD_OF_SALES peuvent accéder au presskit
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { message: "Accès réservé aux HEAD OF et ADMIN" },
        { status: 403 }
      );
    }

    const talents = await prisma.talent.findMany({
      select: {
        id: true,
        prenom: true,
        nom: true,
        photo: true,
        instagram: true,
        tiktok: true,
        niches: true,
        selectedClients: true,
        stats: {
          select: {
            igFollowers: true,
            igEngagement: true,
            igGenreFemme: true,
            igAge18_24: true,
            igAge25_34: true,
            igLocFrance: true,
            ttFollowers: true,
            ttEngagement: true,
          },
        },
      },
      orderBy: [
        { prenom: "asc" },
        { nom: "asc" },
      ],
    });

    // Formatter pour le wizard
    const formatted = talents.map((t) => ({
      id: t.id,
      name: `${t.prenom} ${t.nom}`,
      prenom: t.prenom,
      nom: t.nom,
      photo: t.photo,
      instagram: t.instagram,
      tiktok: t.tiktok,
      niches: t.niches,
      selectedClients: t.selectedClients,
      igFollowers: t.stats?.igFollowers || 0,
      igEngagement: t.stats?.igEngagement || 0,
      ttFollowers: t.stats?.ttFollowers || 0,
      ttEngagement: t.stats?.ttEngagement || 0,
      // Stats audience pour affichage optionnel
      igGenreFemme: t.stats?.igGenreFemme || 0,
      igAge18_24: t.stats?.igAge18_24 || 0,
      igAge25_34: t.stats?.igAge25_34 || 0,
      igLocFrance: t.stats?.igLocFrance || 0,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("❌ Erreur GET /api/presskit/talents:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des talents" },
      { status: 500 }
    );
  }
}
