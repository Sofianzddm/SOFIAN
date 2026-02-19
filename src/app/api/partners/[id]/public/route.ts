import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Route publique: GET /api/partners/[id]/public
// ATTENTION: le paramètre "id" est en réalité le slug du partenaire.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let slug = "";
  try {
    const { id } = await params;
    slug = id;

    const partner = await prisma.partner.findFirst({
      where: {
        slug,
        isActive: true,
      },
    });

    if (!partner) {
      console.log(`[API /partners/${slug}/public] Partenaire non trouvé avec slug: ${slug}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log(`[API /partners/${slug}/public] Partenaire trouvé: ${partner.name} (ID: ${partner.id})`);

    const safePartner = {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      logo: partner.logo,
      description: partner.description,
      message: partner.message,
      showAllTalents: partner.showAllTalents,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    };

    // ⚠️ Afficher uniquement les talents non archivés - même logique que /api/public/talents
    const talentsList = await prisma.talent.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        prenom: true,
        nom: true,
        bio: true,
        photo: true,
        presentation: true,
        presentationEn: true,
        instagram: true,
        tiktok: true,
        youtube: true,
        niches: true,
        ville: true,
        pays: true,
        stats: {
          select: {
            igFollowers: true,
            igFollowersEvol: true,
            igEngagement: true,
            igEngagementEvol: true,
            igGenreFemme: true,
            igGenreHomme: true,
            igAge13_17: true,
            igAge18_24: true,
            igAge25_34: true,
            igAge35_44: true,
            igAge45Plus: true,
            igLocFrance: true,
            ttFollowers: true,
            ttFollowersEvol: true,
            ttEngagement: true,
            ttEngagementEvol: true,
            ttGenreFemme: true,
            ttGenreHomme: true,
            ttAge13_17: true,
            ttAge18_24: true,
            ttAge25_34: true,
            ttAge35_44: true,
            ttAge45Plus: true,
            ttLocFrance: true,
            ytAbonnes: true,
            ytAbonnesEvol: true,
          },
        },
        tarifs: {
          select: {
            tarifStory: true,
            tarifStoryConcours: true,
            tarifPost: true,
            tarifPostConcours: true,
            tarifPostCommun: true,
            tarifReel: true,
            tarifTiktokVideo: true,
            tarifYoutubeVideo: true,
            tarifYoutubeShort: true,
            tarifEvent: true,
            tarifShooting: true,
            tarifAmbassadeur: true,
          },
        },
      },
      orderBy: { prenom: "asc" },
    });

    console.log(`[API /partners/${slug}/public] Partenaire trouvé: ${partner.name}, Talents totaux: ${talentsList.length}`);

    // Récupérer les tarifs négociés pour ce partenaire
    const overrides = await prisma.partnerTarifOverride.findMany({
      where: { partnerId: partner.id },
    });
    const overrideMap = new Map(overrides.map((o) => [o.talentId, o]));

    // Transformer les talents comme dans /api/public/talents et merger les tarifs négociés
    const talents = talentsList.map((talent) => {
      const ov = overrideMap.get(talent.id);
      const defaultTarifs = talent.tarifs
        ? {
            tarifStory: talent.tarifs.tarifStory
              ? Number(talent.tarifs.tarifStory)
              : null,
            tarifStoryConcours: talent.tarifs.tarifStoryConcours
              ? Number(talent.tarifs.tarifStoryConcours)
              : null,
            tarifPost: talent.tarifs.tarifPost
              ? Number(talent.tarifs.tarifPost)
              : null,
            tarifPostConcours: talent.tarifs.tarifPostConcours
              ? Number(talent.tarifs.tarifPostConcours)
              : null,
            tarifPostCommun: talent.tarifs.tarifPostCommun
              ? Number(talent.tarifs.tarifPostCommun)
              : null,
            tarifReel: talent.tarifs.tarifReel
              ? Number(talent.tarifs.tarifReel)
              : null,
            tarifTiktokVideo: talent.tarifs.tarifTiktokVideo
              ? Number(talent.tarifs.tarifTiktokVideo)
              : null,
            tarifYoutubeVideo: talent.tarifs.tarifYoutubeVideo
              ? Number(talent.tarifs.tarifYoutubeVideo)
              : null,
            tarifYoutubeShort: talent.tarifs.tarifYoutubeShort
              ? Number(talent.tarifs.tarifYoutubeShort)
              : null,
            tarifEvent: talent.tarifs.tarifEvent
              ? Number(talent.tarifs.tarifEvent)
              : null,
            tarifShooting: talent.tarifs.tarifShooting
              ? Number(talent.tarifs.tarifShooting)
              : null,
            tarifAmbassadeur: talent.tarifs.tarifAmbassadeur
              ? Number(talent.tarifs.tarifAmbassadeur)
              : null,
          }
        : null;

      // Merger avec les overrides si ils existent
      const mergedTarifs = ov && defaultTarifs
        ? {
            tarifStory: ov.tarifStory !== null && ov.tarifStory !== undefined
              ? Number(ov.tarifStory)
              : defaultTarifs.tarifStory,
            tarifStoryConcours: ov.tarifStoryConcours !== null && ov.tarifStoryConcours !== undefined
              ? Number(ov.tarifStoryConcours)
              : defaultTarifs.tarifStoryConcours,
            tarifPost: ov.tarifPost !== null && ov.tarifPost !== undefined
              ? Number(ov.tarifPost)
              : defaultTarifs.tarifPost,
            tarifPostConcours: ov.tarifPostConcours !== null && ov.tarifPostConcours !== undefined
              ? Number(ov.tarifPostConcours)
              : defaultTarifs.tarifPostConcours,
            tarifPostCommun: ov.tarifPostCommun !== null && ov.tarifPostCommun !== undefined
              ? Number(ov.tarifPostCommun)
              : defaultTarifs.tarifPostCommun,
            tarifReel: ov.tarifReel !== null && ov.tarifReel !== undefined
              ? Number(ov.tarifReel)
              : defaultTarifs.tarifReel,
            tarifTiktokVideo: ov.tarifTiktokVideo !== null && ov.tarifTiktokVideo !== undefined
              ? Number(ov.tarifTiktokVideo)
              : defaultTarifs.tarifTiktokVideo,
            tarifYoutubeVideo: ov.tarifYoutubeVideo !== null && ov.tarifYoutubeVideo !== undefined
              ? Number(ov.tarifYoutubeVideo)
              : defaultTarifs.tarifYoutubeVideo,
            tarifYoutubeShort: ov.tarifYoutubeShort !== null && ov.tarifYoutubeShort !== undefined
              ? Number(ov.tarifYoutubeShort)
              : defaultTarifs.tarifYoutubeShort,
            tarifEvent: ov.tarifEvent !== null && ov.tarifEvent !== undefined
              ? Number(ov.tarifEvent)
              : defaultTarifs.tarifEvent,
            tarifShooting: ov.tarifShooting !== null && ov.tarifShooting !== undefined
              ? Number(ov.tarifShooting)
              : defaultTarifs.tarifShooting,
            tarifAmbassadeur: ov.tarifAmbassadeur !== null && ov.tarifAmbassadeur !== undefined
              ? Number(ov.tarifAmbassadeur)
              : defaultTarifs.tarifAmbassadeur,
          }
        : defaultTarifs;

      return {
      id: talent.id,
      prenom: talent.prenom,
      nom: talent.nom,
      bio: talent.bio || null,
      photo: talent.photo || null,
      presentation: talent.presentation || null,
      presentationEn: talent.presentationEn || null,
      instagram: talent.instagram || null,
      tiktok: talent.tiktok || null,
      youtube: talent.youtube || null,
      niches: talent.niches || [],
      ville: talent.ville || null,
      pays: talent.pays || "France",
      stats: talent.stats
        ? {
            igFollowers: talent.stats.igFollowers,
            igFollowersEvol: talent.stats.igFollowersEvol
              ? Number(talent.stats.igFollowersEvol)
              : null,
            igEngagement: talent.stats.igEngagement
              ? Number(talent.stats.igEngagement)
              : null,
            igEngagementEvol: talent.stats.igEngagementEvol
              ? Number(talent.stats.igEngagementEvol)
              : null,
            igGenreFemme: talent.stats.igGenreFemme
              ? Number(talent.stats.igGenreFemme)
              : null,
            igGenreHomme: talent.stats.igGenreHomme
              ? Number(talent.stats.igGenreHomme)
              : null,
            igAge13_17: talent.stats.igAge13_17
              ? Number(talent.stats.igAge13_17)
              : null,
            igAge18_24: talent.stats.igAge18_24
              ? Number(talent.stats.igAge18_24)
              : null,
            igAge25_34: talent.stats.igAge25_34
              ? Number(talent.stats.igAge25_34)
              : null,
            igAge35_44: talent.stats.igAge35_44
              ? Number(talent.stats.igAge35_44)
              : null,
            igAge45Plus: talent.stats.igAge45Plus
              ? Number(talent.stats.igAge45Plus)
              : null,
            igLocFrance: talent.stats.igLocFrance
              ? Number(talent.stats.igLocFrance)
              : null,
            ttFollowers: talent.stats.ttFollowers,
            ttFollowersEvol: talent.stats.ttFollowersEvol
              ? Number(talent.stats.ttFollowersEvol)
              : null,
            ttEngagement: talent.stats.ttEngagement
              ? Number(talent.stats.ttEngagement)
              : null,
            ttEngagementEvol: talent.stats.ttEngagementEvol
              ? Number(talent.stats.ttEngagementEvol)
              : null,
            ttGenreFemme: talent.stats.ttGenreFemme
              ? Number(talent.stats.ttGenreFemme)
              : null,
            ttGenreHomme: talent.stats.ttGenreHomme
              ? Number(talent.stats.ttGenreHomme)
              : null,
            ttAge13_17: talent.stats.ttAge13_17
              ? Number(talent.stats.ttAge13_17)
              : null,
            ttAge18_24: talent.stats.ttAge18_24
              ? Number(talent.stats.ttAge18_24)
              : null,
            ttAge25_34: talent.stats.ttAge25_34
              ? Number(talent.stats.ttAge25_34)
              : null,
            ttAge35_44: talent.stats.ttAge35_44
              ? Number(talent.stats.ttAge35_44)
              : null,
            ttAge45Plus: talent.stats.ttAge45Plus
              ? Number(talent.stats.ttAge45Plus)
              : null,
            ttLocFrance: talent.stats.ttLocFrance
              ? Number(talent.stats.ttLocFrance)
              : null,
            ytAbonnes: talent.stats.ytAbonnes,
            ytAbonnesEvol: talent.stats.ytAbonnesEvol
              ? Number(talent.stats.ytAbonnesEvol)
              : null,
          }
        : null,
        tarifs: mergedTarifs,
        tarifNegocieAvecAccord: !!ov,
      };
    });

    // Récupérer les projets (GLOBAUX pour tous les partenaires)
    const projects = await prisma.agencyProject.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      include: {
        talents: {
          include: {
            talent: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                photo: true,
                stats: {
                  select: {
                    igFollowers: true,
                    ttFollowers: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const formattedProjects = projects.map((project) => ({
      id: project.id,
      title: project.title,
      slug: project.slug,
      description: project.description,
      coverImage: project.coverImage,
      images: project.images,
      links: project.links,
      videoUrl: project.videoUrl,
      category: project.category,
      date: project.date,
      location: project.location,
      talents: project.talents
        .filter((pt) => pt.talent !== null)
        .map((pt) => ({
          id: pt.talent.id,
          prenom: pt.talent.prenom,
          nom: pt.talent.nom,
          photo: pt.talent.photo,
          role: pt.role,
          stats: pt.talent.stats
            ? {
                igFollowers: Number(pt.talent.stats.igFollowers || 0),
                ttFollowers: Number(pt.talent.stats.ttFollowers || 0),
              }
            : null,
        })),
    }));

    console.log(`[API /partners/${slug}/public] Réponse finale: ${talents.length} talents, ${formattedProjects.length} projets`);

    // Vérifier que les talents sont bien retournés
    if (talents.length === 0) {
      console.warn(`[API /partners/${slug}/public] ATTENTION: Aucun talent retourné après mapping!`);
    }

    return NextResponse.json({
      partner: safePartner,
      talents,
      projects: formattedProjects,
    });
  } catch (error) {
    console.error("Erreur GET /api/partners/[id]/public:", error);
    console.error("Détails:", {
      slug: slug || "non défini",
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { 
        error: "Erreur lors de la récupération des données publiques du partenaire",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

