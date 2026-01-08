import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Détail d'un talent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const talent = await prisma.talent.findUnique({
      where: { id: id },
      include: {
        manager: {
          select: { id: true, prenom: true, nom: true, email: true },
        },
        stats: true,
        tarifs: true,
        _count: {
          select: { collaborations: true },
        },
      },
    });

    if (!talent) {
      return NextResponse.json({ message: "Talent non trouvé" }, { status: 404 });
    }

    return NextResponse.json(talent);
  } catch (error) {
    console.error("Erreur GET talent:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// PUT - Modifier un talent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    // Construire l'objet de mise à jour en excluant les champs non fournis
    const updateData: Record<string, unknown> = {
      prenom: data.prenom,
      nom: data.nom,
      email: data.email,
      telephone: data.telephone || null,
      dateNaissance: data.dateNaissance ? new Date(data.dateNaissance) : null,
      bio: data.bio || null,
      presentation: data.presentation || null,
      adresse: data.adresse || null,
      codePostal: data.codePostal || null,
      ville: data.ville || null,
      pays: data.pays || "France",
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
    };

    // Ne mettre à jour la photo QUE si elle est explicitement fournie
    if (data.photo !== undefined) {
      updateData.photo = data.photo || null;
    }

    const talent = await prisma.talent.update({
      where: { id: id },
      data: {
        ...updateData,

        stats: {
          update: {
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
          update: {
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
    });

    return NextResponse.json(talent);
  } catch (error) {
    console.error("Erreur PUT talent:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// DELETE - Supprimer un talent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const talent = await prisma.talent.findUnique({
      where: { id: id },
      include: { _count: { select: { collaborations: true } } },
    });

    if (talent?._count.collaborations && talent._count.collaborations > 0) {
      return NextResponse.json(
        { message: "Impossible de supprimer, ce talent a des collaborations" },
        { status: 400 }
      );
    }

    await prisma.talent.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Supprimé" });
  } catch (error) {
    console.error("Erreur DELETE talent:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}