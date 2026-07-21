import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/community/talents/[id]
 * Espace community manager : fiche talent en lecture seule (présentation,
 * réseaux, niches, statistiques d'audience). Aucune donnée sensible
 * (bancaire, tarifs, commissions, notes internes, contacts personnels).
 * Accès réservé aux rôles COMMUNITY_MANAGER et ADMIN.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "COMMUNITY_MANAGER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
    }

    const { id } = await params;
    const t = await prisma.talent.findUnique({
      where: { id },
      select: {
        id: true,
        prenom: true,
        nom: true,
        photo: true,
        bio: true,
        presentation: true,
        presentationEn: true,
        ville: true,
        pays: true,
        nationalite: true,
        instagram: true,
        tiktok: true,
        youtube: true,
        snapchat: true,
        niches: true,
        selectedClients: true,
        moyenneVuesStory: true,
        stats: true,
      },
    });

    if (!t) {
      return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
    }

    const s = t.stats;
    const num = (v: unknown) => (v != null ? Number(v) : null);

    return NextResponse.json({
      id: t.id,
      prenom: t.prenom,
      nom: t.nom,
      photo: t.photo,
      bio: t.bio,
      presentation: t.presentation,
      presentationEn: t.presentationEn,
      ville: t.ville,
      pays: t.pays,
      nationalite: t.nationalite,
      instagram: t.instagram,
      tiktok: t.tiktok,
      youtube: t.youtube,
      snapchat: t.snapchat,
      niches: t.niches || [],
      selectedClients: t.selectedClients || [],
      moyenneVuesStory: t.moyenneVuesStory,
      stats: s
        ? {
            igFollowers: s.igFollowers,
            igEngagement: num(s.igEngagement),
            igGenreFemme: num(s.igGenreFemme),
            igGenreHomme: num(s.igGenreHomme),
            igAge13_17: num(s.igAge13_17),
            igAge18_24: num(s.igAge18_24),
            igAge25_34: num(s.igAge25_34),
            igAge35_44: num(s.igAge35_44),
            igAge45Plus: num(s.igAge45Plus),
            igLocFrance: num(s.igLocFrance),
            ttFollowers: s.ttFollowers,
            ttEngagement: num(s.ttEngagement),
            ttGenreFemme: num(s.ttGenreFemme),
            ttGenreHomme: num(s.ttGenreHomme),
            ttAge13_17: num(s.ttAge13_17),
            ttAge18_24: num(s.ttAge18_24),
            ttAge25_34: num(s.ttAge25_34),
            ttAge35_44: num(s.ttAge35_44),
            ttAge45Plus: num(s.ttAge45Plus),
            ttLocFrance: num(s.ttLocFrance),
            ytAbonnes: s.ytAbonnes,
          }
        : null,
    });
  } catch (error) {
    console.error("❌ Erreur GET /api/community/talents/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du talent" },
      { status: 500 }
    );
  }
}
