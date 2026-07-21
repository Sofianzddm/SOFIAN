import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/community/talents
 * Espace community manager : liste en lecture seule des talents (vitrine).
 * N'expose que des champs de présentation (pas d'infos bancaires, tarifs,
 * commissions, notes internes ni contacts personnels).
 * Accès réservé aux rôles COMMUNITY_MANAGER et ADMIN.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "COMMUNITY_MANAGER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
    }

    const talents = await prisma.talent.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        prenom: true,
        nom: true,
        photo: true,
        bio: true,
        presentation: true,
        ville: true,
        pays: true,
        instagram: true,
        tiktok: true,
        youtube: true,
        niches: true,
        stats: {
          select: {
            igFollowers: true,
            igEngagement: true,
            ttFollowers: true,
            ttEngagement: true,
            ytAbonnes: true,
          },
        },
      },
      orderBy: [{ prenom: "asc" }],
    });

    const formatted = talents.map((t) => ({
      id: t.id,
      prenom: t.prenom,
      nom: t.nom,
      photo: t.photo,
      bio: t.bio,
      presentation: t.presentation,
      ville: t.ville,
      pays: t.pays,
      instagram: t.instagram,
      tiktok: t.tiktok,
      youtube: t.youtube,
      niches: t.niches || [],
      igFollowers: t.stats?.igFollowers ?? null,
      igEngagement: t.stats?.igEngagement != null ? Number(t.stats.igEngagement) : null,
      ttFollowers: t.stats?.ttFollowers ?? null,
      ttEngagement: t.stats?.ttEngagement != null ? Number(t.stats.ttEngagement) : null,
      ytAbonnes: t.stats?.ytAbonnes ?? null,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("❌ Erreur GET /api/community/talents:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des talents" },
      { status: 500 }
    );
  }
}
