import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Liste des talents (filtrée par rôle)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    let whereClause = {};
    
    if (user.role === "TM") {
      whereClause = { managerId: user.id };
    }

    const talents = await prisma.talent.findMany({
      where: whereClause,
      include: {
        manager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
          },
        },
        stats: {
          select: {
            igFollowers: true,
            ttFollowers: true,
          },
        },
        _count: {
          select: {
            collaborations: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(talents);
  } catch (error) {
    console.error("Erreur GET talents:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des talents" },
      { status: 500 }
    );
  }
}

// POST - Créer un talent (ADMIN et HEAD_OF uniquement)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { message: "Vous n'avez pas les droits pour créer un talent" },
        { status: 403 }
      );
    }

    const data = await request.json();

    // Validation basique
    if (!data.prenom || !data.nom || !data.email || !data.managerId) {
      return NextResponse.json(
        { message: "Champs obligatoires manquants (prénom, nom, email, manager)" },
        { status: 400 }
      );
    }

    const hasInstagram = data.instagram && data.instagram.trim() !== "";
    const hasTiktok = data.tiktok && data.tiktok.trim() !== "";

    if (!hasInstagram && !hasTiktok) {
      return NextResponse.json(
        { message: "Le talent doit avoir au moins un compte Instagram ou TikTok" },
        { status: 400 }
      );
    }

    if (hasInstagram && (!data.igFollowers || !data.igEngagement)) {
      return NextResponse.json(
        { message: "Les statistiques Instagram (followers et engagement) sont obligatoires" },
        { status: 400 }
      );
    }

    if (hasTiktok && (!data.ttFollowers || !data.ttEngagement)) {
      return NextResponse.json(
        { message: "Les statistiques TikTok (followers et engagement) sont obligatoires" },
        { status: 400 }
      );
    }

    if (hasInstagram && (!data.tarifStory || !data.tarifPost || !data.tarifReel)) {
      return NextResponse.json(
        { message: "Les tarifs Story, Post et Reel sont obligatoires" },
        { status: 400 }
      );
    }

    if (hasTiktok && !data.tarifTiktokVideo) {
      return NextResponse.json(
        { message: "Le tarif Vidéo TikTok est obligatoire" },
        { status: 400 }
      );
    }

    // Créer le talent avec stats et tarifs dans une transaction
    const talent = await prisma.$transaction(async (tx) => {
      // 1. Créer le talent
      const newTalent = await tx.talent.create({
        data: {
          prenom: data.prenom,
          nom: data.nom,
          email: data.email,
          telephone: data.telephone || null,
          dateNaissance: data.dateNaissance ? new Date(data.dateNaissance) : null,
          bio: data.bio || null,
          presentation: data.presentation || null,
          presentationEn: data.presentationEn || null,
          adresse: data.adresse || null,
          codePostal: data.codePostal || null,
          ville: data.ville || null,
          pays: data.pays || "France",
          photo: data.photo || null,
          instagram: data.instagram || null,
          tiktok: data.tiktok || null,
          youtube: data.youtube || null,
          niches: data.niches || [],
          selectedClients: data.selectedClients || [],
          commissionInbound: parseFloat(data.commissionInbound) || 20,
          commissionOutbound: parseFloat(data.commissionOutbound) || 30,
          siret: data.siret || null,
          iban: data.iban || null,
          bic: data.bic || null,
          titulaireCompte: data.titulaireCompte || null,
          managerId: data.managerId,

          stats: {
            create: {
              igFollowers: data.igFollowers ? parseInt(data.igFollowers) : null,
              igFollowersEvol: data.igFollowersEvol ? parseFloat(data.igFollowersEvol) : null,
              igEngagement: data.igEngagement ? parseFloat(data.igEngagement) : null,
              igEngagementEvol: data.igEngagementEvol ? parseFloat(data.igEngagementEvol) : null,
              igGenreFemme: data.igGenreFemme ? parseFloat(data.igGenreFemme) : null,
              igGenreHomme: data.igGenreHomme ? parseFloat(data.igGenreHomme) : null,
              igAge13_17: data.igAge13_17 ? parseFloat(data.igAge13_17) : null,
              igAge18_24: data.igAge18_24 ? parseFloat(data.igAge18_24) : null,
              igAge25_34: data.igAge25_34 ? parseFloat(data.igAge25_34) : null,
              igAge35_44: data.igAge35_44 ? parseFloat(data.igAge35_44) : null,
              igAge45Plus: data.igAge45Plus ? parseFloat(data.igAge45Plus) : null,
              igLocFrance: data.igLocFrance ? parseFloat(data.igLocFrance) : null,
              ttFollowers: data.ttFollowers ? parseInt(data.ttFollowers) : null,
              ttFollowersEvol: data.ttFollowersEvol ? parseFloat(data.ttFollowersEvol) : null,
              ttEngagement: data.ttEngagement ? parseFloat(data.ttEngagement) : null,
              ttEngagementEvol: data.ttEngagementEvol ? parseFloat(data.ttEngagementEvol) : null,
              ttGenreFemme: data.ttGenreFemme ? parseFloat(data.ttGenreFemme) : null,
              ttGenreHomme: data.ttGenreHomme ? parseFloat(data.ttGenreHomme) : null,
              ttAge13_17: data.ttAge13_17 ? parseFloat(data.ttAge13_17) : null,
              ttAge18_24: data.ttAge18_24 ? parseFloat(data.ttAge18_24) : null,
              ttAge25_34: data.ttAge25_34 ? parseFloat(data.ttAge25_34) : null,
              ttAge35_44: data.ttAge35_44 ? parseFloat(data.ttAge35_44) : null,
              ttAge45Plus: data.ttAge45Plus ? parseFloat(data.ttAge45Plus) : null,
              ttLocFrance: data.ttLocFrance ? parseFloat(data.ttLocFrance) : null,
              ytAbonnes: data.ytAbonnes ? parseInt(data.ytAbonnes) : null,
              ytAbonnesEvol: data.ytAbonnesEvol ? parseFloat(data.ytAbonnesEvol) : null,
            },
          },

          tarifs: {
            create: {
              tarifStory: data.tarifStory ? parseFloat(data.tarifStory) : null,
              tarifStoryConcours: data.tarifStoryConcours ? parseFloat(data.tarifStoryConcours) : null,
              tarifPost: data.tarifPost ? parseFloat(data.tarifPost) : null,
              tarifPostConcours: data.tarifPostConcours ? parseFloat(data.tarifPostConcours) : null,
              tarifPostCommun: data.tarifPostCommun ? parseFloat(data.tarifPostCommun) : null,
              tarifReel: data.tarifReel ? parseFloat(data.tarifReel) : null,
              tarifTiktokVideo: data.tarifTiktokVideo ? parseFloat(data.tarifTiktokVideo) : null,
              tarifYoutubeVideo: data.tarifYoutubeVideo ? parseFloat(data.tarifYoutubeVideo) : null,
              tarifYoutubeShort: data.tarifYoutubeShort ? parseFloat(data.tarifYoutubeShort) : null,
              tarifEvent: data.tarifEvent ? parseFloat(data.tarifEvent) : null,
              tarifShooting: data.tarifShooting ? parseFloat(data.tarifShooting) : null,
              tarifAmbassadeur: data.tarifAmbassadeur ? parseFloat(data.tarifAmbassadeur) : null,
            },
          },
        },
        include: {
          manager: {
            select: {
              prenom: true,
              nom: true,
            },
          },
        },
      });

      // 2. Récupérer toutes les HEAD_OF pour les notifier (sauf le créateur)
      const headsOf = await tx.user.findMany({
        where: {
          role: { in: ["HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "ADMIN"] },
          actif: true,
          id: { not: user.id }, // Exclure l'utilisateur qui crée le talent
        },
        select: { id: true, prenom: true, nom: true },
      });

      // 3. Créer les notifications pour chaque HEAD_OF (si il y en a d'autres)
      if (headsOf.length > 0) {
        const notifications = headsOf.map((head) =>
          tx.notification.create({
            data: {
              userId: head.id,
              type: "NOUVEAU_TALENT",
              titre: "🎉 Nouveau talent ajouté",
              message: `${newTalent.prenom} ${newTalent.nom} a été ajouté par ${newTalent.manager.prenom} ${newTalent.manager.nom}. Pensez à vérifier les tarifs !`,
              lien: `/talents/${newTalent.id}`,
              talentId: newTalent.id,
            },
          })
        );

        await Promise.all(notifications);
      }

      return newTalent;
    });

    return NextResponse.json(talent, { status: 201 });
  } catch (error) {
    console.error("Erreur POST talent:", error);
    return NextResponse.json(
      { message: "Erreur lors de la création du talent" },
      { status: 500 }
    );
  }
}